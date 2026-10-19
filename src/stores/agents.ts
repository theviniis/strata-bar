import { create } from 'zustand'
import {
  createDemoAgentsAdapter,
  createNativeAgentsAdapter,
  parseAgentsSnapshot,
  type AgentsAdapter,
  type AgentsSnapshot
} from '@/services/system/agents'

type AgentsState = {
  snapshot: AgentsSnapshot | null
  error: string | null
  connect(): () => void
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
        set({ snapshot, error: snapshot.error })
      }
    }
    let consumers = 0
    let stopConnection: (() => void) | undefined
    return {
      snapshot: null,
      error: null,
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
              const snapshot = await adapter.load()
              if (active) accept(snapshot)
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
