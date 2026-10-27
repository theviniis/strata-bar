import { useState } from 'react'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { usePopupContext } from '@/popups/context'
import { DiskPopup } from './disk.popup'
import { diskFixture } from '../src/fixtures'

export function DiskPopupController() {
  const { mode } = usePopupContext('disk')
  return mode === 'native' ? <NativeDiskPopup /> : <DemoDiskPopup />
}

function NativeDiskPopup() {
  const reading = useResourceChannel('disk')
  return <DiskPopup {...reading} lastData={reading.lastData} demo={false} />
}

function DemoDiskPopup() {
  const [now] = useState(Date.now)
  return (
    <DiskPopup
      event={{ status: 'ready', data: diskFixture(now) }}
      lastData={undefined}
      now={now}
      demo
    />
  )
}
