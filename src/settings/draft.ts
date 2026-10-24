import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCallback, useEffect, useState } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import {
  configSchema,
  migrateConfig,
  defaultConfig,
  parseConfig,
  type Config
} from '../services/configuration/config'
import { bridge } from '../services/system/bridge'

/**
 * The settings window's editor contract.
 *
 * The page edits a *draft*, never the rendered bar: `react-hook-form` holds the
 * candidate document and `zodResolver` runs the schema-v2 schema on every
 * change, so a field-level error blocks Apply before any native write. Apply
 * serializes the validated draft and calls `config_save`; the native store
 * re-validates, writes atomically and publishes a `config` event every bar
 * consumes — that event is the only way a change reaches the desktop.
 *
 * A native rejection lands in the same error slot as a field error, and Revert
 * and Restore defaults reuse the same load/apply paths.
 */

/** The form works on the schema's input shape; Apply submits its parsed output. */
export type ConfigDraft = Config
export type ValidConfig = Config

// Editor mutations always supply complete documents; the canonical schema still
// validates every field and supplies defaults at the persistence boundary.
const draftSchema = z.custom<ConfigDraft>().transform((value, context) => {
  const result = configSchema.safeParse(value)
  if (result.success) return result.data
  for (const issue of result.error.issues) context.addIssue({ ...issue })
  return z.NEVER
})

export type ConfigPersistence = {
  load(): Promise<ValidConfig>
  save(config: ValidConfig): Promise<ValidConfig>
}

export type EditorError = {
  /** `field` errors come from the resolver; `native` errors from `config_save`. */
  source: 'field' | 'native'
  message: string
}

/** Production persistence: the native file is the only source of truth. */
export function createNativePersistence(): ConfigPersistence {
  if (!bridge.configLoad || !bridge.configSave)
    throw new Error('As configurações exigem o runtime nativo')
  return {
    async load() {
      return configSchema.parse(
        migrateConfig((await bridge.configLoad!()).config)
      )
    },
    async save(config) {
      return configSchema.parse((await bridge.configSave!(config)).config)
    }
  }
}

/**
 * Parses raw JSON against the schema. The message carries the field paths, so
 * the JSON surface of the same page (ticket 06) points at the offending field.
 */
export function draftFromText(text: string): ValidConfig | EditorError {
  try {
    return parseConfig(text)
  } catch (error) {
    return {
      source: 'field',
      message:
        error instanceof z.ZodError
          ? error.issues
              .map(
                (issue) =>
                  `${issue.path.join('.') || 'config'}: ${issue.message}`
              )
              .join('\n')
          : error instanceof Error
            ? error.message
            : String(error)
    }
  }
}

/** First resolver message, flattened for the summary alert. */
export function firstError(errors: unknown): string | null {
  if (!errors || typeof errors !== 'object') return null
  for (const value of Object.values(errors as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
    const nested = firstError(value)
    if (nested) return nested
  }
  return null
}

export type ConfigEditor = {
  form: UseFormReturn<ConfigDraft, unknown, ValidConfig>
  /** The last loaded/accepted document: what Revert returns to. */
  saved: ValidConfig
  /** Latest field or native failure, in one slot. */
  error: EditorError | null
  loading: boolean
  loaded: boolean
  saving: boolean
  reverted: boolean
  /** Install a new draft without touching native. */
  replaceDraft(next: ValidConfig): void
  apply(): void
  revert(): void
  restoreDefaults(): void
  jsonText: string
  replaceText(text: string): void
  dismissError(): void
}

/**
 * Owns the draft, its validation and the three explicit actions. Deliberately a
 * hook, not a store: the draft is window-local, so closing the settings window
 * (the `settings` webview is destroyed) leaves no state behind.
 */
export function useConfigEditor(persistence: ConfigPersistence): ConfigEditor {
  const form = useForm<ConfigDraft, unknown, ValidConfig>({
    resolver: zodResolver(draftSchema),
    mode: 'onChange',
    defaultValues: structuredClone(defaultConfig)
  })
  const [rawText, setRawText] = useState<string | null>(null)
  const [textError, setTextError] = useState<EditorError | null>(null)
  const [saved, setSaved] = useState<ValidConfig>(defaultConfig)
  const [error, setError] = useState<EditorError | null>(null)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reverted, setReverted] = useState(false)
  const fieldMessage = firstError(form.formState.errors)

  const load = useCallback(
    async (reverting = false) => {
      setReverted(false)
      try {
        const config = await persistence.load()
        setRawText(null)
        setTextError(null)
        setSaved(config)
        setLoaded(true)
        setReverted(reverting)
        form.reset(config)
        setError(null)
      } catch (e) {
        setError({ source: 'native', message: messageOf(e) })
      } finally {
        setLoading(false)
      }
    },
    [form, persistence]
  )

  useEffect(() => {
    void Promise.resolve().then(() => load())
  }, [load])

  const replaceDraft = useCallback(
    (next: ValidConfig) => {
      // Layout moves are always schema-valid, but the resolver still runs so
      // field markers and the Apply state follow the draft immediately.
      setRawText(null)
      setTextError(null)
      form.reset(next, { keepDefaultValues: true })
      setError(null)
      void form.trigger()
    },
    [form]
  )
  const submit = useCallback(() => {
    void form.handleSubmit(
      async (values) => {
        setSaving(true)
        try {
          const config = await persistence.save(values)
          setRawText(null)
          setTextError(null)
          setSaved(config)
          setReverted(false)
          form.reset(config)
          setError(null)
        } catch (e) {
          // A rejected save leaves the file and the bars untouched; the reason
          // lands in the same slot a field error uses.
          setError({ source: 'native', message: messageOf(e) })
        } finally {
          setSaving(false)
        }
      },
      (errors) => {
        setError({
          source: 'field',
          message: firstError(errors) ?? 'Corrija os campos destacados'
        })
      }
    )()
  }, [form, persistence])
  const apply = useCallback(() => {
    if (loaded && !loading && !saving && !textError) submit()
  }, [loaded, loading, saving, submit, textError])

  const revert = useCallback(() => {
    // Re-read the file: an external edit made while the window was open must
    // be what Revert restores, not a stale in-memory copy.
    setLoading(true)
    void load(true)
  }, [load])

  const restoreDefaults = useCallback(() => {
    form.reset(structuredClone(defaultConfig))
    setError(null)
    setRawText(null)
    setTextError(null)
    setReverted(false)
    // Defaults are a candidate document too; only Apply may persist them.
    void form.trigger()
  }, [form])

  return {
    form,
    saved,
    error:
      textError ??
      (fieldMessage ? { source: 'field', message: fieldMessage } : error),
    loading,
    loaded,
    saving,
    reverted,
    replaceDraft,
    apply,
    revert,
    restoreDefaults,
    jsonText: rawText ?? JSON.stringify(form.getValues(), null, 2),
    replaceText: (text) => {
      setRawText(text)
      const result = draftFromText(text)
      if ('source' in result) {
        setTextError(result)
        return
      }
      setTextError(null)
      setError(null)
      form.reset(result, { keepDefaultValues: true })
      void form.trigger()
    },
    dismissError: () => setError(null)
  }
}

function messageOf(error: unknown) {
  // Tauri rejects with the plain `Err(String)` the native side built.
  return error instanceof Error ? error.message : String(error)
}
