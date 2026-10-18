import { expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { definePopup } from '../popups/definition'
import { isPopupId, resolvePopup } from '../popups/resolve'

const Content = () => null

it('defaults omitted schemas to optional strict empty parameters', () => {
  const popup = definePopup({ label: 'Example', Content })
  expect(popup.schema.parse(undefined)).toEqual({})
  expect(popup.schema.parse({})).toEqual({})
  for (const value of [null, 'value', { extra: true }]) {
    expect(() => popup.schema.parse(value)).toThrow()
  }
  expectTypeOf<undefined>().toExtend<z.input<typeof popup.schema>>()
})

it('preserves required inputs and transformed output types', () => {
  const popup = definePopup({
    label: 'Workspace',
    Content,
    schema: z.object({ workspace: z.string().transform(Number) }).strict()
  })
  expect(popup.schema.parse({ workspace: '3' })).toEqual({ workspace: 3 })
  expect(() => popup.schema.parse(undefined)).toThrow()
  expectTypeOf<z.input<typeof popup.schema>>().toEqualTypeOf<{
    workspace: string
  }>()
  expectTypeOf<z.output<typeof popup.schema>>().toEqualTypeOf<{
    workspace: number
  }>()
})

it('requires a nonempty label and only resolves discovered IDs', () => {
  expect(() => definePopup({ label: ' ', Content })).toThrow('label')
  expect(isPopupId('clock')).toBe(true)
  expect(isPopupId('toString')).toBe(false)
  expect(() => resolvePopup('notRegistered', {})).toThrow(
    'Popup não registrado'
  )
  expect(resolvePopup('audioOutputs', undefined).params).toEqual({})
})
