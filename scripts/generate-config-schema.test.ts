// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { projectRoot, renderSchema, schemaFile } from './generate-config-schema'

function source(file: string) {
  return readFileSync(resolve(projectRoot, file), 'utf8')
}

/** Reads `const NAME: type = value;` from the Rust source, tolerating `1_000`. */
function rustConstant(name: string) {
  const match = source('src-tauri/src/config.rs').match(
    new RegExp(`const ${name}: \\w+ = ([0-9_.]+);`)
  )
  if (!match) throw new Error(`Missing Rust constant ${name}`)
  return Number(match[1].replaceAll('_', ''))
}

async function schemaAt(path: string[]) {
  let node: Record<string, unknown> = JSON.parse(await renderSchema())
  for (const key of path) node = node[key] as Record<string, unknown>
  return node as {
    minimum?: number
    maximum?: number
  }
}

it('writes a schema that is committed and up to date', async () => {
  // The committed file is what editors fetch; a stale copy silently allows
  // values the runtime rejects.
  expect(source(schemaFile)).toBe(await renderSchema())
})

it('keeps bar ranges in step with the native validator', async () => {
  const spacing = await schemaAt(['properties', 'bar', 'properties', 'spacing'])
  expect(spacing.minimum).toBe(0)
  expect(spacing.maximum).toBe(rustConstant('MAX_SPACING'))

  const height = await schemaAt(['properties', 'bar', 'properties', 'height'])
  expect(height.minimum).toBe(rustConstant('MIN_HEIGHT'))
  expect(height.maximum).toBe(rustConstant('MAX_HEIGHT'))
})

it('keeps the widget interval range in step with the native validator', async () => {
  const interval = await schemaAt([
    'properties',
    'widgets',
    'properties',
    'left',
    'items',
    'properties',
    'intervalMs'
  ])
  expect(interval.minimum).toBe(rustConstant('MIN_INTERVAL_MS'))
  expect(interval.maximum).toBe(rustConstant('MAX_INTERVAL_MS'))
})

it('describes what a document may contain, not what it looks like after parsing', async () => {
  // `io: 'input'` keeps optional fields optional, so an editor does not flag a
  // hand-written document for omitting values the runtime would default.
  const schema = JSON.parse(await renderSchema())
  expect(schema.required).toEqual(['version', 'bar', 'widgets'])
  expect(schema.properties.version.const).toBe(1)
})

it('is valid JSON that every editor can fetch', async () => {
  const schema = JSON.parse(source(schemaFile))
  expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
  expect(schema.type).toBe('object')
})
