import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calendar } from '@/services/system/calendar'
import type { CalendarStatus } from '@/services/system/reminders.generated'

export function CalendarSettings({
  onConnected
}: {
  onConnected(connected: boolean): void
}) {
  const id = useId()
  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const native = Boolean(window.__TAURI_INTERNALS__)
  useEffect(() => {
    if (!native) return
    let cancelled = false
    void calendar
      .status()
      .then((value) => {
        if (cancelled) return
        setStatus(value)
        onConnected(value.connected)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [native, onConnected])
  async function change(connect: boolean) {
    setPending(true)
    setError('')
    try {
      const value = connect
        ? await calendar.connect(clientId.trim(), clientSecret.trim())
        : await calendar.disconnect()
      setStatus(value)
      onConnected(value.connected)
      setClientSecret('')
    } catch (e) {
      setError(String(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <section
      aria-label="Conexão Google Calendar"
      className="grid gap-3 text-sm"
    >
      {status?.connected ? (
        <>
          <p className="text-muted-foreground">
            Eventos na agenda principal. Adiar altera somente o alerta local.
          </p>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void change(false)}
          >
            Desconectar Google
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            Habilite Google Calendar API e crie um cliente OAuth do tipo Desktop
            no Google Cloud. Adicione sua conta como usuário de teste, se
            necessário.
          </p>
          <Label htmlFor={`${id}-client`}>Client ID do Google</Label>
          <Input
            id={`${id}-client`}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="…apps.googleusercontent.com"
            autoComplete="off"
            disabled={!native || pending || status?.connecting}
          />
          <Label htmlFor={`${id}-secret`}>
            Client Secret (se fornecido pelo Google)
          </Label>
          <Input
            id={`${id}-secret`}
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
            disabled={!native || pending || status?.connecting}
          />
          <Button
            disabled={
              !native || pending || status?.connecting || !clientId.trim()
            }
            onClick={() => void change(true)}
          >
            {pending || status?.connecting
              ? 'Aguardando autorização no navegador…'
              : 'Conectar Google Calendar'}
          </Button>
        </>
      )}
      {!native && (
        <p className="text-muted-foreground">
          Demonstração · conexão disponível na barra nativa.
        </p>
      )}
      {(error || status?.error) && (
        <p role="alert" className="text-destructive">
          {error || status?.error}
        </p>
      )}
    </section>
  )
}
