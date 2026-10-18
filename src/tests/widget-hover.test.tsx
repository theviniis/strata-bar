import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WidgetHoverGroup } from '../components/widget-hover'
import { WidgetItem } from '../components/widget-item'

afterEach(() => vi.restoreAllMocks())

function fixture() {
  const clicked = vi.fn()
  const { container, unmount } = render(
    <WidgetHoverGroup>
      <nav className="relative" aria-label="Bar">
        <WidgetItem onClick={clicked}>
          <span>CPU</span>
        </WidgetItem>
        <WidgetItem>Memory</WidgetItem>
        <WidgetItem disabled>Disabled</WidgetItem>
      </nav>
    </WidgetHoverGroup>
  )
  const bar = screen.getByRole('navigation')
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(10, 20, 400, 36)
  )
  vi.spyOn(
    screen.getByRole('button', { name: 'CPU' }),
    'getBoundingClientRect'
  ).mockReturnValue(new DOMRect(30, 24, 60, 28))
  vi.spyOn(
    screen.getByRole('button', { name: 'Memory' }),
    'getBoundingClientRect'
  ).mockReturnValue(new DOMRect(100, 24, 90, 28))
  const highlight = container.querySelector('[data-widget-hover-highlight]')!
  return { bar, highlight, clicked, unmount }
}

it('slides a single background between whole widgets, including across gaps', () => {
  const { bar, highlight } = fixture()
  expect(highlight).toHaveStyle({ opacity: '0' })
  fireEvent.pointerMove(screen.getByText('CPU'))
  expect(highlight).toHaveStyle({
    left: '20px',
    top: '4px',
    width: '60px',
    height: '28px',
    opacity: '1'
  })
  expect(highlight).toHaveAttribute('data-moving', 'false')
  fireEvent.pointerMove(bar)
  expect(highlight).toHaveStyle({ opacity: '0' })
  fireEvent.pointerMove(screen.getByText('Memory'))
  expect(highlight).toHaveStyle({ left: '90px', width: '90px', opacity: '1' })
  expect(highlight).toHaveAttribute('data-moving', 'true')
  expect(bar.querySelectorAll('[data-widget-hover-highlight]')).toHaveLength(1)
  fireEvent.pointerLeave(bar)
  expect(highlight).toHaveStyle({ opacity: '0' })
})

it('does not select on click or focus, and preserves widget actions', () => {
  const { bar, highlight, clicked } = fixture()
  fireEvent.focus(screen.getByRole('button', { name: 'CPU' }))
  fireEvent.click(screen.getByRole('button', { name: 'CPU' }))
  expect(clicked).toHaveBeenCalledOnce()
  expect(highlight).toHaveStyle({ opacity: '0' })
  fireEvent.pointerMove(screen.getByText('CPU'))
  fireEvent.click(screen.getByText('CPU'))
  fireEvent.pointerLeave(bar)
  expect(highlight).toHaveStyle({ opacity: '0' })
  fireEvent.pointerMove(screen.getByText('Disabled'))
  expect(highlight).toHaveStyle({ opacity: '0' })
})

it('updates geometry when live metrics change and cleans up the portal', async () => {
  const { bar, highlight, unmount } = fixture()
  fireEvent.pointerMove(screen.getByText('CPU'))
  const target = screen.getByRole('button', { name: 'CPU' })
  vi.mocked(target.getBoundingClientRect).mockReturnValue(
    new DOMRect(30, 24, 85, 28)
  )
  await act(async () => {
    target.firstChild!.textContent = 'CPU 100%'
  })
  expect(highlight).toHaveStyle({ width: '85px' })
  unmount()
  expect(document.contains(highlight)).toBe(false)
  expect(document.contains(bar)).toBe(false)
})
