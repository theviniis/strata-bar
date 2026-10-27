import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { GpuPopup } from '@/features/gpu/gpu.popup'
import type { GpuData } from '@/services/system/gpu.generated'

const at = 100000
function observation(): GpuData {
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: at,
    error: null
  })
  return {
    sequence: 1,
    sampledAt: at,
    adapter: {
      name: 'GeForce RTX 3060 Ti',
      vendorId: 4318,
      deviceId: 9353,
      dedicatedBytes: 8589934592
    },
    percent: metric(27.3),
    memoryUsedBytes: metric(1610612736),
    memoryTotalBytes: metric(8589934592),
    sharedUsedBytes: metric(337641472),
    sharedTotalBytes: metric(17179869184),
    temperatureCelsius: metric(51),
    powerWatts: metric(20.6),
    fanPercent: metric(0),
    temperatureSensor: {
      provider: 'libreHardwareMonitor',
      hardwareId: '/hardware/0',
      sensorId: '/hardware/0/temperature/0',
      name: 'GeForce RTX 3060 Ti'
    },
    history: [
      {
        sequence: 1,
        timestamp: at,
        percent: 27.3,
        temperatureCelsius: 51,
        temperatureUpdatedAt: at
      }
    ]
  }
}
it('shows independent GPU indicators and both observed graphs', () => {
  const { container } = render(
    <GpuPopup
      demo={false}
      lastData={undefined}
      event={{ status: 'ready', data: observation() }}
      now={at}
    />
  )
  expect(screen.getByText('27.3%')).toBeVisible()
  expect(screen.getByText('1.5 GiB / 8.0 GiB')).toBeVisible()
  expect(screen.getByText('51.0 °C')).toBeVisible()
  expect(screen.getByText('20.6 W')).toBeVisible()
  // A stopped fan is a reading: zero, never "Indisponível".
  expect(screen.getByText('0.0%')).toBeVisible()
  expect(screen.getByText('322.0 MiB / 16.0 GiB')).toBeVisible()
  expect(container.querySelectorAll('dd')).toHaveLength(6)
  expect(screen.getAllByRole('group')).toHaveLength(2)
  expect(screen.getByRole('group', { name: /Utilização da GPU/ })).toBeVisible()
  expect(
    screen.getByRole('group', { name: /Temperatura da GPU/ })
  ).toBeVisible()
})
it('keeps other readings usable when thermal sensors are unavailable', () => {
  const data = observation()
  const unavailable = (error: string) => ({
    status: 'unavailable' as const,
    value: null,
    updatedAt: null,
    error
  })
  data.temperatureCelsius = unavailable('Sensor not exposed by LHM')
  data.powerWatts = unavailable('Sensor not exposed by LHM')
  data.fanPercent = unavailable('Sensor not exposed by LHM')
  data.temperatureSensor = null
  data.history[0].temperatureCelsius = null
  data.history[0].temperatureUpdatedAt = null
  render(
    <GpuPopup
      demo={false}
      lastData={undefined}
      event={{ status: 'ready', data }}
      now={at}
    />
  )
  expect(screen.getByText('27.3%')).toBeVisible()
  expect(screen.getByText('1.5 GiB / 8.0 GiB')).toBeVisible()
  expect(screen.getByText('322.0 MiB / 16.0 GiB')).toBeVisible()
  expect(screen.getAllByText('Indisponível')).toHaveLength(3)
  expect(
    screen.getByText(
      /Sensores de temperatura, consumo e ventoinha indispon�veis/
    )
  ).toBeVisible()
  // The unavailable sensor reads as a gap, never as an invented point.
  expect(screen.getByText(/1 leitura indisponível/)).toBeVisible()
})
it('shows loading without zeros and preserves stale readings after transport failure', () => {
  const view = render(
    <GpuPopup
      demo={false}
      lastData={undefined}
      event={{ status: 'loading' }}
      now={at}
    />
  )
  expect(screen.getByRole('status')).toHaveTextContent('Carregando GPU')
  expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
  view.rerender(
    <GpuPopup
      demo={false}
      event={{ status: 'error', error: 'IPC offline' }}
      lastData={observation()}
      now={at + 8000}
    />
  )
  expect(screen.getByText('27.3% · desatualizada')).toBeVisible()
  expect(screen.getByText('51.0 °C · desatualizada')).toBeVisible()
  // The used/limit pair reads as one value, so the marker appears once.
  expect(screen.getByText('1.5 GiB / 8.0 GiB · desatualizada')).toBeVisible()
})
it('excludes expired observations from the temperature scale', () => {
  const data = observation()
  data.history = [
    {
      sequence: 0,
      timestamp: at - 122000,
      percent: 90,
      temperatureCelsius: 180,
      temperatureUpdatedAt: at - 122000
    },
    {
      sequence: 1,
      timestamp: at,
      percent: 27.3,
      temperatureCelsius: 121,
      temperatureUpdatedAt: at
    }
  ]
  render(
    <GpuPopup
      demo={false}
      lastData={undefined}
      event={{ status: 'ready', data }}
      now={at}
    />
  )
  // The scale comes from the observed window only: the expired 180 °C sample
  // can neither raise the maximum nor reach the line.
  expect(screen.getByRole('group', { name: /Temperatura.*130/ })).toBeVisible()
  expect(screen.getByText('130 °C')).toBeVisible()
})
