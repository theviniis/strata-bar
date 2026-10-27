import { MusicPopupContent } from '@/features/music/popup/music.popup.controller'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MusicContent } from '@/features/music/widget/music.controller'
import {
  demoMedia,
  mediaPosition,
  parseMediaEvent
} from '@/services/system/media'
import { createMockBridge } from '@/services/system/bridge'
import type { MediaRequest } from '@/services/system/media.generated'

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
  for (const name of ['Faixa anterior', 'Reproduzir', 'Próxima faixa'])
    expect(screen.getByRole('button', { name })).toBeDisabled()
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

it('rejects a ready resource without a value and names the offending field', () => {
  // A stale Spotify correlation used to report the favorite as ready-with-no-value,
  // which invalidated the whole payload and blanked the widget to "Mídia indisponível".
  const data = demoMedia()
  data.favorite = { status: 'ready', value: null, reason: null }
  const parsed = parseMediaEvent({ status: 'ready', data })
  expect(parsed.status).toBe('error')
  if (parsed.status === 'error') expect(parsed.error).toContain('favorite')
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

it('opens the music popup from the title without nesting playback buttons', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  render(
    <MusicContent
      event={{ status: 'ready', data: demoMedia() }}
      onAction={vi.fn()}
    />
  )
  const trigger = screen.getByRole('button', { name: 'Abrir player de música' })
  expect(trigger.querySelector('button')).toBeNull()
  await act(async () => {
    fireEvent.click(trigger)
  })
  expect(screen.getByRole('heading', { name: 'Dragonaut' })).toBeVisible()
  expect(screen.getByText('Sleep')).toBeVisible()
})

it('renders artwork values and sends popup controls with session identity', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  data.artwork = {
    status: 'ready',
    value: 'data:image/png;base64,AAAA',
    reason: null
  }
  data.favorite = { status: 'ready', value: false, reason: null }
  data.capabilities.favorite = true
  const onAction = vi.fn(async () => {})
  render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={onAction} />
  )
  expect(screen.getByRole('img')).toHaveAttribute('src', data.artwork.value)
  expect(
    screen.getByRole('slider', { name: 'Progresso da música' })
  ).toHaveAttribute('aria-valuenow', '32000')
  await act(async () =>
    fireEvent.keyDown(
      screen.getByRole('slider', { name: 'Progresso da música' }),
      { key: 'ArrowRight' }
    )
  )
  expect(onAction).toHaveBeenLastCalledWith({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'seek', positionMs: 32001 }
  })
  for (const [name, action] of [
    ['Faixa anterior', { action: 'previous' }],
    ['Pausar', { action: 'playPause' }],
    ['Próxima faixa', { action: 'next' }],
    ['Adicionar aos favoritos', { action: 'favorite', saved: true }]
  ] as const) {
    await act(async () => fireEvent.click(screen.getByRole('button', { name })))
    expect(onAction).toHaveBeenLastCalledWith({
      sessionId: data.sessionId,
      trackId: data.trackId,
      action
    })
  }
})

it('keeps popup playback controls available while a favorite request is pending', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  data.favorite = { status: 'ready', value: false, reason: null }
  data.capabilities.favorite = true
  let finishFavorite!: () => void
  const favoriteRequest = new Promise<void>((resolve) => {
    finishFavorite = resolve
  })
  const onAction = vi.fn((request: MediaRequest) =>
    request.action.action === 'favorite' ? favoriteRequest : Promise.resolve()
  )
  render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={onAction} />
  )
  const favorite = screen.getByRole('button', {
    name: 'Adicionar aos favoritos'
  })
  fireEvent.click(favorite)
  fireEvent.click(favorite)
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(favorite).toHaveAttribute('aria-disabled', 'true')
  for (const name of ['Faixa anterior', 'Pausar', 'Próxima faixa']) {
    const control = screen.getByRole('button', { name })
    expect(control).toBeEnabled()
    await act(async () => fireEvent.click(control))
    expect(favorite).toHaveAttribute('aria-disabled', 'true')
  }
  expect(
    screen.getByRole('slider', { name: 'Progresso da música' })
  ).toBeEnabled()
  expect(onAction).toHaveBeenCalledTimes(4)
  await act(async () => finishFavorite())
  expect(favorite).toBeEnabled()
})

it('keeps progress steady through small native corrections but accepts a real backward seek', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  const onAction = vi.fn(async () => {})
  const { rerender } = render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={onAction} />
  )
  act(() => vi.advanceTimersByTime(500))
  const slider = screen.getByRole('slider', { name: 'Progresso da música' })
  expect(slider).toHaveAttribute('aria-valuenow', '32500')
  const progress = data.progress.value!
  const corrected = {
    ...data,
    progress: {
      ...data.progress,
      value: { ...progress, positionMs: 32300, measuredAt: Date.now() }
    }
  }
  rerender(
    <MusicPopupContent
      event={{ status: 'ready', data: corrected }}
      onAction={onAction}
    />
  )
  expect(slider).toHaveAttribute('aria-valuenow', '32500')
  rerender(
    <MusicPopupContent
      event={{
        status: 'ready',
        data: {
          ...corrected,
          progress: {
            ...corrected.progress,
            value: { ...progress, positionMs: 12000, measuredAt: Date.now() }
          }
        }
      }}
      onAction={onAction}
    />
  )
  expect(slider).toHaveAttribute('aria-valuenow', '12000')
})

it('continues advancing when frequent events repeat the same timeline position', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  const onAction = vi.fn(async () => {})
  const { rerender } = render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={onAction} />
  )
  for (let i = 0; i < 20; i++) {
    act(() => vi.advanceTimersByTime(100))
    rerender(
      <MusicPopupContent
        event={{
          status: 'ready',
          data: {
            ...data,
            progress: {
              ...data.progress,
              value: { ...data.progress.value!, measuredAt: Date.now() }
            }
          }
        }}
        onAction={onAction}
      />
    )
  }
  expect(
    Number(
      screen
        .getByRole('slider', { name: 'Progresso da música' })
        .getAttribute('aria-valuenow')
    )
  ).toBeGreaterThanOrEqual(33750)
})

it('drives the player volume and mute through media actions, never the output endpoint', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  const onAction = vi.fn(async () => {})
  render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={onAction} />
  )
  const slider = screen.getByRole('slider', { name: 'Volume do player' })
  expect(slider).toHaveAttribute('aria-valuenow', '64')
  await act(async () => fireEvent.keyDown(slider, { key: 'ArrowRight' }))
  expect(onAction).toHaveBeenLastCalledWith({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'volume', level: 65 }
  })
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Silenciar player' }))
  )
  expect(onAction).toHaveBeenLastCalledWith({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'mute', muted: true }
  })
})

it('hides the player volume when the application audio session is ambiguous', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  data.volume = {
    status: 'unavailable',
    value: null,
    reason: 'No unambiguous application audio session'
  }
  data.capabilities.volume = false
  data.capabilities.mute = false
  render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={vi.fn()} />
  )
  expect(screen.queryByRole('slider', { name: 'Volume do player' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Silenciar player' })).toBeNull()
  expect(screen.queryByText('Volume do player')).toBeNull()
})

it('renders the favorite control while the Spotify correlation is pending', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  data.favorite = {
    status: 'unavailable',
    value: null,
    reason: 'Spotify track has not been securely correlated'
  }
  data.capabilities.favorite = true
  render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={vi.fn()} />
  )
  const favorite = screen.getByRole('button', {
    name: 'Adicionar aos favoritos'
  })
  expect(favorite).toHaveAttribute('aria-disabled', 'true')
  expect(favorite).toHaveAttribute('aria-busy', 'true')
  expect(favorite).toHaveAttribute(
    'title',
    'Spotify track has not been securely correlated'
  )
})

it('hides repeat, shuffle, volume and favorite when the running player is incompatible', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  data.shuffle = {
    status: 'unsupported',
    value: null,
    reason: 'Player does not expose shuffle'
  }
  data.repeat = {
    status: 'unsupported',
    value: null,
    reason: 'Player does not expose repeat'
  }
  data.volume = {
    status: 'unavailable',
    value: null,
    reason: 'No unambiguous application audio session'
  }
  data.favorite = {
    status: 'unavailable',
    value: null,
    reason: 'Player has no Spotify library'
  }
  data.capabilities = {
    ...data.capabilities,
    shuffle: false,
    repeat: false,
    volume: false,
    mute: false,
    favorite: false
  }
  render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={vi.fn()} />
  )
  for (const name of [
    'Aleatório',
    'Repetição',
    'Silenciar player',
    'Ativar som do player',
    'Adicionar aos favoritos',
    'Remover dos favoritos'
  ])
    expect(screen.queryByRole('button', { name })).toBeNull()
  expect(screen.queryByRole('slider', { name: 'Volume do player' })).toBeNull()
  expect(screen.queryByText('Volume do player')).toBeNull()
  // Playback controls the player does support stay available.
  for (const name of ['Faixa anterior', 'Pausar', 'Próxima faixa'])
    expect(screen.getByRole('button', { name })).toBeEnabled()
})

it('keeps the player volume visible without a mute button when the session exposes no mute', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  data.capabilities.mute = false
  render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={vi.fn()} />
  )
  expect(
    screen.getByRole('slider', { name: 'Volume do player' })
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Silenciar player' })).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Ativar som do player' })
  ).toBeNull()
})

it('toggles shuffle and cycles repeat modes with capability gating', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const data = demoMedia()
  const onAction = vi.fn(async () => {})
  const { rerender } = render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={onAction} />
  )
  const shuffle = screen.getByRole('button', { name: 'Aleatório' })
  const repeat = screen.getByRole('button', { name: 'Repetição' })
  expect(shuffle).toHaveAttribute('aria-pressed', 'false')
  await act(async () => fireEvent.click(shuffle))
  expect(onAction).toHaveBeenLastCalledWith({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'shuffle', active: true }
  })
  for (const [mode, next] of [
    ['none', 'list'],
    ['list', 'track'],
    ['track', 'none']
  ] as const) {
    rerender(
      <MusicPopupContent
        event={{
          status: 'ready',
          data: {
            ...data,
            repeat: { status: 'ready', value: mode, reason: null }
          }
        }}
        onAction={onAction}
      />
    )
    await act(async () => fireEvent.click(repeat))
    expect(onAction).toHaveBeenLastCalledWith({
      sessionId: data.sessionId,
      trackId: data.trackId,
      action: { action: 'repeat', mode: next }
    })
  }
  const unsupported = {
    ...data,
    shuffle: {
      status: 'unsupported' as const,
      value: null,
      reason: 'Player does not expose shuffle'
    },
    repeat: {
      status: 'unsupported' as const,
      value: null,
      reason: 'Player does not expose repeat'
    },
    capabilities: { ...data.capabilities, shuffle: false, repeat: false }
  }
  rerender(
    <MusicPopupContent
      event={{ status: 'ready', data: unsupported }}
      onAction={onAction}
    />
  )
  expect(screen.queryByRole('button', { name: 'Aleatório' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Repetição' })).toBeNull()
})

it('applies shuffle and repeat only to demo subscribers', async () => {
  const adapter = createMockBridge()
  const receive = vi.fn()
  const dispose = await adapter.subscribe('media', receive)
  const data = receive.mock.lastCall![0].data
  await adapter.mediaAction!({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'shuffle', active: true }
  })
  expect(receive.mock.lastCall![0].data.shuffle.value).toBe(true)
  await adapter.mediaAction!({
    sessionId: data.sessionId,
    trackId: data.trackId,
    action: { action: 'repeat', mode: 'track' }
  })
  expect(receive.mock.lastCall![0].data.repeat.value).toBe('track')
  dispose()
})

it('rejects payloads missing the playback mode resources', () => {
  expect(
    parseMediaEvent({
      status: 'ready',
      data: { ...demoMedia(), shuffle: undefined }
    }).status
  ).toBe('error')
  expect(
    parseMediaEvent({
      status: 'ready',
      data: { ...demoMedia(), repeat: undefined }
    }).status
  ).toBe('error')
})
