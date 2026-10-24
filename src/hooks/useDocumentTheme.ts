import { useLayoutEffect } from 'react'
import type { Config } from '@/services/configuration/config'
import { themeStyle } from '@/services/theme/palettes'
import { useResolvedTheme } from './useResolvedTheme'

export function applyDocumentTheme(
  palette: Config['bar']['colorTheme'],
  mode: 'light' | 'dark'
) {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  root.dataset.theme = mode
  root.dataset.colorTheme = palette
  Object.entries(themeStyle(palette, mode)).forEach(([key, value]) => {
    root.style.setProperty(
      key === 'colorScheme' ? 'color-scheme' : key,
      String(value)
    )
  })
}

/** Document scope also covers portals and off-screen measurement probes. */
export function useDocumentTheme(
  bar: Pick<Config['bar'], 'theme' | 'colorTheme'>
) {
  const mode = useResolvedTheme(bar.theme)
  useLayoutEffect(() => {
    applyDocumentTheme(bar.colorTheme, mode)
  }, [bar.colorTheme, mode])
  return mode
}
