import { Cpu } from '@/features/cpu/widget/cpu.widget'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { CpuPopup } from '@/features/cpu/popup/cpu.popup'
import type { CpuData } from '@/services/system/cpu.generated'

const at = 100000
function observation(): CpuData {
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: at,
    error: null
  })
  return {
    sequence: 1,
    sampledAt: at,
    percent: metric(25.5),
    frequencyHz: metric(3_985_000_000),
    maxFrequencyHz: metric(2_904_000_000),
    physicalCores: metric(6),
    logicalProcessors: metric(12),
    temperatureCelsius: metric(42.5),
    temperatureSensor: {
      provider: 'libreHardwareMonitor',
      hardwareId: '/hardware/0',
      sensorId: '/hardware/0/temperature/0',
      name: 'CPU temperature'
    },
    history: [
      {
        sequence: 1,
        timestamp: at,
        percent: 25.5,
        temperatureCelsius: 42.5,
        temperatureUpdatedAt: at
      }
    ]
  }
}
it('shows independent CPU indicators and both observed graphs', () => {
  render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data: observation() }}
      now={at}
    />
  )
  expect(screen.getByText('25.5')).toBeVisible()
  expect(screen.getByText('3.98 GHz')).toBeVisible()
  expect(screen.getByText('2.90 GHz')).toBeVisible()
  expect(screen.getByText('6 / 12')).toBeVisible()
  expect(screen.getByText('42.5')).toBeVisible()
  expect(screen.getAllByRole('group')).toHaveLength(2)
  expect(screen.getByRole('group', { name: /Utilização da CPU/ })).toBeVisible()
  expect(
    screen.getByRole('group', { name: /Temperatura do pacote da CPU/ })
  ).toBeVisible()
})
it('keeps other readings usable when thermal sensors are unavailable', () => {
  const data = observation()
  data.temperatureCelsius = {
    status: 'unavailable',
    value: null,
    updatedAt: null,
    error: 'Sensor not exposed by LHM'
  }
  data.temperatureSensor = null
  data.history[0].temperatureCelsius = null
  data.history[0].temperatureUpdatedAt = null
  render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={at}
    />
  )
  expect(screen.getByText('3.98 GHz')).toBeVisible()
  expect(screen.getByText('Indisponível')).toBeVisible()
  expect(screen.getByText(/Sensor de temperatura indispon�vel/)).toBeVisible()
  // The unavailable sensor reads as a gap, never as an invented point.
  expect(screen.getByText(/1 leitura indisponível/)).toBeVisible()
})
it('shows loading without zeros and preserves stale readings after transport failure', () => {
  const view = render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'loading' }}
      now={at}
    />
  )
  expect(screen.getByRole('status')).toHaveTextContent('Carregando CPU')
  expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
  view.rerender(
    <CpuPopup
      demo={false}
      event={{ status: 'error', error: 'IPC offline' }}
      lastData={observation()}
      now={at + 8000}
    />
  )
  expect(screen.getByText('25.5 · desatualizada')).toBeVisible()
  expect(screen.getByText('42.5 · desatualizada')).toBeVisible()
})
it('keeps temperature above 100 visible and excludes expired graph observations', () => {
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
      percent: 25.5,
      temperatureCelsius: 121,
      temperatureUpdatedAt: at
    }
  ]
  render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={at}
    />
  )
  // The scale is taken from the observed window only: the expired 180 °C
  // sample can neither raise the maximum nor reach the line.
  expect(screen.getByRole('group', { name: /Temperatura.*130/ })).toBeVisible()
  expect(screen.getByText('130 °C')).toBeVisible()
})
it('scales the temperature graph from its own window, not from the clock', () => {
  const data = observation()
  data.history = [
    {
      sequence: 1,
      timestamp: at,
      percent: 20,
      temperatureCelsius: 121,
      temperatureUpdatedAt: at
    },
    {
      sequence: 2,
      timestamp: at + 900,
      percent: 30,
      temperatureCelsius: 180,
      temperatureUpdatedAt: at + 900
    }
  ]
  render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={at}
    />
  )
  // The newest reading landed after the clock's last tick. It is still the
  // newest observation, so it ends the drawn window and sets the scale; a
  // clock-filtered window would drop it for the rest of the second.
  expect(screen.getByRole('group', { name: /Temperatura.*180/ })).toBeVisible()
  expect(screen.getByText('180 °C')).toBeVisible()
})

it('exposes the temperature sensor error on the big number', () => {
  const data = observation()
  data.temperatureCelsius = {
    status: 'unavailable',
    value: null,
    updatedAt: null,
    error: 'Thermal sensor offline'
  }
  render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={at}
    />
  )
  expect(screen.getByText('Thermal sensor offline')).toBeVisible()
  expect(screen.getByText('Indisponível')).toBeVisible()
})

it('makes widget temperature optional and marks stale thermal readings independently', () => {
  const data = observation()
  const props = {
    event: { status: 'ready' as const, data },
    lastData: undefined,
    now: at,
    format: 'compact' as const,
    describedBy: undefined
  }
  const { rerender } = render(<Cpu {...props} />)
  expect(screen.queryByLabelText('Temperatura da CPU')).not.toBeInTheDocument()
  rerender(<Cpu {...props} showUsage={false} showTemperature />)
  expect(screen.queryByLabelText('Uso da CPU')).not.toBeInTheDocument()
  rerender(<Cpu {...props} showTemperature />)
  expect(screen.getByLabelText('Temperatura da CPU')).toHaveTextContent(
    `${data.temperatureCelsius.value?.toFixed(1)} °C`
  )
  data.temperatureCelsius.updatedAt = at - 7000
  rerender(<Cpu {...props} showTemperature />)
  expect(screen.getByLabelText('Temperatura da CPU')).toHaveTextContent('*')
  expect(screen.getByLabelText('Uso da CPU')).not.toHaveTextContent('*')
  data.temperatureCelsius = {
    status: 'unavailable',
    value: null,
    updatedAt: null,
    error: null
  }
  rerender(<Cpu {...props} showTemperature />)
  expect(screen.getByLabelText('Temperatura da CPU')).toHaveTextContent('—')
})
