import type { Preview } from '@storybook/react-vite'
import { StorybookDocsContainer } from './DocsContainer'
import '@fontsource-variable/geist'
import '../src/app/styles.css'

const preview: Preview = {
  parameters: { docs: { container: StorybookDocsContainer } },
  globalTypes: {
    theme: { toolbar: { icon: 'circlehollow', items: ['dark', 'light'] } }
  },
  initialGlobals: { theme: 'dark' },
  decorators: [
    (Story, context) => (
      <main
        data-theme={context.globals.theme}
        className={`group min-h-screen bg-background p-6 text-foreground ${context.globals.theme}`}
      >
        <Story />
      </main>
    )
  ]
}
export default preview
