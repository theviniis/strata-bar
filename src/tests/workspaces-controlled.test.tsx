import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspacesWidget } from '@/features/workspaces/WorkspacesWidget'
import { WorkspacesController } from '@/features/workspaces/WorkspacesController'
import { workspacesFixture } from '@/features/workspaces/fixtures'
import { defaultView } from '@/components/status-bar/presentation'
import { WidgetViewContext } from '@/components/status-bar/widget-view'
import { WidgetPreviewContext } from '@/components/status-bar/widget-preview-context'
import type { WorkspacesData, SystemEvent } from '@/services/system/bridge'

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
  dispose: vi.fn(),
  action: vi.fn(async () => {}),
  emit: undefined as ((event: SystemEvent<WorkspacesData>) => void) | undefined
}))
vi.mock('@/services/system/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/system/bridge')>()),
  bridge: { mode: 'native', workspacesAction: runtime.action },
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
  vi.clearAllMocks()
})

it('renders explicit states, titles, refs and selection without connecting', () => {
  const onSelect = vi.fn()
  const itemRef = vi.fn()
  const props = {
    format: 'label' as const,
    workspaceProps: {
      onSelect,
      itemRef,
      containerRef: undefined,
      indicatorRef: undefined,
      describedBy: 'tip',
      showTitles: false
    }
  }
  const view = render(
    <WorkspacesWidget {...props} event={{ status: 'loading' }} />
  )
  expect(screen.getByLabelText('Áreas de trabalho')).toHaveTextContent('…')
  view.rerender(
    <WorkspacesWidget
      {...props}
      event={{ status: 'ready', data: workspacesFixture() }}
    />
  )
  const button = screen.getByRole('button', { name: 'Workspace 2 (active)' })
  expect(button).not.toHaveAttribute('title')
  expect(button).toHaveAttribute('aria-describedby', 'tip')
  expect(itemRef).toHaveBeenCalledWith(1, button)
  fireEvent.click(button)
  expect(onSelect).toHaveBeenCalledWith(1)
  view.rerender(
    <WorkspacesWidget
      {...props}
      workspaceProps={{ ...props.workspaceProps, showTitles: true }}
      event={{ status: 'ready', data: workspacesFixture() }}
    />
  )
  expect(button).toHaveAttribute('title', 'Web · 1 janela(s) · Tiling')
  view.rerender(
    <WorkspacesWidget
      {...props}
      event={{ status: 'error', error: 'offline' }}
    />
  )
  expect(screen.getByText('Workspaces Offline')).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  view.rerender(
    <WorkspacesWidget
      {...props}
      event={{ status: 'unavailable', data: null }}
    />
  )
  expect(screen.getByText('Workspaces Offline')).toBeVisible()
  expect(runtime.connect).not.toHaveBeenCalled()
})

it('owns subscriptions, configured intervals, focus actions and cleanup', () => {
  const view = render(
    <WidgetViewContext value={defaultView}>
      <WorkspacesController />
    </WidgetViewContext>
  )
  expect(runtime.connect.mock.calls[0][2]).toEqual({ intervalMs: 2000 })
  act(() => runtime.emit?.({ status: 'ready', data: workspacesFixture() }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Workspace 1 (populated)' })
  )
  expect(runtime.action).toHaveBeenCalledWith({
    action: 'focusWorkspace',
    monitor: 1,
    workspace: 0,
    source: 'windows'
  })
  view.rerender(
    <WidgetViewContext value={{ ...defaultView, intervalMs: 4000 }}>
      <WorkspacesController />
    </WidgetViewContext>
  )
  expect(runtime.dispose).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[1][2]).toEqual({ intervalMs: 4000 })
  view.unmount()
  expect(runtime.dispose).toHaveBeenCalledTimes(2)
})

it('keeps workspace preview actions inert', () => {
  const view = render(
    <WidgetPreviewContext value={true}>
      <WorkspacesController />
    </WidgetPreviewContext>
  )
  fireEvent.click(screen.getAllByRole('button')[0])
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(runtime.action).not.toHaveBeenCalled()
  view.unmount()
})

it('animates active workspace changes and cancels the indicator on unmount', () => {
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel, onfinish: null }))
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'animate'
  )
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: animate
  })
  try {
    const data = workspacesFixture()
    const view = render(<WorkspacesController />)
    act(() => runtime.emit?.({ status: 'ready', data }))
    expect(animate).not.toHaveBeenCalled()
    const next: WorkspacesData = {
      ...data,
      workspaces: data.workspaces.map((workspace) => ({
        ...workspace,
        status: workspace.index === 0 ? 'active' : 'empty'
      }))
    }
    act(() => runtime.emit?.({ status: 'ready', data: next }))
    expect(animate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ offset: 1, width: '24px' })
      ]),
      { duration: 450, fill: 'forwards' }
    )
    view.unmount()
    expect(cancel).toHaveBeenCalledOnce()
  } finally {
    if (original)
      Object.defineProperty(HTMLElement.prototype, 'animate', original)
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  }
})
