import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FormEvent } from 'react'
import { Reminders } from '@/features/reminders/widget/reminders.widget'
import { RemindersController } from '@/features/reminders/widget/reminders.controller'
import { RemindersPopup } from '@/features/reminders/popup/reminders.popup'
import { ReminderAlertActions } from '@/features/reminders/src/reminder-alert-actions'
import { ReminderAlert } from '@/features/reminders/popup/reminder-alert.popup'
import { CalendarSettings } from '@/features/reminders/src/calendar-settings'
import {
  reminderFixture,
  remindersPopupFixture,
  REMINDER_FIXTURE_TIME
} from '@/features/reminders/src/fixtures'
import { getRemindersStore } from '@/stores/reminders'
import { WidgetRuntimeContext } from '@/components/status-bar/widget-runtime-context'
import { previewWidgetRuntime } from '@/services/system/widget-runtime'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('renders the reminder countdown, error, compact and ringing states by props', () => {
  const onClick = vi.fn()
  const ref = vi.fn()
  const props = {
    next: reminderFixture(),
    now: REMINDER_FIXTURE_TIME,
    ringing: false,
    error: null,
    format: 'label' as const,
    onClick,
    ref
  }
  const view = render(<Reminders {...props} />)
  expect(screen.getByLabelText('Tempo restante')).toHaveTextContent('5:00')
  const button = screen.getByRole('button', { name: 'Abrir lembretes' })
  expect(ref).toHaveBeenCalledWith(button)
  fireEvent.click(button)
  expect(onClick).toHaveBeenCalledOnce()
  view.rerender(<Reminders {...props} now={REMINDER_FIXTURE_TIME + 60000} />)
  expect(screen.getByLabelText('Tempo restante')).toHaveTextContent('4:00')
  view.rerender(<Reminders {...props} format="compact" />)
  expect(screen.queryByLabelText('Tempo restante')).not.toBeInTheDocument()
  view.rerender(
    <Reminders {...props} next={null} ringing error="IPC offline" />
  )
  expect(button.querySelector('svg')).toHaveClass('text-destructive')
  expect(screen.queryByLabelText('Tempo restante')).not.toBeInTheDocument()
})

it('delegates controlled snooze/dismiss and disables actions while pending', () => {
  const props = {
    inputId: 'snooze-test',
    option: '5' as const,
    pending: false,
    error: null,
    onOptionChange: vi.fn(),
    onSnooze: vi.fn(),
    onDismiss: vi.fn()
  }
  const view = render(<ReminderAlertActions {...props} />)
  fireEvent.change(screen.getByLabelText('Adiar por'), {
    target: { value: '15' }
  })
  expect(props.onOptionChange).toHaveBeenCalledWith('15')
  expect(screen.getByLabelText('Adiar por')).toHaveValue('5')
  fireEvent.click(screen.getByRole('button', { name: 'Adiar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }))
  expect(props.onSnooze).toHaveBeenCalledOnce()
  expect(props.onDismiss).toHaveBeenCalledOnce()
  view.rerender(
    <ReminderAlertActions {...props} pending error="Falha ao salvar" />
  )
  expect(screen.getByRole('button', { name: 'Adiar' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Dispensar' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('Falha ao salvar')
})

it('renders the popup without runtime providers and delegates form operations', () => {
  const props = remindersPopupFixture()
  const onDurationChange = vi.fn()
  const onAddMinutes = vi.fn()
  const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) =>
    event.preventDefault()
  )
  const view = render(
    <RemindersPopup
      {...props}
      onDurationChange={onDurationChange}
      onAddMinutes={onAddMinutes}
      onSubmit={onSubmit}
    />
  )
  fireEvent.change(screen.getByLabelText('Duração (horas e minutos)'), {
    target: { value: '00:10' }
  })
  expect(onDurationChange).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Duração (horas e minutos)')).toHaveValue(
    '00:05'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar 10 minutos' }))
  expect(onAddMinutes).toHaveBeenCalledWith(10)
  fireEvent.submit(screen.getByRole('form', { name: 'Criar lembrete' }))
  expect(onSubmit).toHaveBeenCalledOnce()
  view.rerender(
    <RemindersPopup {...props} pending visibleError="IPC offline" />
  )
  expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('IPC offline')
})

it('renders alert loading/errors and delegates closing without a popup host', () => {
  const close = vi.fn()
  const props = {
    synchronized: false,
    reminder: undefined,
    source: 'demo' as const,
    error: null,
    close,
    message: <p>Mensagem controlada</p>,
    actions: <button>Ação controlada</button>
  }
  const view = render(<ReminderAlert {...props} />)
  expect(screen.getByRole('status')).toHaveTextContent('Carregando lembrete…')
  view.rerender(<ReminderAlert {...props} error="IPC offline" />)
  expect(screen.getByRole('alert')).toHaveTextContent('IPC offline')
  view.rerender(
    <ReminderAlert {...props} synchronized reminder={reminderFixture()} />
  )
  expect(screen.getByText('Mensagem controlada')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Ação controlada' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Fechar alerta' }))
  expect(close).toHaveBeenCalledOnce()
})

it('keeps Calendar credentials controlled and delegates connection', () => {
  const onClientIdChange = vi.fn()
  const onConnect = vi.fn()
  render(
    <CalendarSettings
      id="calendar-test"
      clientId="desktop-client"
      clientSecret=""
      pending={false}
      error=""
      native
      status={{ connected: false, connecting: false, error: null }}
      onClientIdChange={onClientIdChange}
      onClientSecretChange={vi.fn()}
      onConnect={onConnect}
      onDisconnect={vi.fn()}
    />
  )
  fireEvent.change(screen.getByLabelText('Client ID do Google'), {
    target: { value: 'new-client' }
  })
  expect(onClientIdChange).toHaveBeenCalledWith('new-client')
  expect(screen.getByLabelText('Client ID do Google')).toHaveValue(
    'desktop-client'
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Conectar Google Calendar' })
  )
  expect(onConnect).toHaveBeenCalledOnce()
})

it('cleans the countdown interval and leaves inert previews without timers', () => {
  vi.useFakeTimers()
  const store = getRemindersStore()
  const previous = store.getState().snapshot
  store.setState({
    snapshot: { version: 1, revision: 1, reminders: [reminderFixture()] }
  })
  try {
    const view = render(<RemindersController />)
    expect(vi.getTimerCount()).toBe(1)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
    const preview = render(
      <WidgetRuntimeContext value={previewWidgetRuntime}>
        <RemindersController />
      </WidgetRuntimeContext>
    )
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.queryByLabelText('Tempo restante')).not.toBeInTheDocument()
    preview.unmount()
  } finally {
    store.setState({ snapshot: previous })
  }
})
