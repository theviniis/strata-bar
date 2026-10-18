import { render, screen, fireEvent } from '@testing-library/react'
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
it('shows independent CPU indicators and both inspectable observed graphs', () => {
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
  expect(screen.getAllByRole('img')).toHaveLength(2)
  fireEvent.focus(screen.getByRole('button', { name: /42.5 °C/ }))
  expect(screen.getByRole('status')).toHaveTextContent('42.5 °C')
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
  expect(screen.queryByRole('button', { name: /°C/ })).not.toBeInTheDocument()
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
      timestamp: at - 62000,
      percent: 90,
      temperatureCelsius: 180,
      temperatureUpdatedAt: at - 62000
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
  expect(screen.getByRole('img', { name: /Temperatura.*130/ })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /180.0 °C/ })
  ).not.toBeInTheDocument()
  fireEvent.focus(screen.getByRole('button', { name: /121.0 °C/ }))
  expect(screen.getByRole('status')).toHaveTextContent('121.0 °C')
})
