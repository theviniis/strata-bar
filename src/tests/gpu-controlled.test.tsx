import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WidgetPreview } from '@/components/status-bar/widget-preview'
import { widgetSchema } from '@/services/configuration/config'
import { Gpu } from '@/features/gpu/widget/gpu.widget'
import { GpuController } from '@/features/gpu/widget/gpu.controller'
import { GpuPopupController } from '@/features/gpu/popup/gpu.popup.controller'
import { PopupContext } from '@/popups/context'
import { gpuFixture, GPU_FIXTURE_TIME } from '@/features/gpu/src/fixtures'
import { defaultView } from '@/components/status-bar/presentation'
import { WidgetViewContext } from '@/components/status-bar/widget-view'
import { WidgetRuntimeContext } from '@/components/status-bar/widget-runtime-context'
import {
  liveWidgetRuntime,
  previewWidgetRuntime
} from '@/services/system/widget-runtime'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
  dispose: vi.fn(),
  emit: undefined as
    ((event: SystemEvent<ChannelData['gpu']>) => void) | undefined
}))
vi.mock('@/services/system/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/system/bridge')>()),
  bridge: { mode: 'native' },
  connect: (...args: unknown[]) => {
    runtime.connect(...args)
    runtime.emit = args[3] as typeof runtime.emit
    return runtime.dispose
  }
}))
vi.mock('@/services/system/overlay', () => ({
  overlay: { mode: 'demo', hide: vi.fn(async () => {}) }
}))
afterEach(() => {
  runtime.connect.mockClear()
  runtime.dispose.mockClear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('renders GPU states and presentation only from props and forwards refs and events', () => {
  const click = vi.fn()
  const ref = vi.fn()
  const props = {
    event: { status: 'loading' as const },
    lastData: undefined,
    now: GPU_FIXTURE_TIME,
    format: defaultView.format,
    onClick: click,
    ref,
    describedBy: 'gpu-tip'
  }
  const view = render(<Gpu {...props} />)
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent('...')
  const button = screen.getByRole('button')
  expect(ref).toHaveBeenCalledWith(button)
  fireEvent.click(button)
  expect(click).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Uso da GPU')).toHaveAttribute(
    'aria-describedby',
    'gpu-tip'
  )
  view.rerender(
    <Gpu {...props} event={{ status: 'ready', data: gpuFixture() }} />
  )
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent('27.3%')
  view.rerender(
    <Gpu
      {...props}
      event={{ status: 'ready', data: gpuFixture() }}
      now={GPU_FIXTURE_TIME + 10000}
      format="compact"
    />
  )
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  expect(screen.queryByText('GPU')).not.toBeInTheDocument()
  view.rerender(
    <Gpu {...props} event={{ status: 'unavailable', data: null }} />
  )
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent('—')
  view.rerender(
    <Gpu
      {...props}
      event={{ status: 'error', error: 'IPC offline' }}
      lastData={gpuFixture()}
    />
  )
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent('27.3*%')
  expect(runtime.connect).not.toHaveBeenCalled()
})

it('owns the subscription, retains failed readings and resubscribes on interval changes', () => {
  vi.useFakeTimers()
  vi.setSystemTime(GPU_FIXTURE_TIME)
  const view = render(
    <WidgetViewContext value={defaultView}>
      <GpuController />
    </WidgetViewContext>
  )
  expect(runtime.connect).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[0][2]).toEqual({ intervalMs: 2000 })
  act(() => runtime.emit?.({ status: 'ready', data: gpuFixture() }))
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent('27.3%')
  act(() => runtime.emit?.({ status: 'error', error: 'IPC offline' }))
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  view.rerender(
    <WidgetViewContext value={{ ...defaultView, intervalMs: 4000 }}>
      <GpuController />
    </WidgetViewContext>
  )
  expect(runtime.dispose).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[1][2]).toEqual({ intervalMs: 4000 })
  view.unmount()
  expect(runtime.dispose).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('uses the shared GPU visual in inert preview without a subscription or timer', () => {
  vi.useFakeTimers()
  const view = render(
    <WidgetRuntimeContext value={previewWidgetRuntime}>
      <GpuController />
    </WidgetRuntimeContext>
  )
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent('%')
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
})

it('renders the shared GPU preview without a native subscription', () => {
  vi.useFakeTimers()
  const view = render(
    <WidgetPreview
      widget={widgetSchema.parse({ id: 'gpu', type: 'gpu' })}
      theme="dark"
    />
  )
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent('27.0%')
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
})

it('resolves the popup subscription in its own window and cleans it up', () => {
  vi.useFakeTimers()
  vi.setSystemTime(GPU_FIXTURE_TIME)
  const observe = liveWidgetRuntime.observeTime
  const stopTime = vi.fn()
  vi.spyOn(liveWidgetRuntime, 'observeTime').mockImplementation(
    (listener, cadence) => {
      const stop = observe(listener, cadence)
      return () => {
        stop()
        stopTime()
      }
    }
  )
  const view = render(
    <PopupContext
      value={{ id: 'gpu', mode: 'native', params: undefined, close: vi.fn() }}
    >
      <GpuPopupController />
    </PopupContext>
  )
  expect(screen.getByRole('status')).toHaveTextContent('Carregando GPU')
  expect(runtime.connect.mock.calls[0][1]).toBe('gpu')
  act(() => runtime.emit?.({ status: 'ready', data: gpuFixture() }))
  expect(screen.getByText('20.6 W')).toBeVisible()
  act(() => runtime.emit?.({ status: 'error', error: 'IPC offline' }))
  expect(screen.getByText('20.6 W · desatualizada')).toBeVisible()
  view.unmount()
  expect(runtime.dispose).toHaveBeenCalledOnce()
  expect(stopTime).toHaveBeenCalledOnce()
})

it('renders the demo popup without connecting a native resource channel', () => {
  vi.useFakeTimers()
  const observeTime = vi.spyOn(liveWidgetRuntime, 'observeTime')
  const view = render(
    <PopupContext
      value={{ id: 'gpu', mode: 'demo', params: undefined, close: vi.fn() }}
    >
      <GpuPopupController />
    </PopupContext>
  )
  expect(screen.getByText(/Dados de demonstração/)).toBeVisible()
  expect(screen.getByText('27.3%')).toBeVisible()
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(observeTime).not.toHaveBeenCalled()
  view.unmount()
})
