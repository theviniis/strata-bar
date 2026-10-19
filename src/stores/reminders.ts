import { create } from 'zustand'
import {
  createDemoRemindersAdapter,
  createNativeRemindersAdapter,
  parseReminderSnapshot,
  type CreateReminder,
  type ReminderSnapshot,
  type RemindersAdapter,
  type SnoozeOption
} from '@/services/system/reminders'

type RemindersState = {
  source: RemindersAdapter['kind']
  snapshot: ReminderSnapshot | null
  error: string | null
  connect(): Promise<() => void>
  create(request: CreateReminder): Promise<boolean>
  dismiss(id: string): Promise<boolean>
  snooze(id: string, option: SnoozeOption): Promise<boolean>
  syncCalendar(id: string): Promise<boolean>
  startDemoScheduler(): () => void
}

export function createRemindersStore(adapter: RemindersAdapter) {
  return create<RemindersState>((set, get) => {
    const fail = (error: unknown) => {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
    const accept = (value: ReminderSnapshot) => {
      const snapshot = parseReminderSnapshot(value)
      const previous = get().snapshot
      if (previous === null || snapshot.revision > previous.revision) {
        set({ snapshot, error: null })
      }
    }
    const mutate = async (operation: () => Promise<ReminderSnapshot>) => {
      try {
        accept(await operation())
        set({ error: null })
        return true
      } catch (error) {
        fail(error)
        return false
      }
    }
    return {
      source: adapter.kind,
      snapshot: null,
      error: null,
      startDemoScheduler() {
        if (adapter.kind !== 'demo' || !adapter.tick) return () => {}
        let active = true
        let inFlight = false
        const tick = async () => {
          if (
            !active ||
            inFlight ||
            !get().snapshot?.reminders.some(
              (r) => r.status === 'scheduled' && r.notifyAt <= Date.now()
            )
          )
            return
          inFlight = true
          try {
            const snapshot = await adapter.tick!()
            if (active) accept(snapshot)
          } catch (error) {
            if (active) fail(error)
          } finally {
            inFlight = false
          }
        }
        void tick()
        const timer = setInterval(() => void tick(), 1000)
        return () => {
          active = false
          clearInterval(timer)
        }
      },
      async connect() {
        let unlisten: (() => void) | undefined
        let active = true
        try {
          unlisten = await adapter.listen(
            (snapshot) => {
              if (!active) return
              try {
                accept(snapshot)
              } catch (error) {
                fail(error)
              }
            },
            (error) => {
              if (active) fail(error)
            }
          )
          accept(await adapter.load())
          set({ error: null })
        } catch (error) {
          unlisten?.()
          active = false
          fail(error)
        }
        return () => {
          active = false
          unlisten?.()
        }
      },
      create: (request) => mutate(() => adapter.create(request)),
      dismiss: (id) => mutate(() => adapter.transition(id, null)),
      snooze: (id, option) => mutate(() => adapter.transition(id, option)),
      syncCalendar: (id) => mutate(() => adapter.syncCalendar(id))
    }
  })
}

let instance: ReturnType<typeof createRemindersStore> | undefined

// Lazy initialization keeps storage access inside the connection lifecycle.
export function getRemindersStore() {
  instance ??= createRemindersStore(
    window.__TAURI_INTERNALS__
      ? createNativeRemindersAdapter()
      : createDemoRemindersAdapter()
  )
  return instance
}

export function useReminders<T>(selector: (state: RemindersState) => T): T {
  const useStore = getRemindersStore()
  return useStore(selector)
}
