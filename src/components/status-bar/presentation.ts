import type { WidgetConfig } from '@/services/configuration/config'

/**
 * Content-side presentation every native bar widget accepts. Geometry, edge
 * and spacing are host concerns; these fields are what the configuration
 * applies to a widget's own render.
 */
export interface WidgetView {
  /** `compact` drops the widget's own label and keeps only its reading. */
  workspaceSource?: WidgetConfig['workspaceSource']
  format: WidgetConfig['format']
  /** `false` disables the hover/focus tooltip surface for this widget. */
  tooltip: boolean
  /** Polling cadence for channels the shared worker polls. */
  intervalMs: number
  /** Horizontal outer margin in CSS pixels. */
  marginX?: WidgetConfig['marginX']
}

export const defaultView: WidgetView = {
  format: 'label',
  tooltip: true,
  intervalMs: 2000
}

export function viewOf(widget: WidgetConfig): WidgetView {
  return {
    workspaceSource: widget.workspaceSource,
    format: widget.format,
    tooltip: widget.tooltip,
    intervalMs: widget.intervalMs,
    marginX: widget.marginX
  }
}

/** `showLabel` is the one visual decision the configured `format` encodes. */
export function showLabel(format: WidgetConfig['format']) {
  return format === 'label'
}
