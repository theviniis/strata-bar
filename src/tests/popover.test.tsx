import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const host = vi.hoisted(() => ({
  show: vi.fn(),
  hide: vi.fn(),
  closed: null as null | ((event: { payload: { session: string } }) => void)
}))
vi.mock('../services/system/overlay', () => ({
  overlay: { mode: 'native', show: host.show, hide: host.hide }
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, handler: typeof host.closed) => {
    host.closed = handler
    return () => {
      host.closed = null
    }
  }
}))
import { useOverlayPopover } from '../hooks/useOverlayPopover'
function Trigger() {
  const { triggerRef, open, toggle } = useOverlayPopover('audioOutputs')
  return (
    <div data-overlay-anchor>
      <button
        ref={triggerRef}
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        Outputs
      </button>
    </div>
  )
}
beforeEach(() => {
  host.show.mockResolvedValue(undefined)
  host.hide.mockResolvedValue(undefined)
  vi.clearAllMocks()
})
it('opens a typed popup, closes on a second click and ignores another owner closing', async () => {
  render(<Trigger />)
  vi.spyOn(
    screen.getByRole('button').parentElement!,
    'getBoundingClientRect'
  ).mockReturnValue(new DOMRect(100, 0, 80, 36))
  await waitFor(() => expect(host.closed).not.toBeNull())
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() =>
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  )
  const request = host.show.mock.calls[0][0]
  expect(request).toMatchObject({
    kind: 'popover',
    component: 'audioOutputs',
    anchor: { x: 100, y: 0, width: 80, height: 36 },
    size: { width: 320, height: 380 }
  })
  act(() => host.closed!({ payload: { session: 'another-owner' } }))
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() =>
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  )
  expect(host.hide).toHaveBeenCalledWith(request.session)
})
it('closes on Escape and outside pointer input', async () => {
  render(<Trigger />)
  await waitFor(() => expect(host.closed).not.toBeNull())
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() =>
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  )
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() =>
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  )
  fireEvent.pointerDown(document.body)
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
})
