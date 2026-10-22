import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PopupContext } from '@/popups/context'
import { prepareDemoReminderSound } from '@/services/system/reminder-sound'
import { useConfig } from '@/stores/config'
import { getRemindersStore, useReminders } from '@/stores/reminders'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useContext, useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useCalendarStatus } from './useCalendarStatus'
import { ActiveReminders } from './ActiveReminders'
import { reminderFormSchema, type ReminderFormValues } from './form'
import { scheduledDateTime } from './presentation'
import { ReminderEditor } from './ReminderEditor'

export function RemindersPopup() {
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
  const { mode, duration, date, syncCalendar } = useWatch({ control })
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
  return (
    <div className="w-105">
      <div>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Lembretes</CardTitle>
          </div>
          <CardDescription>
            Um alerta na hora certa, mesmo depois de reiniciar o Strata.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-h-140 gap-4 overflow-y-auto">
          {source === 'demo' && (
            <p className="text-xs text-muted-foreground">
              Demonstração · dados locais deste navegador.
            </p>
          )}
          {!connected && (
            <p className="text-xs text-muted-foreground">
              Para conectar Google Calendar, abra Configurações → Lembretes.
            </p>
          )}
          <Tabs
            value={mode}
            onValueChange={(value) =>
              setValue('mode', value === 'dateTime' ? 'dateTime' : 'duration')
            }
          >
            <form
              aria-label="Criar lembrete"
              noValidate
              onSubmit={(event) => void handleSubmit(submit)(event)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.nativeEvent.isComposing &&
                  event.target instanceof HTMLInputElement
                ) {
                  event.preventDefault()
                  event.currentTarget.requestSubmit()
                }
              }}
              className="grid gap-3"
            >
              <TabsList
                aria-label="Tipo de lembrete"
                className="grid w-full grid-cols-2"
              >
                <TabsTrigger value="duration">Duração</TabsTrigger>
                <TabsTrigger value="dateTime">Data e hora</TabsTrigger>
              </TabsList>

              <Field>
                <FieldLabel htmlFor={`${id}-message`}>Mensagem</FieldLabel>
                <Controller
                  name="message"
                  control={control}
                  render={({ field }) => (
                    <ReminderEditor
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
              </Field>

              <TabsContent value="duration" className="grid gap-3 mt-0">
                <Field>
                  <FieldLabel htmlFor={`${id}-duration`}>
                    Duração (horas e minutos)
                  </FieldLabel>
                  <Input
                    id={`${id}-duration`}
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                    maxLength={5}
                    required
                    disabled={pending}
                    {...register('duration')}
                    aria-invalid={!!errors.duration}
                    value={duration}
                    onFocus={(event) =>
                      event.currentTarget.setSelectionRange(3, 5)
                    }
                    onPointerDown={(event) => {
                      durationPointerFocus.current =
                        document.activeElement !== event.currentTarget
                    }}
                    onPointerUp={(event) => {
                      if (durationPointerFocus.current) {
                        event.currentTarget.setSelectionRange(3, 5)
                        durationPointerFocus.current = false
                      }
                    }}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value.includes(':')) {
                        const [hours, minutes = ''] = value.split(':')
                        setDuration(
                          `${hours.replace(/\D/g, '').slice(0, 2)}:${minutes.replace(/\D/g, '').slice(0, 2)}`
                        )
                      } else {
                        const digits = value.replace(/\D/g, '').slice(0, 4)
                        setDuration(
                          digits.length > 2
                            ? `${digits.slice(0, 2)}:${digits.slice(2)}`
                            : digits
                        )
                      }
                    }}
                    className="appearance-none bg-background"
                  />
                </Field>
                <div
                  role="group"
                  aria-label="Adicionar tempo"
                  className="grid grid-cols-4 gap-2"
                >
                  {[5, 10, 20, 30].map((minutes) => (
                    <Button
                      key={minutes}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      aria-label={`Adicionar ${minutes} minutos`}
                      onClick={() => {
                        const [hours, currentMinutes] = (duration ?? '')
                          .split(':')
                          .map(Number)
                        const current = /^([01]\d|2[0-3]):[0-5]\d$/.test(
                          duration ?? ''
                        )
                          ? hours * 60 + currentMinutes
                          : 0
                        const total = current + minutes
                        if (total > 1439) {
                          setFormError(
                            'A duração máxima é 23 horas e 59 minutos'
                          )
                          return
                        }
                        setFormError('')
                        setDuration(
                          `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
                        )
                      }}
                    >
                      +{minutes} min
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  No Google Calendar, o evento terá sempre 5 minutos.
                </p>
              </TabsContent>
              <TabsContent value="dateTime" className="grid gap-3">
                <FieldGroup className="flex-row">
                  <Field>
                    <FieldLabel htmlFor={`${id}-date`}>
                      Data do lembrete
                    </FieldLabel>
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          id={`${id}-date`}
                          className="w-full justify-between font-normal"
                        >
                          {date
                            ? date.toLocaleDateString('pt-BR')
                            : 'Selecionar data'}
                          <ChevronDown aria-hidden="true" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        aria-label="Selecionar data do lembrete"
                        className="max-h-(--radix-popover-content-available-height) w-auto max-w-none overflow-y-auto p-0"
                        align="start"
                        side={calendarSide}
                        avoidCollisions={false}
                        collisionPadding={8}
                        onEscapeKeyDown={(event) => event.stopPropagation()}
                      >
                        <Calendar
                          mode="single"
                          selected={date}
                          captionLayout="dropdown"
                          defaultMonth={date}
                          onSelect={(selected) => {
                            setValue('date', selected, {
                              shouldDirty: true,
                              shouldValidate: true
                            })
                            setDateOpen(false)
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </Field>

                  <Field className="w-32">
                    <FieldLabel htmlFor={`${id}-time`}>
                      Horário local
                    </FieldLabel>
                    <Input
                      id={`${id}-time`}
                      type="time"
                      step="60"
                      required
                      {...register('time')}
                      aria-invalid={!!errors.time}
                      className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    />
                  </Field>
                </FieldGroup>
                <div
                  role="group"
                  aria-label="Selecionar dia"
                  className="grid grid-cols-4 gap-2"
                >
                  {[
                    { label: 'Hoje', weekday: null, days: 0 },
                    { label: 'Amanhã', weekday: null, days: 1 },
                    { label: 'Sábado', weekday: 6, days: 0 },
                    { label: 'Domingo', weekday: 0, days: 0 }
                  ].map(({ label, weekday, days }) => (
                    <Button
                      key={label}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending || isSubmitting}
                      onClick={() => {
                        const selected = new Date(Date.now())
                        const offset =
                          weekday === null
                            ? days
                            : (weekday - selected.getDay() + 7) % 7
                        selected.setDate(selected.getDate() + offset)
                        selected.setHours(0, 0, 0, 0)
                        setValue('date', selected, {
                          shouldDirty: true,
                          shouldValidate: true
                        })
                        setDateOpen(false)
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-event`}>Duração do evento (min)</Label>
                  <Input
                    id={`${id}-event`}
                    type="number"
                    min="1"
                    step="1"
                    required
                    {...register('eventDuration')}
                    aria-invalid={!!errors.eventDuration}
                  />
                </div>
              </TabsContent>
              <FieldGroup>
                <Field orientation={'horizontal'}>
                  <Checkbox
                    id="google-calendar"
                    checked={!!syncCalendar && connected}
                    disabled={!connected || pending}
                    onCheckedChange={(checked) =>
                      setValue('syncCalendar', !!checked)
                    }
                  />
                  <FieldLabel htmlFor="google-calendar">
                    Criar evento no Google Calendar
                  </FieldLabel>
                </Field>
              </FieldGroup>
              <Button
                type="submit"
                disabled={pending || isSubmitting || snapshot === null}
              >
                {pending ? (
                  'Salvando…'
                ) : (
                  <>
                    Criar lembrete{' '}
                    <KbdGroup aria-hidden="true" data-icon="inline-end">
                      <Kbd variant="primary">Ctrl</Kbd>
                      <span>+</span>
                      <Kbd variant="primary">⏎</Kbd>
                    </KbdGroup>
                  </>
                )}
              </Button>
            </form>
          </Tabs>
          {visibleError && (
            <p role="alert" className="text-sm text-destructive">
              {visibleError}
            </p>
          )}
          {success && (
            <p role="status" className="text-xs text-muted-foreground">
              {success}
            </p>
          )}
          <ActiveReminders
            connected={connected}
            pending={pending}
            onPendingChange={setPending}
          />
        </CardContent>
      </div>
    </div>
  )
}
