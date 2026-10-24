import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoicemeeterData } from '../services/system/bridge'
import { useAudioRouting } from '../hooks/useAudioRouting'

type Listener = (event: {
  status: string
  data?: unknown
  error?: string
}) => void

const host = vi.hoisted(() => ({
  channelSource: vi.fn(async () => undefined),
  capabilities: vi.fn(async () => ({ voicemeeter: true })),
  overlay: {
    mode: 'native' as 'native' | 'demo',
    show: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined),
    resize: vi.fn(async () => ({ arrowX: 160 }))
  },
  listeners: new Map<string, Listener>(),
  payload: {} as Record<string, unknown>
}))

vi.mock('../services/system/bridge', () => ({
  bridge: {
    mode: 'native',
    setChannelSource: host.channelSource,
    capabilities: host.capabilities
  },
  connect: (
    _bridge: unknown,
    channel: string,
    _options: unknown,
    listener: Listener
  ) => {
    host.listeners.set(channel, listener)
    listener({ status: 'ready', data: host.payload[channel] as never })
    return () => host.listeners.delete(channel)
  }
}))
vi.mock('../services/system/overlay', () => ({ overlay: host.overlay }))
import { defaultConfig } from '../services/configuration/config'
import { useConfig } from '../stores/config'
import NativeBar from '../components/status-bar/NativeBar'
import { optionLabel } from '../features/audio/presentation'
import { PopupHost } from '../popups/PopupHost'
import { resetVoicemeeterCapability } from '../hooks/useVoicemeeterCapability'

type VoicemeeterAudio = typeof defaultConfig.audio.output

const engine: VoicemeeterData = {
  application: 2,
  strips: [
    {
      index: 0,
      slot: 'Hardware 1',
      physical: true,
      name: 'Mic',
      gain: 0,
      mute: false
    },
    {
      index: 3,
      slot: 'V1',
      physical: false,
      name: 'Windows',
      gain: 0,
      mute: false
    }
  ],
  buses: [
    {
      index: 0,
      slot: 'A1',
      physical: true,
      name: 'ASIO4ALL v2',
      gain: 0,
      mute: false
    },
    { index: 3, slot: 'B1', physical: false, name: '', gain: 0, mute: false }
  ]
}

function seed(type: 'volume' | 'microphone', audio?: VoicemeeterAudio) {
  const config = structuredClone(defaultConfig)
  config.audio[type === 'volume' ? 'output' : 'input'] = audio ?? {
    source: 'windows',
    targetIndex: 0
  }
  config.widgets = {
    left: [],
    center: [],
    right: config.widgets.right.filter((widget) => widget.type === type)
  }
  useConfig.setState({ config, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetVoicemeeterCapability()
  host.capabilities.mockResolvedValue({ voicemeeter: true })
  host.payload.volume = { level: 64, muted: false }
  host.payload.microphone = { level: 64, muted: false }
  host.payload.voicemeeter = engine
  host.payload.audioOutputs = {
    devices: [{ id: 'speakers', name: 'Alto-falantes' }],
    defaultDeviceId: 'speakers'
  }
  useConfig.setState({ config: defaultConfig, error: null })
  host.listeners.clear()
  // jsdom ships no ResizeObserver, which Radix's popups need on mount.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

it('routes the volume channel through the configured Voicemeeter bus', () => {
  seed('volume', {
    source: 'voicemeeter',
    targetIndex: 0
  })
  render(<NativeBar />)
  expect(host.channelSource).toHaveBeenCalledWith('volume', {
    kind: 'bus',
    index: 0
  })
  expect(screen.getByText('Voicemeeter: Bus 0')).toBeInTheDocument()
})

it('uses the bus index for the global output label', () => {
  seed('volume', {
    source: 'voicemeeter',
    targetIndex: 2
  })
  render(<NativeBar />)
  expect(host.channelSource).toHaveBeenCalledWith('volume', {
    kind: 'bus',
    index: 2
  })
  expect(screen.getByText('Voicemeeter: Bus 2')).toBeInTheDocument()
})

it('clears the Voicemeeter routing when the widget returns to Windows', () => {
  seed('volume', { source: 'voicemeeter', targetIndex: 0 })
  const { rerender } = render(<NativeBar />)
  expect(host.channelSource).toHaveBeenCalledWith('volume', {
    kind: 'bus',
    index: 0
  })
  seed('volume')
  rerender(<NativeBar />)
  expect(host.channelSource).toHaveBeenCalledWith('volume', null)
})

it('routes the microphone strip and reports unavailable Voicemeeter', () => {
  seed('microphone', {
    source: 'voicemeeter',
    targetIndex: 0
  })
  render(<NativeBar />)
  expect(host.channelSource).toHaveBeenCalledWith('microphone', {
    kind: 'strip',
    index: 0
  })
  expect(screen.getByText('Microfone (Strip 0): 64%')).toBeInTheDocument()
  const listener = host.listeners.get('microphone')!
  act(() =>
    listener({ status: 'unavailable', data: null, timestamp: 0 } as never)
  )
  expect(
    screen.getByText('Microfone (Strip 0) indisponível')
  ).toBeInTheDocument()
})

it('formats engine slots with the assigned device name', () => {
  expect(optionLabel(engine.buses[0]!)).toBe('A1 · ASIO4ALL v2')
  expect(optionLabel(engine.buses[1]!)).toBe('B1')
  expect(optionLabel(engine.strips[0]!)).toBe('Hardware 1 · Mic')
})

it('hides the gear button when Voicemeeter was not detected', async () => {
  host.capabilities.mockResolvedValue({ voicemeeter: false })
  render(<PopupHost id="audioOutputs" mode="native" close={() => {}} />)
  await act(async () => {})
  expect(
    screen.queryByRole('button', {
      name: 'Configurações do Voicemeeter'
    })
  ).not.toBeInTheDocument()
})

it.each(['audioOutputs', 'audioInputs'] as const)(
  'keeps %s focused on daily controls without preference forms',
  async (id) => {
    host.payload.audioInputs = {
      devices: [{ id: 'mic', name: 'Microfone' }],
      defaultDeviceId: 'mic'
    }
    render(<PopupHost id={id} mode="native" close={() => {}} />)
    await screen.findByRole('slider', { name: 'Volume' })
    expect(
      screen.queryByRole('button', { name: 'Configurações do Voicemeeter' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeEnabled()
  }
)

describe('config events push audio routing', () => {
  it('pushes both global routes on config hydration (startup)', () => {
    const config = structuredClone(defaultConfig)
    config.audio.output = {
      source: 'voicemeeter',
      targetIndex: 1
    }
    config.audio.input = {
      source: 'voicemeeter',
      targetIndex: 2
    }
    // Simulate the native store hydrating the config (startup)
    useConfig.setState({ config, error: null, revision: 1 })

    // Render a bar-like component that uses useAudioRouting
    render(<TestBar config={config} />)

    expect(host.channelSource).toHaveBeenCalledWith('volume', {
      kind: 'bus',
      index: 1
    })
    expect(host.channelSource).toHaveBeenCalledWith('microphone', {
      kind: 'strip',
      index: 2
    })

    // Config event arrives (external edit) - new revision
    const newConfig = structuredClone(config)
    newConfig.audio.output = {
      source: 'voicemeeter',
      targetIndex: 3
    }
    useConfig.setState({ config: newConfig, error: null, revision: 2 })
    // Re-render to trigger the hook again
    render(<TestBar config={newConfig} />)

    // The hook pushes both global channels; the last call may be for microphone
    // Check that the volume routing was pushed with the new config
    const calls = host.channelSource.mock.calls as unknown as Array<
      [string, { kind: 'bus' | 'strip'; index: number } | null]
    >
    const volumeCalls = calls.filter((c) => c[0] === 'volume')
    expect(volumeCalls[volumeCalls.length - 1]).toEqual([
      'volume',
      { kind: 'bus', index: 3 }
    ])
  })

  it('applies the latest global channel settings across rapid config edits', () => {
    const config = structuredClone(defaultConfig)
    config.audio.output = {
      source: 'voicemeeter',
      targetIndex: 0
    }
    useConfig.setState({ config, error: null, revision: 1 })
    render(<TestBar config={config} />)

    // Rapid edits: push multiple routing changes for the same channel
    const edit1 = structuredClone(config)
    edit1.audio.output = {
      source: 'voicemeeter',
      targetIndex: 1
    }
    useConfig.setState({ config: edit1, error: null, revision: 2 })
    render(<TestBar config={edit1} />)

    const edit2 = structuredClone(config)
    edit2.audio.output = {
      source: 'voicemeeter',
      targetIndex: 2
    }
    useConfig.setState({ config: edit2, error: null, revision: 3 })
    render(<TestBar config={edit2} />)

    const edit3 = structuredClone(config)
    edit3.audio.output = {
      source: 'windows',
      targetIndex: 0
    }
    useConfig.setState({ config: edit3, error: null, revision: 4 })
    render(<TestBar config={edit3} />)

    // The last write (edit3) should win - routing cleared (windows)
    const calls = host.channelSource.mock.calls as unknown as Array<
      [string, { kind: 'bus' | 'strip'; index: number } | null]
    >
    const volumeCalls = calls.filter((c) => c[0] === 'volume')
    expect(volumeCalls[volumeCalls.length - 1]).toEqual(['volume', null])
  })

  it('reports unavailable when Voicemeeter is missing, no fallback to Windows', () => {
    host.capabilities.mockResolvedValue({ voicemeeter: false })
    const config = structuredClone(defaultConfig)
    config.audio.output = {
      source: 'voicemeeter',
      targetIndex: 0
    }
    useConfig.setState({ config, error: null, revision: 1 })

    // Render Volume widget directly to test the unavailable status
    seed('volume', {
      source: 'voicemeeter',
      targetIndex: 0
    })
    render(<NativeBar />)

    // Routing was pushed to native worker
    expect(host.channelSource).toHaveBeenCalledWith('volume', {
      kind: 'bus',
      index: 0
    })

    // Simulate Voicemeeter becoming unavailable (engine not running)
    const volumeListener = host.listeners.get('volume')!
    act(() =>
      volumeListener({
        status: 'unavailable',
        data: null,
        timestamp: 0
      } as never)
    )

    // The widget should show unavailable, not fall back to Windows
    expect(
      screen.getByText('Voicemeeter: Bus 0 indisponível')
    ).toBeInTheDocument()

    // Switching back to Windows should work normally
    seed('volume')
    render(<NativeBar />)

    expect(host.channelSource).toHaveBeenCalledWith('volume', null)
    expect(screen.getByText('Volume do dispositivo padrão')).toBeInTheDocument()
  })
})

// Test component that uses the bar-level audio routing hook
function TestBar({ config }: { config: typeof defaultConfig }) {
  useAudioRouting(config.audio)
  return <div data-testid="test-bar" />
}

it('sends identical global routes from bars with different layouts and duplicate audio widgets', () => {
  const first = structuredClone(defaultConfig)
  first.audio = {
    output: { source: 'voicemeeter', targetIndex: 3 },
    input: { source: 'voicemeeter', targetIndex: 1 }
  }
  const second = structuredClone(first)
  first.widgets.right.push({
    ...first.widgets.right.find((w) => w.type === 'volume')!,
    id: 'headphones'
  })
  second.widgets = { left: [], center: [], right: [] }
  render(
    <>
      <TestBar config={first} />
      <TestBar config={second} />
    </>
  )
  expect(host.channelSource.mock.calls).toEqual([
    ['volume', { kind: 'bus', index: 3 }],
    ['microphone', { kind: 'strip', index: 1 }],
    ['volume', { kind: 'bus', index: 3 }],
    ['microphone', { kind: 'strip', index: 1 }]
  ])
})
