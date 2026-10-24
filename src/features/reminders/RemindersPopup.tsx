import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
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
import { ChevronDown } from 'lucide-react'
import type { RemindersPopupProps } from './RemindersPopupController'

export function RemindersPopup({
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
  loaded,
  onDateOpenChange,
  onSyncCalendarChange
}: RemindersPopupProps) {
  return (
    <section className="w-105 grid max-h-140 gap-4 overflow-y-auto p-4">
      {source === 'demo' && (
        <p className="text-caption text-muted-foreground">
          Demonstração · dados locais deste navegador.
        </p>
      )}
      {!connected && (
        <p className="text-caption text-muted-foreground">
          Para conectar Google Calendar, abra Configurações → Lembretes.
        </p>
      )}
      <Tabs value={mode} onValueChange={onModeChange}>
        <form
          aria-label="Criar lembrete"
          noValidate
          onSubmit={onSubmit}
          onKeyDown={onFormKeyDown}
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
            {editor}
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
                {...fields.duration}
                aria-invalid={!!errors.duration}
                value={duration}
                onFocus={onDurationFocus}
                onPointerDown={onDurationPointerDown}
                onPointerUp={onDurationPointerUp}
                onChange={onDurationChange}
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
                  onClick={() => onAddMinutes(minutes)}
                >
                  +{minutes} min
                </Button>
              ))}
            </div>
            <p className="text-caption text-muted-foreground">
              No Google Calendar, o evento terá sempre 5 minutos.
            </p>
          </TabsContent>
          <TabsContent value="dateTime" className="grid gap-3">
            <FieldGroup className="flex-row">
              <Field>
                <FieldLabel htmlFor={`${id}-date`}>Data do lembrete</FieldLabel>
                <Popover open={dateOpen} onOpenChange={onDateOpenChange}>
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
                      onSelect={onDateChange}
                    />
                  </PopoverContent>
                </Popover>
              </Field>

              <Field className="w-32">
                <FieldLabel htmlFor={`${id}-time`}>Horário local</FieldLabel>
                <Input
                  id={`${id}-time`}
                  type="time"
                  step="60"
                  required
                  {...fields.time}
                  value={time ?? ''}
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
                  onClick={() => onQuickDate(weekday, days)}
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
                {...fields.eventDuration}
                value={eventDuration ?? ''}
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
                onCheckedChange={(checked) => onSyncCalendarChange(!!checked)}
              />
              <FieldLabel htmlFor="google-calendar">
                Criar evento no Google Calendar
              </FieldLabel>
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={pending || isSubmitting || !loaded}>
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
        <p role="alert" className="text-body text-destructive">
          {visibleError}
        </p>
      )}
      {success && (
        <p role="status" className="text-caption text-muted-foreground">
          {success}
        </p>
      )}
      {activeReminders}
    </section>
  )
}
