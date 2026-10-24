import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NativeBarSurface } from '@/components/status-bar/NativeBar'
import { defaultConfig } from '@/services/configuration/config'

const query = '(prefers-color-scheme: dark)'
afterEach(() => vi.unstubAllGlobals())

it('follows system theme changes and removes the listener on unmount', () => {
  let dark = false
  const listeners = new Set<() => void>()
  const addEventListener = vi.fn((_event: string, listener: () => void) =>
    listeners.add(listener)
  )
  const removeEventListener = vi.fn((_event: string, listener: () => void) =>
    listeners.delete(listener)
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) =>
      media !== query
        ? {
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
          }
        : {
            media,
            get matches() {
              return dark
            },
            addEventListener,
            removeEventListener
          }
    )
  )
  const { rerender, unmount } = render(
    <NativeBarSurface
      widgets={{ left: [], center: [], right: [] }}
      bar={{ ...defaultConfig.bar, theme: 'system' }}
    />
  )
  const root = () => screen.getByRole('navigation').closest('[data-theme]')
  expect(window.matchMedia).toHaveBeenCalledWith(query)
  expect(root()).toHaveAttribute('data-theme', 'light')
  act(() => {
    dark = true
    listeners.forEach((listener) => listener())
  })
  expect(root()).toHaveAttribute('data-theme', 'dark')
  rerender(
    <NativeBarSurface
      widgets={{ left: [], center: [], right: [] }}
      bar={{ ...defaultConfig.bar, theme: 'light' }}
    />
  )
  expect(root()).toHaveAttribute('data-theme', 'light')
  expect(listeners.size).toBe(0)
  rerender(
    <NativeBarSurface
      widgets={{ left: [], center: [], right: [] }}
      bar={{ ...defaultConfig.bar, theme: 'system' }}
    />
  )
  expect(listeners.size).toBe(1)
  unmount()
  expect(listeners.size).toBe(0)
  expect(removeEventListener).toHaveBeenCalledTimes(2)
})
