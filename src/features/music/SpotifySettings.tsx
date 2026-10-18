import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { bridge } from '@/services/system/bridge'
import type { SpotifyStatus } from '@/services/system/media.generated'

/** Shared account settings; playback controls remain in the compact bar. */
export function SpotifySettings() {
  const inputId = useId()
  const [clientId, setClientId] = useState('')
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
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
    <section
      className="flex flex-col gap-2 border-t border-border p-4"
      aria-label="Conexão Spotify"
    >
      <h3 className="text-sm font-medium">Spotify</h3>
      <p className="text-xs text-muted-foreground">
        Conecte sua conta para consultar e alterar músicas favoritas. Cadastre o
        redirect URI http://127.0.0.1:43821/spotify/callback no seu aplicativo
        Spotify.
      </p>
      <Label htmlFor={inputId}>Client ID</Label>
      <Input
        id={inputId}
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        placeholder="Client ID do seu aplicativo"
        autoComplete="off"
        disabled={!native || pending || status?.state === 'connecting'}
      />
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
