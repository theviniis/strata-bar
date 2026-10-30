import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ pin: vi.fn(), drag: vi.fn() }))
vi.mock('../services/system/overlay', () => ({
  overlay: {
    pin: native.pin,
    drag: native.drag,
    resize: vi.fn(async () => ({ arrowX: 0 }))
  }
}))

import { PopupSurface } from '../popups/popup-surface'
import { WidgetPopup } from '../popups/widget-popup'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.clearAllMocks()
  native.pin.mockResolvedValue(undefined)
  native.drag.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

it('exposes accessible pin state and preserves explicit close and Escape', () => {
  const close = vi.fn()
  const change = vi.fn()
  const { rerender } = render(
    <PopupSurface label="CPU" mode="demo" close={close} onPinChange={change}>
      Content
    </PopupSurface>
  )
  const pin = screen.getByRole('button', { name: 'Fixar popup' })
  expect(pin).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(pin)
  expect(change).toHaveBeenCalledWith(true)
  rerender(
    <PopupSurface
      label="CPU"
      mode="demo"
      pinned
      close={close}
      onPinChange={change}
    >
      Content
    </PopupSurface>
  )
  expect(
    screen.getByRole('button', { name: 'Desafixar popup' })
  ).toHaveAttribute('aria-pressed', 'true')
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Fechar popup' }))
  expect(close).toHaveBeenCalledTimes(2)
})

it('waits for native transfer and reports a failure without claiming to be pinned', async () => {
  let reject!: (error: Error) => void
  native.pin.mockReturnValueOnce(
    new Promise<void>((_resolve, fail) => {
      reject = fail
    })
  )
  render(
    <PopupSurface
      label="CPU"
      mode="native"
      session="cpu-session"
      close={() => {}}
    >
      Content
    </PopupSurface>
  )
  const pin = screen.getByRole('button', { name: 'Fixar popup' })
  fireEvent.click(pin)
  expect(native.pin).toHaveBeenCalledWith('cpu-session', true)
  expect(pin).toBeDisabled()
  reject(new Error('Transfer failed'))
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Transfer failed')
  )
  expect(pin).toBeEnabled()
  expect(pin).toHaveAttribute('aria-pressed', 'false')
})

it('keeps special alerts free of window controls', () => {
  render(
    <PopupSurface
      label="Alert"
      mode="demo"
      pinnable={false}
      closeOnEscape={false}
      close={() => {}}
    >
      Alert
    </PopupSurface>
  )
  expect(screen.queryByRole('button', { name: 'Fixar popup' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Fechar popup' })).toBeNull()
})

it('starts native dragging only from the pinned header, never its buttons', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const { container } = render(
    <PopupSurface
      label="CPU"
      mode="native"
      pinned
      session="one"
      close={() => {}}
    >
      Content
    </PopupSurface>
  )
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'Desafixar popup' }),
    { button: 0 }
  )
  expect(native.drag).not.toHaveBeenCalled()
  fireEvent.pointerDown(container.querySelector('[data-popup-drag-handle]')!, {
    button: 0
  })
  expect(native.drag).toHaveBeenCalledWith('one')
})

it('keeps studio pins open while another widget opens and avoids duplicate pins', async () => {
  render(
    <>
      <WidgetPopup.Root popup="cpu">
        <WidgetPopup.Trigger>Open CPU</WidgetPopup.Trigger>
      </WidgetPopup.Root>
      <WidgetPopup.Root popup="gpu">
        <WidgetPopup.Trigger>Open GPU</WidgetPopup.Trigger>
      </WidgetPopup.Root>
    </>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open CPU' }))
  const cpu = await screen.findByRole('dialog', { name: 'CPU' })
  fireEvent.click(await screen.findByRole('button', { name: 'Fixar popup' }))
  expect(screen.getByRole('dialog', { name: 'CPU' })).toBe(cpu)
  expect(
    screen.getByRole('button', { name: 'Desafixar popup' })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open CPU' }))
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Open GPU' }))
  expect(
    await screen.findByRole('button', { name: 'Fixar popup' })
  ).toBeInTheDocument()
  expect(screen.getAllByRole('dialog')).toHaveLength(2)
  fireEvent.click(within(cpu).getByRole('button', { name: 'Desafixar popup' }))
  expect(screen.getByRole('dialog', { name: 'CPU' })).toBe(cpu)
  await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
})
