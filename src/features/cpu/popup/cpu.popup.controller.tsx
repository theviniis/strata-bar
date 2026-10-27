import { useResourceChannel } from '@/hooks/useResourceChannel'
import { usePopupContext } from '@/popups/context'
import { cpuFixture } from '../src/fixtures'
import { useState } from 'react'
import { CpuPopup } from './cpu.popup'

export function CpuPopupController() {
  const { mode } = usePopupContext('cpu')
  return mode === 'native' ? <NativeCpuPopup /> : <DemoCpuPopup />
}

function NativeCpuPopup() {
  const reading = useResourceChannel('cpu')
  return <CpuPopup {...reading} lastData={reading.lastData} demo={false} />
}

function DemoCpuPopup() {
  const [at] = useState(Date.now)
  const data = cpuFixture(at)
  return (
    <CpuPopup
      event={{ status: 'ready', data }}
      lastData={undefined}
      now={at}
      demo
    />
  )
}
