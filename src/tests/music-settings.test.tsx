import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MusicPopupContent } from '@/features/music/music.popup'
import { demoMedia } from '@/services/system/media'

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

it('shows unavailable media without setup controls', () => {
  render(
    <MusicPopupContent event={{ status: 'unavailable' }} onAction={vi.fn()} />
  )
  expect(screen.getByRole('status')).toHaveTextContent('Mídia indisponível')
  expect(
    screen.getByText('Não conseguimos obter os dados de mídia')
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /Configurações|Conectar/ })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('textbox', { name: 'Client ID' })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('updates favorites after account changes while preserving everyday player controls', () => {
  const data = demoMedia()
  data.favorite = {
    status: 'unauthenticated',
    value: null,
    reason: 'Connect Spotify'
  }
  data.capabilities.favorite = false
  const { rerender } = render(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={vi.fn()} />
  )
  expect(
    screen.queryByRole('button', { name: /dos favoritos|aos favoritos/ })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pausar' })).toBeEnabled()
  expect(
    screen.getByRole('slider', { name: 'Progresso da música' })
  ).toBeEnabled()
  expect(screen.getByRole('slider', { name: 'Volume do player' })).toBeEnabled()
  const connected = demoMedia()
  connected.capabilities.favorite = true
  connected.favorite = { status: 'ready', value: false, reason: null }
  rerender(
    <MusicPopupContent
      event={{ status: 'ready', data: connected }}
      onAction={vi.fn()}
    />
  )
  expect(
    screen.getByRole('button', { name: /dos favoritos|aos favoritos/ })
  ).toBeEnabled()
  expect(
    screen.queryByText(/Configurações → Layout → Música/)
  ).not.toBeInTheDocument()
  rerender(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={vi.fn()} />
  )
  expect(
    screen.queryByRole('button', { name: /dos favoritos|aos favoritos/ })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pausar' })).toBeEnabled()
  expect(
    screen.getByRole('slider', { name: 'Progresso da música' })
  ).toBeEnabled()
  expect(screen.getByRole('slider', { name: 'Volume do player' })).toBeEnabled()
})
