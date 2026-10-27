import { PopupContext } from '@/popups/context'
import { ReminderAlertController as ReminderAlert } from '@/features/reminders/reminderAlert.popup'
import {
  act,
  fireEvent,
  render as renderComponent,
  screen,
  waitFor
} from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import type { ReactNode } from 'react'
import { QueryProvider } from '@/components/QueryProvider'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RemindersController as Reminders } from '@/features/reminders/RemindersController'
import {
  formatCountdown,
  scheduledDateTime
} from '@/features/reminders/presentation'
import { RemindersPopupController as RemindersPopup } from '@/features/reminders/reminders.popup'
import { getRemindersStore } from '@/stores/reminders'
import { PopupHost } from '@/popups/PopupHost'
import { createDemoRemindersAdapter } from '@/services/system/reminders'
import { DemoReminderAlertsController as DemoReminderAlerts } from '@/features/reminders/DemoReminderAlertsController'

function fillMessage(
  element: HTMLElement,
  options: { target: { value: string } }
) {
  act(() => {
    const editor = (element as HTMLElement & { editor: Editor }).editor
    editor.commands.setContent(options.target.value, {
      contentType: 'markdown'
    })
  })
}

let dispose: () => void = () => {}
const render = (ui: ReactNode) =>
  renderComponent(ui, { wrapper: QueryProvider })
beforeEach(async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  localStorage.clear()
  const store = getRemindersStore()
  store.setState({ snapshot: null, error: null })
  dispose = await store.getState().connect()
})
afterEach(() => {
  dispose()
  vi.unstubAllGlobals()
})

it('renders the icon, conditionally counts down and opens the creation popup', async () => {
  render(<Reminders />)
  expect(screen.queryByLabelText('Tempo restante')).not.toBeInTheDocument()
  await act(async () => {
    await getRemindersStore()
      .getState()
      .create({
        message: 'Tea',
        mode: { type: 'duration', seconds: 60 },
        scheduledAt: null,
        eventDurationSeconds: null
      })
  })
  expect(screen.getByLabelText('Tempo restante')).toHaveTextContent('1:00')
  fireEvent.click(screen.getByRole('button', { name: 'Abrir lembretes' }))
  expect(
    await screen.findByRole('dialog', { name: 'Lembretes' })
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Mensagem')).toBeInTheDocument()
})

it('creates a duration reminder with fixed event duration and lists it', async () => {
  render(<RemindersPopup />)
  fillMessage(screen.getByLabelText('Mensagem'), {
    target: { value: 'Take a break' }
  })
  let minutes = 5
  for (const increment of [5, 10, 20, 30]) {
    fireEvent.click(
      screen.getByRole('button', { name: `Adicionar ${increment} minutos` })
    )
    minutes += increment
    expect(screen.getByLabelText('Duração (horas e minutos)')).toHaveValue(
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    )
  }
  expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Ativos (0)' })).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Criar lembrete' }))
  const createdTrigger = await screen.findByRole('button', {
    name: 'Ativos (1)'
  })
  expect(createdTrigger).toHaveAttribute('aria-expanded', 'false')
  expect(
    screen.queryByRole('button', { name: 'Dispensar' })
  ).not.toBeInTheDocument()
  fireEvent.click(createdTrigger)
  await waitFor(() =>
    expect(screen.getByText('Take a break')).toBeInTheDocument()
  )
  const r = getRemindersStore().getState().snapshot!.reminders[0]
  expect(r.mode).toEqual({ type: 'duration', seconds: 4200 })
  expect(r.eventDurationSeconds).toBe(300)
  const activeTrigger = screen.getByRole('button', { name: 'Ativos (1)' })
  expect(activeTrigger).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(activeTrigger)
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Dispensar' })
    ).not.toBeInTheDocument()
  )
  expect(activeTrigger).toHaveAttribute('aria-expanded', 'false')
  expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(1)
  fireEvent.click(activeTrigger)

  expect(
    screen.getByRole('checkbox', { name: 'Criar evento no Google Calendar' })
  ).toBeDisabled()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Dispensar' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }))
  await waitFor(() =>
    expect(screen.getByText('Nenhum lembrete ativo.')).toBeInTheDocument()
  )
})

it('creates a duration from the time selector', async () => {
  render(<RemindersPopup />)
  expect(screen.getByLabelText('Duração (horas e minutos)')).toHaveValue(
    '00:05'
  )
  fillMessage(screen.getByLabelText('Mensagem'), {
    target: { value: 'Timer' }
  })
  fireEvent.change(screen.getByLabelText('Duração (horas e minutos)'), {
    target: { value: '02:15' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Criar lembrete' }))
  await waitFor(() =>
    expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(1)
  )
  const reminder = getRemindersStore().getState().snapshot!.reminders[0]
  expect(reminder.mode).toEqual({ type: 'duration', seconds: 8100 })
  expect(reminder.eventDurationSeconds).toBe(300)
})

it('selects minutes on focus and masks typed or pasted duration digits', () => {
  render(<RemindersPopup />)
  const input = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Duração (horas e minutos)'
  })
  act(() => input.focus())
  expect(input.selectionStart).toBe(3)
  expect(input.selectionEnd).toBe(5)
  fireEvent.change(input, { target: { value: '00:25' } })
  expect(input).toHaveValue('00:25')
  fireEvent.change(input, { target: { value: '0130' } })
  expect(input).toHaveValue('01:30')
  fireEvent.change(input, { target: { value: 'ab12:cd34' } })
  expect(input).toHaveValue('12:34')
  act(() => input.blur())
  fireEvent.pointerDown(input)
  act(() => input.focus())
  input.setSelectionRange(0, 0)
  fireEvent.pointerUp(input)
  expect(input.selectionStart).toBe(3)
  expect(input.selectionEnd).toBe(5)
  fireEvent.pointerDown(input)
  input.setSelectionRange(0, 2)
  fireEvent.pointerUp(input)
  expect(input.selectionStart).toBe(0)
  expect(input.selectionEnd).toBe(2)
})

it('submits with Enter from a field and validates a blank message with Zod', async () => {
  render(<RemindersPopup />)
  const message = screen.getByLabelText('Mensagem')
  fillMessage(message, { target: { value: '   ' } })
  fireEvent.keyDown(message, { key: 'Enter', ctrlKey: true })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Informe a mensagem'
  )
  expect(message).toHaveAttribute('aria-invalid', 'true')
  expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(0)
  fillMessage(message, { target: { value: '  Enter reminder  ' } })
  fireEvent.keyDown(message, { key: 'Enter', ctrlKey: true })
  await waitFor(() =>
    expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(1)
  )
  expect(getRemindersStore().getState().snapshot!.reminders[0].message).toBe(
    'Enter reminder'
  )
})

it('submits date/time with Enter and ignores an invalid inactive duration', async () => {
  render(<RemindersPopup />)
  fireEvent.change(screen.getByLabelText('Duração (horas e minutos)'), {
    target: { value: '' }
  })
  fireEvent.click(screen.getByRole('tab', { name: 'Data e hora' }))
  fillMessage(screen.getByLabelText('Mensagem'), {
    target: { value: 'Future appointment' }
  })
  const clock = vi
    .spyOn(Date, 'now')
    .mockReturnValue(new Date().setHours(0, 0, 0, 0))
  const time = '12:00'
  try {
    fireEvent.change(screen.getByLabelText('Horário local'), {
      target: { value: time }
    })
    fireEvent.keyDown(screen.getByLabelText('Horário local'), { key: 'Enter' })
    await waitFor(() =>
      expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(1)
    )
    expect(getRemindersStore().getState().snapshot!.reminders[0].mode).toEqual({
      type: 'dateTime'
    })
  } finally {
    clock.mockRestore()
  }
})

it('normalizes shortcuts and prevents wrapping past the time selector limit', () => {
  render(<RemindersPopup />)
  const input = screen.getByLabelText('Duração (horas e minutos)')
  fireEvent.change(input, { target: { value: '00:50' } })
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar 20 minutos' }))
  expect(input).toHaveValue('01:10')
  fireEvent.change(input, { target: { value: '23:50' } })
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar 20 minutos' }))
  expect(input).toHaveValue('23:50')
  expect(screen.getByRole('alert')).toHaveTextContent('23 horas e 59 minutos')
  expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(0)
})

it.each(['00:00', '', '24:00'])(
  'rejects invalid duration %s before persistence',
  async (duration) => {
    render(<RemindersPopup />)
    fillMessage(screen.getByLabelText('Mensagem'), {
      target: { value: 'Invalid timer' }
    })
    fireEvent.change(screen.getByLabelText('Duração (horas e minutos)'), {
      target: { value: duration }
    })
    fireEvent.submit(
      screen.getByRole('button', { name: 'Criar lembrete' }).closest('form')!
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe')
    expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(0)
  }
)

it.each(['top', 'bottom'] as const)(
  'keeps the calendar on the popup %s side',
  async (side) => {
    render(
      <PopupHost id="reminders" mode="demo" side={side} close={() => {}} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Data e hora' }))
    fireEvent.click(screen.getByLabelText('Data do lembrete'))
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: 'Selecionar data do lembrete' })
      ).toHaveAttribute('data-side', side)
    )
  }
)

it.each([
  [new Date(2027, 11, 31, 12), [0, 1, 1, 2]],
  [new Date(2028, 0, 1, 12), [0, 1, 0, 1]],
  [new Date(2028, 0, 2, 12), [0, 1, 6, 0]]
])(
  'selects date shortcuts from %s without changing time or submitting',
  async (today, offsets) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(today.getTime())
    try {
      render(<RemindersPopup />)
      fireEvent.click(screen.getByRole('tab', { name: 'Data e hora' }))
      const time = screen.getByLabelText('Horário local')
      fireEvent.change(time, { target: { value: '14:30' } })
      const labels = ['Hoje', 'Amanhã', 'Sábado', 'Domingo']
      for (const [index, label] of labels.entries()) {
        fireEvent.click(screen.getByRole('button', { name: label }))
        const expected = new Date(today)
        expected.setDate(expected.getDate() + offsets[index])
        await waitFor(() =>
          expect(screen.getByLabelText('Data do lembrete')).toHaveTextContent(
            expected.toLocaleDateString('pt-BR')
          )
        )
        expect(time).toHaveValue('14:30')
        expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(
          0
        )
      }
    } finally {
      clock.mockRestore()
    }
  }
)

it('renders a date picker and rejects past dates before saving', async () => {
  render(<RemindersPopup />)
  fireEvent.click(screen.getByRole('tab', { name: 'Data e hora' }))
  expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Data do lembrete'))
  expect(screen.getByRole('grid')).toBeInTheDocument()
  fireEvent.keyDown(
    screen.getByRole('dialog', { name: 'Selecionar data do lembrete' }),
    { key: 'Escape' }
  )
  await waitFor(() =>
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  )
  fillMessage(screen.getByLabelText('Mensagem'), {
    target: { value: 'Appointment' }
  })
  fireEvent.change(screen.getByLabelText('Horário local'), {
    target: { value: '00:00' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Criar lembrete' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('futuro')
  expect(getRemindersStore().getState().snapshot!.reminders).toHaveLength(0)
})

it('converts local date/time and formats countdown without wrapping hours', () => {
  const date = new Date(2030, 0, 15)
  expect(scheduledDateTime(date, '14:30')).toBe(
    new Date(2030, 0, 15, 14, 30).getTime()
  )
  expect(() => scheduledDateTime(date, '25:00')).toThrow()
  expect(() => scheduledDateTime(undefined, '14:00')).toThrow()
  expect(formatCountdown(11 * 3600_000 + 59 * 60_000 + 59_000)).toBe('11:59:59')
  expect(formatCountdown(1)).toBe('0:01')
})

it('directs unconfigured Calendar users to Settings with text while keeping reminder creation available', () => {
  render(<RemindersPopup />)
  expect(screen.getByText(/Configurações → Lembretes/)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /Configurações do Google Calendar/ })
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Client ID do Google')).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(screen.getByRole('form', { name: 'Criar lembrete' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Criar lembrete' })).toBeEnabled()
})

async function overdue(message: string) {
  const store = getRemindersStore()
  await store.getState().create({
    message,
    mode: { type: 'duration', seconds: 1 },
    scheduledAt: null,
    eventDurationSeconds: null
  })
  const reminder = store.getState().snapshot!.reminders.at(-1)!
  const adapter = createDemoRemindersAdapter(
    localStorage,
    () => reminder.notifyAt
  )
  const snapshot = await adapter.tick!()
  store.setState({ snapshot })
  return reminder
}

it('waits for the expiry snapshot instead of closing the native alert on stale state', async () => {
  const reminder = await overdue('Await expiry snapshot')
  const store = getRemindersStore()
  const expired = store.getState().snapshot!
  const revision = expired.revision
  store.setState({
    snapshot: {
      ...expired,
      revision: revision - 1,
      reminders: expired.reminders.map((r) => ({ ...r, status: 'scheduled' }))
    }
  })
  const close = vi.fn()
  render(
    <PopupContext.Provider
      value={{
        id: 'reminderAlert',
        mode: 'native',
        params: { id: reminder.id, revision },
        close
      }}
    >
      <ReminderAlert />
    </PopupContext.Provider>
  )
  expect(close).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('button', { name: 'Dispensar' })
  ).not.toBeInTheDocument()
  act(() => store.setState({ snapshot: expired }))
  expect(screen.getByRole('button', { name: 'Dispensar' })).toBeEnabled()
  expect(close).not.toHaveBeenCalled()
  await act(async () => {
    await store.getState().dismiss(reminder.id)
  })
  await waitFor(() => expect(close).toHaveBeenCalled())
})

it('renders Markdown in the expiry alert without moving keyboard focus', async () => {
  const r = await overdue(
    '## Heading\n\n**Important** and *formatted*\n\n- First\n- Second'
  )
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  try {
    render(
      <PopupHost
        id="reminderAlert"
        params={{ id: r.id }}
        mode="demo"
        close={() => {}}
      />
    )
    // Popup content is a code-split chunk; the surface mounts before it resolves.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Heading' })
    ).toBeInTheDocument()
    expect(screen.getByText('Important').tagName).toBe('STRONG')
    expect(screen.getByText('formatted').tagName).toBe('EM')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Dispensar' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Adiar' })).toBeEnabled()
  } finally {
    input.remove()
  }
})

it('snoozes an alert with a preset, persists it and closes after saving', async () => {
  const r = await overdue('Tea is ready')
  const close = vi.fn()
  render(
    <PopupHost
      id="reminderAlert"
      params={{ id: r.id }}
      mode="demo"
      close={close}
    />
  )
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(
    'Tea is ready'
  )
  fireEvent.change(screen.getByLabelText('Adiar por'), {
    target: { value: '15' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Adiar' }))
  await waitFor(() => expect(close).toHaveBeenCalled())
  const saved = (await createDemoRemindersAdapter().load()).reminders[0]
  expect(saved.status).toBe('scheduled')
  expect(saved.notifyAt - Date.now()).toBeGreaterThan(899_000)
  expect(saved.originalAt).toBe(r.originalAt)
})

it('keeps an alert open if saving a dismissal fails', async () => {
  const r = await overdue('Do not lose this alert')
  const close = vi.fn()
  render(
    <PopupHost
      id="reminderAlert"
      params={{ id: r.id }}
      mode="demo"
      close={close}
    />
  )
  const dismiss = await screen.findByRole('button', { name: 'Dispensar' })
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('disk full')
  })
  try {
    fireEvent.click(dismiss)
    expect(await screen.findByRole('alert')).toHaveTextContent('disk full')
    expect(close).not.toHaveBeenCalled()
    expect(getRemindersStore().getState().snapshot!.reminders[0].status).toBe(
      'ringing'
    )
  } finally {
    spy.mockRestore()
  }
})

it('presents simultaneous overdue alerts in sequence and keeps closed alerts pending', async () => {
  await overdue('First')
  await overdue('Second')
  render(<DemoReminderAlerts />)
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('First')
  fireEvent.keyDown(
    screen.getByRole('dialog', { name: 'Alerta de lembrete' }),
    { key: 'Escape' }
  )
  expect(screen.getByRole('alertdialog')).toHaveTextContent('First')
  fireEvent.pointerDown(document.body)
  expect(screen.getByRole('alertdialog')).toHaveTextContent('First')
  fireEvent.click(screen.getByRole('button', { name: 'Fechar alerta' }))
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('Second')
  expect(getRemindersStore().getState().snapshot!.reminders[0].status).toBe(
    'ringing'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }))
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  )
  expect(getRemindersStore().getState().snapshot!.reminders[1].status).toBe(
    'dismissed'
  )
})
