import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { cubicBezier, interpolate } from 'motion'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const motion = vi.hoisted(() => ({ animate: vi.fn() }))
vi.mock('motion/react', () => ({
  useAnimate: () => [useRef(null), motion.animate]
}))
import { PopupSurface } from '../popups/PopupSurface'
import {
  popupDockKeyframes,
  popupOpenKeyframes,
  POPUP_ENTER_MS
} from '../popups/motion'
import { overlay } from '../services/system/overlay'

beforeEach(() => {
  motion.animate.mockReset()
  motion.animate.mockImplementation(() => ({
    stop: vi.fn(),
    complete: vi.fn(),
    then: vi.fn()
  }))
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps expansion velocity continuous through the middle of opening', () => {
  render(
    <PopupSurface mode="demo" label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  const frame = vi.mocked(window.requestAnimationFrame)
  act(() => frame.mock.calls[0][0](0))
  act(() => frame.mock.calls[1][0](16))
  const [, keyframes, options] = motion.animate.mock.calls[1]
  const curves = options.ease
  const ease =
    typeof curves[0] === 'number'
      ? cubicBezier(...(curves as [number, number, number, number]))
      : curves.map((curve: [number, number, number, number]) =>
          cubicBezier(...curve)
        )
  const values = keyframes.scaleY as number[]
  const times = options.times ?? values.map((_, i) => i / (values.length - 1))
  const sample = interpolate(times, values, { ease })
  // The previous segmented easing stopped at 40% and accelerated again.
  const before = (sample(0.4) - sample(0.398)) / 0.002
  const after = (sample(0.402) - sample(0.4)) / 0.002
  expect(Math.abs(after - before)).toBeLessThan(0.1)
})

it('prepares a hidden panel and opens only after two presentation frames', () => {
  const { rerender, unmount } = render(
    <PopupSurface mode="demo" label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  const frame = vi.mocked(window.requestAnimationFrame)
  expect(motion.animate).toHaveBeenCalledTimes(1)
  expect(motion.animate.mock.calls[0][1]).toMatchObject({ opacity: 0 })
  act(() => frame.mock.calls[0][0](0))
  expect(motion.animate).toHaveBeenCalledTimes(1)
  act(() => frame.mock.calls[1][0](16))
  expect(motion.animate.mock.calls[1][1]).toMatchObject({
    opacity: [0, 1],
    scaleX: [expect.any(Number), 1],
    scaleY: [expect.any(Number), 1]
  })
  rerender(
    <PopupSurface mode="demo" label="Popup" close={() => {}}>
      Updated
    </PopupSurface>
  )
  expect(motion.animate).toHaveBeenCalledTimes(2)
  const controls = motion.animate.mock.results[1].value
  unmount()
  expect(controls.stop).toHaveBeenCalled()
})

it('waits for native placement before opening and uses the widget dimensions', async () => {
  let reveal!: (size: {
    arrowX: number
    anchorSize: { width: number; height: number }
  }) => void
  vi.spyOn(overlay, 'resize').mockReturnValue(
    new Promise((resolve) => {
      reveal = resolve
    })
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 320, 200)
  )
  const props = {
    mode: 'native' as const,
    session: 'opening',
    label: 'Popup',
    close: () => {}
  }
  const { rerender, container } = render(
    <PopupSurface {...props}>Content</PopupSurface>
  )
  expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  await act(async () =>
    reveal({ arrowX: 280, anchorSize: { width: 80, height: 28 } })
  )
  expect(window.requestAnimationFrame).toHaveBeenCalledOnce()
  rerender(
    <PopupSurface {...props} closing>
      Content
    </PopupSurface>
  )
  expect(container.querySelector('[style*="transform-origin"]')).toHaveStyle({
    transformOrigin: '280px 0%'
  })
  expect(motion.animate.mock.lastCall![1]).toMatchObject({
    scaleX: [null, 0.42, 0.25, 0.215]
  })
})

it('keeps content inert during travel and reports docking only after completion', () => {
  const onExited = vi.fn()
  const { rerender, container, unmount } = render(
    <PopupSurface
      mode="demo"
      label="Popup"
      close={() => {}}
      onExited={onExited}
    >
      Content
    </PopupSurface>
  )
  rerender(
    <PopupSurface
      mode="demo"
      closing
      label="Popup"
      close={() => {}}
      onExited={onExited}
    >
      Content
    </PopupSurface>
  )
  expect(container.textContent).toBe('Content')
  expect(container.querySelector('[inert]')).not.toBeNull()
  expect(onExited).not.toHaveBeenCalled()
  const exit = motion.animate.mock.results.at(-1)!.value
  const finish = exit.then.mock.calls[0][0]
  act(() => finish())
  expect(onExited).toHaveBeenCalledOnce()
  unmount()
  act(() => finish())
  expect(onExited).toHaveBeenCalledOnce()
})

it('does not restart opening if closed before the presentation frames', () => {
  const { rerender } = render(
    <PopupSurface mode="demo" label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  const frame = vi.mocked(window.requestAnimationFrame)
  act(() => frame.mock.calls[0][0](0))
  rerender(
    <PopupSurface mode="demo" closing label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  const calls = motion.animate.mock.calls.length
  act(() => frame.mock.calls[1][0](16))
  expect(motion.animate).toHaveBeenCalledTimes(calls)
})

it('skips travel and completes immediately for reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const onExited = vi.fn()
  render(
    <PopupSurface
      mode="demo"
      closing
      label="Popup"
      close={() => {}}
      onExited={onExited}
    >
      Content
    </PopupSurface>
  )
  expect(motion.animate).not.toHaveBeenCalled()
  expect(onExited).toHaveBeenCalledOnce()
})

it('mirrors the docking trajectory for bottom bars', () => {
  const size = { width: 320, height: 200 }
  const top = popupDockKeyframes('bottom', size)
  const bottom = popupDockKeyframes('top', size)
  expect(bottom.scaleX).toEqual(top.scaleX)
  expect(bottom.y).toEqual(top.y.map((y) => (y === null ? null : -y)))
  expect(top.opacity).toEqual([null, 1, 1, 0])
})

it('emerges from the widget, travels outward and settles without overshoot', () => {
  const size = { width: 320, height: 200 }
  const anchor = { width: 80, height: 28 }
  const opening = popupOpenKeyframes('bottom', size, anchor)
  expect(opening.scaleX[0]).toBe(0.25)
  expect(opening.scaleY[0]).toBe(0.14)
  expect(opening.y).toEqual([-12, 0])
  expect(opening.y.at(-1)).toBe(0)
  expect(Math.max(...opening.scaleX)).toBe(1)
  expect(opening.opacity).toEqual([0, 1])
  expect(opening.clipPath[0]).toBe('inset(0px round 160px)')
  expect(POPUP_ENTER_MS).toBe(500)
  const mirrored = popupOpenKeyframes('top', size, anchor)
  expect(mirrored.y).toEqual(opening.y.map((y) => (y === 0 ? 0 : -y)))
})

it('removes the entry clip after settling and never restores it during exit', () => {
  const { rerender } = render(
    <PopupSurface mode="demo" label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  const frame = vi.mocked(window.requestAnimationFrame)
  act(() => frame.mock.calls[0][0](0))
  act(() => frame.mock.calls[1][0](16))
  const finish = motion.animate.mock.results[1].value.then.mock.calls[0][0]
  act(() => finish())
  expect(motion.animate.mock.lastCall![1]).toEqual({ clipPath: 'none' })
  rerender(
    <PopupSurface mode="demo" closing label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  const calls = motion.animate.mock.calls.length
  act(() => finish())
  expect(motion.animate).toHaveBeenCalledTimes(calls)
})
