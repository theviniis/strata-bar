import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ActiveWindow } from '@/features/active-window/widget/active-window.widget'
import { ActiveWindowController } from '@/features/active-window/widget/active-window.controller'
import { defaultView } from '@/components/status-bar/presentation'
import { WidgetViewContext } from '@/components/status-bar/widget-view'
import { WidgetRuntimeContext } from '@/components/status-bar/widget-runtime-context'
import { previewWidgetRuntime } from '@/services/system/widget-runtime'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
  dispose: vi.fn(),
  emit: undefined as
    ((event: SystemEvent<ChannelData['activeWindow']>) => void) | undefined
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
afterEach(() => {
  runtime.connect.mockClear()
  runtime.dispose.mockClear()
  vi.useRealTimers()
})

const title = 'Visual Studio Code'

it('renders every state, label variant and truncation from props only', () => {
  const click = vi.fn()
  const ref = vi.fn()
  const props = {
    event: { status: 'loading' as const },
    format: defaultView.format,
    onClick: click,
    ref,
    describedBy: 'active-window-tip'
  }
  const view = render(<ActiveWindow {...props} />)

  // Widget shell keeps a stable accessible name; the reading has its own label.
  const button = screen.getByRole('button', { name: 'Janela ativa' })
  const output = screen.getByLabelText('Título da janela ativa')
  expect(output).toHaveTextContent('...')
  expect(button).toHaveAttribute('aria-describedby', 'active-window-tip')
  expect(ref).toHaveBeenCalledWith(button)
  fireEvent.click(button)
  expect(click).toHaveBeenCalledOnce()

  // Truncation is a presentation concern of the reading only.
  expect(output).toHaveClass('max-w-[16rem]', 'truncate')
  expect(button).not.toHaveClass('max-w-[16rem]')

  // `label` shows the "Ativa" prefix; `compact` keeps only the title.
  expect(screen.getByText('Ativa')).toBeVisible()
  view.rerender(
    <ActiveWindow
      {...props}
      format="compact"
      event={{ status: 'ready', data: title }}
    />
  )
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent(
    title
  )
  expect(screen.queryByText('Ativa')).not.toBeInTheDocument()

  view.rerender(
    <ActiveWindow {...props} event={{ status: 'ready', data: title }} />
  )
  expect(screen.getByText('Ativa')).toBeVisible()
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent(
    title
  )

  // A failed or unsupported reading never shows a stale or invented title.
  view.rerender(
    <ActiveWindow
      {...props}
      event={{ status: 'error', data: null, error: 'IPC offline' }}
    />
  )
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent('—')
  view.rerender(
    <ActiveWindow {...props} event={{ status: 'unavailable', data: null }} />
  )
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent('—')

  // An empty title is still a ready reading; it must not be replaced by '...'.
  view.rerender(
    <ActiveWindow {...props} event={{ status: 'ready', data: '' }} />
  )
  const empty = screen.getByLabelText('Título da janela ativa')
  expect(empty.textContent).toBe('')
  expect(empty).not.toHaveTextContent('...')
  expect(runtime.connect).not.toHaveBeenCalled()
})

it('owns the subscription, follows live titles and resubscribes on interval changes', () => {
  const view = render(
    <WidgetViewContext value={defaultView}>
      <ActiveWindowController />
    </WidgetViewContext>
  )
  expect(runtime.connect).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[0][1]).toBe('activeWindow')
  expect(runtime.connect.mock.calls[0][2]).toEqual({ intervalMs: 2000 })
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent(
    '...'
  )

  act(() => runtime.emit?.({ status: 'ready', data: title }))
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent(
    title
  )

  act(() => runtime.emit?.({ status: 'loading', data: null }))
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent(
    '...'
  )

  act(() =>
    runtime.emit?.({ status: 'error', data: null, error: 'IPC offline' })
  )
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent('—')

  view.rerender(
    <WidgetViewContext value={{ ...defaultView, intervalMs: 500 }}>
      <ActiveWindowController />
    </WidgetViewContext>
  )
  expect(runtime.dispose).toHaveBeenCalledOnce()
  expect(runtime.connect.mock.calls[1][2]).toEqual({ intervalMs: 500 })

  view.unmount()
  expect(runtime.dispose).toHaveBeenCalledTimes(2)
})

it('does not fabricate a title without a preview sample or a subscription', () => {
  vi.useFakeTimers()
  const view = render(
    <WidgetRuntimeContext value={previewWidgetRuntime}>
      <ActiveWindowController />
    </WidgetRuntimeContext>
  )
  expect(runtime.connect).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Título da janela ativa')).toHaveTextContent('—')
  expect(vi.getTimerCount()).toBe(0)
  view.unmount()
})
