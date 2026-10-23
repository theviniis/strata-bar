import type { StorybookConfig } from '@storybook/react-vite'
import { fileURLToPath } from 'node:url'

const config: StorybookConfig = {
  stories: [
    '../src/stories/**/*.mdx',
    '../src/features/**/*.stories.tsx',
    '../src/components/**/*.stories.tsx',
    '../src/popups/**/*.stories.tsx'
  ],
  framework: '@storybook/react-vite',

  // Do not load application discovery plugins or the AppBar development port.
  core: {
    disableTelemetry: true,
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: fileURLToPath(
          new URL('./vite.config.ts', import.meta.url)
        )
      }
    }
  },

  addons: ['@storybook/addon-vitest', '@storybook/addon-docs']
}
export default config
