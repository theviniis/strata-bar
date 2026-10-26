import { Button } from '@/components/ui/button'
import { BellRing, X } from 'lucide-react'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReactNode } from 'react'
import type { Reminder } from '@/services/system/reminders.generated'

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
