import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SlidingHighlight } from '../components/ui/sliding-highlight'
import { WidgetItem } from '../components/widget-item'
import type { ComponentProps } from 'react'

// Assert measured targets here; real Motion interpolation is checked in-browser.
vi.mock('motion/react', () => ({
  useReducedMotion: () => false,
  motion: {
    span: ({
      animate,
      initial,
      transition,
      ...props
    }: ComponentProps<'span'> & {
      animate: ComponentProps<'span'>['style']
      initial: boolean
      transition: unknown
    }) => {
      void initial
      void transition
      return <span {...props} style={animate} />
    }
  }
}))

afterEach(() => vi.restoreAllMocks())

it('works with plain elements and keeps nested groups independent', () => {
  const { container } = render(
    <SlidingHighlight highlightClassName="rounded-full bg-primary/20">
      <div>
        <button data-sliding-highlight-item>Outer</button>
        <SlidingHighlight>
          <div>
            <button data-sliding-highlight-item>Inner</button>
          </div>
        </SlidingHighlight>
      </div>
    </SlidingHighlight>
  )
  const outer = container.querySelector('[data-sliding-highlight-group]')!
  const inner = screen.getByRole('button', { name: 'Inner' })
  vi.spyOn(inner, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(10, 10, 60, 28)
  )
  fireEvent.pointerMove(inner)
  const outerHighlight = outer.querySelector(
    ':scope > [data-sliding-highlight]'
  )!
  const innerHighlight = inner.parentElement!.querySelector(
    '[data-sliding-highlight]'
  )!
  expect(outerHighlight).toHaveStyle({ opacity: '0' })
  expect(outerHighlight).toHaveClass('rounded-full', 'bg-primary/20')
  expect(innerHighlight).toHaveStyle({ opacity: '1', width: '60px' })
})

function fixture() {
  const clicked = vi.fn()
  const { container, unmount } = render(
    <SlidingHighlight>
      <nav className="relative" aria-label="Bar">
        <WidgetItem onClick={clicked}>
          <span>CPU</span>
        </WidgetItem>
        <WidgetItem>Memory</WidgetItem>
        <WidgetItem disabled>Disabled</WidgetItem>
      </nav>
    </SlidingHighlight>
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
  const highlight = container.querySelector('[data-sliding-highlight]')!
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
  expect(bar.querySelectorAll('[data-sliding-highlight]')).toHaveLength(1)
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

it('copies each corner from the item and follows live shape changes', async () => {
  const { highlight } = fixture()
  const cpu = screen.getByRole('button', { name: 'CPU' })
  const memory = screen.getByRole('button', { name: 'Memory' })
  Object.assign(cpu.style, {
    borderTopLeftRadius: '9999px',
    borderTopRightRadius: '9999px',
    borderBottomRightRadius: '9999px',
    borderBottomLeftRadius: '9999px'
  })
  fireEvent.pointerMove(cpu)
  expect(highlight).toHaveStyle({
    borderTopLeftRadius: '9999px',
    borderTopRightRadius: '9999px',
    borderBottomRightRadius: '9999px',
    borderBottomLeftRadius: '9999px'
  })
  Object.assign(memory.style, {
    borderTopLeftRadius: '2px',
    borderTopRightRadius: '4px',
    borderBottomRightRadius: '6px',
    borderBottomLeftRadius: '8px'
  })
  fireEvent.pointerMove(memory)
  expect(highlight).toHaveStyle({
    borderTopLeftRadius: '2px',
    borderTopRightRadius: '4px',
    borderBottomRightRadius: '6px',
    borderBottomLeftRadius: '8px'
  })
  await act(async () => {
    memory.style.borderTopLeftRadius = '50%'
  })
  expect(highlight).toHaveStyle({ borderTopLeftRadius: '50%' })
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
