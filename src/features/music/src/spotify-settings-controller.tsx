import { bridge } from '@/services/system/bridge'
import type { SpotifyStatus } from '@/services/system/media.generated'
import { useEffect, useId, useRef, useState } from 'react'
import { SpotifySettings } from './spotify-settings'
const SPOTIFY_CALLBACK = 'http://127.0.0.1:43821/spotify/callback'
const SPOTIFY_DASHBOARD = 'https://developer.spotify.com/dashboard/create'
export function SpotifySettingsController() {
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
    <SpotifySettings
      inputId={inputId}
      inputRef={inputRef}
      clientId={clientId}
      status={status}
      error={error}
      pending={pending}
      copied={copied}
      native={native}
      onClientIdChange={setClientId}
      onOpenDashboard={openDashboard}
      onCopyCallback={copyCallback}
      onPasteClientId={pasteClientId}
      onConnectionChange={change}
    />
  )
}
