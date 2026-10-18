import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PopupSurface } from '../popups/PopupSurface'
import { overlay } from '../services/system/overlay'

afterEach(() => vi.restoreAllMocks())

it('animates the shared surface once and cancels on unmount', () => {
  const cancel = vi.fn()
  const pause = vi.fn()
  const play = vi.fn()
  const animate = vi.fn(() => ({ cancel, pause, play }) as unknown as Animation)
  const frame = vi.spyOn(window, 'requestAnimationFrame')
  frame.mockImplementation(() => 1)
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  const original = HTMLElement.prototype.animate
  HTMLElement.prototype.animate = animate
  try {
    const { rerender, unmount } = render(
      <PopupSurface mode="demo" label="Popup" maxHeight={380} close={() => {}}>
        Content
      </PopupSurface>
    )
    expect(pause).toHaveBeenCalledOnce()
    expect(play).not.toHaveBeenCalled()
    act(() => frame.mock.calls[0][0](0))
    expect(play).not.toHaveBeenCalled()
    act(() => frame.mock.calls[1][0](16))
    expect(play).toHaveBeenCalledOnce()
    expect(animate).toHaveBeenCalledWith(
      [
        {
          opacity: 0,
          transform: 'translateY(-12px) scale(0.12, 0.04)',
          borderRadius: '32px',
          filter: 'blur(3px)'
        },
        {
          opacity: 1,
          transform: 'translateY(0) scale(1)',
          borderRadius: '12px',
          filter: 'blur(0px)'
        }
      ],
      { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' }
    )
    rerender(
      <PopupSurface mode="demo" label="Popup" maxHeight={380} close={() => {}}>
        Updated content
      </PopupSurface>
    )
    expect(animate).toHaveBeenCalledTimes(1)
    unmount()
    expect(cancel).toHaveBeenCalledOnce()
  } finally {
    HTMLElement.prototype.animate = original
  }
})

it('keeps the native animation paused until the first resize reveals the window', async () => {
  let reveal!: (size: { maxHeight: number }) => void
  vi.spyOn(overlay, 'resize').mockReturnValue(
    new Promise((resolve) => {
      reveal = resolve
    })
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 200
  } as DOMRect)
  const pause = vi.fn()
  const play = vi.fn()
  const cancel = vi.fn()
  const original = HTMLElement.prototype.animate
  HTMLElement.prototype.animate = vi.fn(
    () => ({ pause, play, cancel }) as unknown as Animation
  )
  const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  try {
    const { unmount } = render(
      <PopupSurface
        mode="native"
        session="opening"
        label="Popup"
        maxHeight={380}
        close={() => {}}
      >
        Content
      </PopupSurface>
    )
    expect(pause).toHaveBeenCalledOnce()
    expect(frame).not.toHaveBeenCalled()
    await act(async () => reveal({ maxHeight: 380 }))
    expect(play).not.toHaveBeenCalled()
    act(() => frame.mock.calls[0][0](0))
    act(() => frame.mock.calls[1][0](16))
    expect(play).toHaveBeenCalledOnce()
    unmount()
    expect(cancel).toHaveBeenCalledOnce()
  } finally {
    HTMLElement.prototype.animate = original
  }
})

it('contracts toward the widget before unmount and disables interaction during exit', () => {
  const original = HTMLElement.prototype.animate
  const cancel = vi.fn()
  const animate = vi.fn(
    () => ({ pause: vi.fn(), play: vi.fn(), cancel }) as unknown as Animation
  )
  HTMLElement.prototype.animate = animate
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  try {
    const { rerender, container, unmount } = render(
      <PopupSurface
        mode="demo"
        label="Popup"
        maxHeight={380}
        arrowX={280}
        close={() => {}}
      >
        Content
      </PopupSurface>
    )
    rerender(
      <PopupSurface
        mode="demo"
        closing
        label="Popup"
        maxHeight={380}
        arrowX={280}
        close={() => {}}
      >
        Content
      </PopupSurface>
    )
    expect(container.textContent).toBe('Content')
    expect(container.querySelector('[inert]')).not.toBeNull()
    expect(container.querySelector('[style*="transform-origin"]')).toHaveStyle({
      transformOrigin: '280px 0%'
    })
    expect(animate).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          opacity: 0,
          transform: 'translateY(-12px) scale(0.12, 0.04)'
        })
      ]),
      {
        duration: 220,
        easing: 'cubic-bezier(0.4, 0, 0.7, 0.2)',
        fill: 'forwards'
      }
    )
    expect(cancel).toHaveBeenCalledOnce()
    unmount()
    expect(cancel).toHaveBeenCalledTimes(3)
  } finally {
    HTMLElement.prototype.animate = original
  }
})
