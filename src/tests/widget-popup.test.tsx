import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Handler = (event: {
  payload: { session: string; restoreFocus?: boolean }
}) => void
const host = vi.hoisted(() => ({
  overlay: {
    mode: 'native' as 'native' | 'demo',
    show: vi.fn(),
    hide: vi.fn(),
    resize: vi.fn()
  },
  listeners: new Set<Handler>(),
  nativeVolume: vi.fn(),
  nativeOutput: vi.fn()
}))
vi.mock('../services/system/overlay', () => ({ overlay: host.overlay }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, handler: Handler) => {
    host.listeners.add(handler)
    return () => host.listeners.delete(handler)
  }
}))
vi.mock('../services/system/bridge', async (original) => {
  const actual = await original<typeof import('../services/system/bridge')>()
  return {
    ...actual,
    bridge: {
      ...actual.bridge,
      setVolume: host.nativeVolume,
      setAudioOutput: host.nativeOutput
    }
  }
})
vi.mock('../hooks/useSystemChannel', () => ({
  useSystemChannel: () => ({ status: 'loading' })
}))
import { WidgetPopup } from '../popups/WidgetPopup'
import { VolumeController } from '../features/volume/widget/volume.controller'
import { MicrophoneController } from '../features/microphone/widget/microphone.controller'
import { RemindersController } from '../features/reminders/widget/reminders.controller'
import { WidgetItem } from '../components/widget-item'
import { PopupHost } from '../popups/PopupHost'
import { resolvePopup } from '../popups/resolve'
import { discoveredPopups as popupRegistry } from '../popups/.generated/popups'
import { PopupSurface } from '../popups/PopupSurface'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '../components/ui/tooltip'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.clearAllMocks()
  host.listeners.clear()
  host.overlay.mode = 'native'
  host.overlay.show.mockResolvedValue(undefined)
  host.overlay.hide.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

it.each([
  ['audio', () => <VolumeController />],
  ['microphone', () => <MicrophoneController />],
  ['reminders', () => <RemindersController />]
] as const)(
  'uses the rounded %s widget itself as the popup anchor',
  async (_name, widget) => {
    render(widget())
    const button = screen.getByRole('button')
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(40, 0, 100, 36)
    )
    await waitFor(() => expect(host.listeners.size).toBe(1))
    fireEvent.click(button)
    await waitFor(() =>
      expect(button).toHaveAttribute('data-popup-open', 'true')
    )
    expect(button).toHaveClass('rounded-full')
    expect(button).toHaveClass('data-[popup-open=true]:bg-muted')
    expect(button.parentElement).not.toHaveAttribute('data-popup-open')
    expect(host.overlay.show).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: { x: 40, y: 0, width: 100, height: 36 }
      })
    )
  }
)

it.each(['native', 'demo'] as const)(
  'preserves child shapes for popup triggers and anchors in %s mode',
  (mode) => {
    host.overlay.mode = mode
    render(
      <WidgetPopup.Root popup="cpu">
        <WidgetPopup.Anchor asChild>
          <div data-testid="pill-anchor" className="rounded-full">
            <WidgetPopup.Trigger asChild>
              <WidgetItem>Pill widget</WidgetItem>
            </WidgetPopup.Trigger>
          </div>
        </WidgetPopup.Anchor>
      </WidgetPopup.Root>
    )
    for (const element of [
      screen.getByTestId('pill-anchor'),
      screen.getByRole('button', { name: 'Pill widget' })
    ]) {
      expect(element).toHaveClass('rounded-full')
      expect(element).not.toHaveClass('rounded')
    }
  }
)

it('composes child refs/handlers, uses the whole anchor and restores focus only when requested', async () => {
  const ref = createRef<HTMLButtonElement>()
  const clicked = vi.fn()
  render(
    <WidgetPopup.Root popup="audioOutputs" params={{}}>
      <WidgetPopup.Anchor asChild>
        <div data-testid="anchor">
          <WidgetPopup.Trigger asChild>
            <button ref={ref} onClick={clicked}>
              Open
            </button>
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  )
  const button = screen.getByRole('button', { name: 'Open' })
  vi.spyOn(
    screen.getByTestId('anchor'),
    'getBoundingClientRect'
  ).mockReturnValue(new DOMRect(40, 0, 100, 36))
  await waitFor(() => expect(host.listeners.size).toBe(1))
  fireEvent.click(button)
  await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'true'))
  expect(button).toHaveAttribute('data-popup-open', 'true')
  expect(screen.getByTestId('anchor')).toHaveAttribute(
    'data-popup-open',
    'true'
  )
  expect(clicked).toHaveBeenCalledOnce()
  expect(ref.current).toBe(button)
  expect(document.querySelector('button button')).toBeNull()
  expect(host.overlay.show).toHaveBeenCalledWith(
    expect.objectContaining({
      anchor: { x: 40, y: 0, width: 100, height: 36 },
      params: {}
    })
  )
  const session = host.overlay.show.mock.calls[0][0].session
  act(() =>
    host.listeners.forEach((handler) =>
      handler({ payload: { session: 'old-session', restoreFocus: true } })
    )
  )
  expect(button).toHaveAttribute('aria-expanded', 'true')
  act(() =>
    host.listeners.forEach((handler) =>
      handler({ payload: { session, restoreFocus: true } })
    )
  )
  expect(button).toHaveFocus()
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(button).toHaveAttribute('data-popup-open', 'false')
  expect(screen.getByTestId('anchor')).toHaveAttribute(
    'data-popup-open',
    'false'
  )
})

it('uses the trigger as implicit anchor and honors prevented child clicks', async () => {
  render(
    <WidgetPopup.Root popup="audioOutputs">
      <WidgetPopup.Trigger asChild>
        <button onClick={(event) => event.preventDefault()}>Blocked</button>
      </WidgetPopup.Trigger>
    </WidgetPopup.Root>
  )
  fireEvent.click(screen.getByRole('button'))
  expect(host.overlay.show).not.toHaveBeenCalled()
})

it('uses a trigger rectangle when no explicit anchor is provided', async () => {
  render(
    <WidgetPopup.Root popup="audioOutputs">
      <WidgetPopup.Trigger>Implicit</WidgetPopup.Trigger>
    </WidgetPopup.Root>
  )
  const trigger = screen.getByRole('button')
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(120, 4, 40, 28)
  )
  fireEvent.click(trigger)
  await waitFor(() =>
    expect(host.overlay.show).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: { x: 120, y: 4, width: 40, height: 28 }
      })
    )
  )
})

it('replaces an opening session and ignores its late response', async () => {
  let complete!: () => void
  host.overlay.show.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      complete = resolve
    })
  )
  render(
    <>
      <WidgetPopup.Root popup="audioOutputs">
        <WidgetPopup.Trigger>First</WidgetPopup.Trigger>
      </WidgetPopup.Root>
      <WidgetPopup.Root popup="audioOutputs">
        <WidgetPopup.Trigger>Second</WidgetPopup.Trigger>
      </WidgetPopup.Root>
    </>
  )
  fireEvent.click(screen.getByRole('button', { name: 'First' }))
  fireEvent.click(screen.getByRole('button', { name: 'Second' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  )
  await act(async () => complete())
  expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  expect(host.overlay.hide).toHaveBeenCalledWith(
    host.overlay.show.mock.calls[0][0].session
  )
})

it('does not apply an older resize response after newer content was measured', async () => {
  let measure!: () => void
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        measure = callback
      }
      observe() {}
      disconnect() {}
    }
  )
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 320, 200))
  let old!: (value: { arrowX: number }) => void
  host.overlay.resize
    .mockReturnValueOnce(
      new Promise((resolve) => {
        old = resolve
      })
    )
    .mockResolvedValue({ arrowX: 165 })
  try {
    render(
      <PopupSurface
        mode="native"
        session="size-session"
        label="Free content"

        close={() => {}}
      >
        <section>Any content</section>
      </PopupSurface>
    )
    rect.mockReturnValue(new DOMRect(0, 0, 320, 250))
    act(() => measure())
    await waitFor(() =>
      expect(
        screen.getByRole('dialog').parentElement?.querySelector('[aria-hidden]')
      ).toHaveStyle({ left: '165px' })
    )
    await act(async () => old({ arrowX: 20 }))
    expect(
      screen.getByRole('dialog').parentElement?.querySelector('[aria-hidden]')
    ).toHaveStyle({ left: '165px' })
  } finally {
    rect.mockRestore()
  }
})

it('rejects invalid parameters without opening a native window', async () => {
  render(
    <WidgetPopup.Root popup="audioOutputs" params={{ extra: true } as never}>
      <WidgetPopup.Trigger>Open</WidgetPopup.Trigger>
    </WidgetPopup.Root>
  )
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(host.overlay.show).not.toHaveBeenCalled()
  expect(() => resolvePopup('unknown', {})).toThrow('Popup não registrado')
  // @ts-expect-error Catalog IDs are the public API; arbitrary names are rejected.
  const unknown = <WidgetPopup.Root popup="unknown">invalid</WidgetPopup.Root>
  const invalid = (
    // @ts-expect-error Empty schemas do not accept undeclared parameters.
    <WidgetPopup.Root popup="audioOutputs" params={{ extra: true }}>
      invalid
    </WidgetPopup.Root>
  )
  void unknown
  void invalid
})

it('provides an interactive, themed demo without native subscriptions or commands', async () => {
  host.overlay.mode = 'demo'
  render(
    <main className="group" data-theme="light">
      <WidgetPopup.Root popup="audioOutputs">
        <WidgetPopup.Trigger>Audio preview</WidgetPopup.Trigger>
      </WidgetPopup.Root>
    </main>
  )
  const trigger = screen.getByRole('button', { name: 'Audio preview' })
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Saída de áudio' })
  expect(trigger).toHaveAttribute('data-popup-open', 'true')
  expect(trigger).toHaveClass('data-[popup-open=true]:bg-muted')
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByText(/Demonstração interativa/)).toBeInTheDocument()
  expect(dialog.closest('[data-theme]')).toHaveAttribute('data-theme', 'light')
  const headphones = await within(dialog).findByRole('button', {
    name: 'Fones de ouvido (demo)'
  })
  fireEvent.click(headphones)
  await waitFor(() =>
    expect(headphones).toHaveAttribute('aria-pressed', 'true')
  )
  const slider = within(dialog).getByRole('slider', { name: 'Volume' })
  fireEvent.keyDown(slider, { key: 'End' })
  await waitFor(() =>
    expect(within(dialog).getByLabelText('Volume atual')).toHaveTextContent(
      '100'
    )
  )
  fireEvent.click(within(dialog).getByRole('button', { name: 'Silenciar' }))
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Ativar som' })
    ).toHaveAttribute('aria-pressed', 'true')
  )
  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveAttribute('data-popup-open', 'false')
  expect(host.nativeVolume).not.toHaveBeenCalled()
  expect(host.nativeOutput).not.toHaveBeenCalled()
  expect(host.overlay.show).not.toHaveBeenCalled()
})

it('renders an accessible validation error for untrusted overlay content', () => {
  render(
    <PopupHost id="not-registered" params={{}} mode="demo" close={() => {}} />
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Popup não registrado')
})

it('suppresses studio tooltips while a popup is active', async () => {
  host.overlay.mode = 'demo'
  render(
    <>
      <Tooltip open>
        <TooltipTrigger>Hint</TooltipTrigger>
        <TooltipContent>Studio tooltip</TooltipContent>
      </Tooltip>
      <WidgetPopup.Root popup="audioOutputs">
        <WidgetPopup.Trigger>Open preview</WidgetPopup.Trigger>
      </WidgetPopup.Root>
    </>
  )
  expect(await screen.findByText('Studio tooltip')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open preview' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.queryByText('Studio tooltip')).not.toBeInTheDocument()
  )
})

it('contains a registered content failure without losing the close action', () => {
  const original = popupRegistry.audioOutputs.Content
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const close = vi.fn()
  popupRegistry.audioOutputs.Content = () => {
    throw new Error('Widget failed')
  }
  try {
    render(<PopupHost id="audioOutputs" mode="demo" close={close} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Widget failed')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(close).toHaveBeenCalledOnce()
  } finally {
    popupRegistry.audioOutputs.Content = original
    log.mockRestore()
  }
})
