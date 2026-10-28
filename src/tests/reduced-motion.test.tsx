import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useReducedMotion } from '../hooks/use-reduced-motion'
import { defaultConfig, parseConfig } from '../services/configuration/config'
import { popupMotionEnabled } from '../popups/motion'
import { useConfig } from '../stores/config'

afterEach(() => {
  useConfig.setState({ config: defaultConfig })
  vi.unstubAllGlobals()
})

it('ignores browser motion preferences and follows live configuration', () => {
  const matchMedia = vi.fn(() => ({ matches: true }))
  vi.stubGlobal('matchMedia', matchMedia)
  const { result } = renderHook(() => useReducedMotion())
  expect(result.current).toBe(false)
  expect(popupMotionEnabled()).toBe(true)
  act(() => {
    useConfig.setState({
      config: parseConfig(
        JSON.stringify({
          ...defaultConfig,
          bar: { ...defaultConfig.bar, reduceMotion: true }
        })
      )
    })
  })
  expect(result.current).toBe(true)
  expect(popupMotionEnabled()).toBe(false)
  expect(matchMedia).not.toHaveBeenCalled()
})

it('keeps animations enabled for existing configuration documents', () => {
  const document = JSON.parse(JSON.stringify(defaultConfig))
  delete document.bar.reduceMotion
  expect(parseConfig(JSON.stringify(document)).bar.reduceMotion).toBe(false)
})
