import { themeStyle } from '../src/services/theme/palettes'
import { useDocumentTheme } from '../src/hooks/useDocumentTheme'
import type { ReactNode } from 'react'
import type { Preview } from '@storybook/react-vite'
import { StorybookDocsContainer } from './DocsContainer'
import '@fontsource-variable/geist'
import '../src/app/styles.css'

function ThemeFrame({
  mode,
  children
}: {
  mode: 'light' | 'dark'
  children: ReactNode
}) {
  useDocumentTheme({ theme: mode, colorTheme: 'current' })
  return (
    <main
      data-theme={mode}
      style={themeStyle('current', mode)}
      className={`group min-h-screen bg-background p-6 text-foreground ${mode}`}
    >
      {children}
    </main>
  )
}

const preview: Preview = {
  parameters: { docs: { container: StorybookDocsContainer } },
  globalTypes: {
    theme: { toolbar: { icon: 'circlehollow', items: ['dark', 'light'] } }
  },
  initialGlobals: { theme: 'dark' },
  decorators: [
    (Story, context) => (
      <ThemeFrame mode={context.globals.theme === 'light' ? 'light' : 'dark'}>
        <Story />
      </ThemeFrame>
    )
  ]
}
export default preview
