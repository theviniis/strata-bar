import { z } from 'zod'
import type {
  AgentsSnapshot,
  AgentSession,
  OpenCodeSnapshot,
  AntigravitySnapshot,
  CreateAgentSessionResult,
  AgentMessage,
  AgentReplyRequest
} from './agents.generated'

export type {
  AgentType,
  AgentSession,
  SessionStatus,
  AgentsSnapshot,
  OpenCodeSnapshot,
  AntigravitySnapshot,
  CreateAgentSessionResult,
  AgentMessage,
  AgentReplyRequest
} from './agents.generated'

const session: z.ZodType<AgentSession> = z
  .object({
    id: z.string().min(1).max(128),
    agent: z.enum(['opencode', 'antigravity']),
    connectionId: z.enum(['opencode-local', 'antigravity-hooks']),
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
  .refine((value) =>
    value.agent === 'opencode'
      ? value.connectionId === 'opencode-local' &&
        /^ses[A-Za-z0-9_-]*$/.test(value.id)
      : value.connectionId === 'antigravity-hooks' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          value.id
        )
  )

const question: z.ZodType<AgentMessage> = z
  .object({
    id: z
      .string()
      .regex(/^frm_[A-Za-z0-9_-]+$/)
      .max(128),
    sessionId: z
      .string()
      .regex(/^ses[A-Za-z0-9_-]*$/)
      .max(128),
    connectionId: z.literal('opencode-local'),
    version: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().min(1).max(1024),
    fields: z
      .array(
        z
          .object({
            key: z.string().min(1).max(128),
            title: z.string().max(1024),
            description: z.string().max(2048).nullable(),
            required: z.boolean(),
            minLength: z.number().int().min(0).max(4096).nullable(),
            maxLength: z.number().int().min(0).max(4096).nullable()
          })
          .strict()
      )
      .max(8),
    unsupportedReason: z.string().nullable(),
    replyBlocked: z.boolean()
  })
  .strict()
  .refine((q) => new Set(q.fields.map((f) => f.key)).size === q.fields.length)

const opencode: z.ZodType<OpenCodeSnapshot> = z
  .object({
    status: z.enum(['disabled', 'connecting', 'connected', 'disconnected']),
    sessions: z.array(session).max(178),
    hasMore: z.boolean(),
    questions: z.array(question).max(128),
    error: z.string().nullable()
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.sessions.map((session) => session.id)).size ===
        value.sessions.length &&
      value.sessions.every((session) => session.agent === 'opencode') &&
      new Set(value.questions.map((q) => q.id)).size ===
        value.questions.length &&
      value.questions.every((q) =>
        value.sessions.some((s) => s.id === q.sessionId)
      )
  )

const antigravity: z.ZodType<AntigravitySnapshot> = z
  .object({
    status: z.enum(['disabled', 'connecting', 'connected', 'disconnected']),
    sessions: z.array(session).max(128),
    error: z.string().nullable()
  })
  .strict()
  .refine(
    (value) =>
      value.sessions.every((session) => session.agent === 'antigravity') &&
      new Set(value.sessions.map((session) => session.id)).size ===
        value.sessions.length
  )

const schema: z.ZodType<AgentsSnapshot> = z
  .object({
    version: z.literal(5),
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
    opencode,
    antigravity
  })
  .strict()
  .refine(
    (value) => new Set(value.applications.map((app) => app.agent)).size === 3
  )

export function parseAgentsSnapshot(value: unknown): AgentsSnapshot {
  return schema.parse(value)
}

const creationResult: z.ZodType<CreateAgentSessionResult> = z
  .object({
    sessionId: z
      .string()
      .regex(/^ses[A-Za-z0-9_-]*$/)
      .max(128),
    promptStatus: z.enum(['notRequested', 'accepted', 'notSent', 'unknown']),
    error: z.string().nullable()
  })
  .strict()

export interface AgentsAdapter {
  readonly kind: 'native' | 'demo'
  replyOpenCode(request: AgentReplyRequest): Promise<void>
  load(): Promise<AgentsSnapshot>
  setOpenCode(enabled: boolean): Promise<AgentsSnapshot>
  setAntigravity(enabled: boolean): Promise<AgentsSnapshot>
  createOpenCode(
    directory: string,
    prompt?: string
  ): Promise<CreateAgentSessionResult>
  listen(
    listener: (snapshot: AgentsSnapshot) => void,
    onError: (error: unknown) => void
  ): Promise<() => void>
}

export function createNativeAgentsAdapter(): AgentsAdapter {
  return {
    kind: 'native',
    async replyOpenCode(request) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('agents_reply_opencode', { request })
    },
    async createOpenCode(directory, prompt) {
      const { invoke } = await import('@tauri-apps/api/core')
      return creationResult.parse(
        await invoke('agents_create_opencode', {
          directory,
          prompt: prompt ?? null
        })
      )
    },
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
    async setAntigravity(enabled) {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseAgentsSnapshot(
        await invoke('agents_set_antigravity', { enabled })
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
    version: 5,
    revision: 0,
    observedAt: Date.now(),
    error: null,
    applications: [
      { agent: 'chatgpt', running: true },
      { agent: 'opencode', running: true },
      { agent: 'antigravity', running: true }
    ],
    opencode: {
      status: 'disabled',
      sessions: [],
      questions: [],
      hasMore: false,
      error: null
    },
    antigravity: { status: 'disabled', sessions: [], error: null }
  }
  return {
    kind: 'demo',
    async replyOpenCode(request) {
      if (snapshot.opencode.status !== 'connected')
        throw new Error('OpenCode desconectado')
      const q = snapshot.opencode.questions.find(
        (q) =>
          q.id === request.questionId &&
          q.sessionId === request.sessionId &&
          q.version === request.version &&
          !q.replyBlocked &&
          !q.unsupportedReason
      )
      if (!q) throw new Error('Pergunta indisponível ou alterada')
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        opencode: {
          ...snapshot.opencode,
          questions: snapshot.opencode.questions.filter(
            (q) => q.id !== request.questionId
          )
        }
      }
      for (const listener of listeners) listener(structuredClone(snapshot))
    },
    async createOpenCode(directory, prompt) {
      if (snapshot.opencode.status !== 'connected')
        throw new Error('OpenCode desconectado')
      const id = `ses_demo_${snapshot.revision + 1}`
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        opencode: {
          ...snapshot.opencode,
          sessions: [
            {
              id,
              agent: 'opencode',
              connectionId: 'opencode-local',
              title: 'Nova conversa',
              directory,
              status: prompt ? 'processing' : 'idle',
              updatedAt: Date.now()
            },
            ...snapshot.opencode.sessions
          ]
        }
      }
      for (const listener of listeners) listener(structuredClone(snapshot))
      return {
        sessionId: id,
        promptStatus: prompt ? 'accepted' : 'notRequested',
        error: null
      }
    },
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
              questions: [
                {
                  id: 'frm_demo',
                  sessionId: 'ses_demo',
                  connectionId: 'opencode-local',
                  version: 'd'.repeat(64),
                  title: 'Como deseja continuar?',
                  fields: [
                    {
                      key: 'direction',
                      title: 'Orientação',
                      description: null,
                      required: true,
                      minLength: 1,
                      maxLength: 4096
                    }
                  ],
                  unsupportedReason: null,
                  replyBlocked: false
                }
              ],
              hasMore: false,
              sessions: [
                {
                  id: 'ses_demo',
                  agent: 'opencode',
                  connectionId: 'opencode-local',
                  title: 'Exemplo de sessão',
                  directory: 'C:\\Projetos\\demo',
                  status: 'attention',
                  updatedAt: Date.now()
                }
              ]
            }
          : {
              status: 'disabled',
              sessions: [],
              questions: [],
              hasMore: false,
              error: null
            }
      }
      for (const listener of listeners) listener(structuredClone(snapshot))
      return structuredClone(snapshot)
    },
    async setAntigravity(enabled) {
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        antigravity: {
          status: enabled ? 'connecting' : 'disabled',
          sessions: [],
          error: null
        }
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
