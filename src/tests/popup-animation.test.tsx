import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PopupSurface } from '../popups/PopupSurface'

afterEach(() => vi.restoreAllMocks())

it('animates the shared surface once and cancels on unmount', () => {
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel }) as unknown as Animation)
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
    act(() => frame.mock.calls[0][0](0))
    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: 'translateY(-4px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: 160, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
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
