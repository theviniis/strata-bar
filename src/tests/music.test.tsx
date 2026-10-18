import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MusicContent } from '@/features/music/Music'
import {
  demoMedia,
  mediaPosition,
  parseMediaEvent
} from '@/services/system/media'
import { createMockBridge } from '@/services/system/bridge'

vi.mock('@/hooks/useOverlayTooltip', () => ({
  useOverlayTooltip: () => ({ trigger: {}, describedBy: 'music-tip' })
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) =>
    setTimeout(() => fn(0), 16)
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('shows metadata and independent controls with current session and track identity', async () => {
  const data = demoMedia()
  const onAction = vi.fn(async () => {})
  render(<MusicContent event={{ status: 'ready', data }} onAction={onAction} />)
  act(() => vi.advanceTimersByTime(20))
  expect(screen.getAllByText('Dragonaut — Sleep')[0]).toBeInTheDocument()
  const pause = screen.getByRole('button', { name: 'Pausar' })
  expect(pause.closest('button')?.parentElement?.closest('button')).toBeNull()
  await act(async () => {
    fireEvent.click(pause)
  })
  expect(onAction).toHaveBeenCalledWith({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'playPause' }
  })
})

it('retains paused sessions and disables unsupported controls', () => {
  const data = demoMedia()
  data.playback = 'paused'
  data.capabilities.previous = false
  render(<MusicContent event={{ status: 'ready', data }} onAction={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Faixa anterior' })).toBeDisabled()
})

it('keeps the widget visible without a session and disables playback controls', () => {
  const onAction = vi.fn()
  const { rerender } = render(
    <MusicContent
      event={{ status: 'ready', data: demoMedia() }}
      onAction={onAction}
    />
  )
  rerender(
    <MusicContent event={{ status: 'unavailable' }} onAction={onAction} />
  )
  const widget = screen.getByLabelText('Música')
  expect(widget).not.toHaveAttribute('aria-hidden', 'true')
  expect(widget).not.toHaveAttribute('inert')
  expect(widget).toHaveClass('max-w-45')
  expect(screen.getAllByText('Nenhuma música tocando')[0]).toBeVisible()
  expect(screen.queryAllByText('Dragonaut — Sleep')).toHaveLength(0)
  for (const button of screen.getAllByRole('button'))
    expect(button).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir' }))
  expect(onAction).not.toHaveBeenCalled()
  rerender(
    <MusicContent
      event={{ status: 'ready', data: demoMedia() }}
      onAction={onAction}
    />
  )
  expect(screen.getByRole('button', { name: 'Pausar' })).toBeEnabled()
})

it('blocks duplicate commands and reports native rejection without demo substitution', async () => {
  let reject: (reason: Error) => void = () => {}
  const onAction = vi.fn(
    () =>
      new Promise<void>((_, no) => {
        reject = no
      })
  )
  render(
    <MusicContent
      event={{ status: 'ready', data: demoMedia() }}
      onAction={onAction}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Próxima faixa' }))
  fireEvent.click(screen.getByRole('button', { name: 'Próxima faixa' }))
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Próxima faixa' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Próxima faixa' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  await act(async () => reject(new Error('Player rejected command')))
  expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(
    'Player rejected command'
  )
})

it('validates artwork and resource availability, retaining unknown favorite separately from false', () => {
  const data = demoMedia()
  expect(parseMediaEvent({ status: 'ready', data }).status).toBe('ready')
  const unknown = parseMediaEvent({ status: 'ready', data })
  if (unknown.status === 'ready') expect(unknown.data.favorite.value).toBeNull()
  data.favorite = { status: 'ready', value: false, reason: null }
  expect(parseMediaEvent({ status: 'ready', data }).status).toBe('ready')
  data.artwork = {
    status: 'ready',
    value: 'https://remote.invalid/art.png',
    reason: null
  }
  expect(parseMediaEvent({ status: 'ready', data }).status).toBe('error')
  expect(
    parseMediaEvent({ status: 'ready', data: { title: 'Missing contract' } })
      .status
  ).toBe('error')
})

it('interpolates progress while clamping at the duration and remaining stationary on pause', () => {
  const progress = demoMedia().progress.value!
  expect(mediaPosition(progress, progress.measuredAt + 1000)).toBe(33000)
  expect(mediaPosition(progress, progress.measuredAt + 999999)).toBe(
    progress.durationMs
  )
  expect(
    mediaPosition({ ...progress, rate: 0 }, progress.measuredAt + 999999)
  ).toBe(32000)
})

it('demo media actions update only demo subscribers and dispose cleanly', async () => {
  const adapter = createMockBridge()
  const receive = vi.fn()
  const dispose = await adapter.subscribe('media', receive)
  const data = receive.mock.lastCall![0].data
  await adapter.mediaAction!({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'playPause' }
  })
  expect(receive.mock.lastCall![0].data.playback).toBe('paused')
  dispose()
  const calls = receive.mock.calls.length
  await adapter.mediaAction!({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'next' }
  })
  expect(receive).toHaveBeenCalledTimes(calls)
})

it('limits width and scrolls overflowing metadata back and forth, cancelling on unmount', () => {
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  const width = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(100)
  const scroll = vi
    .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
    .mockReturnValue(220)
  const original = HTMLElement.prototype.animate
  HTMLElement.prototype.animate = animate as unknown as typeof original
  try {
    const { unmount } = render(
      <MusicContent
        event={{ status: 'ready', data: demoMedia() }}
        onAction={vi.fn()}
      />
    )
    act(() => vi.advanceTimersByTime(20))
    expect(screen.getByLabelText('Música')).toHaveClass('max-w-45')
    expect(animate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ transform: 'translateX(-120px)' }),
        { transform: 'translateX(0)', offset: 1 }
      ]),
      { duration: 12400, iterations: Infinity, easing: 'linear' }
    )
    unmount()
    expect(cancel).toHaveBeenCalled()
  } finally {
    HTMLElement.prototype.animate = original
    width.mockRestore()
    scroll.mockRestore()
  }
})
