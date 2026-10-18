import { ClockPopup } from '@/features/clock/ClockPopup'
import type { ComponentType } from 'react'
import { z } from 'zod'
import { AudioOutputs } from '../features/volume/AudioOutputs'
import { isPopupId, MAX_POPUP_PARAMS_BYTES, type PopupId } from './catalog'

export function definePopup<S extends z.ZodType>(definition: {
  schema: S
  Content: ComponentType
}): { schema: S; Content: ComponentType } {
  return definition
}

/** Exhaustive: adding/removing a catalog ID requires a matching registration. */
export const popupRegistry = {
  audioOutputs: definePopup({
    schema: z.object({}).strict().default({}),
    Content: AudioOutputs
  }),
  clock: definePopup({
    schema: z.object({}).strict().default({}),
    Content: ClockPopup
  })
} satisfies Record<PopupId, { schema: z.ZodType; Content: ComponentType }>

type StrictEmpty<T> = T extends object
  ? keyof T extends never
    ? Record<string, never>
    : T
  : T
export type PopupParams<K extends PopupId> = StrictEmpty<
  z.input<(typeof popupRegistry)[K]['schema']>
>
export type PopupValues<K extends PopupId> = z.output<
  (typeof popupRegistry)[K]['schema']
>

export function resolvePopup(id: unknown, params: unknown) {
  if (!isPopupId(id)) throw new Error('Popup não registrado')
  const entry = popupRegistry[id]
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
