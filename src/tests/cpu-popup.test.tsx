import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { CpuPopupContent } from '@/features/cpu/CpuPopup'
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
      provider: 'msiAfterburner',
      sourceId: 128,
      instance: 4294967295,
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
    <CpuPopupContent
      event={{ status: 'ready', data: observation() }}
      now={at}
    />
  )
  expect(screen.getByText('25.5%')).toBeVisible()
  expect(screen.getByText('3.98 GHz')).toBeVisible()
  expect(screen.getByText('2.90 GHz')).toBeVisible()
  expect(screen.getByText('6 / 12')).toBeVisible()
  expect(screen.getByText('42.5 °C')).toBeVisible()
  expect(screen.getAllByRole('group')).toHaveLength(2)
  expect(screen.getByRole('group', { name: /Utilização da CPU/ })).toBeVisible()
  expect(
    screen.getByRole('group', { name: /Temperatura do pacote da CPU/ })
  ).toBeVisible()
})
it('keeps Windows readings usable when Afterburner is unavailable', () => {
  const data = observation()
  data.temperatureCelsius = {
    status: 'unavailable',
    value: null,
    updatedAt: null,
    error: 'Afterburner not running'
  }
  data.temperatureSensor = null
  data.history[0].temperatureCelsius = null
  data.history[0].temperatureUpdatedAt = null
  render(<CpuPopupContent event={{ status: 'ready', data }} now={at} />)
  expect(screen.getByText('3.98 GHz')).toBeVisible()
  expect(screen.getByText('Indisponível')).toBeVisible()
  expect(screen.getByText(/requer MSI Afterburner/)).toBeVisible()
  // The unavailable sensor reads as a gap, never as an invented point.
  expect(screen.getByText(/1 leitura indisponível/)).toBeVisible()
})
it('shows loading without zeros and preserves stale readings after transport failure', () => {
  const view = render(
    <CpuPopupContent event={{ status: 'loading' }} now={at} />
  )
  expect(screen.getByRole('status')).toHaveTextContent('Carregando CPU')
  expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
  view.rerender(
    <CpuPopupContent
      event={{ status: 'error', error: 'IPC offline' }}
      lastData={observation()}
      now={at + 8000}
    />
  )
  expect(screen.getByText('25.5% · desatualizada')).toBeVisible()
  expect(screen.getByText('42.5 °C · desatualizada')).toBeVisible()
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
  render(<CpuPopupContent event={{ status: 'ready', data }} now={at} />)
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
  render(<CpuPopupContent event={{ status: 'ready', data }} now={at} />)
  // The newest reading landed after the clock's last tick. It is still the
  // newest observation, so it ends the drawn window and sets the scale; a
  // clock-filtered window would drop it for the rest of the second.
  expect(screen.getByRole('group', { name: /Temperatura.*180/ })).toBeVisible()
  expect(screen.getByText('180 °C')).toBeVisible()
})
