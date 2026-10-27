import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Disk } from '@/features/disk/widget/disk.widget'
import { DiskController } from '@/features/disk/widget/disk.controller'
import { diskFixture, DISK_FIXTURE_TIME } from '@/features/disk/src/fixtures'
import { defaultView } from '@/components/status-bar/presentation'
import { WidgetViewContext } from '@/components/status-bar/widget-view'
import { WidgetPreviewContext } from '@/components/status-bar/widget-preview-context'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
  dispose: vi.fn(),
  emit: undefined as
    ((event: SystemEvent<ChannelData['disk']>) => void) | undefined
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

it('renders disk states from props and forwards refs and callbacks', () => {
  const click = vi.fn()
  const ref = vi.fn()
  const props = {
    event: { status: 'loading' as const },
    lastData: undefined,
    now: DISK_FIXTURE_TIME,
    format: defaultView.format,
    describedBy: 'disk-tip',
    onClick: click,
    ref
  }
  const view = render(<Disk {...props} />)
  expect(screen.getByText('...')).toBeVisible()
  const button = screen.getByRole('button')
  expect(ref).toHaveBeenCalledWith(button)
  expect(button).toHaveAttribute('aria-describedby', 'disk-tip')
  fireEvent.click(button)
  expect(click).toHaveBeenCalledOnce()
  view.rerender(
    <Disk {...props} event={{ status: 'ready', data: diskFixture() }} />
  )
  expect(screen.getByText('C: 44%')).toBeVisible()
  view.rerender(
    <Disk
      {...props}
      event={{ status: 'ready', data: diskFixture() }}
      now={DISK_FIXTURE_TIME + 10000}
      format="compact"
    />
  )
  expect(screen.queryByText('C: 44%')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  view.rerender(
    <Disk {...props} event={{ status: 'unavailable', data: null }} />
  )
  expect(screen.getByText('\u2014')).toBeVisible()
  view.rerender(
    <Disk
      {...props}
      event={{ status: 'error', error: 'IPC offline' }}
      lastData={diskFixture()}
    />
  )
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  expect(runtime.connect).not.toHaveBeenCalled()
})

it('owns the subscription, retains failed readings and resubscribes on interval changes', () => {
  vi.useFakeTimers()
  vi.setSystemTime(DISK_FIXTURE_TIME)
  const view = render(
    <WidgetViewContext value={defaultView}>
      <DiskController />
    </WidgetViewContext>
  )
  expect(runtime.connect).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[0][2]).toEqual({ intervalMs: 2000 })
  act(() => runtime.emit?.({ status: 'ready', data: diskFixture() }))
  expect(screen.getByText('C: 44%')).toBeVisible()
  act(() => runtime.emit?.({ status: 'error', error: 'IPC offline' }))
  expect(screen.getByLabelText('Leitura desatualizada')).toBeVisible()
  view.rerender(
    <WidgetViewContext value={{ ...defaultView, intervalMs: 4000 }}>
      <DiskController />
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
      <DiskController />
    </WidgetPreviewContext>
  )
  expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
})
