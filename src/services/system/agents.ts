import { z } from 'zod'
import type { AgentsSnapshot } from './agents.generated'

export type { AgentType, AgentsSnapshot } from './agents.generated'

const schema: z.ZodType<AgentsSnapshot> = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(0).max(4_294_967_295),
    observedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    applications: z
      .array(
        z
          .object({
            agent: z.enum(['chatgpt', 'opencode', 'antigravity']),
            running: z.boolean().nullable()
          })
          .strict()
      )
      .length(3),
    error: z.string().nullable()
  })
  .strict()
  .refine(
    (value) => new Set(value.applications.map((app) => app.agent)).size === 3
  )

export function parseAgentsSnapshot(value: unknown): AgentsSnapshot {
  return schema.parse(value)
}

export interface AgentsAdapter {
  readonly kind: 'native' | 'demo'
  load(): Promise<AgentsSnapshot>
  listen(
    listener: (snapshot: AgentsSnapshot) => void,
    onError: (error: unknown) => void
  ): Promise<() => void>
}

export function createNativeAgentsAdapter(): AgentsAdapter {
  return {
    kind: 'native',
    async load() {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseAgentsSnapshot(await invoke('agents_snapshot'))
    },
    async listen(listener, onError) {
      const { listen } = await import('@tauri-apps/api/event')
      return listen('agents:snapshot', (event) => {
        try {
          listener(parseAgentsSnapshot(event.payload))
        } catch (error) {
          onError(error)
        }
      })
    }
  }
}

export function createDemoAgentsAdapter(): AgentsAdapter {
  return {
    kind: 'demo',
    async load() {
      return {
        version: 1,
        revision: 0,
        observedAt: Date.now(),
        error: null,
        applications: [
          { agent: 'chatgpt', running: true },
          { agent: 'opencode', running: false },
          { agent: 'antigravity', running: true }
        ]
      }
    },
    async listen() {
      return () => {}
    }
  }
}
