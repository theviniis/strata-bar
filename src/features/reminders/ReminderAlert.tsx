import { useEffect } from 'react'
import { BellRing } from 'lucide-react'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePopupContext } from '@/popups/context'
import { useReminders } from '@/stores/reminders'
import { ReminderAlertActions } from './ReminderAlertActions'

export function ReminderAlert() {
  const { params, close } = usePopupContext('reminderAlert')
  const snapshot = useReminders((s) => s.snapshot)
  const reminder = snapshot?.reminders.find((r) => r.id === params.id)
  const error = useReminders((s) => s.error)
  const source = useReminders((s) => s.source)
  useEffect(() => {
    if (snapshot && (!reminder || reminder.status !== 'ringing')) close()
  }, [snapshot, reminder, close])
  return (
    <section
      role="alertdialog"
      aria-label="Lembrete vencido"
      className={source === 'native' ? 'w-90' : 'w-90 max-w-[calc(100vw-32px)]'}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing size={18} aria-hidden="true" />
          Lembrete
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {reminder ? (
          <>
            <p className="max-h-60 overflow-y-auto wrap-break-word whitespace-pre-wrap text-sm">
              {reminder.message}
            </p>
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
