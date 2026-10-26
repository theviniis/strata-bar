import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Cpu } from '@/features/cpu/Cpu'
import { CpuController } from '@/features/cpu/CpuController'
import { cpuFixture, CPU_FIXTURE_TIME } from '@/features/cpu/fixtures'
import { defaultView } from '@/components/status-bar/presentation'
import { WidgetViewContext } from '@/components/status-bar/widget-view'
import { WidgetPreviewContext } from '@/components/status-bar/widget-preview-context'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
  dispose: vi.fn(),
  emit: undefined as
    ((event: SystemEvent<ChannelData['cpu']>) => void) | undefined
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
})

it('renders CPU states and presentation only from props and forwards refs and events', () => {
  const click = vi.fn()
  const ref = vi.fn()
  const props = {
    event: { status: 'loading' as const },
    lastData: undefined,
    now: CPU_FIXTURE_TIME,
    format: defaultView.format,
    onClick: click,
    ref,
    describedBy: 'cpu-tip'
  }
  const view = render(<Cpu {...props} />)
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('...')
  const button = screen.getByRole('button')
  expect(ref).toHaveBeenCalledWith(button)
  fireEvent.click(button)
  expect(click).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Uso da CPU')).toHaveAttribute(
    'aria-describedby',
    'cpu-tip'
  )
  view.rerender(
    <Cpu {...props} event={{ status: 'ready', data: cpuFixture() }} />
  )
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('25.5%')
  view.rerender(
    <Cpu
      {...props}
      event={{ status: 'ready', data: cpuFixture() }}
      now={CPU_FIXTURE_TIME + 10000}
      format="compact"
    />
  )
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  expect(screen.queryByText('CPU')).not.toBeInTheDocument()
  view.rerender(
    <Cpu {...props} event={{ status: 'unavailable', data: null }} />
  )
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('—')
  view.rerender(
    <Cpu
      {...props}
      event={{ status: 'error', error: 'IPC offline' }}
      lastData={cpuFixture()}
    />
  )
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('25.5*%')
  expect(runtime.connect).not.toHaveBeenCalled()
})

it('owns the subscription, retains failed readings and resubscribes on interval changes', () => {
  vi.useFakeTimers()
  vi.setSystemTime(CPU_FIXTURE_TIME)
  const view = render(
    <WidgetViewContext value={defaultView}>
      <CpuController />
    </WidgetViewContext>
  )
  expect(runtime.connect).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[0][2]).toEqual({ intervalMs: 2000 })
  act(() => runtime.emit?.({ status: 'ready', data: cpuFixture() }))
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('25.5%')
  act(() => runtime.emit?.({ status: 'error', error: 'IPC offline' }))
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  view.rerender(
    <WidgetViewContext value={{ ...defaultView, intervalMs: 4000 }}>
      <CpuController />
    </WidgetViewContext>
  )
  expect(runtime.dispose).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[1][2]).toEqual({ intervalMs: 4000 })
  view.unmount()
  expect(runtime.dispose).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('uses the shared CPU visual in inert preview without a subscription or timer', () => {
  vi.useFakeTimers()
  const view = render(
    <WidgetPreviewContext value={true}>
      <CpuController />
    </WidgetPreviewContext>
  )
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('%')
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
})
