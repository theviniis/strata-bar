import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BarSettings } from '../settings/bar-settings'
import { defaultConfig } from '../services/configuration/config'

vi.mock('../settings/theme-preview', () => ({ ThemePreview: () => null }))
afterEach(() => vi.unstubAllGlobals())

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
