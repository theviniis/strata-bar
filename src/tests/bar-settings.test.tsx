import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BarSettings } from '../settings/bar-settings'
import { defaultConfig } from '../services/configuration/config'

vi.mock('../settings/theme-preview', () => ({ ThemePreview: () => null }))
afterEach(() => vi.unstubAllGlobals())

it('selects a filled background while preserving the maximized preference', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const onChange = vi.fn()
  const draft = {
    ...defaultConfig,
    bar: { ...defaultConfig.bar, fillOnMaximized: true }
  }
  const { rerender } = render(<BarSettings draft={draft} onChange={onChange} />)
  fireEvent.click(screen.getByText('Preenchido'))
  expect(onChange).toHaveBeenLastCalledWith({
    ...draft,
    bar: { ...draft.bar, background: 'filled' }
  })
  rerender(
    <BarSettings
      draft={{ ...draft, bar: { ...draft.bar, background: 'filled' } }}
      onChange={onChange}
    />
  )
  expect(
    screen.queryByRole('switch', {
      name: 'Preencher fundo quando houver janela maximizada no monitor'
    })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText('Posicionamento e comportamento')
  ).not.toBeInTheDocument()
  rerender(<BarSettings draft={draft} onChange={onChange} />)
  const toggle = screen.getByRole('switch', {
    name: 'Preencher fundo quando houver janela maximizada no monitor'
  })
  expect(toggle).toBeEnabled()
  expect(toggle).toBeChecked()
})

it('enables the maximized-window background in the settings draft', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const onChange = vi.fn()
  render(<BarSettings draft={defaultConfig} onChange={onChange} />)
  const toggle = screen.getByRole('switch', {
    name: 'Preencher fundo quando houver janela maximizada no monitor'
  })
  expect(toggle).not.toBeChecked()
  fireEvent.click(toggle)
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultConfig,
    bar: { ...defaultConfig.bar, fillOnMaximized: true }
  })
})

it('edits shared widget spacing and allows zero spacing', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const onChange = vi.fn()
  render(<BarSettings draft={defaultConfig} onChange={onChange} />)
  expect(
    screen.queryByRole('slider', { name: 'Raio das curvas' })
  ).not.toBeInTheDocument()
  const slider = screen.getByRole('slider', {
    name: 'Espaçamento entre widgets'
  })
  expect(slider).toHaveAttribute(
    'aria-valuenow',
    String(defaultConfig.bar.spacing)
  )
  expect(slider).toHaveAttribute('aria-valuemin', '0')
  expect(slider).toHaveAttribute('aria-valuemax', '32')
  fireEvent.keyDown(slider, { key: 'Home' })
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultConfig,
    bar: { ...defaultConfig.bar, spacing: 0 }
  })
})

it('edits the application animation preference', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const onChange = vi.fn()
  render(<BarSettings draft={defaultConfig} onChange={onChange} />)
  const toggle = screen.getByRole('switch', { name: 'Reduzir animações' })
  expect(toggle).not.toBeChecked()
  fireEvent.click(toggle)
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultConfig,
    bar: { ...defaultConfig.bar, reduceMotion: true }
  })
})
