import { useResourceChannel } from '@/hooks/useResourceChannel'
import { usePopupContext } from '@/popups/context'
import { gpuFixture } from '../src/fixtures'
import { useState } from 'react'
import { GpuPopup } from './gpu.popup'

export function GpuPopupController() {
  const { mode } = usePopupContext('gpu')
  return mode === 'native' ? <NativeGpuPopup /> : <DemoGpuPopup />
}

function NativeGpuPopup() {
  const reading = useResourceChannel('gpu')
  return <GpuPopup {...reading} lastData={reading.lastData} demo={false} />
}

function DemoGpuPopup() {
  const [at] = useState(Date.now)
  const data = gpuFixture(at)
  return (
    <GpuPopup
      event={{ status: 'ready', data }}
      lastData={undefined}
      now={at}
      demo
    />
  )
}
