import type { ComponentType } from 'react'
import { createElement, lazy, useState } from 'react'
import { z } from 'zod'

const emptyParams = z.object({}).strict().default({})

type Definition<S extends z.ZodType> = {
  label: string
  Content: ComponentType & { preload?: () => Promise<unknown> }
  className?: string
  schema: S
}

/**
 * Defers a popup's content module until the surface actually renders it, so a
 * window's startup graph never carries that popup's dependencies.
 */
export function lazyContent<
  M extends Record<K, ComponentType>,
  K extends string
>(load: () => Promise<M>, name: K) {
  let pending: Promise<{ default: M[K] }> | undefined
  let loaded: { default: M[K] } | undefined
  const preload = () => {
    pending ??= Promise.resolve()
      .then(load)
      .then((module) => {
        loaded = { default: module[name] }
        return loaded
      })
      .catch((error: unknown) => {
        pending = undefined
        throw error
      })
    return pending
  }
  const Deferred = lazy(preload)
  function Content() {
    // Pick once per mount: warm opens avoid Suspense's fallback delay, while
    // cold opens keep the same lazy child even after its import resolves.
    const [Component] = useState<ComponentType>(
      () => loaded?.default ?? Deferred
    )
    return createElement(Component)
  }
  return Object.assign(Content, { preload })
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
