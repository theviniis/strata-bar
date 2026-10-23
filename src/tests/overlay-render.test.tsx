import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Handler = (event: { payload: unknown }) => void

const host = vi.hoisted(() => ({
  listeners: new Map<string, Handler>(),
  ready: vi.fn(),
  warmup: vi.fn(() => vi.fn())
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: host.ready }))
vi.mock('../popups/warmup', () => ({ warmPopupContents: host.warmup }))

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, handler: Handler) => {
    host.listeners.set(name, handler)
    return () => host.listeners.delete(name)
  }
}))

import Overlay from '../overlay/Overlay'
import { measureTooltip } from '../overlay/measure'

beforeEach(() => {
  host.listeners.clear()
  host.ready.mockClear()
  host.ready.mockResolvedValue(null)
  host.warmup.mockClear()
  window.__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  window.__TAURI_INTERNALS__ = undefined
})

async function mountOverlay() {
  render(<Overlay />)
  await waitFor(() => expect(host.listeners.has('overlay:render')).toBe(true))
}

it('starts warmup only after overlay readiness and cancels on unmount', async () => {
  let ready!: () => void
  host.ready.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      ready = resolve
    })
  )
  const { unmount } = render(<Overlay />)
  await waitFor(() => expect(host.ready).toHaveBeenCalledWith('overlay_ready'))
  expect(host.warmup).not.toHaveBeenCalled()
  await act(async () => ready())
  await waitFor(() => expect(host.warmup).toHaveBeenCalledOnce())
  const stop = host.warmup.mock.results[0].value
  unmount()
  expect(stop).toHaveBeenCalledOnce()
})

it('does not warm after unmounting while overlay readiness is pending', async () => {
  let ready!: () => void
  host.ready.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      ready = resolve
    })
  )
  const { unmount } = render(<Overlay />)
  await waitFor(() => expect(host.ready).toHaveBeenCalledWith('overlay_ready'))
  unmount()
  await act(async () => ready())
  expect(host.warmup).not.toHaveBeenCalled()
})

it('paints the rendered text as text, never as markup', async () => {
  await mountOverlay()
  act(() =>
    host.listeners.get('overlay:render')!({
      payload: {
        kind: 'tooltip',
        text: '<b>RAM</b>',
        side: 'bottom',
        arrowX: 120
      }
    })
  )
  expect(screen.getByText('<b>RAM</b>')).toBeInTheDocument()
  expect(document.querySelector('b')).toBeNull()
  expect(document.querySelector('.rotate-45')).toHaveStyle({ left: '120px' })
})

it('measures tooltip text with the same typography as the rendered overlay', async () => {
  await mountOverlay()
  act(() =>
    host.listeners.get('overlay:render')!({
      payload: { kind: 'tooltip', text: 'Clock', side: 'bottom' }
    })
  )
  const context = screen.getByText('Clock').closest('[aria-hidden="true"]')!
  let measured = false
  const measure = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      measured = true
      for (const token of context.classList) expect(this).toHaveClass(token)
      expect(this).toHaveStyle({ maxWidth: `${window.innerWidth}px` })
      return new DOMRect(0, 0, 100.25, 24)
    })
  try {
    measureTooltip('Clock')
    expect(measured).toBe(true)
    expect(document.querySelector('[style*="-10000px"]')).toBeNull()
  } finally {
    measure.mockRestore()
  }
})

it('renders nothing while idle and clears when the host hides it', async () => {
  const { container } = render(<Overlay />)
  await waitFor(() => expect(host.listeners.has('overlay:clear')).toBe(true))
  expect(container).toBeEmptyDOMElement()
  act(() =>
    host.listeners.get('overlay:render')!({
      payload: { kind: 'tooltip', text: 'Uso total de CPU', side: 'bottom' }
    })
  )
  expect(screen.getByText('Uso total de CPU')).toBeInTheDocument()
  act(() => host.listeners.get('overlay:clear')!({ payload: null }))
  expect(container).toBeEmptyDOMElement()
})

it('replays a preparation that arrived before the overlay listeners installed', async () => {
  host.ready.mockResolvedValueOnce({
    session: 10,
    render: {
      kind: 'tooltip',
      text: 'Prepared',
      side: 'bottom',
      session: 10
    }
  })
  await mountOverlay()
  expect(await screen.findByText('Prepared')).toBeInTheDocument()
})

it('ignores a late ready snapshot after a newer clear event', async () => {
  let ready!: (payload: unknown) => void
  host.ready.mockReturnValueOnce(
    new Promise((resolve) => {
      ready = resolve
    })
  )
  await mountOverlay()
  await waitFor(() => expect(host.listeners.has('overlay:clear')).toBe(true))
  act(() => host.listeners.get('overlay:clear')!({ payload: 21 }))
  await act(async () =>
    ready({
      session: 20,
      render: {
        kind: 'tooltip',
        text: 'Stale preparation',
        side: 'bottom',
        session: 20
      }
    })
  )
  expect(screen.queryByText('Stale preparation')).not.toBeInTheDocument()
})

it('clears a render whose hide occurred while listeners were still installing', async () => {
  let ready!: (payload: unknown) => void
  host.ready.mockReturnValueOnce(
    new Promise((resolve) => {
      ready = resolve
    })
  )
  await mountOverlay()
  act(() =>
    host.listeners.get('overlay:render')!({
      payload: {
        kind: 'tooltip',
        text: 'Missed clear',
        side: 'bottom',
        session: 30
      }
    })
  )
  await act(async () => ready({ session: 31, render: null }))
  expect(screen.queryByText('Missed clear')).not.toBeInTheDocument()
})

it('ignores old render and clear events after a newer session', async () => {
  await mountOverlay()
  act(() =>
    host.listeners.get('overlay:render')!({
      payload: { kind: 'tooltip', text: 'Current', side: 'bottom', session: 4 }
    })
  )
  act(() => host.listeners.get('overlay:clear')!({ payload: 3 }))
  act(() =>
    host.listeners.get('overlay:render')!({
      payload: { kind: 'tooltip', text: 'Old', side: 'bottom', session: 2 }
    })
  )
  expect(screen.getByText('Current')).toBeInTheDocument()
  expect(screen.queryByText('Old')).not.toBeInTheDocument()
  act(() => host.listeners.get('overlay:clear')!({ payload: 4 }))
  expect(screen.queryByText('Current')).not.toBeInTheDocument()
})
