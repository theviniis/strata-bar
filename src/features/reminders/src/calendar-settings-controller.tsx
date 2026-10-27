import { calendar } from '@/services/system/calendar'
import { useId, useState } from 'react'
import { CalendarSettings } from './calendar-settings'
import { useCalendarStatus } from './use-calendar-status'

export function CalendarSettingsController() {
  const id = useId()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const native = Boolean(window.__TAURI_INTERNALS__)
  const {
    data: status,
    error: statusError,
    refetch
  } = useCalendarStatus(native)
  async function change(connect: boolean) {
    setPending(true)
    setError('')
    try {
      if (connect) await calendar.connect(clientId.trim(), clientSecret.trim())
      else await calendar.disconnect()
      await refetch()
      setClientSecret('')
    } catch (e) {
      setError(String(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <CalendarSettings
      id={id}
      clientId={clientId}
      clientSecret={clientSecret}
      pending={pending}
      error={error || (statusError ? String(statusError) : status?.error) || ''}
      native={native}
      status={status}
      onClientIdChange={setClientId}
      onClientSecretChange={setClientSecret}
      onConnect={() => void change(true)}
      onDisconnect={() => void change(false)}
    />
  )
}
