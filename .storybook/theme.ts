import { create } from 'storybook/theming'

// sRGB equivalents of the semantic OKLCH tokens in src/app/styles.css.
// Storybook's color utilities expect RGB/hex values rather than OKLCH.
const palette = {
  primary: '#fd73bf',
  secondary: '#b494ff',
  dark: {
    background: '#282936',
    surface: '#1f202b',
    foreground: '#f8f8f2',
    muted: '#3e4255',
    border: '#3e4255',
    subtext: '#9394a2'
  },
  light: {
    background: '#ffffff',
    surface: '#f8f8f8',
    foreground: '#282936',
    muted: '#edeef4',
    border: '#d6d7de',
    subtext: '#647095'
  }
}

function strataTheme(base: 'light' | 'dark') {
  const colors = palette[base]
  return create({
    base,
    brandTitle: 'Strata',
    fontBase: '"Geist Variable", "Segoe UI", sans-serif',
    fontCode: 'Consolas, monospace',
    colorPrimary: palette.primary,
    colorSecondary: palette.secondary,
    appBg: colors.surface,
    appContentBg: colors.background,
    appPreviewBg: colors.background,
    appHoverBg: colors.muted,
    appBorderColor: colors.border,
    appBorderRadius: 10,
    textColor: colors.foreground,
    textInverseColor: base === 'dark' ? palette.dark.background : '#ffffff',
    textMutedColor: colors.subtext,
    barTextColor: colors.subtext,
    barHoverColor: palette.primary,
    barSelectedColor: palette.primary,
    barBg: colors.surface,
    buttonBg: colors.surface,
    buttonBorder: colors.border,
    booleanBg: colors.muted,
    booleanSelectedBg: palette.primary,
    inputBg: colors.background,
    inputBorder: colors.border,
    inputTextColor: colors.foreground,
    inputBorderRadius: 8
  })
}

export const strataThemes = {
  dark: strataTheme('dark'),
  light: strataTheme('light')
}
