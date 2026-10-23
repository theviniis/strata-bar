import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AudioOutputs } from '@/features/volume/AudioOutputs'
import { AudioInputs } from '@/features/microphone/AudioInputs'
import { Volume } from '@/features/volume/Volume'
import { Microphone } from '@/features/microphone/Microphone'
import { VolumeController } from '@/features/volume/VolumeController'
import { MicrophoneController } from '@/features/microphone/MicrophoneController'
import { WidgetPreviewContext } from '@/components/status-bar/widget-preview-context'
import { WidgetViewContext } from '@/components/status-bar/widget-view'
import { defaultView } from '@/components/status-bar/presentation'
import {
  audioInputsFixture,
  audioOutputsFixture,
  audioLevelFixture
} from '@/features/audio/fixtures'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
  dispose: vi.fn(),
  emit: new Map<string, (event: SystemEvent<ChannelData['volume']>) => void>()
}))
vi.mock('@/services/system/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/system/bridge')>()),
  bridge: { mode: 'native' },
  connect: (...args: unknown[]) => {
    runtime.connect(...args)
    runtime.emit.set(
      args[1] as string,
      args[3] as (event: SystemEvent<ChannelData['volume']>) => void
    )
    return runtime.dispose
  }
}))
vi.mock('@/services/system/overlay', () => ({
  overlay: { mode: 'demo', hide: vi.fn(async () => {}) }
}))
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  vi.clearAllMocks()
  runtime.emit.clear()
  vi.useRealTimers()
})

it.each([Volume, Microphone])(
  'forwards widget attributes, ref and events without connecting',
  (Visual) => {
    const onClick = vi.fn()
    const ref = vi.fn()
    const view = render(
      <Visual
        event={{ status: 'ready', data: audioLevelFixture() }}
        describedBy="audio-tip"
        onClick={onClick}
        ref={ref}
      />
    )
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-describedby', 'audio-tip')
    expect(ref).toHaveBeenCalledWith(button)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
    view.rerender(
      <Visual
        event={{ status: 'unavailable', data: null }}
        describedBy={undefined}
      />
    )
    expect(screen.getByRole('button')).toBeVisible()
    expect(runtime.connect).not.toHaveBeenCalled()
  }
)

it.each(['outputs', 'inputs'] as const)(
  'controls %s selection, mute, slider, pending and errors by props',
  (kind) => {
    const data =
      kind === 'outputs' ? audioOutputsFixture() : audioInputsFixture()
    const callbacks = {
      select: vi.fn(),
      mute: vi.fn(),
      setDraft: vi.fn(),
      setLevel: vi.fn(),
      retry: vi.fn()
    }
    const common = {
      volume: { status: 'ready' as const, data: audioLevelFixture() },
      data,
      pending: null,
      error: '',
      level: 64,
      muted: false,
      ...callbacks
    }
    const content = (pending: string | null, error = '') =>
      kind === 'outputs' ? (
        <AudioOutputs
          {...common}
          outputs={{ status: 'ready', data }}
          pending={pending}
          error={error}
        />
      ) : (
        <AudioInputs
          {...common}
          inputs={{ status: 'ready', data }}
          pending={pending}
          error={error}
        />
      )
    const view = render(content(null))
    fireEvent.click(screen.getByRole('button', { name: data.devices[1].name }))
    expect(callbacks.select).toHaveBeenCalledWith(data.devices[1].id)
    // The visual waits for its controller to confirm a new selection.
    expect(
      screen.getByText(data.devices[0].name).closest('button')
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(
      screen.getByRole('button', {
        name: kind === 'outputs' ? 'Silenciar' : 'Silenciar microfone'
      })
    )
    expect(callbacks.mute).toHaveBeenCalledOnce()
    const slider = screen.getByRole('slider', { name: 'Volume' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(callbacks.setDraft).toHaveBeenCalledWith(65)
    expect(callbacks.setLevel).toHaveBeenCalledWith(65)
    expect(screen.getByLabelText('Volume atual').textContent).toBe('64%')
    view.rerender(content(data.devices[1].id, 'Operation failed'))
    expect(
      screen.getByRole('button', { name: data.devices[1].name })
    ).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Operation failed')
    expect(slider).toHaveAttribute('data-disabled', '')
    expect(runtime.connect).not.toHaveBeenCalled()
  }
)

it('owns independent subscriptions, follows intervals and cleans up', () => {
  const view = render(
    <WidgetViewContext value={defaultView}>
      <VolumeController />
      <MicrophoneController />
    </WidgetViewContext>
  )
  expect(runtime.connect).toHaveBeenCalledTimes(2)
  act(() =>
    runtime.emit.get('microphone')?.({
      status: 'ready',
      data: { level: 40, muted: true }
    })
  )
  expect(screen.getByRole('button', { name: 'Entrada de áudio' })).toBeVisible()
  view.rerender(
    <WidgetViewContext
      value={{
        ...defaultView,
        intervalMs: 4000,
        audio: { source: 'voicemeeter', target: { kind: 'strip', index: 0 } }
      }}
    >
      <VolumeController />
      <MicrophoneController />
    </WidgetViewContext>
  )
  expect(runtime.dispose).toHaveBeenCalledTimes(2)
  expect(runtime.connect.mock.calls[2][2]).toEqual({ intervalMs: 4000 })
  expect(screen.getByText(/Voicemeeter: Strip 0/)).toBeInTheDocument()
  view.unmount()
  expect(runtime.dispose).toHaveBeenCalledTimes(4)
})

it('renders inert audio previews without subscriptions or timers', () => {
  vi.useFakeTimers()
  const view = render(
    <WidgetPreviewContext value={true}>
      <VolumeController />
      <MicrophoneController />
    </WidgetPreviewContext>
  )
  expect(screen.getAllByRole('button')).toHaveLength(2)
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
})
