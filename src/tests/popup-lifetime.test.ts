import { afterEach, expect, it, vi } from 'vitest'
import { popupIsActive } from '@/popups/coordinator'
import { PopupLifetime, type PopupLifetimeAdapter } from '@/popups/lifetime'

const owners: PopupLifetime[] = []

it('releases detached ownership and attaches a returned session independently', async () => {
  const first = owner('native')
  await first.lifetime.setOpen(true)
  const session = first.show.mock.calls[0][0]
  first.lifetime.detach()
  expect(first.adapter.hide).not.toHaveBeenCalled()
  expect(popupIsActive()).toBe(false)
  const second = owner('native')
  await second.lifetime.setOpen(true)
  first.lifetime.attach(session)
  expect(second.adapter.hide).toHaveBeenCalledOnce()
  expect(first.lifetime.getSnapshot()).toMatchObject({ open: true, session })
  first.lifetime.closed({ session: 'unrelated' })
  expect(first.lifetime.getSnapshot().open).toBe(true)
})

function owner(mode: PopupLifetimeAdapter['mode']) {
  const show = vi.fn<(session: string) => void | Promise<unknown>>()
  const adapter = {
    mode,
    prepare: vi.fn(() => show),
    hide: vi.fn(),
    beforeOpen: vi.fn(),
    dock: vi.fn(),
    cleanup: vi.fn(),
    restoreFocus: vi.fn()
  }
  const lifetime = new PopupLifetime(adapter)
  owners.push(lifetime)
  return { lifetime, adapter, show }
}

afterEach(() => {
  owners.splice(0).forEach((lifetime) => lifetime.dispose())
})

it.each(['native', 'demo'] as const)(
  'preserves %s release timing and prevents an old exit from releasing its replacement',
  async (mode) => {
    const first = owner(mode)
    await first.lifetime.setOpen(true)
    const session = first.show.mock.calls[0][0]
    await first.lifetime.setOpen(false)
    expect(first.lifetime.getSnapshot().open).toBe(mode === 'demo')
    expect(popupIsActive()).toBe(mode === 'demo')

    const second = owner(mode)
    await second.lifetime.setOpen(true)
    first.lifetime.closed({ session, docked: true, restoreFocus: true })
    expect(second.lifetime.getSnapshot().open).toBe(true)
    expect(popupIsActive()).toBe(true)
    expect(first.adapter.restoreFocus).toHaveBeenCalledTimes(
      mode === 'native' ? 1 : 0
    )
    // Native docking is acknowledged independently by the native host. Studio
    // replacement skips the old animation and therefore never docks its anchor.
    expect(first.adapter.dock).toHaveBeenCalledTimes(mode === 'native' ? 1 : 0)
  }
)

it.each(['native', 'demo'] as const)(
  'ignores a previous %s opening after the same widget reopens',
  async (mode) => {
    const { lifetime, adapter, show } = owner(mode)
    await lifetime.setOpen(true)
    const previous = show.mock.calls[0][0]
    await lifetime.setOpen(false)
    await lifetime.setOpen(false)
    await lifetime.setOpen(true)
    const current = show.mock.calls[1][0]
    expect(current).not.toBe(previous)
    lifetime.closed({ session: previous, docked: true, restoreFocus: true })
    expect(lifetime.getSnapshot()).toMatchObject({ open: true, closing: false })
    expect(adapter.dock).not.toHaveBeenCalled()
    expect(adapter.restoreFocus).not.toHaveBeenCalled()

    await lifetime.setOpen(false)
    lifetime.closed({ session: current, docked: true })
    lifetime.closed({ session: current, docked: true })
    expect(lifetime.getSnapshot()).toMatchObject({
      open: false,
      closing: false
    })
    expect(adapter.dock).toHaveBeenCalledOnce()
    expect(popupIsActive()).toBe(false)
  }
)

it('does not reopen or release another owner when a pending native show completes', async () => {
  const first = owner('native')
  let finish!: () => void
  first.show.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
  const opening = first.lifetime.setOpen(true)
  expect(first.lifetime.getSnapshot().open).toBe(false)
  const second = owner('native')
  await second.lifetime.setOpen(true)
  finish()
  await opening
  expect(first.lifetime.getSnapshot().open).toBe(false)
  expect(first.adapter.hide).toHaveBeenCalledWith(first.show.mock.calls[0][0])
  expect(second.lifetime.getSnapshot().open).toBe(true)
  expect(popupIsActive()).toBe(true)
})

it.each(['native', 'demo'] as const)(
  'validates %s input before replacing another owner',
  async (mode) => {
    const first = owner(mode)
    await first.lifetime.setOpen(true)
    const invalid = owner(mode)
    invalid.adapter.prepare.mockImplementation(() => {
      throw new Error('Invalid popup')
    })
    await invalid.lifetime.setOpen(true)
    expect(first.lifetime.getSnapshot().open).toBe(true)
    expect(first.adapter.hide).not.toHaveBeenCalled()
    expect(invalid.show).not.toHaveBeenCalled()
    expect(invalid.lifetime.getSnapshot().error).toContain('Invalid popup')
    expect(popupIsActive()).toBe(true)
  }
)

it.each(['native', 'demo'] as const)(
  'disposes %s ownership without docking or restoring focus',
  async (mode) => {
    const { lifetime, adapter, show } = owner(mode)
    await lifetime.setOpen(true)
    const session = show.mock.calls[0][0]
    lifetime.dispose()
    lifetime.closed({ session, docked: true, restoreFocus: true })
    expect(popupIsActive()).toBe(false)
    expect(adapter.dock).not.toHaveBeenCalled()
    expect(adapter.restoreFocus).not.toHaveBeenCalled()
    expect(adapter.cleanup).toHaveBeenCalledOnce()
    expect(adapter.hide).toHaveBeenCalledTimes(mode === 'native' ? 1 : 0)
  }
)

it('only restores native focus when the matching close explicitly requests it', async () => {
  const { lifetime, adapter, show } = owner('native')
  await lifetime.setOpen(true)
  lifetime.closed({ session: 'foreign', restoreFocus: true, docked: true })
  expect(adapter.restoreFocus).not.toHaveBeenCalled()
  lifetime.closed({ session: show.mock.calls[0][0], docked: false })
  expect(adapter.restoreFocus).not.toHaveBeenCalled()
  expect(adapter.dock).not.toHaveBeenCalled()
  await lifetime.setOpen(true)
  lifetime.closed({ session: show.mock.calls[1][0], restoreFocus: true })
  expect(adapter.restoreFocus).toHaveBeenCalledOnce()
})

it('does not notify idle native widgets on repeated dismissal input', async () => {
  const { lifetime } = owner('native')
  const before = lifetime.getSnapshot()
  const changed = vi.fn()
  const stop = lifetime.subscribe(changed)
  await lifetime.setOpen(false)
  await lifetime.setOpen(false)
  expect(lifetime.getSnapshot()).toBe(before)
  expect(changed).not.toHaveBeenCalled()
  stop()
})
