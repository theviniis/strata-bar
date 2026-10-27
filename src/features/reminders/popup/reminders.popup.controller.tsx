import {
  type ChangeEventHandler,
  type FocusEventHandler,
  type FormEventHandler,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from 'react'
import { PopupContext } from '@/popups/context'
import { prepareDemoReminderSound } from '@/services/system/reminder-sound'
import { useConfig } from '@/stores/config'
import { getRemindersStore, useReminders } from '@/stores/reminders'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useCalendarStatus } from '../src/use-calendar-status'
import { ActiveRemindersController } from '../src/active-reminders-controller'
import { reminderFormSchema, type ReminderFormValues } from '../src/form'
import { scheduledDateTime } from '../src/presentation'
import { ReminderEditorController } from '../src/reminder-editor-controller'
import { RemindersPopup } from './reminders.popup'

function useRemindersPopupModel() {
  const id = useId()
  const popup = useContext(PopupContext)
  const barPosition = useConfig((state) => state.config.bar.position)
  const calendarSide = popup?.side ?? (barPosition === 'top' ? 'bottom' : 'top')
  const snapshot = useReminders((s) => s.snapshot)
  const error = useReminders((s) => s.error)
  const create = useReminders((s) => s.create)
  const source = useReminders((s) => s.source)
  const calendarStatus = useCalendarStatus(source === 'native')
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ReminderFormValues>({
    resolver: zodResolver(reminderFormSchema),
    defaultValues: {
      mode: 'duration',
      message: '',
      duration: '00:05',
      date: new Date(),
      time: '09:00',
      eventDuration: '30',
      syncCalendar: false
    }
  })
  const { mode, duration, date, time, eventDuration, syncCalendar } = useWatch({
    control
  })
  const setDuration = (value: string) =>
    setValue('duration', value, { shouldDirty: true, shouldValidate: true })
  const durationPointerFocus = useRef(false)
  const submitting = useRef(false)
  const [dateOpen, setDateOpen] = useState(false)
  const connected = source === 'native' && !!calendarStatus.data?.connected
  const previousConnection = useRef<boolean | null>(null)
  const [actionPending, setPending] = useState(false)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(() => {
    const value = source === 'native' && !!calendarStatus.data?.connected
    if (previousConnection.current !== value) {
      setValue('syncCalendar', value)
      previousConnection.current = value
    }
  }, [source, calendarStatus.data?.connected, setValue])
  const createReminder = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (values: ReminderFormValues) => {
      const [hours, minutes] = values.duration.split(':').map(Number)
      const seconds =
        values.mode === 'duration'
          ? hours * 3600 + minutes * 60
          : Number(values.eventDuration) * 60
      const scheduledAt =
        values.mode === 'dateTime'
          ? scheduledDateTime(values.date, values.time)
          : null
      const ok = await create({
        message: values.message,
        mode:
          values.mode === 'duration'
            ? { type: 'duration', seconds }
            : { type: 'dateTime' },
        scheduledAt,
        eventDurationSeconds: values.mode === 'duration' ? null : seconds,
        syncCalendar: connected && values.syncCalendar
      })
      if (!ok) {
        throw new Error(
          getRemindersStore().getState().error ??
            'Não foi possível salvar o lembrete'
        )
      }
    },
    onSuccess: () => {
      setValue('message', '')
      setSuccess(
        'Lembrete salvo. Falhas de sincronização aparecem na lista abaixo.'
      )
    },
    onError: (error) => {
      setFormError(error.message)
    },
    onSettled: () => {
      submitting.current = false
    }
  })
  const pending = actionPending || createReminder.isPending
  function submit(values: ReminderFormValues) {
    if (pending || submitting.current) return
    submitting.current = true
    prepareDemoReminderSound()
    setFormError('')
    setSuccess('')
    createReminder.mutate(values)
  }
  const validationError = Object.values(errors).find(
    (field) => field?.message
  )?.message
  const visibleError =
    formError ||
    validationError ||
    (calendarStatus.error ? String(calendarStatus.error) : '') ||
    error
  const fields = {
    duration: register('duration'),
    time: register('time'),
    eventDuration: register('eventDuration')
  }
  const editor: ReactNode = (
    <Controller
      name="message"
      control={control}
      render={({ field }) => (
        <ReminderEditorController
          id={`${id}-message`}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          disabled={isSubmitting || createReminder.isPending}
          invalid={!!errors.message}
          onSubmit={() => void handleSubmit(submit)()}
        />
      )}
    />
  )
  const activeReminders: ReactNode = (
    <ActiveRemindersController
      connected={connected}
      pending={pending}
      onPendingChange={setPending}
    />
  )
  const onModeChange = (value: string) =>
    setValue('mode', value === 'dateTime' ? 'dateTime' : 'duration')
  const onSubmit: FormEventHandler<HTMLFormElement> = (event) =>
    void handleSubmit(submit)(event)
  const onFormKeyDown: KeyboardEventHandler<HTMLFormElement> = (event) => {
    if (
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing &&
      event.target instanceof HTMLInputElement
    ) {
      event.preventDefault()
      event.currentTarget.requestSubmit()
    }
  }
  const onDurationPointerDown: PointerEventHandler<HTMLInputElement> = (
    event
  ) => {
    durationPointerFocus.current =
      document.activeElement !== event.currentTarget
  }
  const onDurationFocus: FocusEventHandler<HTMLInputElement> = (event) => {
    event.currentTarget.setSelectionRange(3, 5)
  }
  const onDurationPointerUp: PointerEventHandler<HTMLInputElement> = (
    event
  ) => {
    if (durationPointerFocus.current) {
      event.currentTarget.setSelectionRange(3, 5)
      durationPointerFocus.current = false
    }
  }
  const onDurationChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const value = event.target.value
    if (value.includes(':')) {
      const [hours, minutes = ''] = value.split(':')
      setDuration(
        `${hours.replace(/\D/g, '').slice(0, 2)}:${minutes.replace(/\D/g, '').slice(0, 2)}`
      )
    } else {
      const digits = value.replace(/\D/g, '').slice(0, 4)
      setDuration(
        digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
      )
    }
  }
  const onAddMinutes = (minutes: number) => {
    const [hours, currentMinutes] = (duration ?? '').split(':').map(Number)
    const current = /^([01]\d|2[0-3]):[0-5]\d$/.test(duration ?? '')
      ? hours * 60 + currentMinutes
      : 0
    const total = current + minutes
    if (total > 1439) {
      setFormError('A duração máxima é 23 horas e 59 minutos')
      return
    }
    setFormError('')
    setDuration(
      `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    )
  }
  const onDateChange = (selected: Date | undefined) => {
    setValue('date', selected, {
      shouldDirty: true,
      shouldValidate: true
    })
    setDateOpen(false)
  }
  const onQuickDate = (weekday: number | null, days: number) => {
    const selected = new Date(Date.now())
    const offset =
      weekday === null ? days : (weekday - selected.getDay() + 7) % 7
    selected.setDate(selected.getDate() + offset)
    selected.setHours(0, 0, 0, 0)
    setValue('date', selected, {
      shouldDirty: true,
      shouldValidate: true
    })
    setDateOpen(false)
  }
  return {
    id,
    source,
    connected,
    mode,
    duration,
    time,
    eventDuration,
    date,
    syncCalendar,
    pending,
    isSubmitting,
    visibleError,
    success,
    errors,
    fields,
    editor,
    activeReminders,
    dateOpen,
    calendarSide,
    onModeChange,
    onSubmit,
    onFormKeyDown,
    onDurationPointerDown,
    onDurationFocus,
    onDurationPointerUp,
    onDurationChange,
    onAddMinutes,
    onDateChange,
    onQuickDate,
    loaded: snapshot !== null,
    onDateOpenChange: setDateOpen,
    onSyncCalendarChange: (checked: boolean) =>
      setValue('syncCalendar', checked)
  }
}

export type RemindersPopupProps = Omit<
  ReturnType<typeof useRemindersPopupModel>,
  'editor' | 'activeReminders'
> & { editor: ReactNode; activeReminders: ReactNode }

export function RemindersPopupController() {
  return <RemindersPopup {...useRemindersPopupModel()} />
}
