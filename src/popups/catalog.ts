import catalog from './catalog.json'

export type PopupId = keyof typeof catalog
export const POPUP_GAP = 12
export const MAX_POPUP_PARAMS_BYTES = 16 * 1024

export function isPopupId(value: unknown): value is PopupId {
  return typeof value === 'string' && Object.hasOwn(catalog, value)
}

export function popupMetadata(id: PopupId) {
  const entry: { label: string; width?: number; maxHeight?: number } =
    catalog[id]
  return {
    label: entry.label,
    width: entry.width ?? 320,
    maxHeight: entry.maxHeight ?? 380
  }
}
