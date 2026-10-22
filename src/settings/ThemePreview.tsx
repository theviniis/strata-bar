import { StudioBar } from '@/components/status-bar/StudioBar'
import type { Config } from '@/services/configuration/config'
import { cn } from '@/lib/utils'

/** The NativeBar renderer, fitted to the selector with studio sample data. */
export function ThemePreview({ config }: { config: Config }) {
  return (
    <div
      inert
      aria-hidden="true"
      data-theme-preview={config.bar.theme}
      className={cn(
        'relative h-24 w-full overflow-hidden rounded-md border border-border bg-muted',
        config.bar.theme === 'dark' ? 'dark' : 'light'
      )}
    >
      <StudioBar config={config} staticPreview />
    </div>
  )
}
