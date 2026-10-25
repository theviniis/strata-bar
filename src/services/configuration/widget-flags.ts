import type { WidgetType } from './config'

/** Release flags by widget type, independent of saved per-instance settings. */
export const widgetFlags: Readonly<Record<WidgetType, boolean>> = {
  separator: true,
  clock: true,
  weather: true,
  reminders: true,
  agents: false,
  cpu: true,
  memory: true,
  gpu: true,
  disk: true,
  network: false,
  music: true,
  volume: true,
  microphone: true,
  activeWindow: false,
  komorebi: true
}

export function isWidgetAvailable(type: WidgetType): boolean {
  return widgetFlags[type]
}
