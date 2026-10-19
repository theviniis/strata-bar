import { z } from 'zod'
import type {
  AgentsSnapshot,
  AgentSession,
  OpenCodeSnapshot
} from './agents.generated'

export type {
  AgentType,
  AgentSession,
  SessionStatus,
  AgentsSnapshot,
  OpenCodeSnapshot
} from './agents.generated'

const session: z.ZodType<AgentSession> = z
  .object({
    id: z
      .string()
      .regex(/^ses[A-Za-z0-9_-]*$/)
      .max(128),
    agent: z.literal('opencode'),
    connectionId: z.literal('opencode-local'),
    title: z.string().min(1).max(1024),
    directory: z.string().min(1).max(4096),
    status: z.enum([
      'processing',
      'attention',
      'completed',
      'error',
      'idle',
      'unknown',
      'disconnected'
    ]),
    updatedAt: z.number().min(0).max(8_640_000_000_000_000)
  })
  .strict()

const opencode: z.ZodType<OpenCodeSnapshot> = z
  .object({
    status: z.enum(['disabled', 'connecting', 'connected', 'disconnected']),
    sessions: z.array(session).max(178),
    hasMore: z.boolean(),
    error: z.string().nullable()
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.sessions.map((session) => session.id)).size ===
      value.sessions.length
  )

const schema: z.ZodType<AgentsSnapshot> = z
  .object({
    version: z.literal(2),
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
    error: z.string().nullable(),
    opencode
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
  setOpenCode(enabled: boolean): Promise<AgentsSnapshot>
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
    async setOpenCode(enabled) {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseAgentsSnapshot(
        await invoke('agents_set_opencode', { enabled })
      )
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
  const listeners = new Set<(snapshot: AgentsSnapshot) => void>()
  let snapshot: AgentsSnapshot = {
    version: 2,
    revision: 0,
    observedAt: Date.now(),
    error: null,
    applications: [
      { agent: 'chatgpt', running: true },
      { agent: 'opencode', running: true },
      { agent: 'antigravity', running: true }
    ],
    opencode: { status: 'disabled', sessions: [], hasMore: false, error: null }
  }
  return {
    kind: 'demo',
    async load() {
      return structuredClone(snapshot)
    },
    async setOpenCode(enabled) {
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        opencode: enabled
          ? {
              status: 'connected',
              error: null,
              hasMore: false,
              sessions: [
                {
                  id: 'ses_demo',
                  agent: 'opencode',
                  connectionId: 'opencode-local',
                  title: 'Exemplo de sessão',
                  directory: 'C:\\Projetos\\demo',
                  status: 'processing',
                  updatedAt: Date.now()
                }
              ]
            }
          : { status: 'disabled', sessions: [], hasMore: false, error: null }
      }
      for (const listener of listeners) listener(structuredClone(snapshot))
      return structuredClone(snapshot)
    },
    async listen(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
