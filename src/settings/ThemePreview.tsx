import { themeStyle } from '@/services/theme/palettes'
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
      data-color-theme-preview={config.bar.colorTheme}
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
      style={themeStyle(config.bar.colorTheme, theme)}
      className={cn('h-full w-full bg-muted', theme, className)}
    >
      <StudioBar
        config={{
          ...viewConfig(config, null, []),
          bar: { ...config.bar, theme }
        }}
        staticPreview
      />
      <div className="mx-auto mt-2 flex w-fit items-center gap-2 rounded-md border border-border bg-popover px-3 py-1 text-micro text-popover-foreground">
        <span className="size-2 rounded-full bg-primary" />
        CPU <span className="text-muted-foreground">24%</span>
        <span className="h-1 w-10 rounded-full bg-chart-2" />
      </div>
      <div className="mt-2 flex justify-center gap-1">
        {[
          'bg-background',
          'bg-primary',
          'bg-secondary',
          'bg-accent',
          'bg-chart-4'
        ].map((color) => (
          <span
            key={color}
            className={cn('size-2 rounded-full border border-border', color)}
          />
        ))}
      </div>
    </div>
  )
}
