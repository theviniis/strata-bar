import {
  fireEvent,
  render as renderComponent,
  screen,
  waitFor
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryProvider } from '@/components/QueryProvider'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CalendarSettings } from '@/features/reminders/CalendarSettings'
import { RemindersPopup } from '@/features/reminders/RemindersPopup'
import { getRemindersStore } from '@/stores/reminders'

const render = (ui: ReactNode) =>
  renderComponent(ui, { wrapper: QueryProvider })

const account = vi.hoisted(() => ({
  status: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn()
}))
vi.mock('@/services/system/calendar', () => ({ calendar: account }))

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  account.status
    .mockReset()
    .mockResolvedValue({ connected: false, connecting: false, error: null })
  account.connect
    .mockReset()
    .mockResolvedValue({ connected: true, connecting: false, error: null })
  account.disconnect
    .mockReset()
    .mockResolvedValue({ connected: false, connecting: false, error: null })
  vi.stubGlobal('__TAURI_INTERNALS__', {})
})
afterEach(() => vi.unstubAllGlobals())

it('connects from settings with trimmed credentials and disconnects without losing local reminders', async () => {
  const connected = vi.fn()
  render(<CalendarSettings onConnected={connected} />)
  fireEvent.change(screen.getByLabelText('Client ID do Google'), {
    target: { value: ' client.apps.googleusercontent.com ' }
  })
  fireEvent.change(
    screen.getByLabelText('Client Secret (se fornecido pelo Google)'),
    { target: { value: ' test-client-secret ' } }
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Conectar Google Calendar' })
  )
  await waitFor(() =>
    expect(account.connect).toHaveBeenCalledWith(
      'client.apps.googleusercontent.com',
      'test-client-secret'
    )
  )
  const disconnect = await screen.findByRole('button', {
    name: 'Desconectar Google'
  })
  expect(connected).toHaveBeenLastCalledWith(true)
  fireEvent.click(disconnect)
  await waitFor(() => expect(account.disconnect).toHaveBeenCalledOnce())
  expect(
    await screen.findByLabelText('Client Secret (se fornecido pelo Google)')
  ).toHaveValue('')
  expect(connected).toHaveBeenLastCalledWith(false)
})

it('loads the existing connection without opening settings so Calendar event creation stays available', async () => {
  account.status.mockResolvedValue({
    connected: true,
    connecting: false,
    error: null
  })
  getRemindersStore().setState({
    source: 'native',
    snapshot: { version: 1, revision: 0, reminders: [] },
    error: null
  })
  render(<RemindersPopup />)
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'Criar evento no Google Calendar' })
    ).toBeEnabled()
  )
  const checkbox = screen.getByRole('checkbox', {
    name: 'Criar evento no Google Calendar'
  })
  expect(checkbox).toBeChecked()
  fireEvent.click(checkbox)
  expect(checkbox).not.toBeChecked()
  fireEvent.click(
    screen.getByRole('button', { name: 'Configurações do Google Calendar' })
  )
  expect(
    await screen.findByRole('button', { name: 'Desconectar Google' })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(checkbox).not.toBeChecked()
})

it('checks event creation after connecting and clears it on disconnect', async () => {
  getRemindersStore().setState({
    source: 'native',
    snapshot: { version: 1, revision: 0, reminders: [] },
    error: null
  })
  render(<RemindersPopup />)
  const checkbox = screen.getByRole('checkbox', {
    name: 'Criar evento no Google Calendar'
  })
  expect(checkbox).toBeDisabled()
  expect(checkbox).not.toBeChecked()
  fireEvent.click(
    screen.getByRole('button', { name: /Configura.*Google Calendar/ })
  )
  fireEvent.change(await screen.findByLabelText('Client ID do Google'), {
    target: { value: 'client.apps.googleusercontent.com' }
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Conectar Google Calendar' })
  )
  const disconnect = await screen.findByRole('button', {
    name: 'Desconectar Google'
  })
  expect(checkbox).toBeChecked()
  fireEvent.click(disconnect)
  await waitFor(() => expect(account.disconnect).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(checkbox).toBeDisabled()
  expect(checkbox).not.toBeChecked()
})
