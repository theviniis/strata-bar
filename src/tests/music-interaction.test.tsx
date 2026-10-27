import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useMusicPopupControls } from '@/features/music/src/use-music-popup-controls'
import { demoMedia } from '@/services/system/media'

it('sends volume while dragging, keeps the draft through stale echoes, and coalesces pending moves', async () => {
  let finish!: () => void
  const onAction = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const data = demoMedia()
  const { result } = renderHook(() => useMusicPopupControls(data, onAction))
  act(() => result.current.setVolumeDraft(70))
  expect(onAction).toHaveBeenCalledWith(
    expect.objectContaining({ action: { action: 'volume', level: 70 } })
  )
  act(() => {
    result.current.setVolumeDraft(80)
    result.current.setVolumeDraft(90)
  })
  expect(result.current.level).toBe(90)
  expect(onAction).toHaveBeenCalledTimes(1)
  await act(async () => finish())
  expect(onAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: { action: 'volume', level: 90 } })
  )
  await act(async () => finish())
  expect(result.current.level).toBe(90)
})
it('preserves the last seek while another playback command is pending', async () => {
  let finish!: () => void
  const onAction = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const data = demoMedia()
  const { result } = renderHook(() => useMusicPopupControls(data, onAction))
  act(() => {
    void result.current.act({ action: 'playPause' })
  })
  act(() => {
    result.current.setSeek(60000)
    void result.current.act({ action: 'seek', positionMs: 60000 })
    result.current.setSeek(90000)
    void result.current.act({ action: 'seek', positionMs: 90000 })
  })
  expect(result.current.position).toBe(90000)
  await act(async () => finish())
  expect(onAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: { action: 'seek', positionMs: 90000 } })
  )
  await act(async () => finish())
  expect(result.current.position).toBeGreaterThanOrEqual(90000)
})
