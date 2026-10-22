import { viewConfig } from './monitor-layout'
import { StudioBar } from '@/components/status-bar/StudioBar'
import type { Config } from '@/services/configuration/config'
import { cn } from '@/lib/utils'

/** The same studio bar renders both halves at full width before clipping. */
export function ThemePreview({ config }: { config: Config }) {
  const theme = config.bar.theme
  const system = theme === 'system'
  return (
    <div
      inert
      aria-hidden="true"
      data-theme-preview={config.bar.theme}
      className="relative h-24 w-full overflow-hidden rounded-md border border-border bg-muted"
    >
      {system ? (
        <>
          <PreviewSurface
            config={config}
            theme="light"
            className="absolute inset-0 [clip-path:polygon(0_0,55%_0,45%_100%,0_100%)]"
          />
          <PreviewSurface
            config={config}
            theme="dark"
            className="absolute inset-0 [clip-path:polygon(55%_0,100%_0,100%_100%,45%_100%)]"
          />
          <div className="pointer-events-none absolute inset-0 bg-foreground/40 [clip-path:polygon(54.8%_0,55.2%_0,45.2%_100%,44.8%_100%)]" />
        </>
      ) : (
        <PreviewSurface config={config} theme={theme} />
      )}
    </div>
  )
}

function PreviewSurface({
  config,
  theme,
  className
}: {
  config: Config
  theme: Exclude<Config['bar']['theme'], 'system'>
  className?: string
}) {
  return (
    <div
      data-theme={theme}
      className={cn('h-full w-full bg-muted', theme, className)}
    >
      <StudioBar
        config={{
          ...viewConfig(config, null, []),
          bar: { ...config.bar, theme }
        }}
        staticPreview
      />
    </div>
  )
}
