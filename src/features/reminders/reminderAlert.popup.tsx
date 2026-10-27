import { definePopup } from '@/popups/definition'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { BellRing, X } from 'lucide-react'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ReactNode, useEffect } from 'react'
import type { Reminder } from '@/services/system/reminders.generated'
import { usePopupContext } from '@/popups/context'
import { useReminders } from '@/stores/reminders'
import { ReminderMessageController } from './ReminderMessageController'
import { ReminderAlertActionsController } from './ReminderAlertActionsController'

export interface ReminderAlertProps {
  synchronized: boolean
  reminder: Reminder | undefined
  error: string | null
  source: 'native' | 'demo'
  close: () => void
  message: ReactNode
  actions: ReactNode
}
export function ReminderAlert({
  synchronized,
  reminder,
  error,
  source,
  close,
  message,
  actions
}: ReminderAlertProps) {
  return (
    <section
      role="alertdialog"
      aria-label="Lembrete vencido"
      className={source === 'native' ? 'w-90' : 'w-90 max-w-[calc(100vw-32px)]'}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <BellRing size={18} aria-hidden="true" />
            Lembrete
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Fechar alerta"
            onClick={close}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {synchronized && reminder ? (
          <>
            <div className="max-h-60 min-w-0 overflow-y-auto">{message}</div>
            {actions}
            <p className="text-body text-muted-foreground">
              Fechar esta janela mantém o lembrete pendente no sino.
            </p>
          </>
        ) : (
          <p role={error ? 'alert' : 'status'}>
            {error ?? 'Carregando lembrete…'}
          </p>
        )}
      </CardContent>
    </section>
  )
}

export function ReminderAlertController() {
  const { params, close } = usePopupContext('reminderAlert')
  const snapshot = useReminders((s) => s.snapshot)
  const reminder = snapshot?.reminders.find((r) => r.id === params.id)
  const synchronized =
    snapshot !== null && snapshot.revision >= (params.revision ?? 0)
  const error = useReminders((s) => s.error)
  const source = useReminders((s) => s.source)
  useEffect(() => {
    if (synchronized && (!reminder || reminder.status !== 'ringing')) close()
  }, [synchronized, reminder, close])
  return (
    <ReminderAlert
      synchronized={synchronized}
      reminder={reminder}
      error={error}
      source={source}
      close={close}
      message={
        reminder ? (
          <ReminderMessageController message={reminder.message} />
        ) : null
      }
      actions={
        reminder ? (
          <ReminderAlertActionsController id={reminder.id} onDone={close} />
        ) : null
      }
    />
  )
}

export default definePopup({
  label: 'Alerta de lembrete',
  Content: ReminderAlertController,
  schema: z
    .object({
      id: z.uuid(),
      revision: z.number().int().nonnegative().optional()
    })
    .strict()
})
