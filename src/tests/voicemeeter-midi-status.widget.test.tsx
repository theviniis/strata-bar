import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { MidiDeviceStatus, SystemEvent } from '@/services/system/bridge'
import { VoicemeeterMidiStatus } from '@/features/voicemeeter-midi-status/src/voicemeeter-midi-status.widget'
import { VoicemeeterMidiStatusController } from '@/features/voicemeeter-midi-status/src/voicemeeter-midi-status.controller'

const host = vi.hoisted(() => ({
  overlay: {
    mode: 'native' as 'native' | 'demo',
    show: vi.fn(),
    hide: vi.fn(),
    resize: vi.fn()
  },
  listeners: new Map<string, (event: SystemEvent<MidiDeviceStatus>) => void>(),
  restartVoicemeeterAudioEngine: vi.fn(async () => undefined)
}))

vi.mock('@/services/system/overlay', () => ({ overlay: host.overlay }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ label: 'bar-test' })
}))
vi.mock('@/services/system/bridge', () => ({
  bridge: {
    mode: 'native',
    restartVoicemeeterAudioEngine: host.restartVoicemeeterAudioEngine
  },
  connect: (
    _bridge: unknown,
    channel: string,
    _options: unknown,
    listener: (event: SystemEvent<MidiDeviceStatus>) => void
  ) => {
    host.listeners.set(channel, listener)
    listener({ status: 'loading', data: null, timestamp: Date.now() })
    return () => host.listeners.delete(channel)
  }
}))
vi.mock('@/hooks/use-widget-view', () => ({
  useWidgetView: () => ({
    tooltip: true,
    intervalMs: 2000,
    format: 'label',
    showUsage: false,
    showTemperature: false
  })
}))

beforeEach(() => {
  vi.clearAllMocks()
  host.overlay.mode = 'native'
  host.overlay.show.mockResolvedValue(undefined)
  host.overlay.hide.mockResolvedValue(undefined)
  host.listeners.clear()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(() => vi.unstubAllGlobals())

function emitStatus(status: SystemEvent<MidiDeviceStatus>) {
  const listener = host.listeners.get('voicemeeterMidi')
  if (listener) act(() => listener(status))
}

describe('VoicemeeterMidiStatus widget', () => {
  it('renders connected status with green icon', () => {
    render(
      <VoicemeeterMidiStatus
        event={{
          status: 'ready',
          data: {
            status: 'connected',
            deviceName: 'WORLDE easy control',
            lastCheck: Date.now()
          },
          timestamp: Date.now()
        }}
        describedBy={undefined}
      />
    )
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    const icon = button.querySelector('svg')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('text-green-500')
  })

  it('renders disconnected status with red icon', () => {
    render(
      <VoicemeeterMidiStatus
        event={{
          status: 'ready',
          data: {
            status: 'disconnected',
            deviceName: 'WORLDE easy control',
            lastCheck: Date.now(),
            error: 'Not found'
          },
          timestamp: Date.now()
        }}
        describedBy={undefined}
      />
    )
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    const icon = button.querySelector('svg')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('text-red-500')
  })

  it('renders checking status with yellow icon', () => {
    render(
      <VoicemeeterMidiStatus
        event={{
          status: 'ready',
          data: { status: 'checking', lastCheck: Date.now() },
          timestamp: Date.now()
        }}
        describedBy={undefined}
      />
    )
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    const icon = button.querySelector('svg')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('text-yellow-500')
  })

  it('renders unavailable status with gray icon', () => {
    render(
      <VoicemeeterMidiStatus
        event={{
          status: 'ready',
          data: {
            status: 'unavailable' as const,
            reason: 'voicemeeter_not_installed' as const,
            message: 'Not installed'
          },
          timestamp: Date.now()
        }}
        describedBy={undefined}
      />
    )
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    const icon = button.querySelector('svg')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('text-gray-500')
  })

  it('renders error status with red icon', () => {
    render(
      <VoicemeeterMidiStatus
        event={{
          status: 'error',
          data: null,
          error: 'MIDI error',
          timestamp: Date.now()
        }}
        describedBy={undefined}
      />
    )
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    const icon = button.querySelector('svg')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('text-red-500')
  })
})

describe('VoicemeeterMidiStatusController', () => {
  it('opens popup on click', async () => {
    render(<VoicemeeterMidiStatusController />)
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    await waitFor(() => expect(host.listeners.size).toBe(1))
    fireEvent.click(button)
    await waitFor(() =>
      expect(button).toHaveAttribute('data-popup-open', 'true')
    )
  })

  it('shows connected status in widget', async () => {
    render(<VoicemeeterMidiStatusController />)
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    await waitFor(() => expect(host.listeners.size).toBe(1))
    emitStatus({
      status: 'ready',
      data: {
        status: 'connected',
        deviceName: 'WORLDE easy control',
        lastCheck: Date.now()
      },
      timestamp: Date.now()
    })
    await waitFor(() => {
      const icon = button.querySelector('svg')
      expect(icon).toHaveClass('text-green-500')
    })
  })

  it('shows disconnected status in widget', async () => {
    render(<VoicemeeterMidiStatusController />)
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    await waitFor(() => expect(host.listeners.size).toBe(1))
    emitStatus({
      status: 'ready',
      data: {
        status: 'disconnected',
        deviceName: 'WORLDE easy control',
        lastCheck: Date.now(),
        error: 'Not found'
      },
      timestamp: Date.now()
    })
    await waitFor(() => {
      const icon = button.querySelector('svg')
      expect(icon).toHaveClass('text-red-500')
    })
  })

  it.skip('calls restartVoicemeeterAudioEngine when restart button clicked in popup - popup content not rendered in test environment', async () => {
    render(<VoicemeeterMidiStatusController />)
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    await waitFor(() => expect(host.listeners.size).toBe(1))
    // Emit disconnected status to enable restart button
    emitStatus({
      status: 'ready',
      data: {
        status: 'disconnected',
        deviceName: 'WORLDE easy control',
        lastCheck: Date.now(),
        error: 'Not found'
      },
      timestamp: Date.now()
    })
    fireEvent.click(button)
    // Wait for popup to open and find restart button
    const restartButton = await screen.findByRole('button', {
      name: 'Reiniciar Audio Engine'
    })
    fireEvent.click(restartButton)
    await waitFor(() =>
      expect(host.restartVoicemeeterAudioEngine).toHaveBeenCalledTimes(1)
    )
  })

  it.skip('disables restart button when status is connected - popup content not rendered in test environment', async () => {
    render(<VoicemeeterMidiStatusController />)
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    await waitFor(() => expect(host.listeners.size).toBe(1))
    emitStatus({
      status: 'ready',
      data: {
        status: 'connected',
        deviceName: 'WORLDE easy control',
        lastCheck: Date.now()
      },
      timestamp: Date.now()
    })
    fireEvent.click(button)
    const restartButton = await screen.findByRole('button', {
      name: 'Reiniciar Audio Engine'
    })
    expect(restartButton).toBeDisabled()
  })

  it.skip('handles demo mode showing unavailable - popup content not rendered in test environment', async () => {
    host.overlay.mode = 'demo'
    render(<VoicemeeterMidiStatusController />)
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    await waitFor(() => expect(host.listeners.size).toBe(1))
    fireEvent.click(button)
    await waitFor(() =>
      expect(
        screen.getByText(
          /Dispon[ií]vel apenas no build nativo \(pnpm desktop\)/i
        )
      ).toBeInTheDocument()
    )
  })

  it('shows unavailable status in widget for demo mode', async () => {
    host.overlay.mode = 'demo'
    render(<VoicemeeterMidiStatusController />)
    const button = screen.getByRole('button', {
      name: 'Status MIDI do Voicemeeter'
    })
    await waitFor(() => expect(host.listeners.size).toBe(1))
    emitStatus({
      status: 'unavailable',
      data: {
        status: 'unavailable',
        reason: 'midi_api_error',
        message: 'Disponível apenas no build nativo (pnpm desktop)'
      },
      timestamp: Date.now()
    })
    await waitFor(() => {
      const icon = button.querySelector('svg')
      expect(icon).toHaveClass('text-gray-500')
    })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('MIDI indisponível')
  })
})
