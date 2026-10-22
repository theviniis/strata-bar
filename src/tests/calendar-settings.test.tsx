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

const events = vi.hoisted(() => ({
  listener: undefined as undefined | (() => void)
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, listener: () => void) => {
    events.listener = listener
    return () => {}
  })
}))

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
  expect(
    screen.queryByRole('button', { name: /Configurações do Google/ })
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Client ID do Google')).not.toBeInTheDocument()
})

it('reflects external connection changes without mounting the old settings form', async () => {
  getRemindersStore().setState({
    source: 'native',
    snapshot: { version: 1, revision: 0, reminders: [] },
    error: null
  })
  render(<RemindersPopup />)
  const checkbox = screen.getByRole('checkbox', {
    name: 'Criar evento no Google Calendar'
  })
  await screen.findByText(/Configurações → Lembretes/)
  expect(checkbox).toBeDisabled()
  account.status.mockResolvedValue({
    connected: true,
    connecting: false,
    error: null
  })
  await waitFor(() => expect(events.listener).toBeDefined())
  events.listener?.()
  await waitFor(() => expect(checkbox).toBeChecked())
  account.status.mockResolvedValue({
    connected: false,
    connecting: false,
    error: null
  })
  events.listener?.()
  await waitFor(() => expect(checkbox).toBeDisabled())
  expect(checkbox).not.toBeChecked()
})
