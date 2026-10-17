import { useEffect, useState } from 'react'
import { bridge, connect } from '../services/system/bridge'
export function useSystemChannel(channel) {
  const [value, setValue] = useState({ status: 'loading', data: null })
  useEffect(
    () =>
      connect(bridge, channel, { intervalMs: 2000 }, setValue, (error) =>
        setValue({ status: 'error', data: null, error: String(error) })
      ),
    [channel]
  )
  return value
}
