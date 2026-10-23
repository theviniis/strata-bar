import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SpotifySettingsController as SpotifySettings } from '@/features/music/SpotifySettingsController'

const account = vi.hoisted(() => ({
  openDashboard: vi.fn(async () => {}),
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
    spotifyDisconnect: () => account.disconnect(),
    spotifyOpenDashboard: () => account.openDashboard()
  }
}))

afterEach(() => vi.unstubAllGlobals())

it('pastes a valid Client ID, trims whitespace and focuses the field', async () => {
  const id = '0123456789abcdef0123456789abcdef'
  vi.stubGlobal('navigator', {
    clipboard: { readText: vi.fn(async () => ` ${id}\n`) }
  })
  render(<SpotifySettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Colar Client ID' }))
  const input = screen.getByRole('textbox', { name: 'Client ID' })
  await waitFor(() => expect(input).toHaveValue(id))
  expect(input).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Conectar Spotify' })).toBeEnabled()
})

it('retains the existing Client ID when clipboard contents are invalid', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { readText: vi.fn(async () => 'not a client id') }
  })
  render(<SpotifySettings />)
  const input = screen.getByRole('textbox', { name: 'Client ID' })
  fireEvent.change(input, { target: { value: 'existing' } })
  fireEvent.click(screen.getByRole('button', { name: 'Colar Client ID' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'não contém um Client ID válido'
  )
  expect(input).toHaveValue('existing')
})

it('reports clipboard read permission failures', async () => {
  vi.stubGlobal('navigator', {
    clipboard: {
      readText: vi.fn(async () => {
        throw new Error('Denied')
      })
    }
  })
  render(<SpotifySettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Colar Client ID' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível ler o clipboard'
  )
})

it('opens the app registration page and copies the exact callback URL', async () => {
  const writeText = vi.fn(async (_text: string) => {})
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  render(<SpotifySettings />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Criar aplicativo Spotify' })
  )
  await waitFor(() => expect(account.openDashboard).toHaveBeenCalledOnce())
  fireEvent.click(
    screen.getByRole('button', { name: 'Copiar URL de callback' })
  )
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      'http://127.0.0.1:43821/spotify/callback'
    )
  )
  expect(await screen.findByText('URL copiada')).toBeVisible()
})

it('reports clipboard failures instead of confirming a copy', async () => {
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: vi.fn(async () => {
        throw new Error('Permission denied')
      })
    }
  })
  render(<SpotifySettings />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Copiar URL de callback' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível copiar'
  )
  expect(screen.queryByText('URL copiada')).not.toBeInTheDocument()
})

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
