import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import type { Reminder } from '@/services/system/reminders.generated'
import { useReminders } from '@/stores/reminders'
import { cn } from 'cn'
import { ChevronDownIcon, Ghost, RefreshCw, Trash } from 'lucide-react'
import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ComponentProps
} from 'react'
import { ReminderAlertActions } from './ReminderAlertActions'
import { ReminderMessage } from './ReminderMessage'

export const ActiveReminders = memo(function ActiveReminders({
  connected,
  pending,
  onPendingChange
}: {
  connected: boolean
  pending: boolean
  onPendingChange: (pending: boolean) => void
}) {
  const reminders = useReminders((state) => state.snapshot?.reminders)
  const dismiss = useReminders((state) => state.dismiss)
  const sync = useReminders((state) => state.syncCalendar)
  const [isOpen, setIsOpen] = useState(true)

  const active = useMemo(
    () =>
      (reminders ?? [])
        .filter((reminder) => reminder.status !== 'dismissed')
        .sort((a, b) => a.notifyAt - b.notifyAt),
    [reminders]
  )

  const onDimiss = useCallback((r: Reminder) => {
    onPendingChange(true)
    void dismiss(r.id).finally(() => onPendingChange(false))
  }, [])

  const onSync = useCallback((r: Reminder) => {
    onPendingChange(true)
    void sync(r.id).finally(() => onPendingChange(false))
  }, [])

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      aria-label="Lembretes ativos"
      className="space-y-2"
    >
      <CollapsibleTrigger
        render={
          <Button variant="ghost" className="w-full">
            Ativos ({active.length})
            <ChevronDownIcon className="ml-auto group-data-panel-open/button:rotate-180" />
          </Button>
        }
      />

      <CollapsibleContent className="grid gap-2">
        {active.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <Ghost />
              </EmptyMedia>
              <EmptyTitle>Nenhum lembrete ativo.</EmptyTitle>
              <EmptyDescription>
                Adicione novos lembretes para aparecer aqui.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {active.map((r) => (
          <ActiveRemindersItem
            key={r.id}
            reminder={r}
            pending={pending}
            connected={connected}
            onSync={onSync}
            onDimiss={onDimiss}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
})

interface ActiveRemindersItemProps extends ComponentProps<'div'> {
  reminder: Reminder
  pending: boolean
  connected: boolean
  onSync: (reminder: Reminder) => void
  onDimiss: (reminder: Reminder) => void
}

export const ActiveRemindersItem = ({
  className,
  reminder,
  pending,
  connected,
  onSync,
  onDimiss,
  ...props
}: ActiveRemindersItemProps) => {
  return (
    <div
      {...props}
      className={cn(
        className,
        'grid gap-2 rounded border border-border p-3 w-full'
      )}
    >
      <div className="grid gap-2">
        <ReminderMessage message={reminder.message} />
        <p className="text-xs text-muted-foreground">
          {new Date(reminder.notifyAt).toLocaleString()} ·{' '}
          {reminder.status === 'ringing'
            ? 'Aguardando confirmação'
            : 'Agendado'}
        </p>
        {reminder.googleEventId && (
          <p className="text-xs text-muted-foreground">
            Evento criado no Google Calendar
          </p>
        )}
      </div>
      {reminder.calendarRequested && !reminder.googleEventId && (
        <>
          <p className="text-xs text-destructive">
            {reminder.calendarError ?? 'Sincronização pendente'}
          </p>
          <Button
            size="icon"
            className="w-full"
            variant="outline"
            disabled={pending || !connected}
            onClick={() => {
              onSync(reminder)
            }}
          >
            <RefreshCw data-icon="inline-start" /> Tentar sincronizar
          </Button>
        </>
      )}
      {reminder.status === 'ringing' ? (
        <ReminderAlertActions id={reminder.id} />
      ) : (
        <Button
          className="w-full"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            onDimiss(reminder)
          }}
        >
          <Trash data-icon="inline-start" /> Dispensar
        </Button>
      )}
    </div>
  )
}
