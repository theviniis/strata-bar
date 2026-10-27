import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  show: vi.fn(async (_request: unknown) => {}),
  hide: vi.fn(async () => {})
}))

// Keep the real scheduling/measurement logic and stub only the transport.
vi.mock('../services/system/overlay', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/system/overlay')>()
  return { ...actual, overlay: { mode: 'native', ...transport } }
})

import { TOOLTIP_DELAY, useOverlayTooltip } from '../hooks/use-overlay-tooltip'
import { TooltipSurface } from '../overlay/tooltip-surface'

function Target({ text }: { text: string }) {
  const tip = useOverlayTooltip(text)
  return (
    <div {...tip.trigger} data-testid="target">
      <span id={tip.describedBy} role="tooltip">
        {text}
      </span>
    </div>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  transport.show.mockClear()
  transport.hide.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

it('waits for the hover intent, then shows one overlay tooltip', () => {
  render(<Target text="Uso total de CPU" />)
  const target = screen.getByTestId('target')
  fireEvent.pointerEnter(target)
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY - 1))
  expect(transport.show).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(transport.show).toHaveBeenCalledTimes(1)
  expect(
    transport.show.mock.calls[0][0] as Record<string, unknown>
  ).toMatchObject({
    v: 1,
    kind: 'tooltip',
    text: 'Uso total de CPU',
    side: 'bottom'
  })
  fireEvent.pointerLeave(target)
  expect(transport.hide).toHaveBeenCalledTimes(1)
})

it('cancels a pending tooltip when the pointer leaves early', () => {
  render(<Target text="Uso da RAM" />)
  const target = screen.getByTestId('target')
  fireEvent.pointerEnter(target)
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY / 2))
  fireEvent.pointerLeave(target)
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY))
  expect(transport.show).not.toHaveBeenCalled()
})

it('anchors tooltips on the whole widget container, including its icon', () => {
  render(<Target text="CPU" />)
  const target = screen.getByTestId('target')
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  target.append(icon)
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(80, 0, 100, 30)
  )
  vi.spyOn(icon, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 5, 14, 14)
  )
  fireEvent.pointerEnter(target)
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY))
  expect(transport.show).toHaveBeenCalledWith(
    expect.objectContaining({
      anchor: { x: 80, y: 0, width: 100, height: 30 }
    })
  )
})

it('drops a pending tooltip when the widget unmounts', () => {
  const { unmount } = render(<Target text="Volume do dispositivo padrão" />)
  fireEvent.pointerEnter(screen.getByTestId('target'))
  unmount()
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY))
  expect(transport.show).not.toHaveBeenCalled()
})

it('hides a visible tooltip on Escape', () => {
  render(<Target text="Hora local" />)
  fireEvent.pointerEnter(screen.getByTestId('target'))
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY))
  expect(transport.show).toHaveBeenCalledTimes(1)
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
  })
  expect(transport.hide).toHaveBeenCalledTimes(1)
})

it('shares the shadcn pill classes with the studio tooltip', () => {
  render(<TooltipSurface text="RAM · demo" side="bottom" />)
  const pill = screen.getByText('RAM · demo')
  for (const token of [
    'rounded-md',
    'bg-popover',
    'text-popover-foreground',
    'px-3',
    'py-1.5'
  ]) {
    expect(pill).toHaveClass(token)
  }
})

it('does not schedule an empty tooltip when its configured presentation is disabled', () => {
  render(<Target text="" />)
  const target = screen.getByTestId('target')
  fireEvent.pointerEnter(target)
  fireEvent.focus(target)
  expect(vi.getTimerCount()).toBe(0)
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY))
  expect(transport.show).not.toHaveBeenCalled()
})

it('hides the current tooltip when its configured text is disabled', () => {
  const view = render(<Target text="Detalhes da CPU" />)
  fireEvent.pointerEnter(screen.getByTestId('target'))
  act(() => vi.advanceTimersByTime(TOOLTIP_DELAY))
  expect(transport.show).toHaveBeenCalledOnce()
  view.rerender(<Target text="" />)
  expect(transport.hide).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
