import { create } from 'zustand'
import {
  createDemoAgentsAdapter,
  createNativeAgentsAdapter,
  parseAgentsSnapshot,
  type AgentsAdapter,
  type AgentsSnapshot,
  type CreateAgentSessionResult,
  type AgentReplyRequest
} from '@/services/system/agents'

type AgentsState = {
  snapshot: AgentsSnapshot | null
  error: string | null
  replyOpenCode(request: AgentReplyRequest): Promise<void>
  connect(): () => void
  configureOpenCode(enabled: boolean): Promise<void>
  configureAntigravity(enabled: boolean): Promise<void>
  createOpenCode(
    directory: string,
    prompt?: string
  ): Promise<CreateAgentSessionResult>
}

export function createAgentsStore(adapter: AgentsAdapter) {
  return create<AgentsState>((set, get) => {
    const fail = (error: unknown) =>
      set({ error: error instanceof Error ? error.message : String(error) })
    const accept = (value: AgentsSnapshot) => {
      const snapshot = parseAgentsSnapshot(value)
      if (
        get().snapshot === null ||
        snapshot.revision > get().snapshot!.revision
      ) {
        set({ snapshot, error: null })
      }
    }
    let consumers = 0
    let stopConnection: (() => void) | undefined
    return {
      snapshot: null,
      error: null,
      async replyOpenCode(request) {
        const snapshot = get().snapshot
        if (
          get().error ||
          snapshot?.opencode.status !== 'connected' ||
          !snapshot.opencode.questions.some(
            (q) =>
              q.id === request.questionId &&
              q.sessionId === request.sessionId &&
              q.version === request.version &&
              !q.replyBlocked &&
              !q.unsupportedReason
          )
        ) {
          throw new Error(
            'Pergunta indisponível; aguarde reconexão ou atualização'
          )
        }
        await adapter.replyOpenCode(request)
      },
      async createOpenCode(directory, prompt) {
        if (get().error || get().snapshot?.opencode.status !== 'connected') {
          throw new Error('Conecte o OpenCode antes de criar uma conversa')
        }
        return adapter.createOpenCode(directory, prompt)
      },
      async configureOpenCode(enabled) {
        accept(await adapter.setOpenCode(enabled))
      },
      async configureAntigravity(enabled) {
        accept(await adapter.setAntigravity(enabled))
      },
      connect() {
        consumers++
        if (consumers === 1) {
          set({ snapshot: null, error: null })
          let active = true
          let stop: (() => void) | undefined
          stopConnection = () => {
            active = false
            stop?.()
          }
          const start = async () => {
            try {
              stop = await adapter.listen(
                (value) => {
                  if (!active) return
                  try {
                    accept(value)
                  } catch (error) {
                    fail(error)
                  }
                },
                (error) => {
                  if (active) fail(error)
                }
              )
              if (!active) {
                stop()
                return
              }
              try {
                const snapshot = await adapter.load()
                if (active) accept(snapshot)
              } catch (error) {
                // An initial request failure must not silence a working stream.
                if (active && get().snapshot === null) fail(error)
              }
            } catch (error) {
              stop?.()
              if (active) fail(error)
            }
          }
          void start()
        }
        let disposed = false
        return () => {
          if (disposed) return
          disposed = true
          if (--consumers === 0) stopConnection?.()
        }
      }
    }
  })
}

let instance: ReturnType<typeof createAgentsStore> | undefined
export function getAgentsStore() {
  instance ??= createAgentsStore(
    window.__TAURI_INTERNALS__
      ? createNativeAgentsAdapter()
      : createDemoAgentsAdapter()
  )
  return instance
}
