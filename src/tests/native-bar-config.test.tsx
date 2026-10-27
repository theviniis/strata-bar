import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type {
  Channel,
  SubscribeOptions,
  SystemEvent
} from '../services/system/bridge'

const native = vi.hoisted(() => ({
  /** One `config` listener per window, keyed by the window that installed it. */
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  /** Channels each native subscription asked for, in order. */
  connects: [] as { channel: string; intervalMs?: number }[],
  disposes: [] as string[],
  loaded: vi.fn()
}))

const { setVolume, quit, workspacesAction, setChannelSource } = vi.hoisted(
  () => ({
    setChannelSource: vi.fn(async () => {}),
    setVolume: vi.fn(async () => ({ level: 64, muted: false })),
    quit: vi.fn(async () => {}),
    workspacesAction: vi.fn(async () => {})
  })
)

vi.mock('../services/system/bridge', () => ({
  bridge: {
    mode: 'native',
    setVolume,
    quit,
    workspacesAction,
    setChannelSource,
    configLoad: () => native.loaded()
  },
  connect: (
    _bridge: unknown,
    channel: Channel,
    options: SubscribeOptions,
    onValue: (event: SystemEvent<unknown>) => void
  ) => {
    native.connects.push({ channel, intervalMs: options.intervalMs })
    const metric = (value: number) => ({
      status: 'ready',
      value,
      updatedAt: Date.now(),
      error: null
    })
    const data: Partial<Record<Channel, unknown>> = {
      cpu: { percent: metric(23.4) },
      gpu: { percent: metric(27.3) },
      disk: { sequence: 1, sampledAt: Date.now(), volumes: [] },
      memory: {
        sequence: 1,
        sampledAt: Date.now(),
        history: [],
        percent: metric(56.25),
        usedBytes: metric(9663676416),
        totalBytes: metric(17179869184),
        availableBytes: metric(6442450944),
        cachedBytes: metric(4294967296),
        pagingFileBytes: metric(1073741824)
      },
      microphone: { level: 72, muted: false },
      volume: { level: 64, muted: false },
      media: demoMedia(),
      workspaces: {
        monitor: 0,
        floatOverride: false,
        workspaces: [
          {
            index: 0,
            name: null,
            status: 'active',
            layer: 'Tiling',
            windows: 1
          }
        ]
      }
    }
    onValue({ status: 'ready', data: data[channel] })
    return () => {
      native.disposes.push(channel)
    }
  }
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    label: 'bar-1',
    async listen(
      _event: string,
      listener: (event: { payload: unknown }) => void
    ) {
      native.listeners.set('bar-1', listener)
      return () => native.listeners.delete('bar-1')
    }
  })
}))

import NativeBar from '../components/status-bar/native-bar'
import {
  defaultConfig,
  parseConfig,
  type Config
} from '../services/configuration/config'
import { demoMedia } from '../services/system/media'
import { connectConfig, useConfig } from '../stores/config'

function install(config: Config, revision = 1) {
  useConfig.setState({ config: defaultConfig, error: null, revision: 0 })
  native.connects.length = 0
  useConfig.getState().hydrate({ revision, config, error: null })
}

beforeEach(() => {
  setChannelSource.mockClear()
  native.disposes.length = 0
  native.listeners.clear()
  native.loaded.mockReset()
  install(defaultConfig)
})

it('renders duplicate widgets from the same global route and sends both channels once', () => {
  const config = structuredClone(defaultConfig)
  config.audio.output = { source: 'voicemeeter', targetIndex: 1 }
  config.widgets = {
    left: [
      {
        ...config.widgets.right.find((w) => w.type === 'volume')!,
        id: 'speakers'
      }
    ],
    center: [],
    right: [
      {
        ...config.widgets.right.find((w) => w.type === 'volume')!,
        id: 'headphones'
      }
    ]
  }
  install(config)
  render(<NativeBar />)
  expect(screen.getAllByText('Voicemeeter: Bus 1')).toHaveLength(2)
  expect(setChannelSource.mock.calls).toEqual([
    ['volume', { kind: 'bus', index: 1 }],
    ['microphone', null]
  ])
})

it('renders exactly the configured widgets, in the configured sections', () => {
  install(
    parseConfig(
      JSON.stringify({
        version: 1,
        bar: {},
        widgets: {
          left: [{ id: 'clock', type: 'clock' }],
          center: [{ id: 'cpu', type: 'cpu' }],
          right: [{ id: 'volume', type: 'volume' }]
        }
      })
    )
  )
  render(<NativeBar />)
  const left = screen
    .getByRole('navigation')
    .querySelector('[data-section]') as HTMLElement
  const sections = [
    ...screen.getByRole('navigation').querySelectorAll('[data-section]')
  ].map((el) => el as HTMLElement)
  expect(left.dataset.section).toBe('left')
  expect(sections.map((node) => node.getAttribute('data-section'))).toEqual([
    'left',
    'center',
    'right'
  ])
  // Presence follows the document: no default widget leaks in.
  expect(screen.queryByLabelText('Detalhes da GPU')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Detalhes dos discos')).not.toBeInTheDocument()
  // Order inside a section follows the document too.
  expect(sections[2].textContent).toContain('')
  expect(
    screen.getByRole('button', { name: 'Saída de áudio' })
  ).toBeInTheDocument()
})

it('keeps the configured order inside a section', () => {
  install(
    parseConfig(
      JSON.stringify({
        version: 1,
        bar: {},
        widgets: {
          left: [],
          center: [
            { id: 'b-cpu', type: 'cpu' },
            { id: 'b-memory', type: 'memory' }
          ],
          right: []
        }
      })
    )
  )
  render(<NativeBar />)
  const cpu = screen.getByLabelText('Uso da CPU')
  const memory = screen.getByLabelText('Uso da RAM')
  expect(
    cpu.compareDocumentPosition(memory) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
})

it('drops disabled widgets without losing the rest of the composition', () => {
  install(
    parseConfig(
      JSON.stringify({
        version: 1,
        bar: {},
        widgets: {
          left: [],
          center: [
            { id: 'b-cpu', type: 'cpu', enabled: false },
            { id: 'b-memory', type: 'memory' }
          ],
          right: []
        }
      })
    )
  )
  render(<NativeBar />)
  expect(screen.queryByLabelText('Uso da CPU')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Uso da RAM')).toBeInTheDocument()
  // A disabled widget does not subscribe: it costs nothing while keeping its settings.
  expect(native.connects.map((entry) => entry.channel)).toEqual(['memory'])
})

it('applies compact format, the tooltip toggle, the theme and the spacing', () => {
  install(
    parseConfig(
      JSON.stringify({
        version: 1,
        bar: { theme: 'light', spacing: 14 },
        widgets: {
          left: [],
          center: [
            { id: 'b-cpu', type: 'cpu', format: 'compact', tooltip: false },
            { id: 'b-memory', type: 'memory', tooltip: true }
          ],
          right: []
        }
      })
    )
  )
  render(<NativeBar />)
  const bar = screen.getByRole('navigation')
  // The theme root must be an ancestor: `group-data-[theme=light]:` utilities
  // (including the nav's own background) only match descendants of `.group`,
  // so putting `group` on the nav itself leaves the light theme unpainted.
  const themeRoot = bar.closest('[data-theme]')
  expect(themeRoot).toHaveAttribute('data-theme', 'light')
  expect(themeRoot).toHaveClass('group')
  expect(themeRoot).not.toBe(bar)
  expect(bar).toHaveStyle({ gap: '14px' })
  // Compact drops the widget label and keeps the reading.
  expect(screen.queryByText('CPU')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent(/^23.4%?$/)
  // The tooltip toggle removes the hidden `role="tooltip"` span and its reference.
  const cpuOutput = screen.getByLabelText('Uso da CPU')
  expect(cpuOutput).not.toHaveAttribute('aria-describedby')
  expect(screen.queryAllByRole('tooltip')).toHaveLength(1)
})

it('hydrates from the native store and re-renders on config events', async () => {
  native.loaded.mockResolvedValue({
    revision: 2,
    config: parseConfig(
      JSON.stringify({
        version: 1,
        bar: {},
        widgets: { left: [], center: [{ id: 'b-cpu', type: 'cpu' }], right: [] }
      })
    ),
    error: null
  })
  const stop = connectConfig()
  render(<NativeBar />)
  await act(async () => {})
  expect(native.loaded).toHaveBeenCalledOnce()
  expect(native.listeners.has('bar-1')).toBe(true)
  expect(screen.getByLabelText('Uso da CPU')).toBeInTheDocument()
  expect(screen.queryByLabelText('Uso da RAM')).not.toBeInTheDocument()

  // A hand edit reaches this bar through the event, no restart and no reload call.
  const edited = parseConfig(
    JSON.stringify({
      version: 1,
      bar: {},
      widgets: {
        left: [],
        center: [
          { id: 'b-cpu', type: 'cpu' },
          { id: 'b-memory', type: 'memory' }
        ],
        right: []
      }
    })
  )
  await act(async () => {
    native.listeners.get('bar-1')!({
      payload: { revision: 3, config: edited, error: null }
    })
  })
  expect(native.loaded).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Uso da RAM')).toBeInTheDocument()
  stop()
  expect(native.listeners.has('bar-1')).toBe(false)
})

it('re-renders on a config event without remounting or resubscribing unrelated widgets', async () => {
  native.loaded.mockResolvedValue({
    revision: 1,
    config: defaultConfig,
    error: null
  })
  const stop = connectConfig()
  render(<NativeBar />)
  await act(async () => {})
  const cpu = screen.getByLabelText('Uso da CPU')
  const memory = screen.getByLabelText('Uso da RAM')
  const connects = native.connects.length
  const disposes = native.disposes.length

  // A theme edit changes presentation only: no widget remounts, no new subscription.
  const themed = structuredClone(defaultConfig)
  themed.bar.theme = 'light'
  await act(async () => {
    native.listeners.get('bar-1')!({
      payload: { revision: 2, config: themed, error: null }
    })
  })
  const themeRoot = screen.getByRole('navigation').closest('[data-theme]')
  expect(themeRoot).toHaveAttribute('data-theme', 'light')
  expect(screen.getByLabelText('Uso da CPU')).toBe(cpu)
  expect(screen.getByLabelText('Uso da RAM')).toBe(memory)
  expect(native.connects).toHaveLength(connects)
  expect(native.disposes).toHaveLength(disposes)

  // An interval edit re-subscribes exactly that widget's channel.
  const interval = structuredClone(themed)
  interval.widgets.center.find((widget) => widget.type === 'cpu')!.intervalMs =
    5000
  await act(async () => {
    native.listeners.get('bar-1')!({
      payload: { revision: 3, config: interval, error: null }
    })
  })
  expect(screen.getByLabelText('Uso da CPU')).toBe(cpu)
  expect(native.disposes.slice(disposes)).toEqual(['cpu'])
  expect(native.connects.slice(connects)).toEqual([
    { channel: 'cpu', intervalMs: 5000 }
  ])
  stop()
})

it('keeps the last good bar and surfaces a rejected document', async () => {
  native.loaded.mockResolvedValue({
    revision: 1,
    config: defaultConfig,
    error: null
  })
  const stop = connectConfig()
  render(<NativeBar />)
  await act(async () => {})
  const cpu = screen.getByLabelText('Uso da CPU')

  await act(async () => {
    native.listeners.get('bar-1')!({
      payload: {
        revision: 1,
        config: defaultConfig,
        error: 'Invalid config: expected value at line 1 column 1'
      }
    })
  })
  // The bar keeps rendering the last known-good document; the error travels beside it.
  expect(screen.getByLabelText('Uso da CPU')).toBe(cpu)
  expect(useConfig.getState().config).toEqual(defaultConfig)
  expect(useConfig.getState().error).toContain('Invalid config')
  stop()
})
