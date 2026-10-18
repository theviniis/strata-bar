import { z } from 'zod'
import { discoveredPopups, type PopupId } from './.generated/popups'
import { MAX_POPUP_PARAMS_BYTES } from './constants'

export type { PopupId } from './.generated/popups'

export function isPopupId(value: unknown): value is PopupId {
  return typeof value === 'string' && Object.hasOwn(discoveredPopups, value)
}

export function popupMetadata(id: PopupId) {
  return discoveredPopups[id]
}

type StrictEmpty<T> = T extends object
  ? keyof T extends never
    ? Record<string, never>
    : T
  : T
export type PopupParams<K extends PopupId> = StrictEmpty<
  z.input<(typeof discoveredPopups)[K]['schema']>
>
export type PopupValues<K extends PopupId> = z.output<
  (typeof discoveredPopups)[K]['schema']
>

export function resolvePopup(id: unknown, params: unknown) {
  if (!isPopupId(id)) throw new Error('Popup não registrado')
  const entry = discoveredPopups[id]
  const value = entry.schema.parse(params)
  const parsed = value === undefined ? undefined : z.json().parse(value)
  const input = params === undefined ? undefined : z.json().parse(params)
  if (
    new TextEncoder().encode(JSON.stringify(input ?? null)).length >
    MAX_POPUP_PARAMS_BYTES
  ) {
    throw new Error('Parâmetros do popup excedem 16 KiB')
  }
  return { id, params: parsed, input, Content: entry.Content }
}
