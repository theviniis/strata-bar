import { expect, it, vi } from 'vitest'
import { GLOBALS_UPDATED } from 'storybook/internal/core-events'
import { strataThemes } from '../../.storybook/theme'

const runtime = vi.hoisted(() => ({
  setConfig: vi.fn(),
  on: vi.fn(),
  getGlobals: vi.fn(() => ({ theme: 'light' }))
}))
vi.mock('storybook/manager-api', () => ({
  addons: {
    setConfig: runtime.setConfig,
    register: (_id: string, callback: (api: unknown) => void) =>
      callback({ on: runtime.on, getGlobals: runtime.getGlobals })
  }
}))

it('uses the saved toolbar theme in the manager and follows changes', async () => {
  await import('../../.storybook/manager')
  expect(runtime.setConfig).toHaveBeenLastCalledWith({
    theme: strataThemes.light
  })
  const update = runtime.on.mock.calls.find(
    ([event]) => event === GLOBALS_UPDATED
  )?.[1]
  expect(update).toBeTypeOf('function')
  update({ globals: { theme: 'dark' } })
  expect(runtime.setConfig).toHaveBeenLastCalledWith({
    theme: strataThemes.dark
  })
  update({ globals: { theme: 'light' } })
  expect(runtime.setConfig).toHaveBeenLastCalledWith({
    theme: strataThemes.light
  })
})
