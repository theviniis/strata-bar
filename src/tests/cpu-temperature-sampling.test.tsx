import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { CpuPopup } from '@/features/cpu/popup/cpu.popup'
import type { CpuData } from '@/services/system/cpu.generated'

function observation(): CpuData {
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: 100000,
    error: null
  })
  return {
    sequence: 3,
    sampledAt: 104000,
    percent: metric(25),
    frequencyHz: metric(4e9),
    maxFrequencyHz: metric(2.9e9),
    physicalCores: metric(6),
    logicalProcessors: metric(12),
    temperatureCelsius: metric(42),
    temperatureSensor: {
      provider: 'libreHardwareMonitor',
      hardwareId: '/hardware/0',
      sensorId: '/hardware/0/temperature/0',
      name: 'CPU temperature'
    },
    history: [
      {
        sequence: 1,
        timestamp: 100000,
        percent: 25,
        temperatureCelsius: 42,
        temperatureUpdatedAt: 100000
      },
      {
        sequence: 2,
        timestamp: 102000,
        percent: 25,
        temperatureCelsius: null,
        temperatureUpdatedAt: 100000
      },
      {
        sequence: 3,
        timestamp: 104000,
        percent: 25,
        temperatureCelsius: 43,
        temperatureUpdatedAt: 104000
      }
    ]
  }
}
it('does not label a still-valid repeated temperature as a failed reading', () => {
  render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data: observation() }}
      now={104000}
    />
  )
  expect(screen.queryByText(/leitura.*indisponíve/)).not.toBeInTheDocument()
  expect(screen.getByText('42.0 °C')).toBeVisible()
})
it('continues to identify actual source failures while ignoring unchanged readings', () => {
  const data = observation()
  data.sequence = 4
  data.sampledAt = 106000
  data.history.push({
    sequence: 4,
    timestamp: 106000,
    percent: 25,
    temperatureCelsius: null,
    temperatureUpdatedAt: null
  })
  render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={106000}
    />
  )
  expect(screen.getByText(/1 leitura indisponível/)).toBeVisible()
  expect(screen.queryByText(/2 leituras indisponíveis/)).not.toBeInTheDocument()
})
it('connects real observations across a fresh repeat but breaks at a real failure', () => {
  const data = observation()
  const view = render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={104000}
    />
  )
  const hasConnectedTemperatureSegment = () => {
    const chart = screen.getByLabelText(
      /Temperatura do pacote da CPU nos últimos/
    )
    // Inspect the rendered SVG geometry: grid lines use H, whereas a plotted
    // linear segment between observations uses L in either supported renderer.
    return Array.from(chart.querySelectorAll('path[fill="none"]')).some(
      (path) => /[Ll]/.test(path.getAttribute('d') ?? '')
    )
  }
  expect(hasConnectedTemperatureSegment()).toBe(true)
  data.history[1].temperatureUpdatedAt = null
  view.rerender(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={104000}
    />
  )
  expect(hasConnectedTemperatureSegment()).toBe(false)
})
it('includes temperatures from ninety seconds ago and expires readings older than two minutes', () => {
  const data = observation()
  data.history.unshift({
    sequence: 0,
    timestamp: 14000,
    percent: 25,
    temperatureCelsius: 125,
    temperatureUpdatedAt: 14000
  })
  const view = render(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={104000}
    />
  )
  expect(screen.getByText('130 °C')).toBeVisible()
  expect(screen.getByText('Temperatura · 2 minutos')).toBeVisible()
  data.history[0].timestamp = -18000
  data.history[0].temperatureUpdatedAt = -18000
  view.rerender(
    <CpuPopup
      lastData={undefined}
      demo={false}
      event={{ status: 'ready', data }}
      now={104000}
    />
  )
  expect(screen.getByText('100 °C')).toBeVisible()
  expect(screen.queryByText('130 °C')).not.toBeInTheDocument()
})
