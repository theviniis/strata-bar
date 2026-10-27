import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import {
  colorThemeSchema,
  configSchema,
  defaultConfig
} from '@/services/configuration/config'
import { useDocumentTheme } from '@/hooks/use-document-theme'
import { colorThemes, themeStyle } from '@/services/theme/palettes'
import { BarSettings } from '@/settings/bar-settings'
import type { ConfigDraft } from '@/settings/draft'
import { ThemePreview } from '@/settings/theme-preview'

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
})

it('defaults legacy documents to current and validates monitor palettes', () => {
  const legacy = structuredClone(defaultConfig)
  const { colorTheme: _removed, ...bar } = legacy.bar
  expect(configSchema.parse({ ...legacy, bar }).bar.colorTheme).toBe('current')
  for (const colorTheme of colorThemeSchema.options) {
    const result = configSchema.parse({
      ...legacy,
      bar: { ...bar, colorTheme },
      monitors: { DISPLAY2: { colorTheme } }
    })
    expect(result.bar.colorTheme).toBe(colorTheme)
    expect(result.monitors.DISPLAY2.colorTheme).toBe(colorTheme)
  }
  expect(
    configSchema.safeParse({
      ...legacy,
      bar: { ...bar, colorTheme: 'unknown' }
    }).success
  ).toBe(false)
  expect(
    configSchema.safeParse({
      ...legacy,
      monitors: { DISPLAY2: { colorTheme: 'unknown' } }
    }).success
  ).toBe(false)
})

it('supplies the same complete token set for all ten appearances', () => {
  const keys = Object.keys(themeStyle('current', 'light')).sort()
  for (const palette of colorThemeSchema.options)
    for (const mode of ['light', 'dark'] as const) {
      const style = themeStyle(palette, mode)
      expect(Object.keys(style).sort()).toEqual(keys)
      expect(Object.values(style).every(Boolean)).toBe(true)
      expect(style.colorScheme).toBe(mode)
    }
})

it('keeps the saved current palette under its Illusion name and AMOLED surfaces pure black or white', () => {
  expect(colorThemes.current.label).toBe('Illusion (Refined)')
  for (const mode of ['light', 'dark'] as const) {
    const style = { ...themeStyle('amoled', mode) }
    const background = mode === 'dark' ? '#000000' : '#ffffff'
    for (const token of ['--background', '--card', '--popover', '--sidebar'])
      expect(Reflect.get(style, token)).toBe(background)
  }
})

it('keeps preview palettes isolated and splits System into light and dark', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const { container } = render(
    <>
      <ThemePreview
        config={{
          ...defaultConfig,
          bar: { ...defaultConfig.bar, theme: 'system', colorTheme: 'nord' }
        }}
      />
      <ThemePreview
        config={{
          ...defaultConfig,
          bar: { ...defaultConfig.bar, theme: 'light', colorTheme: 'dracula' }
        }}
      />
    </>
  )
  const nord = container.querySelector('[data-color-theme-preview="nord"]')!
  expect(nord).toHaveAttribute('inert')
  const halves = nord.querySelectorAll(':scope > [data-theme]')
  expect(halves).toHaveLength(2)
  expect(halves[0]).toHaveStyle({ ...themeStyle('nord', 'light') })
  expect(halves[1]).toHaveStyle({ ...themeStyle('nord', 'dark') })
  expect(
    container.querySelector(
      '[data-color-theme-preview="dracula"] > [data-theme]'
    )
  ).toHaveStyle({ ...themeStyle('dracula', 'light') })
})

it('edits palette independently from appearance without changing the applied document', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  function Editor() {
    const [draft, setDraft] = useState<ConfigDraft>(defaultConfig)
    useDocumentTheme(defaultConfig.bar)
    return <BarSettings draft={configSchema.parse(draft)} onChange={setDraft} />
  }
  render(<Editor />)
  fireEvent.click(screen.getByRole('button', { name: 'Nord' }))
  fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
  expect(screen.getByRole('button', { name: 'Nord' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(document.documentElement.dataset.colorTheme).toBe('current')
  expect(document.documentElement.dataset.theme).toBe(defaultConfig.bar.theme)
})

it('updates document portals and probes when the system mode changes', () => {
  let dark = false
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return dark
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener)
  }))
  function Theme() {
    useDocumentTheme({ theme: 'system', colorTheme: 'catppuccin' })
    return null
  }
  const { unmount } = render(<Theme />)
  expect(document.documentElement.style.getPropertyValue('--background')).toBe(
    '#eff1f5'
  )
  act(() => {
    dark = true
    listeners.forEach((listener) => listener())
  })
  expect(document.documentElement.style.getPropertyValue('--background')).toBe(
    '#1e1e2e'
  )
  expect(document.documentElement).toHaveClass('dark')
  unmount()
  expect(listeners.size).toBe(0)
})
