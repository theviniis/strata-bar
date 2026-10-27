import { useResourceChannel } from '@/hooks/use-resource-channel'
import { usePopupContext } from '@/popups/context'
import { memoryFixture } from '../src/fixtures'
import { useState } from 'react'
import { MemoryPopup } from './memory.popup'

export function MemoryPopupController() {
  const { mode } = usePopupContext('memory')
  return mode === 'native' ? <NativeMemoryPopup /> : <DemoMemoryPopup />
}

function NativeMemoryPopup() {
  const reading = useResourceChannel('memory')
  return <MemoryPopup {...reading} lastData={reading.lastData} demo={false} />
}

function DemoMemoryPopup() {
  const [at] = useState(Date.now)
  const data = memoryFixture(at)
  return (
    <MemoryPopup
      event={{ status: 'ready', data }}
      lastData={undefined}
      now={at}
      demo
    />
  )
}
