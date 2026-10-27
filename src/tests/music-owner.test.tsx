import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StrictMode, type ReactNode } from 'react'
import { MusicContent } from '@/features/music/MusicController'
import { MusicPopupContent } from '@/features/music/music.popup'
import { useMusicInteractions } from '@/features/music/useMusicInteractions'
import { useMusicPopupControls } from '@/features/music/useMusicPopupControls'
import { PopupHost } from '@/popups/PopupHost'
import { demoMedia } from '@/services/system/media'
import type { SystemEvent } from '@/services/system/bridge'
import type { MediaData, MediaRequest } from '@/services/system/media.generated'

const runtime = vi.hoisted(() => ({
  media: undefined as MediaData | undefined,
  send: vi.fn<(request: MediaRequest) => Promise<unknown>>()
}))

vi.mock('@/services/system/bridge', async (original) => ({
  ...(await original<typeof import('@/services/system/bridge')>()),
  bridge: { mode: 'native', mediaAction: runtime.send },
  connect: (
    _adapter: unknown,
    _channel: unknown,
    _options: unknown,
    accept: (event: SystemEvent<MediaData>) => void
  ) => {
    accept({ status: 'ready', data: runtime.media! })
    return () => {}
  }
}))
vi.mock('@/hooks/useOverlayTooltip', () => ({
  useOverlayTooltip: () => ({ trigger: {}, describedBy: 'music-tip' })
}))
vi.mock('@/services/system/overlay', () => ({
  overlay: { mode: 'demo', hide: vi.fn(async () => {}) }
}))

function transport() {
  const requests: {
    request: MediaRequest
    finish(): void
    fail(error: Error): void
  }[] = []
  const send = vi.fn(
    (request: MediaRequest) =>
      new Promise<void>((finish, fail) => {
        requests.push({ request, finish, fail })
      })
  )
  return { requests, send }
}

beforeEach(() => {
  runtime.media = demoMedia()
  runtime.send.mockReset()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {}
    }))
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it.each(['trackId', 'sessionId'] as const)(
  'releases the new identity immediately and ignores old responses when %s changes',
  async (field) => {
    const native = transport()
    const media = demoMedia()
    const view = renderHook(
      ({ media }) => useMusicInteractions(media, native.send),
      { initialProps: { media } }
    )
    act(() => {
      void view.result.current.interactions.dispatch({ action: 'playPause' })
      void view.result.current.interactions.dispatch({
        action: 'seek',
        positionMs: 90000
      })
    })
    const next = { ...media, [field]: 'new-identity' }
    view.rerender({ media: next })
    expect(view.result.current.state.pending.playback).toBe(false)
    act(() => {
      void view.result.current.interactions.dispatch({ action: 'next' })
    })
    expect(native.requests[1].request).toEqual({
      sessionId: next.sessionId,
      trackId: next.trackId,
      action: { action: 'next' }
    })
    await act(async () => native.requests[0].fail(new Error('Old rejection')))
    expect(native.requests).toHaveLength(2)
    expect(view.result.current.state).toMatchObject({
      error: '',
      pending: { playback: true }
    })
    await act(async () => native.requests[1].finish())
    expect(view.result.current.state.pending.playback).toBe(false)
  }
)

it('discards both queues on close, rejects old callbacks, and starts reopening independently', async () => {
  const native = transport()
  const media = demoMedia()
  const view = renderHook(
    ({ active }) => useMusicPopupControls(media, native.send, active),
    { initialProps: { active: true } }
  )
  const oldVolume = view.result.current.setVolumeDraft
  act(() => {
    oldVolume(70)
    oldVolume(90)
    void view.result.current.act({ action: 'playPause' })
    void view.result.current.act({ action: 'seek', positionMs: 90000 })
  })
  view.rerender({ active: false })
  act(() => oldVolume(95))
  expect(native.requests).toHaveLength(2)
  expect(view.result.current.busyAny).toBe(false)
  view.rerender({ active: true })
  act(() => {
    void view.result.current.act({ action: 'next' })
  })
  await act(async () => {
    native.requests[0].finish()
    native.requests[1].finish()
  })
  expect(native.requests).toHaveLength(3)
  expect(view.result.current.pending.playback).toBe(true)
  await act(async () => native.requests[2].finish())
  expect(view.result.current.busyAny).toBe(false)
})

it('survives StrictMode setup replay and drops queued writes on unmount', async () => {
  const native = transport()
  const media = demoMedia()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>{children}</StrictMode>
  )
  const view = renderHook(() => useMusicPopupControls(media, native.send), {
    wrapper
  })
  act(() => {
    view.result.current.setVolumeDraft(70)
    view.result.current.setVolumeDraft(90)
  })
  expect(native.requests).toHaveLength(1)
  view.unmount()
  await act(async () => native.requests[0].finish())
  expect(native.requests).toHaveLength(1)
})

it('keeps the bar and popup pending state independent for the same track', async () => {
  const native = transport()
  const data = demoMedia()
  const bar = render(
    <MusicContent event={{ status: 'ready', data }} onAction={native.send} />
  )
  const popup = render(
    <MusicPopupContent
      event={{ status: 'ready', data }}
      onAction={native.send}
    />
  )
  fireEvent.click(
    within(popup.container).getByRole('button', { name: 'Pausar' })
  )
  const barPause = within(bar.container).getByRole('button', { name: 'Pausar' })
  expect(barPause).not.toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(barPause)
  expect(native.requests).toHaveLength(2)
  popup.unmount()
  await act(async () => native.requests[0].fail(new Error('Closed popup')))
  expect(barPause).toHaveAttribute('aria-disabled', 'true')
  expect(bar.container).not.toHaveTextContent('Closed popup')
  await act(async () => native.requests[1].finish())
  expect(barPause).not.toHaveAttribute('aria-disabled', 'true')
})

it('clears the bar lock on track change without allowing an old completion to unlock a newer action', async () => {
  const native = transport()
  const data = demoMedia()
  const view = render(
    <MusicContent event={{ status: 'ready', data }} onAction={native.send} />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
  view.rerender(
    <MusicContent
      event={{ status: 'ready', data: { ...data, trackId: 'new-track' } }}
      onAction={native.send}
    />
  )
  const pause = screen.getByRole('button', { name: 'Pausar' })
  expect(pause).not.toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(pause)
  await act(async () => native.requests[0].finish())
  expect(pause).toHaveAttribute('aria-disabled', 'true')
  await act(async () => native.requests[1].finish())
  expect(pause).not.toHaveAttribute('aria-disabled', 'true')
})

it('queues mute and unmute between slider writes using the latest local intent', async () => {
  const native = transport()
  const data = demoMedia()
  render(
    <MusicPopupContent
      event={{ status: 'ready', data }}
      onAction={native.send}
    />
  )
  const slider = screen.getByRole('slider', { name: 'Volume do player' })
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  fireEvent.click(screen.getByRole('button', { name: 'Silenciar player' }))
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  fireEvent.click(screen.getByRole('button', { name: 'Ativar som do player' }))
  expect(native.requests).toHaveLength(1)
  for (let index = 0; index < 4; index += 1)
    await act(async () => native.requests[index].finish())
  expect(native.requests.map(({ request }) => request.action)).toEqual([
    { action: 'volume', level: 65 },
    { action: 'mute', muted: true },
    { action: 'volume', level: 66 },
    { action: 'mute', muted: false }
  ])
})

it('stops queued volume at PopupHost closing while its contents remain mounted', async () => {
  const native = transport()
  runtime.send.mockImplementation(native.send)
  const close = vi.fn()
  const view = render(<PopupHost id="music" mode="native" close={close} />)
  const slider = await screen.findByRole('slider', { name: 'Volume do player' })
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(native.requests).toHaveLength(1)
  view.rerender(<PopupHost id="music" mode="native" closing close={close} />)
  expect(
    screen.getByRole('slider', { name: 'Volume do player', hidden: true })
  ).toBeInTheDocument()
  await act(async () => native.requests[0].finish())
  expect(native.requests).toHaveLength(1)
})
