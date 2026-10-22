import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { bridge } from '@/services/system/bridge'
import type { SpotifyStatus } from '@/services/system/media.generated'
import { ClipboardPaste, Copy, ExternalLink } from 'lucide-react'

const SPOTIFY_CALLBACK = 'http://127.0.0.1:43821/spotify/callback'
const SPOTIFY_DASHBOARD = 'https://developer.spotify.com/dashboard/create'

/** Spotify account settings, owned by the Settings window. */
export function SpotifySettings() {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState('')
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const native = bridge.mode === 'native'
  useEffect(() => {
    if (!native || !bridge.spotifyStatus) return
    let cancelled = false
    const load = async () => {
      try {
        const value = await bridge.spotifyStatus!()
        if (!cancelled) {
          setStatus(value)
          setClientId((old) => old || value.clientId)
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }
    void load()
    const timer = setInterval(() => void load(), 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [native])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  async function openDashboard() {
    setError('')
    try {
      if (native) {
        if (!bridge.spotifyOpenDashboard)
          throw new Error('Abertura do navegador indisponível')
        await bridge.spotifyOpenDashboard()
      } else {
        window.open(SPOTIFY_DASHBOARD, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      setError(String(e))
    }
  }
  async function copyCallback() {
    setError('')
    try {
      await navigator.clipboard.writeText(SPOTIFY_CALLBACK)
      setCopied(true)
    } catch {
      setCopied(false)
      setError(
        'Não foi possível copiar. Copie a URL de callback exibida acima.'
      )
    }
  }
  async function pasteClientId() {
    setError('')
    try {
      const value = (await navigator.clipboard.readText()).trim()
      if (!/^[a-f\d]{32}$/i.test(value)) {
        setError('O clipboard não contém um Client ID válido.')
        return
      }
      setClientId(value)
      inputRef.current?.focus()
    } catch {
      setError(
        'Não foi possível ler o clipboard. Cole o Client ID manualmente.'
      )
    }
  }
  async function change(connect: boolean) {
    setPending(true)
    setError('')
    try {
      if (connect) await bridge.spotifyConnect?.(clientId.trim())
      else await bridge.spotifyDisconnect?.()
      if (bridge.spotifyStatus) setStatus(await bridge.spotifyStatus())
    } catch (e) {
      setError(String(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="flex flex-col gap-2" aria-label="Conexão Spotify">
      <h3 className="text-sm font-medium">Spotify</h3>
      <p className="text-xs text-muted-foreground">
        Conecte sua conta para consultar e alterar músicas favoritas. Crie um
        aplicativo no Spotify e cadastre esta URL como Redirect URI:
      </p>
      <code className="break-all text-xs">{SPOTIFY_CALLBACK}</code>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void openDashboard()}
        >
          <ExternalLink size={14} />
          Criar aplicativo Spotify
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copyCallback()}
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
          onChange={(e) => setClientId(e.target.value)}
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
          onClick={() => void pasteClientId()}
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
          onClick={() => void change(true)}
        >
          Conectar Spotify
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={
            !native || pending || !status || status.state === 'disconnected'
          }
          onClick={() => void change(false)}
        >
          Desconectar
        </Button>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {!native
          ? 'Demonstração · conexão disponível na barra nativa'
          : status?.state === 'connecting'
            ? 'Aguardando autorização no navegador…'
            : status?.state === 'connected'
              ? 'Spotify conectado'
              : 'Spotify desconectado'}
      </p>
      {(error || status?.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error || status?.error}
        </p>
      )}
    </section>
  )
}
