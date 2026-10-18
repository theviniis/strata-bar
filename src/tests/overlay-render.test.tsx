import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Handler = (event: { payload: unknown }) => void

const host = vi.hoisted(() => ({
  listeners: new Map<string, Handler>()
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, handler: Handler) => {
    host.listeners.set(name, handler)
    return () => host.listeners.delete(name)
  }
}))

import Overlay from '../overlay/Overlay'

beforeEach(() => {
  host.listeners.clear()
  window.__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  window.__TAURI_INTERNALS__ = undefined
})

async function mountOverlay() {
  render(<Overlay />)
  await waitFor(() => expect(host.listeners.has('overlay:render')).toBe(true))
}

it('paints the rendered text as text, never as markup', async () => {
  await mountOverlay()
  act(() =>
    host.listeners.get('overlay:render')!({
      payload: { kind: 'tooltip', text: '<b>RAM</b>', side: 'bottom' }
    })
  )
  expect(screen.getByText('<b>RAM</b>')).toBeInTheDocument()
  expect(document.querySelector('b')).toBeNull()
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
