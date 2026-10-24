import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BarSettings } from '../settings/BarSettings'
import { defaultConfig } from '../services/configuration/config'

vi.mock('../settings/ThemePreview', () => ({ ThemePreview: () => null }))
afterEach(() => vi.unstubAllGlobals())

it('edits the shared curve radius and allows square edges', () => {
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
  const slider = screen.getByRole('slider', { name: 'Raio das curvas' })
  expect(slider).toHaveAttribute('aria-valuenow', '16.5')
  expect(slider).toHaveAttribute('aria-valuemax', '16.5')
  fireEvent.keyDown(slider, { key: 'Home' })
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultConfig,
    bar: { ...defaultConfig.bar, cornerRadius: 0 }
  })
})
