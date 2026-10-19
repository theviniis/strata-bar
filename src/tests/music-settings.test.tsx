import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MusicPopupContent } from '@/features/music/MusicPopup'

it('opens Spotify settings without a media session and returns focus when closed', async () => {
  render(
    <MusicPopupContent
      event={{ status: 'unavailable' }}
      onAction={vi.fn()}
      demo
    />
  )
  const trigger = screen.getByRole('button', {
    name: 'Configurações do Spotify'
  })
  expect(
    screen.queryByRole('textbox', { name: 'Client ID' })
  ).not.toBeInTheDocument()
  fireEvent.click(trigger)
  expect(
    screen.getByRole('dialog', { name: 'Configurações do Spotify' })
  ).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Client ID' })).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Conectar Spotify' })
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Configurações do Spotify' })
    ).not.toBeInTheDocument()
  )
  expect(trigger).toHaveFocus()
  expect(screen.getByText('Nenhuma música tocando')).toBeVisible()
})

it('Escape closes only the settings dialog', async () => {
  render(
    <MusicPopupContent
      event={{ status: 'unavailable' }}
      onAction={vi.fn()}
      demo
    />
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Configurações do Spotify' })
  )
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Client ID' }), {
    key: 'Escape'
  })
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Configurações do Spotify' })
    ).not.toBeInTheDocument()
  )
  expect(
    screen.getByRole('button', { name: 'Configurações do Spotify' })
  ).toBeVisible()
})
