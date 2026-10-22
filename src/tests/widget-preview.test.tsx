import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WidgetPreview } from '@/components/status-bar/WidgetPreview'
import { types, widgetSchema } from '@/services/configuration/config'
import { bridge, connect } from '@/services/system/bridge'

vi.mock('../services/system/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/system/bridge')>()),
  connect: vi.fn(),
  bridge: { mode: 'native', subscribe: vi.fn(), setChannelSource: vi.fn() }
}))

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
