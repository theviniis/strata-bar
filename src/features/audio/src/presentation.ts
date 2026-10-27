import type { VoicemeeterData } from '@/services/system/bridge'

/** Display text of one Voicemeeter option: engine slot plus device/label. */
export function optionLabel(item: VoicemeeterData['strips'][number]) {
  const name = item.name.trim()
  return name ? `${item.slot} · ${name}` : item.slot
}
