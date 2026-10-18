// @vitest-environment node
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import ts from 'typescript'
import { discoverPopups, generatePopups, projectRoot } from './generate-popups'

const temporary: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'strata-popup-discovery-'))
  temporary.push(root)
  mkdirSync(join(root, 'src/features'), { recursive: true })
  return root
}
function definition(root: string, name: string) {
  const path = join(root, 'src/features', name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'export default {}\n')
  return path
}
afterEach(() => {
  for (const root of temporary.splice(0))
    rmSync(root, { recursive: true, force: true })
})

it('generates from a clean tree, discovers nested definitions and ignores other files', () => {
  const root = fixture()
  definition(root, 'volume/audioOutputs.popup.ts')
  definition(root, 'clock/clock.popup.ts')
  definition(root, 'clock/ClockPopup.tsx')
  expect(generatePopups(root)).toBe(true)
  const generated = readFileSync(
    join(root, 'src/popups/.generated/popups.ts'),
    'utf8'
  )
  expect(generated).toContain('export type PopupId = "audioOutputs" | "clock"')
  expect(generated).toContain('../../features/volume/audioOutputs.popup')
  expect(generated).not.toContain('ClockPopup.tsx')
  expect(generatePopups(root)).toBe(false)
})

it('updates additions, removals and renames without a central list', () => {
  const root = fixture()
  const path = definition(root, 'clock.popup.ts')
  generatePopups(root)
  renameSync(path, join(dirname(path), 'calendar.popup.ts'))
  expect(generatePopups(root)).toBe(true)
  expect(discoverPopups(join(root, 'src/features')).map(([id]) => id)).toEqual([
    'calendar'
  ])
  rmSync(join(dirname(path), 'calendar.popup.ts'))
  expect(generatePopups(root)).toBe(true)
  expect(
    readFileSync(join(root, 'src/popups/.generated/popups.ts'), 'utf8')
  ).toContain('export type PopupId = never')
})

it('rejects duplicate IDs with both conflicting paths', () => {
  const root = fixture()
  const first = definition(root, 'first/clock.popup.ts')
  const second = definition(root, 'second/clock.popup.ts')
  expect(() => generatePopups(root)).toThrow('Duplicate popup ID')
  try {
    generatePopups(root)
  } catch (error) {
    expect(String(error)).toContain(first)
    expect(String(error)).toContain(second)
  }
})

it.each([
  '.popup.ts',
  '1clock.popup.ts',
  'audio-outputs.popup.ts',
  'áudio.popup.ts'
])('rejects invalid definition name %s with its path', (name) => {
  const root = fixture()
  const path = definition(root, name)
  expect(() => generatePopups(root)).toThrow(`Invalid popup ID`)
  expect(() => generatePopups(root)).toThrow(path)
})

it('accepts ASCII identifier names and escapes prototype keys safely', () => {
  const root = fixture()
  for (const name of ['_details', '$details', 'x1', '__proto__'])
    definition(root, `${name}.popup.ts`)
  generatePopups(root)
  const generated = readFileSync(
    join(root, 'src/popups/.generated/popups.ts'),
    'utf8'
  )
  expect(generated).toContain('["__proto__"]:')
  expect(discoverPopups(join(root, 'src/features'))).toHaveLength(4)
})

it('retains required input and transformed context types through generated imports', () => {
  const root = fixture()
  const helper = JSON.stringify(
    join(projectRoot, 'src/popups/definition').replaceAll('\\', '/')
  )
  writeFileSync(
    definition(root, 'workspaceDetails.popup.ts'),
    `
    import { z } from 'zod'
    import { definePopup } from ${helper}
    export default definePopup({ label: 'Details', Content: () => null,
      schema: z.object({ workspace: z.string().transform(Number) }).strict() })
  `
  )
  writeFileSync(
    definition(root, 'empty.popup.ts'),
    `
    import { definePopup } from ${helper}
    export default definePopup({ label: 'Empty', Content: () => null })
  `
  )
  generatePopups(root)
  for (const name of ['resolve.ts', 'constants.ts', 'context.tsx']) {
    writeFileSync(
      join(root, 'src/popups', name),
      readFileSync(join(projectRoot, 'src/popups', name))
    )
  }
  const assertions = join(root, 'assertions.ts')
  writeFileSync(
    assertions,
    `
    import type { PopupParams, PopupValues } from './src/popups/resolve'
    import { usePopupContext } from './src/popups/context'
    const input: PopupParams<'workspaceDetails'> = { workspace: '3' }
    const output: PopupValues<'workspaceDetails'> = { workspace: 3 }
    const optional: PopupParams<'empty'> = undefined
    const empty: PopupParams<'empty'> = {}
    const context = usePopupContext('workspaceDetails')
    const number: number = context.params.workspace
    // @ts-expect-error A required schema makes params required.
    const missing: PopupParams<'workspaceDetails'> = undefined
    // @ts-expect-error Input uses the schema's original string type.
    const wrongInput: PopupParams<'workspaceDetails'> = { workspace: 3 }
    // @ts-expect-error Context exposes the transformed output.
    const wrongOutput: string = context.params.workspace
    // @ts-expect-error Omitted schemas reject extra parameters.
    const extra: PopupParams<'empty'> = { extra: true }
    // @ts-expect-error Arbitrary IDs are not part of the generated union.
    type Unknown = PopupParams<'unknown'>
  `
  )
  const program = ts.createProgram([assertions], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    paths: {
      zod: [join(projectRoot, 'node_modules/zod')],
      react: [join(projectRoot, 'node_modules/@types/react/index.d.ts')]
    }
  })
  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      )
  ).toEqual([])
}, 30_000)
