import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { memo } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Config, WidgetConfig } from '@/services/configuration/config'
import { Widget } from './Widget'
import { WidgetPreviewContext } from './widget-preview-context'
import { SeparatorMarginContext } from './separator-margin'

/** The actual widget tree, with sample data and all native effects disabled. */
export const WidgetPreview = memo(function WidgetPreview({
  widget,
  theme,
  separatorMarginX = 0
}: {
  widget: WidgetConfig
  theme: Config['bar']['theme']
  separatorMarginX?: number
}) {
  const resolved = useResolvedTheme(theme)
  return (
    <SeparatorMarginContext value={separatorMarginX}>
      <WidgetPreviewContext.Provider value={true}>
        <div
          inert
          aria-hidden="true"
          title={widget.id}
          data-widget-preview={widget.type}
          data-theme={resolved}
          className={cn(
            'group w-full overflow-hidden rounded-md bg-background p-2 text-foreground',
            resolved
          )}
        >
          <TooltipProvider>
            <Widget widget={widget} />
          </TooltipProvider>
        </div>
      </WidgetPreviewContext.Provider>
    </SeparatorMarginContext>
  )
})
