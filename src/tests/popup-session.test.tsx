import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { usePopupContext } from '../popups/context'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  mounted: vi.fn(),
  queries: vi.fn<(client: QueryClient) => void>(),
  prepare: vi.fn(async () => {}),
  disposed: vi.fn(),
  invoke: vi.fn(async () => null),
  resize: vi.fn(async () => ({ arrowX: 40 }))
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: host.invoke }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ label: 'popup-1' })
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (
    name: string,
    handler: (event: { payload: unknown }) => void
  ) => {
    host.listeners.set(name, handler)
    return () => host.listeners.delete(name)
  }
}))
vi.mock('../popups/prepare', () => ({ preparePopup: host.prepare }))
vi.mock('../popups/warmup', () => ({ warmPopupContents: () => () => {} }))
vi.mock('../services/system/overlay', () => ({
  overlay: { resize: host.resize, hide: vi.fn() }
}))
vi.mock('../popups/resolve', () => ({
  isPopupId: () => true,
  popupMetadata: () => ({ label: 'Session' }),
  resolvePopup: () => ({
    id: 'cpu',
    params: {},
    Content: Content
  })
}))
function Content() {
  const { params, close } = usePopupContext('cpu')
  const queries = useQueryClient()
  useEffect(() => {
    host.mounted()
    host.queries(queries)
    queries.setQueryData(
      ['preserved'],
      queries.getQueryData(['preserved']) ?? 'cached'
    )
    return host.disposed
  }, [params, close, queries])
  return <input aria-label="Draft" defaultValue="preserved" />
}
import Overlay from '../overlay/overlay'

beforeEach(() => {
  host.listeners.clear()
  host.mounted.mockClear()
  host.disposed.mockClear()
  host.queries.mockClear()
  host.resize.mockClear()
  host.prepare.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  window.__TAURI_INTERNALS__ = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('changes mode without replacing content, resizing, refocusing or reconnecting observers', async () => {
  const observe = vi.fn()
  const disconnect = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 320, 200)
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe
      disconnect = disconnect
    }
  )
  window.__TAURI_INTERNALS__ = {}
  render(<Overlay />)
  await waitFor(() => expect(host.listeners.size).toBe(4))
  act(() =>
    host.listeners.get('overlay:render')!({
      payload: {
        kind: 'popover',
        component: 'cpu',
        popup_session: 'one',
        session: 1,
        side: 'bottom',
        text: 'CPU'
      }
    })
  )
  const input = await screen.findByRole('textbox')
  input.focus()
  await waitFor(() => expect(host.resize).toHaveBeenCalledOnce())
  // Initial placement focuses the dialog; user focus after that must survive pin.
  input.focus()
  const dialog = screen.getByRole('dialog')
  const frame = dialog.parentElement!
  const padding = frame.style.paddingTop
  for (const [revision, pinned] of [
    [1, true],
    [2, false],
    [3, true]
  ] as const) {
    act(() =>
      host.listeners.get('popup:mode')!({
        payload: {
          session: 'one',
          revision,
          pinned,
          side: 'bottom',
          arrowX: 40
        }
      })
    )
    expect(screen.getByRole('textbox')).toBe(input)
    expect(document.activeElement).toBe(input)
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(frame.style.paddingTop).toBe(padding)
  }
  act(() =>
    host.listeners.get('popup:mode')!({
      payload: {
        session: 'one',
        revision: 2,
        pinned: false,
        side: 'bottom'
      }
    })
  )
  expect(
    screen.getByRole('button', { name: 'Desafixar popup' })
  ).toHaveAttribute('aria-pressed', 'true')
  act(() =>
    host.listeners.get('popup:mode')!({
      payload: {
        session: 'other',
        revision: 99,
        pinned: false,
        side: 'bottom'
      }
    })
  )
  expect(
    screen.getByRole('button', { name: 'Desafixar popup' })
  ).toBeInTheDocument()
  expect(host.mounted).toHaveBeenCalledOnce()
  expect(host.disposed).not.toHaveBeenCalled()
  expect(host.resize).toHaveBeenCalledOnce()
  expect(observe).toHaveBeenCalledOnce()
  expect(disconnect).not.toHaveBeenCalled()
})

it('gates first content on preparation, rejects late preparation and retains queries across leases', async () => {
  window.__TAURI_INTERNALS__ = {}
  let prepared!: () => void
  host.prepare.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        prepared = resolve
      })
  )
  render(<Overlay />)
  await waitFor(() => expect(host.listeners.size).toBe(4))
  const show = (session: number) =>
    host.listeners.get('overlay:render')!({
      payload: {
        kind: 'popover',
        component: 'cpu',
        popup_session: `lease-${session}`,
        session,
        side: 'bottom',
        text: 'CPU'
      }
    })
  act(() => {
    show(1)
  })
  expect(screen.queryByRole('textbox')).toBeNull()
  act(() => {
    host.listeners.get('overlay:clear')!({ payload: 2 })
  })
  await act(async () => prepared())
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(host.mounted).not.toHaveBeenCalled()
  await act(async () => {
    show(3)
  })
  const first = await screen.findByRole('textbox')
  const queries = host.queries.mock.calls[0][0]
  act(() => {
    host.listeners.get('overlay:clear')!({ payload: 4 })
  })
  expect(host.disposed).toHaveBeenCalledOnce()
  expect(screen.queryByRole('textbox')).toBeNull()
  await act(async () => {
    show(5)
  })
  expect(await screen.findByRole('textbox')).not.toBe(first)
  expect(host.queries.mock.calls[1][0]).toBe(queries)
  expect(queries.getQueryData(['preserved'])).toBe('cached')
})
