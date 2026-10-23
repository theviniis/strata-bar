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
import { cn } from '@/lib/utils'
import { ChevronDownIcon, Ghost, RefreshCw, Trash } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

export interface ActiveRemindersProps {
  activeCount: number
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  items: ReactNode
}
export function ActiveReminders({
  activeCount,
  isOpen,
  onOpenChange,
  items
}: ActiveRemindersProps) {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      aria-label="Lembretes ativos"
      className="space-y-2"
    >
      <CollapsibleTrigger
        render={
          <Button variant="ghost" className="w-full">
            Ativos ({activeCount})
            <ChevronDownIcon className="ml-auto group-data-panel-open/button:rotate-180" />
          </Button>
        }
      />

      <CollapsibleContent className="grid gap-2">
        {activeCount === 0 && (
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

        {items}
      </CollapsibleContent>
    </Collapsible>
  )
}

interface ActiveRemindersItemProps extends ComponentProps<'div'> {
  message: ReactNode
  actions: ReactNode
  reminder: Reminder
  pending: boolean
  connected: boolean
  onSync: (reminder: Reminder) => void
  onDismiss: (reminder: Reminder) => void
}

export const ActiveRemindersItem = ({
  className,
  reminder,
  message,
  actions,
  pending,
  connected,
  onSync,
  onDismiss,
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
        {message}
        <p className="text-caption text-muted-foreground">
          {new Date(reminder.notifyAt).toLocaleString()} ·{' '}
          {reminder.status === 'ringing'
            ? 'Aguardando confirmação'
            : 'Agendado'}
        </p>
        {reminder.googleEventId && (
          <p className="text-caption text-muted-foreground">
            Evento criado no Google Calendar
          </p>
        )}
      </div>
      {reminder.calendarRequested && !reminder.googleEventId && (
        <>
          <p className="text-caption text-destructive">
            {reminder.calendarError ?? 'Sincronização pendente'}
          </p>
          <Button
            size="icon"
            className="w-full flex items-center gap-2"
            variant="outline"
            disabled={pending || !connected}
            onClick={() => {
              onSync(reminder)
            }}
          >
            <RefreshCw data-icon="inline-start" />
            Tentar sincronizar
          </Button>
        </>
      )}
      {reminder.status === 'ringing' ? (
        actions
      ) : (
        <Button
          className="w-full flex items-center gap-2"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            onDismiss(reminder)
          }}
        >
          <Trash data-icon="inline-start" />
          Dispensar
        </Button>
      )}
    </div>
  )
}
