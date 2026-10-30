import { useConfig } from '../stores/config'
import { defaultConfig } from '../services/configuration/config'
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { cubicBezier, interpolate } from 'motion'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const motion = vi.hoisted(() => ({ animate: vi.fn() }))
vi.mock('motion/react', async (original) => ({
  ...(await original<typeof import('motion/react')>()),
  useAnimate: () => [useRef(null), motion.animate]
}))
import { PopupSurface } from '../popups/popup-surface'
import {
  popupDockKeyframes,
  popupOpenKeyframes,
  popupTransformKeyframes,
  POPUP_ENTER_MS
} from '../popups/motion'
import { overlay } from '../services/system/overlay'

it('acknowledges native opening only after the animation finishes', async () => {
  const opened = vi.spyOn(overlay, 'opened').mockResolvedValue(undefined)
  vi.spyOn(overlay, 'resize').mockResolvedValue({ arrowX: 100 })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 320, 200)
  )
  render(
    <PopupSurface
      mode="native"
      session="defer-reserve"
      label="Popup"
      close={() => {}}
    >
      Content
    </PopupSurface>
  )
  await act(async () => {})
  expect(opened).not.toHaveBeenCalled()
  const frame = vi.mocked(window.requestAnimationFrame)
  act(() => frame.mock.calls[0][0](0))
  act(() => frame.mock.calls[1][0](16))
  expect(opened).not.toHaveBeenCalled()
  act(() => motion.animate.mock.results[1].value.then.mock.calls[0][0]())
  expect(opened).toHaveBeenCalledExactlyOnceWith('defer-reserve')
})

it('releases preparation after placement when motion is disabled', async () => {
  useConfig.setState({
    config: {
      ...defaultConfig,
      bar: { ...defaultConfig.bar, reduceMotion: true }
    }
  })
  const opened = vi.spyOn(overlay, 'opened').mockResolvedValue(undefined)
  vi.spyOn(overlay, 'resize').mockResolvedValue({ arrowX: 100 })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 320, 200)
  )
  render(
    <PopupSurface
      mode="native"
      session="reduced"
      label="Popup"
      close={() => {}}
    >
      Content
    </PopupSurface>
  )
  await act(async () => {})
  expect(opened).toHaveBeenCalledExactlyOnceWith('reduced')
  expect(window.requestAnimationFrame).not.toHaveBeenCalled()
})

it('morphs the opening capsule into the full popup silhouette', () => {
  render(
    <PopupSurface mode="demo" label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  expect(motion.animate.mock.calls[0][1].clipPath).toBe(
    'inset(0px round 160px)'
  )
  const frame = vi.mocked(window.requestAnimationFrame)
  act(() => frame.mock.calls[0][0](0))
  act(() => frame.mock.calls[1][0](16))
  expect(motion.animate.mock.calls[1][1].clipPath).toEqual([
    'inset(0px round 160px)',
    'inset(0px round 0px)'
  ])
})

it('fades a pinned popup in place and waits for its exit acknowledgment', () => {
  const onExited = vi.fn()
  render(
    <PopupSurface
      mode="native"
      pinned
      closing
      session="pin"
      label="Popup"
      close={() => {}}
      onExited={onExited}
    >
      Content
    </PopupSurface>
  )
  const exit = motion.animate.mock.lastCall!
  expect(exit[1]).toEqual({
    opacity: [null, 0],
    transform: [null, 'translateY(0px) scale(0.96, 0.96)']
  })
  expect(exit[2]).toMatchObject({ duration: 0.15 })
  expect(onExited).not.toHaveBeenCalled()
  act(() => motion.animate.mock.results.at(-1)!.value.then.mock.calls[0][0]())
  expect(onExited).toHaveBeenCalledOnce()
})

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
  useConfig.setState({ config: defaultConfig })
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
  expect(keyframes).toHaveProperty('transform')
  expect(keyframes).not.toHaveProperty('scaleY')
  const values = popupOpenKeyframes('bottom', {
    width: 320,
    height: 200
  }).scaleY
  const times = options.times ?? values.map((_, i) => i / (values.length - 1))
  const sample = interpolate(times, values, { ease })
  // The previous segmented easing stopped at 40% and accelerated again.
  const before = (sample(0.4) - sample(0.398)) / 0.002
  const after = (sample(0.402) - sample(0.4)) / 0.002
  expect(Math.abs(after - before)).toBeLessThan(0.1)
})

it('preserves the original trajectory using compositor-compatible transform frames', () => {
  expect(
    popupTransformKeyframes(
      popupOpenKeyframes(
        'bottom',
        { width: 320, height: 200 },
        { width: 80, height: 28 }
      )
    )
  ).toEqual({
    opacity: [0, 1],
    clipPath: ['inset(0px round 160px)', 'inset(0px round 0px)'],
    transform: [
      'translateY(-12px) scale(0.25, 0.14)',
      'translateY(0px) scale(1, 1)'
    ]
  })
  const close = popupTransformKeyframes(
    popupDockKeyframes('top', { width: 320, height: 200 })
  )
  expect(close.transform[0]).toBeNull()
  expect(close).not.toHaveProperty('scaleX')
  expect(close).not.toHaveProperty('y')
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
    transform: [
      expect.stringContaining('translateY(-12px) scale('),
      'translateY(0px) scale(1, 1)'
    ]
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
    transform: [
      null,
      expect.stringContaining('scale(0.42, 0.42)'),
      expect.stringContaining('scale(0.25, 0.14)'),
      expect.stringContaining('scale(0.215, 0.001)')
    ]
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
  expect(container.textContent).toBe('PopupContent')
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
  useConfig.setState({
    config: {
      ...defaultConfig,
      bar: { ...defaultConfig.bar, reduceMotion: true }
    }
  })
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
  expect(opening.clipPath).toEqual([
    'inset(0px round 160px)',
    'inset(0px round 0px)'
  ])
  expect(POPUP_ENTER_MS).toBe(500)
  const mirrored = popupOpenKeyframes('top', size, anchor)
  expect(mirrored.y).toEqual(opening.y.map((y) => (y === 0 ? 0 : -y)))
})

it('releases the capsule clip after opening and ignores stale completion during exit', () => {
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

it('settles the retained surface immediately when pinned during opening', () => {
  const { rerender } = render(
    <PopupSurface mode="demo" label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  rerender(
    <PopupSurface mode="demo" label="Popup" pinned close={() => {}}>
      Content
    </PopupSurface>
  )
  expect(motion.animate.mock.lastCall![1]).toMatchObject({
    opacity: 1,
    transform: 'translateY(0px) scale(1, 1)',
    clipPath: 'none'
  })
  expect(motion.animate.mock.lastCall![2]).toEqual({ duration: 0 })
})

it('never schedules another opening when a placement reply arrives after pin', async () => {
  let placed!: (value: { arrowX: number }) => void
  vi.spyOn(overlay, 'resize').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        placed = resolve
      })
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 320, 200)
  )
  const { rerender } = render(
    <PopupSurface mode="native" session="one" label="Popup" close={() => {}}>
      Content
    </PopupSurface>
  )
  rerender(
    <PopupSurface
      mode="native"
      session="one"
      label="Popup"
      pinned
      close={() => {}}
    >
      Content
    </PopupSurface>
  )
  const animations = motion.animate.mock.calls.length
  const frames = vi.mocked(window.requestAnimationFrame).mock.calls.length
  await act(async () => placed({ arrowX: 40 }))
  expect(window.requestAnimationFrame).toHaveBeenCalledTimes(frames)
  expect(motion.animate).toHaveBeenCalledTimes(animations)
})
