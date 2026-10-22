import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Config, WidgetConfig } from '@/services/configuration/config'
import { Widget } from './Widget'
import { WidgetPreviewContext } from './widget-preview-context'

/** The actual widget tree, with sample data and all native effects disabled. */
export function WidgetPreview({
  widget,
  theme
}: {
  widget: WidgetConfig
  theme: Config['bar']['theme']
}) {
  return (
    <WidgetPreviewContext.Provider value={true}>
      <div
        inert
        aria-hidden="true"
        title={widget.id}
        data-widget-preview={widget.type}
        data-theme={theme}
        className={cn(
          'group w-full overflow-hidden rounded-md bg-background p-2 text-foreground',
          theme === 'dark' ? 'dark' : 'light'
        )}
      >
        <TooltipProvider>
          <Widget widget={widget} />
        </TooltipProvider>
      </div>
    </WidgetPreviewContext.Provider>
  )
}
