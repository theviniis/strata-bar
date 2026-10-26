import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Memory } from '@/features/memory/Memory'
import { MemoryController } from '@/features/memory/MemoryController'
import { memoryFixture, MEMORY_FIXTURE_TIME } from '@/features/memory/fixtures'
import { defaultView } from '@/components/status-bar/presentation'
import { WidgetViewContext } from '@/components/status-bar/widget-view'
import { WidgetPreviewContext } from '@/components/status-bar/widget-preview-context'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
  dispose: vi.fn(),
  emit: undefined as
    ((event: SystemEvent<ChannelData['memory']>) => void) | undefined
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

it('renders RAM states and presentation only from props and forwards refs and events', () => {
  const click = vi.fn()
  const ref = vi.fn()
  const props = {
    event: { status: 'loading' as const },
    lastData: undefined,
    now: MEMORY_FIXTURE_TIME,
    format: defaultView.format,
    onClick: click,
    ref,
    describedBy: 'memory-tip'
  }
  const view = render(<Memory {...props} />)
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('...')
  const button = screen.getByRole('button')
  expect(ref).toHaveBeenCalledWith(button)
  fireEvent.click(button)
  expect(click).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Uso da RAM')).toHaveAttribute(
    'aria-describedby',
    'memory-tip'
  )
  view.rerender(
    <Memory {...props} event={{ status: 'ready', data: memoryFixture() }} />
  )
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('53.1%')
  view.rerender(
    <Memory
      {...props}
      event={{ status: 'ready', data: memoryFixture() }}
      now={MEMORY_FIXTURE_TIME + 10000}
      format="compact"
    />
  )
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  expect(screen.queryByText('RAM')).not.toBeInTheDocument()
  view.rerender(
    <Memory {...props} event={{ status: 'unavailable', data: null }} />
  )
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('—')
  view.rerender(
    <Memory
      {...props}
      event={{ status: 'error', error: 'IPC offline' }}
      lastData={memoryFixture()}
    />
  )
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('53.1*%')
  expect(runtime.connect).not.toHaveBeenCalled()
})

it('owns the subscription, retains failed readings and resubscribes on interval changes', () => {
  vi.useFakeTimers()
  vi.setSystemTime(MEMORY_FIXTURE_TIME)
  const view = render(
    <WidgetViewContext value={defaultView}>
      <MemoryController />
    </WidgetViewContext>
  )
  expect(runtime.connect).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[0][2]).toEqual({ intervalMs: 2000 })
  act(() => runtime.emit?.({ status: 'ready', data: memoryFixture() }))
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('53.1%')
  act(() => runtime.emit?.({ status: 'error', error: 'IPC offline' }))
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  view.rerender(
    <WidgetViewContext value={{ ...defaultView, intervalMs: 4000 }}>
      <MemoryController />
    </WidgetViewContext>
  )
  expect(runtime.dispose).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[1][2]).toEqual({ intervalMs: 4000 })
  view.unmount()
  expect(runtime.dispose).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('uses the shared RAM visual in inert preview without a subscription or timer', () => {
  vi.useFakeTimers()
  const view = render(
    <WidgetPreviewContext value={true}>
      <MemoryController />
    </WidgetPreviewContext>
  )
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('%')
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
})
