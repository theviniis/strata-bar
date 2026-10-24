import type { ColorTheme } from '@/services/configuration/config'
import type { CSSProperties } from 'react'

export type ThemeMode = 'light' | 'dark'
type Tokens = Record<`--${string}`, string>

const current: Record<ThemeMode, Tokens> = {
  light: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.285 0.024 282.8)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.285 0.024 282.8)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.285 0.024 282.8)',
    '--primary': 'oklch(0.742 0.187 348.6)',
    '--primary-foreground': 'oklch(1 0 0)',
    '--secondary': 'oklch(0.74 0.16 295.4)',
    '--secondary-foreground': 'oklch(0.285 0.024 282.8)',
    '--muted': 'oklch(0.95 0.008 282.8)',
    '--muted-foreground': 'oklch(0.55 0.06 270)',
    '--accent': 'oklch(0.905 0.182 148.3)',
    '--accent-foreground': 'oklch(0.285 0.024 282.8)',
    '--destructive': 'oklch(0.637 0.237 25.4)',
    '--destructive-foreground': 'oklch(1 0 0)',
    '--border': 'oklch(0.88 0.01 282.8)',
    '--input': 'oklch(0.88 0.01 282.8)',
    '--ring': 'oklch(0.742 0.187 348.6)',
    '--subtext': 'oklch(0.67 0.02 282.8)',
    '--radius': '0.625rem',
    '--chart-1': 'oklch(0.742 0.187 348.6)',
    '--chart-2': 'oklch(0.74 0.16 295.4)',
    '--chart-3': 'oklch(0.865 0.127 207.2)',
    '--chart-4': 'oklch(0.905 0.182 148.3)',
    '--chart-5': 'oklch(0.82 0.155 71.8)',
    '--sidebar': 'oklch(0.98 0 0)',
    '--sidebar-foreground': 'oklch(0.285 0.024 282.8)',
    '--sidebar-primary': 'oklch(0.742 0.187 348.6)',
    '--sidebar-primary-foreground': 'oklch(1 0 0)',
    '--sidebar-accent': 'oklch(0.95 0.008 282.8)',
    '--sidebar-accent-foreground': 'oklch(0.285 0.024 282.8)',
    '--sidebar-border': 'oklch(0.88 0.01 282.8)',
    '--sidebar-ring': 'oklch(0.742 0.187 348.6)'
  },
  dark: {
    '--background': 'oklch(0.285 0.024 282.8)',
    '--foreground': 'oklch(0.978 0.008 106.8)',
    '--card': 'oklch(0.248 0.02 282.2)',
    '--card-foreground': 'oklch(0.978 0.008 106.8)',
    '--popover': 'oklch(0.248 0.02 282.2)',
    '--popover-foreground': 'oklch(0.978 0.008 106.8)',
    '--primary': 'oklch(0.742 0.187 348.6)',
    '--primary-foreground': 'oklch(0.285 0.024 282.8)',
    '--secondary': 'oklch(0.74 0.16 295.4)',
    '--secondary-foreground': 'oklch(0.285 0.024 282.8)',
    '--muted': 'oklch(0.383 0.033 275.6)',
    '--muted-foreground': 'oklch(0.55 0.06 270)',
    '--accent': 'hsl(187, 65%, 55%)',
    '--accent-foreground': 'oklch(0.285 0.024 282.8)',
    '--destructive': 'oklch(0.637 0.237 25.4)',
    '--destructive-foreground': 'oklch(0.978 0.008 106.8)',
    '--border': 'oklch(0.383 0.033 275.6)',
    '--input': 'oklch(0.383 0.033 275.6)',
    '--ring': 'oklch(0.742 0.187 348.6)',
    '--subtext': 'oklch(0.67 0.02 282.8)',
    '--radius': '0.625rem',
    '--chart-1': 'oklch(0.742 0.187 348.6)',
    '--chart-2': 'oklch(0.74 0.16 295.4)',
    '--chart-3': 'oklch(0.865 0.127 207.2)',
    '--chart-4': 'oklch(0.905 0.182 148.3)',
    '--chart-5': 'oklch(0.82 0.155 71.8)',
    '--sidebar': 'oklch(0.248 0.02 282.2)',
    '--sidebar-foreground': 'oklch(0.978 0.008 106.8)',
    '--sidebar-primary': 'oklch(0.742 0.187 348.6)',
    '--sidebar-primary-foreground': 'oklch(0.285 0.024 282.8)',
    '--sidebar-accent': 'oklch(0.383 0.033 275.6)',
    '--sidebar-accent-foreground': 'oklch(0.978 0.008 106.8)',
    '--sidebar-border': 'oklch(0.383 0.033 275.6)',
    '--sidebar-ring': 'oklch(0.742 0.187 348.6)'
  }
}

interface Colors {
  background: string
  foreground: string
  surface: string
  muted: string
  subtext: string
  border: string
  primary: string
  secondary: string
  accent: string
  danger: string
  warning: string
  success: string
}

function tokens(c: Colors): Tokens {
  return {
    '--background': c.background,
    '--foreground': c.foreground,
    '--card': c.surface,
    '--card-foreground': c.foreground,
    '--popover': c.surface,
    '--popover-foreground': c.foreground,
    '--primary': c.primary,
    '--primary-foreground': c.background,
    '--secondary': c.secondary,
    '--secondary-foreground': c.background,
    '--accent': c.accent,
    '--accent-foreground': c.background,
    '--muted': c.muted,
    '--muted-foreground': c.subtext,
    '--subtext': c.subtext,
    '--border': c.border,
    '--input': c.border,
    '--ring': c.primary,
    '--destructive': c.danger,
    '--destructive-foreground': c.background,
    '--warning': c.warning,
    '--success': c.success,
    '--chart-1': c.primary,
    '--chart-2': c.secondary,
    '--chart-3': c.accent,
    '--chart-4': c.success,
    '--chart-5': c.warning,
    '--sidebar': c.surface,
    '--sidebar-foreground': c.foreground,
    '--sidebar-primary': c.primary,
    '--sidebar-primary-foreground': c.background,
    '--sidebar-accent': c.muted,
    '--sidebar-accent-foreground': c.foreground,
    '--sidebar-border': c.border,
    '--sidebar-ring': c.primary,
    '--radius': '0.625rem'
  }
}

export const colorThemes = {
  current: {
    label: 'Illusion (Refined)',
    lightLabel: 'Claro',
    darkLabel: 'Escuro'
  },
  amoled: { label: 'AMOLED', lightLabel: 'Claro', darkLabel: 'Escuro' },
  nord: { label: 'Nord', lightLabel: 'Claro (adaptado)', darkLabel: 'Escuro' },
  dracula: {
    label: 'Dracula',
    lightLabel: 'Claro (adaptado)',
    darkLabel: 'Escuro'
  },
  catppuccin: { label: 'Catppuccin', lightLabel: 'Latte', darkLabel: 'Mocha' }
} satisfies Record<
  ColorTheme,
  { label: string; lightLabel: string; darkLabel: string }
>

const palettes: Record<ColorTheme, Record<ThemeMode, Tokens>> = {
  amoled: {
    dark: tokens({
      background: '#000000',
      foreground: '#ffffff',
      surface: '#000000',
      muted: '#171717',
      subtext: '#b3b3b3',
      border: '#404040',
      primary: '#ffffff',
      secondary: '#ff79c6',
      accent: '#b3e5fc',
      danger: '#ff8080',
      warning: '#f5cf75',
      success: '#9cdda6'
    }),
    light: tokens({
      background: '#ffffff',
      foreground: '#000000',
      surface: '#ffffff',
      muted: '#f5f5f5',
      subtext: '#525252',
      border: '#b3b3b3',
      primary: '#171717',
      secondary: '#ff79c6',
      accent: '#075985',
      danger: '#b91c1c',
      warning: '#855b0b',
      success: '#24733a'
    })
  },
  current: {
    light: { ...current.light, '--warning': '#9a6700', '--success': '#287a46' },
    dark: { ...current.dark, '--warning': '#e6b76a', '--success': '#a6d189' }
  },
  nord: {
    dark: tokens({
      background: '#2e3440',
      foreground: '#eceff4',
      surface: '#3b4252',
      muted: '#434c5e',
      subtext: '#b8c4d6',
      border: '#4c566a',
      primary: '#88c0d0',
      secondary: '#b48ead',
      accent: '#81a1c1',
      danger: '#e58b94',
      warning: '#ebcb8b',
      success: '#a3be8c'
    }),
    light: tokens({
      background: '#eceff4',
      foreground: '#2e3440',
      surface: '#e5e9f0',
      muted: '#d8dee9',
      subtext: '#4c566a',
      border: '#a7b2c4',
      primary: '#326777',
      secondary: '#79547b',
      accent: '#406386',
      danger: '#a52d3b',
      warning: '#846015',
      success: '#486332'
    })
  },
  dracula: {
    dark: tokens({
      background: '#282a36',
      foreground: '#f8f8f2',
      surface: '#21222c',
      muted: '#44475a',
      subtext: '#b9bbd2',
      border: '#626680',
      primary: '#bd93f9',
      secondary: '#ff79c6',
      accent: '#8be9fd',
      danger: '#ff5555',
      warning: '#f1fa8c',
      success: '#50fa7b'
    }),
    light: tokens({
      background: '#f8f7fc',
      foreground: '#282a36',
      surface: '#ffffff',
      muted: '#e9e5f3',
      subtext: '#5e5874',
      border: '#c5bfd5',
      primary: '#7541b5',
      secondary: '#a72c77',
      accent: '#16677b',
      danger: '#c62828',
      warning: '#776414',
      success: '#21753b'
    })
  },
  catppuccin: {
    dark: tokens({
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      surface: '#181825',
      muted: '#313244',
      subtext: '#a6adc8',
      border: '#585b70',
      primary: '#cba6f7',
      secondary: '#f5c2e7',
      accent: '#89dceb',
      danger: '#f38ba8',
      warning: '#f9e2af',
      success: '#a6e3a1'
    }),
    light: tokens({
      background: '#eff1f5',
      foreground: '#4c4f69',
      surface: '#e6e9ef',
      muted: '#dce0e8',
      subtext: '#626580',
      border: '#9ca0b0',
      primary: '#8839ef',
      secondary: '#a52d91',
      accent: '#087c97',
      danger: '#d20f39',
      warning: '#946b11',
      success: '#317b20'
    })
  }
}

/** Explicit tokens keep nested previews independent of the surrounding palette. */
export function themeStyle(
  palette: ColorTheme,
  mode: ThemeMode
): CSSProperties {
  return { ...palettes[palette][mode], colorScheme: mode }
}
