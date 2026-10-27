import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Music } from '@/features/music/widget/music.widget'
import { MusicPopup } from '@/features/music/popup/music.popup'
import { SpotifySettings } from '@/features/music/src/spotify-settings'
import { WidgetPreview } from '@/components/status-bar/WidgetPreview'
import { widgetSchema } from '@/services/configuration/config'
import {
  musicFixture,
  musicControlsFixture
} from '@/features/music/src/fixtures'
const runtime = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock('@/services/system/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/system/bridge')>()),
  connect: runtime.connect
}))
vi.mock('@/hooks/useOverlayTooltip', () => ({
  useOverlayTooltip: () => ({ trigger: {}, describedBy: 'tip' })
}))
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)
afterEach(() => vi.useRealTimers())
it('renders media metadata slot and explicit controlled playback state without effects', () => {
  vi.useFakeTimers()
  const action = vi.fn()
  const current = musicFixture()
  const result = render(
    <Music
      current={current}
      pending={false}
      demo={false}
      artwork={null}
      onArtworkError={vi.fn()}
      onAction={action}
      tooltipTrigger={{}}
    >
      <span>{current.title}</span>
    </Music>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
  expect(action).toHaveBeenCalledWith({ action: 'playPause' })
  expect(vi.getTimerCount()).toBe(0)
  result.rerender(
    <Music
      current={current}
      pending
      demo={false}
      artwork={null}
      onArtworkError={vi.fn()}
      onAction={action}
      tooltipTrigger={{}}
    >
      <span>{current.title}</span>
    </Music>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
  expect(action).toHaveBeenCalledOnce()
})
it('renders popup pending and error props and dispatches grouped actions through callbacks', () => {
  vi.useFakeTimers()
  const current = musicFixture()
  const act = vi.fn(async () => true)
  const controls = { ...musicControlsFixture(), act, error: 'Player offline' }
  const result = render(
    <MusicPopup
      event={{ status: 'ready', data: current }}
      media={current}
      demo={false}
      controls={controls}
    />
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Player offline')
  fireEvent.click(screen.getByRole('button', { name: 'Próxima faixa' }))
  expect(act).toHaveBeenCalledWith({ action: 'next' })
  result.rerender(
    <MusicPopup
      event={{ status: 'ready', data: current }}
      media={current}
      demo={false}
      controls={{
        ...controls,
        pending: { ...controls.pending, playback: true }
      }}
    />
  )
  expect(screen.getByRole('button', { name: 'Próxima faixa' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  result.unmount()
})
it('renders Spotify form values and keeps changes controlled by its parent', () => {
  const onClientIdChange = vi.fn()
  const onConnectionChange = vi.fn()
  const clientId = '0123456789abcdef0123456789abcdef'
  render(
    <SpotifySettings
      inputId="spotify-test"
      inputRef={null}
      clientId={clientId}
      status={{ state: 'disconnected', clientId, error: null }}
      error=""
      pending={false}
      copied={true}
      native={true}
      onClientIdChange={onClientIdChange}
      onOpenDashboard={vi.fn()}
      onCopyCallback={vi.fn()}
      onPasteClientId={vi.fn()}
      onConnectionChange={onConnectionChange}
    />
  )
  expect(screen.getByText('URL copiada')).toBeVisible()
  fireEvent.change(screen.getByRole('textbox', { name: 'Client ID' }), {
    target: { value: 'new' }
  })
  expect(onClientIdChange).toHaveBeenCalledWith('new')
  expect(screen.getByRole('textbox', { name: 'Client ID' })).toHaveValue(
    clientId
  )
  fireEvent.click(screen.getByRole('button', { name: 'Conectar Spotify' }))
  expect(onConnectionChange).toHaveBeenCalledWith(true)
})
it('uses the shared music visual for inert demo without media subscription timers', () => {
  vi.useFakeTimers()
  const result = render(
    <WidgetPreview
      widget={widgetSchema.parse({ id: 'music', type: 'music' })}
      theme="dark"
    />
  )
  expect(
    screen.getByRole('button', { name: 'Pausar', hidden: true })
  ).toBeEnabled()
  expect(runtime.connect).not.toHaveBeenCalled()
  result.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
