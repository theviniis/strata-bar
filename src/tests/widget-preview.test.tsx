import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WidgetPreview } from '@/components/status-bar/widget-preview'
import {
  defaultConfig,
  types,
  widgetSchema
} from '@/services/configuration/config'
import { StudioBar } from '@/components/status-bar/studio-bar'
import { WidgetPreviewRuntime } from '@/components/status-bar/widget-preview-runtime'
import { Widget } from '@/components/status-bar/widget'
import { ThemePreview } from '@/settings/theme-preview'
import {
  PREVIEW_TIME,
  widgetPreviewEvent
} from '@/services/system/widget-preview'
import { bridge, connect } from '@/services/system/bridge'
import { overlay } from '@/services/system/overlay'
import { listen } from '@tauri-apps/api/event'

const runtime = vi.hoisted(() => ({ mode: 'native' as 'native' | 'demo' }))

vi.mock('../services/system/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/system/bridge')>()),
  connect: vi.fn(),
  bridge: {
    get mode() {
      return runtime.mode
    },
    subscribe: vi.fn(),
    setChannelSource: vi.fn(),
    mediaAction: vi.fn(),
    workspacesAction: vi.fn(),
    setVolume: vi.fn()
  }
}))

vi.mock('@/services/system/overlay', () => ({
  overlay: {
    get mode() {
      return runtime.mode
    },
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {})
  }
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  runtime.mode = 'native'
})

it('renders the real widgets with sample readings and no native subscriptions or audio routing', () => {
  const { container } = render(
    <>
      {types.map((type) => (
        <WidgetPreview
          key={type}
          widget={widgetSchema.parse({ id: type, type })}
          theme="dark"
        />
      ))}
    </>
  )
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('17.0%')
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent('27.0%')
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('46.0%')
  expect(screen.getByLabelText('Abrir calendário')).toHaveTextContent('09:41')
  expect(container.querySelectorAll('[data-widget-preview]')).toHaveLength(
    types.length
  )
  expect(
    [...container.querySelectorAll('[data-widget-preview]')].every((preview) =>
      preview.hasAttribute('inert')
    )
  ).toBe(true)
  expect(connect).not.toHaveBeenCalled()
  expect(bridge.subscribe).not.toHaveBeenCalled()
  expect(bridge.setChannelSource).not.toHaveBeenCalled()
})

it('uses the actual widget presentation when configuration changes', () => {
  const widget = widgetSchema.parse({
    id: 'cpu',
    type: 'cpu',
    format: 'compact'
  })
  const { rerender } = render(<WidgetPreview widget={widget} theme="dark" />)
  expect(screen.queryByText('CPU')).not.toBeInTheDocument()
  rerender(
    <WidgetPreview widget={{ ...widget, format: 'label' }} theme="light" />
  )
  expect(screen.getByText('CPU')).toBeInTheDocument()
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('17.0%')
})

it('does not listen to Tauri or open overlays when inert previews receive events', async () => {
  vi.useFakeTimers()
  const widget = widgetSchema.parse({ id: 'cpu-inert', type: 'cpu' })
  const view = render(<WidgetPreview widget={widget} theme="dark" />)
  const target = screen.getByLabelText('Detalhes da CPU')
  fireEvent.click(target)
  fireEvent.pointerEnter(target)
  fireEvent.focus(target)
  await act(async () => {
    vi.advanceTimersByTime(1000)
    await Promise.resolve()
  })
  expect(listen).not.toHaveBeenCalled()
  expect(overlay.show).not.toHaveBeenCalled()
  view.unmount()
})

it.each(['native', 'demo'] as const)(
  'uses identical fixed readings in catalog, studio and theme previews in %s mode',
  (mode) => {
    runtime.mode = mode
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    )
    const cpu = widgetSchema.parse({
      id: 'cpu',
      type: 'cpu',
      format: 'compact'
    })
    const config = {
      ...defaultConfig,
      widgets: { left: [cpu], center: [], right: [] }
    }
    const views = [
      render(<WidgetPreview widget={cpu} theme="dark" />),
      render(<StudioBar config={config} />),
      render(<ThemePreview config={config} />)
    ]
    for (const view of views) {
      expect(
        within(view.container).getByLabelText('Uso da CPU')
      ).toHaveTextContent('17.0%')
      const cpuWidget = within(view.container).getByLabelText('Detalhes da CPU')
      expect(within(cpuWidget).queryByText('CPU')).not.toBeInTheDocument()
      expect(view.container.querySelector('[inert]')).not.toBeNull()
    }
    expect(connect).not.toHaveBeenCalled()
    expect(bridge.subscribe).not.toHaveBeenCalled()
    expect(bridge.setChannelSource).not.toHaveBeenCalled()
  }
)

it.each(['native', 'demo'] as const)(
  'rejects synthetic actions and popup triggers for every preview widget in %s mode',
  async (mode) => {
    runtime.mode = mode
    const view = render(
      <WidgetPreviewRuntime>
        {types.map((type) => (
          <Widget key={type} widget={widgetSchema.parse({ id: type, type })} />
        ))}
      </WidgetPreviewRuntime>
    )
    await act(async () => {
      for (const button of view.container.querySelectorAll('button')) {
        fireEvent.pointerDown(button)
        fireEvent.click(button)
        fireEvent.keyDown(button, { key: 'Enter' })
        fireEvent.pointerEnter(button)
        fireEvent.focus(button)
      }
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.querySelector('[data-popup-open="true"]')).toBeNull()
    expect(overlay.show).not.toHaveBeenCalled()
    expect(listen).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
    expect(bridge.mediaAction).not.toHaveBeenCalled()
    expect(bridge.workspacesAction).not.toHaveBeenCalled()
    expect(bridge.setVolume).not.toHaveBeenCalled()
  }
)

it('keeps overflowing music, spectrum and clock still without background timers', async () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(600)
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(100)
  const animate = vi.fn()
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'animate'
  )
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: animate
  })
  try {
    const config = {
      ...defaultConfig,
      widgets: {
        left: ['music', 'mediaSpectrum', 'clock'].map((type) =>
          widgetSchema.parse({ id: type, type })
        ),
        center: [],
        right: []
      }
    }
    const view = render(<StudioBar config={config} />)
    const clock = within(view.container).getByLabelText('Abrir calendário')
    const bands = [
      ...view.container.querySelectorAll<HTMLElement>('[data-spectrum-band]')
    ]
    const before = bands.map((band) => band.style.transform)
    expect(bands).toHaveLength(6)
    expect(before.every((transform) => transform.startsWith('scaleY('))).toBe(
      true
    )
    expect(animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => {
      vi.advanceTimersByTime(120_000)
    })
    expect(clock).toHaveTextContent('09:41')
    expect(bands.map((band) => band.style.transform)).toEqual(before)
    expect(animate).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    if (original)
      Object.defineProperty(HTMLElement.prototype, 'animate', original)
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  }
})

it('retains fixed sample timestamps across wall-clock changes', () => {
  vi.useFakeTimers()
  const channels = ['disk', 'media', 'weather'] as const
  const before = structuredClone(
    channels.map((channel) => widgetPreviewEvent(channel))
  )
  const disk = widgetPreviewEvent('disk')
  const media = widgetPreviewEvent('media')
  expect(disk.status === 'ready' && disk.data.sampledAt).toBe(PREVIEW_TIME)
  expect(
    media.status === 'ready' && media.data.progress.value?.measuredAt
  ).toBe(PREVIEW_TIME)
  vi.setSystemTime(new Date(2030, 0, 1))
  expect(channels.map((channel) => widgetPreviewEvent(channel))).toEqual(before)
})

it('keeps a real native failure visible instead of selecting preview samples', () => {
  runtime.mode = 'native'
  vi.mocked(connect).mockImplementationOnce(
    (_adapter, _channel, _options, _onValue, onError) => {
      onError(new Error('Sensor unavailable'))
      return () => {}
    }
  )
  const view = render(
    <Widget widget={widgetSchema.parse({ id: 'cpu', type: 'cpu' })} />
  )
  expect(
    within(view.container).getByLabelText('Uso da CPU')
  ).not.toHaveTextContent('17.0%')
  expect(within(view.container).getByLabelText('Uso da CPU')).toHaveTextContent(
    '—'
  )
  expect(view.container).toHaveTextContent('Sensor unavailable')
})
