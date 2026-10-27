import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PopupSurface } from '@/popups/popup-surface'
import { overlay } from '@/services/system/overlay'

afterEach(() => vi.restoreAllMocks())

it.each(['native', 'demo'] as const)(
  'preserves keyboard focus when an alert appears in %s',
  async (mode) => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 360, 280)
    )
    const resize = vi
      .spyOn(overlay, 'resize')
      .mockResolvedValue({ arrowX: 100 })
    try {
      await act(async () => {
        render(
          <PopupSurface
            mode={mode}
            session="reminder-test"
            label="Alert"
            autoFocus={false}
            close={() => {}}
          >
            Reminder
          </PopupSurface>
        )
      })
      expect(input).toHaveFocus()
      if (mode === 'native') expect(resize).toHaveBeenCalled()
    } finally {
      input.remove()
    }
  }
)
