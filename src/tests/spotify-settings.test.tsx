import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SpotifySettings } from '@/features/music/SpotifySettings'

const account = vi.hoisted(() => ({
  state: 'disconnected',
  connect: vi.fn(async (_id: string) => {
    account.state = 'connected'
  }),
  disconnect: vi.fn(async () => {
    account.state = 'disconnected'
  })
}))
vi.mock('@/services/system/bridge', () => ({
  bridge: {
    mode: 'native',
    spotifyStatus: async () => ({
      state: account.state,
      clientId: '',
      error: null
    }),
    spotifyConnect: (id: string) => account.connect(id),
    spotifyDisconnect: () => account.disconnect()
  }
}))

it('validates the public Client ID and connects/disconnects through native commands', async () => {
  render(<SpotifySettings />)
  const connect = screen.getByRole('button', { name: 'Conectar Spotify' })
  expect(connect).toBeDisabled()
  const input = screen.getByRole('textbox', { name: 'Client ID' })
  fireEvent.change(input, { target: { value: 'invalid' } })
  expect(connect).toBeDisabled()
  const id = '0123456789abcdef0123456789abcdef'
  fireEvent.change(input, { target: { value: id } })
  fireEvent.click(connect)
  await waitFor(() => expect(account.connect).toHaveBeenCalledWith(id))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Spotify conectado')
  )
  fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
  await waitFor(() => expect(account.disconnect).toHaveBeenCalledOnce())
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Spotify desconectado')
  )
})
