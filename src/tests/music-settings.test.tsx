import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MusicPopupContent } from '@/features/music/MusicPopup'
import { demoMedia } from '@/services/system/media'

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

it('guides an unconfigured player to settings using text without setup controls', () => {
  render(
    <MusicPopupContent event={{ status: 'unavailable' }} onAction={vi.fn()} />
  )
  expect(screen.getByText(/Configurações → Player de música/)).toBeVisible()
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
  expect(screen.getByText(/Configurações → Player de música/)).toBeVisible()
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
    screen.queryByText(/Configurações → Player de música/)
  ).not.toBeInTheDocument()
  rerender(
    <MusicPopupContent event={{ status: 'ready', data }} onAction={vi.fn()} />
  )
  expect(
    screen.queryByRole('button', { name: /dos favoritos|aos favoritos/ })
  ).not.toBeInTheDocument()
  expect(screen.getByText(/Configurações → Player de música/)).toBeVisible()
})
