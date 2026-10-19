import type { ComponentType } from 'react'
import { z } from 'zod'

const emptyParams = z.object({}).strict().default({})

type Definition<S extends z.ZodType> = {
  label: string
  Content: ComponentType
  className?: string
  schema: S
}

export function definePopup<S extends z.ZodType>(
  definition: Definition<S>
): Definition<S>
export function definePopup(
  definition: Omit<Definition<typeof emptyParams>, 'schema'>
): Definition<typeof emptyParams>
export function definePopup(
  definition: Omit<Definition<z.ZodType>, 'schema'> & { schema?: z.ZodType }
): Definition<z.ZodType> {
  if (!definition.label.trim()) throw new Error('Popup label must not be empty')
  return { ...definition, schema: definition.schema ?? emptyParams }
}
