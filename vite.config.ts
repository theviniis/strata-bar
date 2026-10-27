import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { generatePopups, projectRoot } from './scripts/generate-popups'

function popupDiscovery() {
  return {
    name: 'strata-popup-discovery',
    buildStart() {
      generatePopups()
    },
    configureServer(server: import('vite').ViteDevServer) {
      const features = fileURLToPath(new URL('./src/features', import.meta.url))
      server.watcher.add(features)
      const update = (path: string) => {
        if (
          !path
            .replaceAll('\\', '/')
            .startsWith(features.replaceAll('\\', '/') + '/') ||
          !/\.popup(?:\.tsx?|-definition\.ts)$/.test(path)
        )
          return
        try {
          if (generatePopups(projectRoot))
            server.ws.send({ type: 'full-reload' })
        } catch (error) {
          server.config.logger.error(String(error))
          server.ws.send({
            type: 'error',
            err: { message: String(error), stack: '' }
          })
        }
      }
      server.watcher.on('add', update).on('unlink', update)
      server.httpServer?.once('close', () => {
        server.watcher.off('add', update).off('unlink', update)
      })
    }
  }
}

export default defineConfig({
  plugins: [popupDiscovery(), react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 1420,
    strictPort: true,
    warmup: { clientFiles: ['./src/main.tsx'] },
    watch: {
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/src-tauri/**',
        '**/research/**'
      ]
    }
  },
  test: {
    include: [
      'src/tests/**/*.test.{ts,tsx}',
      'scripts/generate-popups.test.ts'
    ],
    environment: 'jsdom',
    // Avoid contention between full editor trees in concurrent Windows workers.
    maxWorkers: 2,
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 10000
  }
})
