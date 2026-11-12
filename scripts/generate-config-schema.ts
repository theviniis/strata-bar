import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { configSchema } from '../src/services/configuration/config.ts'

export const projectRoot = fileURLToPath(new URL('../', import.meta.url))
export const schemaFile = 'config.schema.json'

/**
 * Renders the JSON Schema editors consume for a hand-edited `config.json`.
 *
 * `io: 'input'` describes what a document may contain (defaults applied, fields
 * optional), which is what an editor wants while typing. Generated from the Zod
 * schema so the ranges stay in step with the runtime validation instead of
 * being maintained by hand.
 *
 * Cross-field `superRefine` rules (unique widget ids, Voicemeeter target) do not
 * survive this translation: JSON Schema has no equivalent for them, so a
 * document can be schema-valid and still be rejected natively. The schema is an
 * authoring aid, never the gate.
 */
export async function renderSchema(root = projectRoot) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = z.toJSONSchema(configSchema, { io: 'input' }) as any

  // Add $defs for widget types to provide editor completions for per-widget config
  if (!schema.$defs) schema.$defs = {}
  if (!schema.$defs.widgets) schema.$defs.widgets = {}
  schema.$defs.widgets.voicemeeterMidiStatus = {
    type: 'object',
    description:
      'Monitor de status do dispositivo MIDI (WORLDE easy control) no Voicemeeter',
    properties: {
      enabled: { type: 'boolean', default: false },
      tooltip: { type: 'boolean', default: true }
    },
    additionalProperties: false
  }

  // Add reference in monitor widget overrides for per-widget-type validation
  const widgetsProp =
    schema.properties?.monitors?.additionalProperties?.properties?.widgets
  if (widgetsProp) {
    if (!widgetsProp.properties) widgetsProp.properties = {}
    widgetsProp.properties.voicemeeterMidiStatus = {
      $ref: '#/$defs/widgets/voicemeeterMidiStatus'
    }
  }

  // Format with the repo's Prettier config so the generated file and
  // `pnpm format:check` cannot disagree about the same bytes.
  const options = (await resolveConfig(resolve(root, schemaFile))) ?? {}
  return format(JSON.stringify(schema), { ...options, parser: 'json' })
}

/** Writes only when the content changed, so the gate does not churn the file. */
export async function generateSchema(root = projectRoot) {
  const path = resolve(root, schemaFile)
  const next = await renderSchema(root)
  if (existsSync(path) && readFileSync(path, 'utf8') === next) return false
  writeFileSync(path, next)
  return true
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const changed = await generateSchema()
  console.log(`${schemaFile} ${changed ? 'written' : 'unchanged'}`)
}
