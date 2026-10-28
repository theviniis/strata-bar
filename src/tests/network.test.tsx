import { NetworkGraph } from '@/features/network/src/network-graph'
import { NetworkSpeedTest } from '@/features/network/src/network-speed-test'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { networkFixture } from '@/features/network/src/fixtures'
import { NetworkPopup } from '@/features/network/popup/network.popup'
import { NetworkWidget } from '@/features/network/widget/network.widget'
import {
  formatRate,
  graphMaximum,
  networkSeries
} from '@/features/network/src/presentation'
import { parseNetworkEvent } from '@/services/system/network'
import { WidgetInspector } from '@/settings/widget-inspector'
import { editMonitorDraft } from '@/settings/monitor-layout'
import {
  configSchema,
  defaultConfig,
  widgetSchema
} from '@/services/configuration/config'

const data = networkFixture(1_800_000_000_000)
describe('network contract and presentation', () => {
  it('validates real shapes, history order, quantities and test budget', () => {
    expect(parseNetworkEvent({ status: 'ready', data }).status).toBe('ready')
    for (const patch of [
      { download: -1 },
      { upload: Infinity },
      { history: [...data.history].reverse() },
      { speedTest: { ...data.speedTest, transferredBytes: 500_000_001 } },
      { speedTest: { ...data.speedTest, stageProgress: 1.1 } },
      { quality: { ...data.quality, lost: 61 } }
    ]) {
      expect(
        parseNetworkEvent({ status: 'ready', data: { ...data, ...patch } })
          .status
      ).toBe('error')
    }
    expect(parseNetworkEvent({ status: 'error', error: 'offline' })).toEqual({
      status: 'error',
      error: 'offline'
    })
  })
  it('discards saved interface overrides so monitoring stays automatic', () => {
    const config = configSchema.parse({
      ...defaultConfig,
      network: { interfaceId: 'old-pinned-adapter' }
    })
    expect(config.network).toEqual({
      unit: 'bytes',
      probesEnabled: true,
      probeTarget: '1.1.1.1'
    })
    expect(config.network).not.toHaveProperty('interfaceId')
  })
  it('formats decimal bytes and bits without turning missing values into zero', () => {
    expect(formatRate(12_400_000)).toBe('12,4 MB/s')
    expect(formatRate(1_000_000, 'bits')).toBe('8 Mbps')
    expect(formatRate(0)).toBe('0 B/s')
    expect(formatRate(null)).toBe('—')
  })
  it('uses a shared scale and breaks both lines during silence', () => {
    const points = [
      { timestamp: 1000, download: 100, upload: 200 },
      { timestamp: 7000, download: 400, upload: 30 }
    ]
    expect(graphMaximum(points)).toBe(400)
    expect(networkSeries(points)).toEqual([
      points[0],
      { timestamp: 1001, download: null, upload: null },
      points[1]
    ])
  })
  it('defaults configuration and rejects nonliteral probe targets', () => {
    expect(
      configSchema.parse({ ...defaultConfig, network: {} }).network
    ).toEqual({
      unit: 'bytes',
      probesEnabled: true,
      probeTarget: '1.1.1.1'
    })
    expect(
      configSchema.safeParse({
        ...defaultConfig,
        network: { probeTarget: 'example.com' }
      }).success
    ).toBe(false)
    expect(
      configSchema.safeParse({
        ...defaultConfig,
        network: { probeTarget: '2606:4700:4700::1111' }
      }).success
    ).toBe(true)
  })
})
it('renders both live directions and hides stale readings', () => {
  const view = render(
    <NetworkWidget event={{ status: 'ready', data }} now={data.sampledAt} />
  )
  expect(screen.getByLabelText('Download')).toHaveTextContent('99,2')
  expect(screen.getByLabelText('Upload')).toHaveTextContent('9,6')
  expect(screen.getAllByText('Mbps')).toHaveLength(2)
  view.rerender(
    <NetworkWidget
      event={{ status: 'ready', data }}
      now={data.sampledAt + 7000}
    />
  )
  expect(screen.getByLabelText('Download')).toHaveTextContent('—')
  expect(screen.getByLabelText('Upload')).toHaveTextContent('—')
})
it('shows diagnostics, the shared chart and manual test controls', () => {
  const start = vi.fn()
  render(
    <NetworkPopup
      event={{ status: 'ready', data }}
      now={data.sampledAt}
      onStart={start}
      onCancel={vi.fn()}
    />
  )
  expect(
    screen.getByRole('group', {
      name: 'Download e upload no mesmo gráfico, últimos 2 minutos'
    })
  ).toBeInTheDocument()
  const graph = screen.getByRole('group', {
    name: 'Download e upload no mesmo gráfico, últimos 2 minutos'
  })
  const curves = graph.querySelectorAll('.recharts-line-curve')
  expect(curves).toHaveLength(2)
  expect(curves[0].getAttribute('stroke')).not.toBe(
    curves[1].getAttribute('stroke')
  )
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(
    within(screen.getByLabelText('Qualidade da conexão')).getByText('Ping')
  ).toBeInTheDocument()
  expect(screen.getByText('Perda ICMP')).toBeInTheDocument()
  const toggle = screen.getByRole('tab', {
    name: 'Teste de velocidade'
  })
  expect(toggle).toHaveAttribute('aria-selected', 'false')
  expect(
    screen.queryByRole('button', { name: 'Testar velocidade' })
  ).not.toBeInTheDocument()
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Testar velocidade' }))
  expect(start).toHaveBeenCalledOnce()
  expect(screen.getByText(/até 30 s ou 500 MB/)).toBeInTheDocument()
})

it('switches tabs without cancelling the test and restores its running controls', () => {
  const cancel = vi.fn()
  render(
    <NetworkPopup
      event={{
        status: 'ready',
        data: {
          ...data,
          speedTest: { ...data.speedTest, phase: 'download', elapsedMs: 2000 }
        }
      }}
      now={data.sampledAt}
      onStart={vi.fn()}
      onCancel={cancel}
    />
  )
  const toggle = screen.getByRole('tab', {
    name: 'Teste de velocidade'
  })
  fireEvent.click(toggle)
  expect(
    screen.getByRole('button', { name: 'Cancelar teste' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('progressbar', { name: 'Progresso de download' })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Resumo' }))
  expect(toggle).toHaveAttribute('aria-selected', 'false')
  expect(
    screen.queryByRole('button', { name: 'Cancelar teste' })
  ).not.toBeInTheDocument()
  expect(cancel).not.toHaveBeenCalled()
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar teste' }))
  expect(cancel).toHaveBeenCalledOnce()
})

it.each(['both', 'download', 'upload'] as const)(
  'shows only configured directions: %s',
  (direction) => {
    render(
      <NetworkWidget
        event={{ status: 'ready', data }}
        now={data.sampledAt}
        direction={direction}
      />
    )
    expect(Boolean(screen.queryByLabelText('Download'))).toBe(
      direction !== 'upload'
    )
    expect(Boolean(screen.queryByLabelText('Upload'))).toBe(
      direction !== 'download'
    )
  }
)
it('keeps the readings and hides unit labels in compact format', () => {
  const view = render(
    <NetworkWidget
      event={{ status: 'ready', data }}
      now={data.sampledAt}
      format="compact"
    />
  )
  expect(screen.getByLabelText('Download')).toHaveTextContent('99,2')
  expect(screen.getByLabelText('Upload')).toHaveTextContent('9,6')
  expect(screen.queryByText('Mbps')).not.toBeInTheDocument()
  view.rerender(
    <NetworkWidget
      event={{ status: 'ready', data }}
      now={data.sampledAt}
      format="label"
    />
  )
  expect(screen.getAllByText('Mbps')).toHaveLength(2)
})
it('offers direction and format controls in the widget inspector', () => {
  const onChange = vi.fn()
  render(
    <WidgetInspector
      widget={widgetSchema.parse({ id: 'network', type: 'network' })}
      onChange={onChange}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  expect(onChange).toHaveBeenLastCalledWith({ networkDirection: 'upload' })
  fireEvent.click(screen.getByRole('button', { name: 'Compacto' }))
  expect(onChange).toHaveBeenLastCalledWith({ format: 'compact' })
})
it('persists monitor-specific direction and format without changing other monitors', () => {
  const document = configSchema.parse({
    ...defaultConfig,
    widgets: {
      left: [{ id: 'net', type: 'network', networkDirection: 'both' }],
      center: [],
      right: []
    }
  })
  const changed = editMonitorDraft(document, 'DISPLAY1').updateWidget('net', {
    networkDirection: 'upload',
    format: 'compact'
  })
  const saved = configSchema.parse(JSON.parse(JSON.stringify(changed)))
  expect(
    editMonitorDraft(saved, 'DISPLAY1').view.widgets.left[0]
  ).toMatchObject({ networkDirection: 'upload', format: 'compact' })
  expect(
    editMonitorDraft(saved, 'DISPLAY2').view.widgets.left[0]
  ).toMatchObject({ networkDirection: 'both', format: 'label' })
  expect(
    widgetSchema.safeParse({
      id: 'net',
      type: 'network',
      networkDirection: 'neither'
    }).success
  ).toBe(false)
})

it('preserves Mbps and missing results when speed tests use NetworkRate', () => {
  render(
    <NetworkSpeedTest
      test={{
        ...data.speedTest,
        phase: 'complete',
        downloadMbps: 80,
        uploadMbps: null
      }}
      busy={false}
      onStart={vi.fn()}
      onCancel={vi.fn()}
    />
  )
  expect(screen.getByLabelText('Download')).toHaveTextContent('80,00 Mbps')
  expect(screen.getByLabelText('Upload')).toHaveTextContent('—')
})

it('keeps the traffic legend outside the plot so it cannot cover time ticks', () => {
  render(<NetworkGraph points={data.history} now={data.sampledAt} />)
  const legend = screen.getByText('Download', { exact: true })
  expect(legend.closest('.recharts-wrapper')).toBeNull()
})

it('follows the measured test stage without inventing pending results', () => {
  const base = {
    busy: false,
    onStart: vi.fn(),
    onCancel: vi.fn(),
    quality: data.quality
  }
  const view = render(
    <NetworkSpeedTest
      {...base}
      test={{ ...data.speedTest, phase: 'download', downloadMbps: 80 }}
    />
  )
  expect(
    screen.getByRole('meter', { name: 'Velocidade de download' })
  ).toHaveAttribute('aria-valuenow', '80')
  expect(screen.getByLabelText('Upload')).toHaveTextContent('—')
  expect(
    within(screen.getByLabelText('Qualidade ICMP atual')).getByText('Ping')
      .nextElementSibling
  ).toHaveTextContent('12 ms')
  view.rerender(
    <NetworkSpeedTest
      {...base}
      test={{
        ...data.speedTest,
        phase: 'upload',
        downloadMbps: 80,
        uploadMbps: 20
      }}
    />
  )
  expect(
    screen.getByRole('meter', { name: 'Velocidade de upload' })
  ).toHaveAttribute('aria-valuenow', '20')
  expect(screen.getByLabelText('Download')).toHaveTextContent('80,00 Mbps')
  view.rerender(
    <NetworkSpeedTest
      {...base}
      test={{ ...data.speedTest, phase: 'error', error: 'Falha de conexão' }}
    />
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Falha de conexão')
  fireEvent.click(screen.getByRole('button', { name: 'Testar velocidade' }))
  expect(base.onStart).toHaveBeenCalledOnce()
})
it('keeps the gauge scale above measured gigabit speeds', () => {
  render(
    <NetworkSpeedTest
      test={{ ...data.speedTest, phase: 'download', downloadMbps: 2400 }}
      busy={false}
      onStart={vi.fn()}
      onCancel={vi.fn()}
    />
  )
  const meter = screen.getByRole('meter', { name: 'Velocidade de download' })
  expect(meter).toHaveAttribute('aria-valuenow', '2400')
  expect(Number(meter.getAttribute('aria-valuemax'))).toBeGreaterThanOrEqual(
    2400
  )
})

it('places progress below the gauge and replaces it with a compact completed result', async () => {
  const callbacks = {
    busy: false,
    onStart: vi.fn(),
    onCancel: vi.fn(),
    quality: data.quality
  }
  const view = render(
    <NetworkSpeedTest
      {...callbacks}
      test={{
        ...data.speedTest,
        phase: 'download',
        downloadMbps: 94.24,
        elapsedMs: 5000,
        stageProgress: 0.4
      }}
    />
  )
  const gauge = screen.getByRole('meter')
  const progress = screen.getByRole('progressbar', {
    name: 'Progresso de download'
  })
  expect(
    gauge.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(progress).toHaveAttribute('aria-valuenow', '40')
  expect(progress.firstElementChild).toHaveStyle({
    transform: 'translateX(-60%)'
  })
  expect(
    screen.queryByRole('progressbar', { name: 'Progresso de upload' })
  ).not.toBeInTheDocument()
  view.rerender(
    <NetworkSpeedTest
      {...callbacks}
      test={{
        ...data.speedTest,
        phase: 'upload',
        elapsedMs: 10000,
        transferredBytes: 100000000,
        stageProgress: 0.1
      }}
    />
  )
  expect(
    screen.queryByRole('progressbar', { name: 'Progresso de download' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('progressbar', { name: 'Progresso de upload' })
  ).toHaveAttribute('aria-valuenow', '10')
  view.rerender(
    <NetworkSpeedTest
      {...callbacks}
      test={{
        ...data.speedTest,
        phase: 'upload',
        elapsedMs: 17500,
        transferredBytes: 125000000,
        stageProgress: 0.5
      }}
    />
  )
  expect(
    screen.getByRole('progressbar', { name: 'Progresso de upload' })
  ).toHaveAttribute('aria-valuenow', '50')
  expect(
    screen.getByRole('progressbar', { name: 'Progresso de upload' })
      .firstElementChild
  ).toHaveStyle({ transform: 'translateX(-50%)' })
  view.rerender(
    <NetworkSpeedTest
      {...callbacks}
      test={{
        ...data.speedTest,
        phase: 'complete',
        downloadMbps: 94.24,
        uploadMbps: 94.05,
        elapsedMs: 23000
      }}
    />
  )
  await waitFor(() =>
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  )
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Download')).toHaveTextContent('94,24 Mbps')
  expect(screen.getByLabelText('Upload')).toHaveTextContent('94,05 Mbps')
  expect(
    screen.getByRole('button', { name: 'Testar velocidade' })
  ).toBeInTheDocument()
})

it('uses host stage progress when opening midway through upload', () => {
  const snapshot = {
    ...data.speedTest,
    phase: 'upload' as const,
    elapsedMs: 22000,
    transferredBytes: 300000000,
    stageProgress: 0.65
  }
  render(
    <NetworkSpeedTest
      test={snapshot}
      busy={false}
      onStart={vi.fn()}
      onCancel={vi.fn()}
    />
  )
  expect(screen.getAllByRole('progressbar')).toHaveLength(1)
  expect(
    screen.getByRole('progressbar', { name: 'Progresso de upload' })
  ).toHaveAttribute('aria-valuenow', '65')
})

it.each([
  [0, '0,00 Kbps'],
  [0.512, '512,00 Kbps'],
  [1, '1,00 Mbps'],
  [80, '80,00 Mbps']
])(
  'automatically scales speed-test units for %s Mbps',
  (downloadMbps, expected) => {
    render(
      <NetworkSpeedTest
        test={{ ...data.speedTest, phase: 'complete', downloadMbps }}
        busy={false}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const reading = screen.getByLabelText('Download')
    expect(reading).toHaveTextContent(expected)
    expect(reading).toHaveAttribute('aria-description', expected)
    expect(reading.parentElement).toHaveTextContent(expected.split(' ')[1])
  }
)

it('automatically scales each bar direction between Kbps and Mbps', () => {
  const view = render(
    <NetworkWidget
      event={{
        status: 'ready',
        data: { ...data, download: 64_000, upload: 125_000 }
      }}
      now={data.sampledAt}
    />
  )
  expect(screen.getByLabelText('Download')).toHaveTextContent('512 Kbps')
  expect(screen.getByLabelText('Upload')).toHaveTextContent('1 Mbps')
  view.rerender(
    <NetworkWidget
      event={{
        status: 'ready',
        data: { ...data, download: 125_000, upload: 64_000 }
      }}
      now={data.sampledAt}
    />
  )
  expect(screen.getByLabelText('Download')).toHaveTextContent('1 Mbps')
  expect(screen.getByLabelText('Upload')).toHaveTextContent('512 Kbps')
})
