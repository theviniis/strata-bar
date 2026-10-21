import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { VoicemeeterData } from '../services/system/bridge'

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
import { Microphone } from '../features/microphone/Microphone'
import { Volume } from '../features/volume/Volume'
import { VoicemeeterSettings } from '../features/audio/VoicemeeterSettings'
import { optionLabel } from '../features/audio/presentation'
import { PopupHost } from '../popups/PopupHost'
import { resetVoicemeeterCapability } from '../hooks/useVoicemeeterCapability'

type VoicemeeterAudio = NonNullable<
  ReturnType<typeof import('../services/configuration/config').widgetAudio>
>

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
  config.widgets.right.find((w) => w.type === type)!.audio = audio
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
    target: { kind: 'bus', index: 0 },
    label: 'A1 fones'
  })
  render(<Volume />)
  expect(host.channelSource).toHaveBeenCalledWith('volume', {
    kind: 'bus',
    index: 0
  })
  expect(screen.getByText('Voicemeeter: A1 fones')).toBeInTheDocument()
})

it('falls back to the index label without a configured label', () => {
  seed('volume', {
    source: 'voicemeeter',
    target: { kind: 'bus', index: 2 }
  })
  render(<Volume />)
  expect(host.channelSource).toHaveBeenCalledWith('volume', {
    kind: 'bus',
    index: 2
  })
  expect(screen.getByText('Voicemeeter: Bus 2')).toBeInTheDocument()
})

it('clears the Voicemeeter routing when the widget returns to Windows', () => {
  seed('volume', { source: 'voicemeeter', target: { kind: 'bus', index: 0 } })
  const { rerender } = render(<Volume />)
  expect(host.channelSource).toHaveBeenLastCalledWith('volume', {
    kind: 'bus',
    index: 0
  })
  seed('volume')
  rerender(<Volume />)
  expect(host.channelSource).toHaveBeenLastCalledWith('volume', null)
})

it('routes the microphone strip and reports unavailable Voicemeeter', () => {
  seed('microphone', {
    source: 'voicemeeter',
    target: { kind: 'strip', index: 0 }
  })
  render(<Microphone />)
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

it('opens the gear settings with the checkbox and the bus list', async () => {
  render(<PopupHost id="audioOutputs" mode="native" close={() => {}} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Configurações do Voicemeeter' })
  )
  expect(
    screen.getByRole('heading', { name: 'Configurações do Voicemeeter' })
  ).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.queryByRole('button', { name: 'B1' })).not.toBeInTheDocument()
  expect(
    screen.getByText('O mute e o slider agem no dispositivo padrão do Windows.')
  ).toBeInTheDocument()
})

it('checking the box enables Voicemeeter routing on the first bus', () => {
  render(<VoicemeeterSettings type="volume" kind="bus" />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(
    useConfig.getState().config.widgets.right.find((w) => w.type === 'volume')!
      .audio
  ).toEqual({
    source: 'voicemeeter',
    target: { kind: 'bus', index: 0 },
    label: 'A1 · ASIO4ALL v2'
  })
  expect(
    screen.getByText('A1 · ASIO4ALL v2').closest('button')
  ).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('B1').closest('button')).toHaveAttribute(
    'aria-pressed',
    'false'
  )
})

it('disabling the checkbox keeps the target but returns to Windows endpoints', () => {
  seed('volume', {
    source: 'voicemeeter',
    target: { kind: 'bus', index: 0 },
    label: 'A1'
  })
  render(<VoicemeeterSettings type="volume" kind="bus" />)
  expect(screen.getByRole('checkbox')).toBeChecked()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(
    useConfig.getState().config.widgets.right.find((w) => w.type === 'volume')!
      .audio
  ).toEqual({
    source: 'voicemeeter',
    target: { kind: 'bus', index: 0 },
    label: 'A1',
    enabled: false
  })
  const persisted = JSON.parse(localStorage.getItem('strata.config.v1')!) as {
    widgets: { right: Array<{ type: string; audio?: unknown }> }
  }
  const widget = persisted.widgets.right.find((w) => w.type === 'volume')!
  expect(widget.audio).toEqual({
    source: 'voicemeeter',
    target: { kind: 'bus', index: 0 },
    label: 'A1',
    enabled: false
  })
})

it('re-enabling keeps the previously configured target', () => {
  seed('volume', {
    source: 'voicemeeter',
    target: { kind: 'bus', index: 3 }
  })
  render(<VoicemeeterSettings type="volume" kind="bus" />)
  const checkbox = screen.getByRole('checkbox')
  expect(checkbox).toBeChecked()
  // Turn it off and back on; the target stays where it was.
  fireEvent.click(checkbox)
  fireEvent.click(checkbox)
  expect(
    useConfig.getState().config.widgets.right.find((w) => w.type === 'volume')!
      .audio
  ).toEqual({
    source: 'voicemeeter',
    target: { kind: 'bus', index: 3 },
    label: 'B1',
    enabled: true
  })
})

it('buttons persist the selected bus and label', () => {
  seed('volume', { source: 'voicemeeter', target: { kind: 'bus', index: 0 } })
  render(<VoicemeeterSettings type="volume" kind="bus" />)
  const group = screen.getByRole('group', {
    name: 'Faixa de Voicemeeter controlando a saída'
  })
  fireEvent.click(screen.getByText('B1'))
  expect(
    useConfig.getState().config.widgets.right.find((w) => w.type === 'volume')!
      .audio
  ).toEqual({
    source: 'voicemeeter',
    target: { kind: 'bus', index: 3 },
    label: 'B1'
  })
  expect(group).toBeInTheDocument()
  expect(screen.getByText('B1').closest('button')).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

it('enabling the microphone defaults to its first strip and a button changes it', () => {
  render(<VoicemeeterSettings type="microphone" kind="strip" />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(
    useConfig
      .getState()
      .config.widgets.right.find((w) => w.type === 'microphone')!.audio
  ).toEqual({
    source: 'voicemeeter',
    target: { kind: 'strip', index: 0 },
    label: 'Hardware 1 · Mic'
  })
  fireEvent.click(screen.getByText('V1 · Windows'))
  expect(
    useConfig
      .getState()
      .config.widgets.right.find((w) => w.type === 'microphone')!.audio
  ).toEqual({
    source: 'voicemeeter',
    target: { kind: 'strip', index: 3 },
    label: 'V1 · Windows'
  })
})

it('warns for the current target without the engine running', () => {
  seed('microphone', {
    source: 'voicemeeter',
    target: { kind: 'strip', index: 3 },
    label: 'V1 · Windows'
  })
  render(<VoicemeeterSettings type="microphone" kind="strip" />)
  const listener = host.listeners.get('voicemeeter')!
  act(() =>
    listener({ status: 'unavailable', data: null, timestamp: 0 } as never)
  )
  expect(
    screen.getByText('Voicemeeter não está em execução.')
  ).toBeInTheDocument()
  expect(screen.getByText('Alvo atual: V1 · Windows.')).toBeInTheDocument()
})
