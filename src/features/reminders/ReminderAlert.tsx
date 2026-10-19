import { Button } from '@/components/ui/button'
import { useEffect } from 'react'
import { BellRing, X } from 'lucide-react'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePopupContext } from '@/popups/context'
import { useReminders } from '@/stores/reminders'
import { ReminderMessage } from './ReminderMessage'
import { ReminderAlertActions } from './ReminderAlertActions'

export function ReminderAlert() {
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
            <div className="max-h-60 min-w-0 overflow-y-auto">
              <ReminderMessage message={reminder.message} />
            </div>
            <ReminderAlertActions id={reminder.id} onDone={close} />
            <p className="text-xs text-muted-foreground">
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
