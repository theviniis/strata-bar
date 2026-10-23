import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SpotifyStatus } from '@/services/system/media.generated'
import type { Ref } from 'react'
import { ClipboardPaste, Copy, ExternalLink } from 'lucide-react'
const SPOTIFY_CALLBACK = 'http://127.0.0.1:43821/spotify/callback'
export interface SpotifySettingsProps {
  inputId: string
  inputRef: Ref<HTMLInputElement>
  clientId: string
  status: SpotifyStatus | null
  error: string
  pending: boolean
  copied: boolean
  native: boolean
  onClientIdChange(value: string): void
  onOpenDashboard(): void
  onCopyCallback(): void
  onPasteClientId(): void
  onConnectionChange(connect: boolean): void
}
export function SpotifySettings({
  inputId,
  inputRef,
  clientId,
  status,
  error,
  pending,
  copied,
  native,
  onClientIdChange,
  onOpenDashboard,
  onCopyCallback,
  onPasteClientId,
  onConnectionChange
}: SpotifySettingsProps) {
  return (
    <section className="flex flex-col gap-2" aria-label="Conexão Spotify">
      <h3 className="text-body font-medium">Spotify</h3>
      <p className="text-caption text-muted-foreground">
        Conecte sua conta para consultar e alterar músicas favoritas. Crie um
        aplicativo no Spotify e cadastre esta URL como Redirect URI:
      </p>
      <code className="break-all text-caption">{SPOTIFY_CALLBACK}</code>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onOpenDashboard()}
        >
          <ExternalLink size={14} />
          Criar aplicativo Spotify
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onCopyCallback()}
        >
          <Copy size={14} />
          <span aria-live="polite">
            {copied ? 'URL copiada' : 'Copiar URL de callback'}
          </span>
        </Button>
      </div>
      <Label htmlFor={inputId}>Client ID</Label>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          id={inputId}
          value={clientId}
          onChange={(e) => onClientIdChange(e.target.value)}
          placeholder="Client ID do seu aplicativo"
          autoComplete="off"
          className="min-w-0"
          disabled={!native || pending || status?.state === 'connecting'}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Colar Client ID"
          disabled={!native || pending || status?.state === 'connecting'}
          onClick={() => void onPasteClientId()}
        >
          <ClipboardPaste size={14} />
          Colar
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={
            !native ||
            pending ||
            status?.state === 'connecting' ||
            !/^[a-f\d]{32}$/i.test(clientId.trim())
          }
          onClick={() => void onConnectionChange(true)}
        >
          Conectar Spotify
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={
            !native || pending || !status || status.state === 'disconnected'
          }
          onClick={() => void onConnectionChange(false)}
        >
          Desconectar
        </Button>
      </div>
      <p role="status" className="text-caption text-muted-foreground">
        {!native
          ? 'Demonstração · conexão disponível na barra nativa'
          : status?.state === 'connecting'
            ? 'Aguardando autorização no navegador…'
            : status?.state === 'connected'
              ? 'Spotify conectado'
              : 'Spotify desconectado'}
      </p>
      {(error || status?.error) && (
        <p role="alert" className="text-caption text-destructive">
          {error || status?.error}
        </p>
      )}
    </section>
  )
}
