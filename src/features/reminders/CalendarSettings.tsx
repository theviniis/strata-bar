import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CalendarStatus } from '@/services/system/reminders.generated'

export interface CalendarSettingsProps {
  id: string
  clientId: string
  clientSecret: string
  pending: boolean
  error: string
  native: boolean
  status: CalendarStatus | undefined
  onClientIdChange: (value: string) => void
  onClientSecretChange: (value: string) => void
  onConnect: () => void
  onDisconnect: () => void
}
export function CalendarSettings({
  id,
  clientId,
  clientSecret,
  pending,
  error,
  native,
  status,
  onClientIdChange,
  onClientSecretChange,
  onConnect,
  onDisconnect
}: CalendarSettingsProps) {
  return (
    <section
      aria-label="Conexão Google Calendar"
      className="flex min-w-0 flex-col items-start gap-4 text-sm leading-relaxed"
    >
      {status?.connected ? (
        <>
          <p className="text-muted-foreground">
            Eventos na agenda <strong>Lembretes Strata</strong>, criada
            automaticamente se preciso. Adiar altera somente o alerta local.
          </p>
          <Button variant="outline" disabled={pending} onClick={onDisconnect}>
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
            onChange={(e) => onClientIdChange(e.target.value)}
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
            onChange={(e) => onClientSecretChange(e.target.value)}
            autoComplete="off"
            disabled={!native || pending || status?.connecting}
          />
          <Button
            className="h-auto min-h-8 max-w-full whitespace-normal"
            disabled={
              !native || pending || status?.connecting || !clientId.trim()
            }
            onClick={onConnect}
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
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
