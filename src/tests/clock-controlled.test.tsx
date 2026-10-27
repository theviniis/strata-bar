import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Clock } from '@/features/clock/Clock'
import { ClockController } from '@/features/clock/ClockController'
import { ClockPopup } from '@/features/clock/clock.popup'
import { ClockPopupController } from '@/features/clock/clock.popup'
import { clockFixture } from '@/features/clock/fixtures'
import { WidgetPreviewContext } from '@/components/status-bar/widget-preview-context'

vi.mock('@/services/system/overlay', () => ({
  overlay: { mode: 'demo', hide: vi.fn(async () => {}) }
}))
afterEach(() => vi.useRealTimers())
it('uses the shared widget center alignment by default', () => {
  render(
    <Clock time={clockFixture()} showDate={false} describedBy={undefined} />
  )
  const button = screen.getByRole('button', { name: 'Abrir calendário' })
  expect(button).toHaveClass('items-center')
  expect(button).not.toHaveClass('items-end')
})
it('lets caller classes override the shared widget alignment', () => {
  render(
    <Clock
      time={clockFixture()}
      showDate={false}
      describedBy={undefined}
      className="items-start"
    />
  )
  const button = screen.getByRole('button', { name: 'Abrir calendário' })
  expect(button).toHaveClass('items-start')
  expect(button).not.toHaveClass('items-center')
  expect(button).not.toHaveClass('items-end')
})
it('renders explicit clock props and forwards trigger refs and callbacks', () => {
  const time = clockFixture()
  const click = vi.fn()
  const ref = vi.fn()
  const result = render(
    <Clock
      time={time}
      showDate
      describedBy="clock-tip"
      onClick={click}
      ref={ref}
    />
  )
  expect(screen.getByText(time.hours)).toBeVisible()
  expect(screen.getByText(time.date)).toBeVisible()
  const button = screen.getByRole('button', { name: 'Abrir calendário' })
  expect(button).toHaveAttribute('aria-describedby', 'clock-tip')
  expect(ref).toHaveBeenCalledWith(button)
  fireEvent.click(button)
  expect(click).toHaveBeenCalledOnce()
  result.rerender(
    <Clock time={time} showDate={false} describedBy={undefined} />
  )
  expect(screen.queryByText(time.date)).not.toBeInTheDocument()
})
it('aligns updates to the minute and clears the timer on unmount', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 23, 9, 41, 45))
  const result = render(<ClockController />)
  const initial = document.querySelector('time')!.dateTime
  act(() => vi.advanceTimersByTime(14999))
  expect(document.querySelector('time')).toHaveAttribute('datetime', initial)
  act(() => vi.advanceTimersByTime(1))
  expect(document.querySelector('time')).toHaveAttribute(
    'datetime',
    new Date(2026, 9, 23, 9, 42).toISOString()
  )
  expect(vi.getTimerCount()).toBe(1)
  result.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('keeps the clock preview free of timers', () => {
  vi.useFakeTimers()
  const result = render(
    <WidgetPreviewContext value={true}>
      <ClockController />
    </WidgetPreviewContext>
  )
  expect(vi.getTimerCount()).toBe(0)
  result.unmount()
})
it('controls calendar month, selected day and today from props across midnight', () => {
  const time = clockFixture()
  const result = render(
    <ClockPopup
      time={time}
      calendarMonth={time.now}
      selectedDate={time.now}
      onDateSelect={vi.fn()}
    />
  )
  expect(screen.getByText(time.hours)).toHaveAttribute(
    'datetime',
    time.dateTime
  )
  expect(document.querySelector('[data-slot="calendar"]')).toHaveAttribute(
    'inert'
  )
  expect(
    document.querySelector('[data-selected-single="true"]')
  ).toHaveTextContent('23')
  const next = {
    ...time,
    now: new Date(2026, 10, 1),
    hours: '00:00',
    dateTime: new Date(2026, 10, 1).toISOString()
  }
  result.rerender(
    <ClockPopup
      time={next}
      calendarMonth={next.now}
      selectedDate={next.now}
      onDateSelect={vi.fn()}
    />
  )
  expect(screen.getByRole('grid')).toHaveAttribute(
    'aria-label',
    'November 2026'
  )
  expect(
    document.querySelector('[data-selected-single="true"]')
  ).toHaveTextContent('1')
})
it('popup controller advances its calendar month at midnight and cleans up', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 59))
  const result = render(<ClockPopupController />)
  expect(screen.getByRole('grid')).toHaveAttribute('aria-label', 'October 2026')
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.getByRole('grid')).toHaveAttribute(
    'aria-label',
    'November 2026'
  )
  result.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
