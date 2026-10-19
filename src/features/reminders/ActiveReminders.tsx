import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { useReminders } from '@/stores/reminders'
import { Ghost } from 'lucide-react'
import { memo, useMemo } from 'react'
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
  const active = useMemo(
    () =>
      (reminders ?? [])
        .filter((reminder) => reminder.status !== 'dismissed')
        .sort((a, b) => a.notifyAt - b.notifyAt),
    [reminders]
  )
  return (
    <Accordion defaultValue={[]} aria-label="Lembretes ativos">
      <AccordionItem value="active">
        <AccordionTrigger className="py-0">
          Ativos ({active.length})
        </AccordionTrigger>
        <AccordionContent className="grid gap-2">
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
            <div
              key={r.id}
              className="grid gap-2 rounded border border-border p-3"
            >
              <ReminderMessage message={r.message} />
              <p className="text-xs text-muted-foreground">
                {new Date(r.notifyAt).toLocaleString()} ·{' '}
                {r.status === 'ringing' ? 'Aguardando confirmação' : 'Agendado'}
              </p>
              {r.googleEventId && (
                <p className="text-xs text-muted-foreground">
                  Evento criado no Google Calendar
                </p>
              )}
              {r.calendarRequested && !r.googleEventId && (
                <>
                  <p className="text-xs text-destructive">
                    {r.calendarError ?? 'Sincronização pendente'}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || !connected}
                    onClick={() => {
                      onPendingChange(true)
                      void sync(r.id).finally(() => onPendingChange(false))
                    }}
                  >
                    Tentar sincronizar
                  </Button>
                </>
              )}
              {r.status === 'ringing' ? (
                <ReminderAlertActions id={r.id} />
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    onPendingChange(true)
                    void dismiss(r.id).finally(() => onPendingChange(false))
                  }}
                >
                  Dispensar
                </Button>
              )}
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
})
