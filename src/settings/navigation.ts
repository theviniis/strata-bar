import { z } from 'zod'

const navigationSchema = z.object({
  section: z.enum(['layout', 'appearance', 'json']),
  monitor: z
    .object({ id: z.string().min(1), connected: z.boolean() })
    .nullable()
})
export type SettingsNavigation = z.infer<typeof navigationSchema>
const key = 'strata.settings.navigation.v1'

/** UI preferences survive WebView destruction and application restarts. */
export function readNavigation(): SettingsNavigation {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (saved && !['layout', 'appearance', 'json'].includes(saved.section))
      saved.section = 'layout'
    return navigationSchema.parse(saved)
  } catch {
    return { section: 'layout', monitor: null }
  }
}

export function rememberNavigation(patch: Partial<SettingsNavigation>) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...readNavigation(), ...patch }))
  } catch {
    // A blocked storage must not prevent navigation in the current window.
  }
}
