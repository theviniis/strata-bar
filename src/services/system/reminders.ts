import { z } from 'zod'
import type {
  CreateReminder,
  Reminder,
  ReminderSnapshot,
  SnoozeOption
} from './reminders.generated'

export type {
  CreateReminder,
  Reminder,
  ReminderMode,
  ReminderSnapshot,
  SnoozeOption
} from './reminders.generated'

const instant = z.number().int().min(0).max(8_640_000_000_000_000)
const seconds = z.number().int().min(1).max(4_294_967_295)
const mode = z.discriminatedUnion('type', [
  z.object({ type: z.literal('duration'), seconds }).strict(),
  z.object({ type: z.literal('dateTime') }).strict()
])
const message = z.string().refine((value) => {
  const length = Array.from(value.trim()).length
  return length > 0 && Array.from(value).length <= 2000
}, 'Message must contain 1–2000 characters')
const reminder: z.ZodType<Reminder> = z
  .object({
    id: z.uuid(),
    message,
    mode,
    originalAt: instant,
    notifyAt: instant,
    eventDurationSeconds: seconds,
    status: z.enum(['scheduled', 'ringing', 'dismissed']),
    createdAt: instant,
    updatedAt: instant,
    googleEventId: z.string().nullable(),
    calendarRequested: z.boolean().default(false),
    calendarError: z.string().nullable().default(null)
  })
  .strict()
  .refine(
    (r) =>
      r.updatedAt >= r.createdAt &&
      (r.mode.type !== 'duration' || r.eventDurationSeconds === 300)
  )
const snapshot: z.ZodType<ReminderSnapshot> = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(0).max(4_294_967_295),
    reminders: z.array(reminder)
  })
  .strict()
  .refine(
    (s) => new Set(s.reminders.map((r) => r.id)).size === s.reminders.length
  )

export function parseReminderSnapshot(value: unknown): ReminderSnapshot {
  return snapshot.parse(value)
}

export const snoozeOptions = [
  '5',
  '10',
  '15',
  '30'
] as const satisfies readonly SnoozeOption[]
export const remindersStorageKey = 'strata.reminders.v1'

export interface RemindersAdapter {
  readonly kind: 'native' | 'demo'
  load(): Promise<ReminderSnapshot>
  listen(
    listener: (snapshot: ReminderSnapshot) => void,
    onError: (error: unknown) => void
  ): Promise<() => void>
  create(request: CreateReminder): Promise<ReminderSnapshot>
  transition(id: string, snooze: SnoozeOption | null): Promise<ReminderSnapshot>
  syncCalendar(id: string): Promise<ReminderSnapshot>
  tick?(): Promise<ReminderSnapshot>
}

export function createNativeRemindersAdapter(): RemindersAdapter {
  return {
    kind: 'native',
    async load() {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseReminderSnapshot(await invoke('reminders_snapshot'))
    },
    async listen(listener, onError) {
      const { listen } = await import('@tauri-apps/api/event')
      const stopSnapshot = await listen<ReminderSnapshot>(
        'reminders:snapshot',
        (event) => {
          try {
            listener(parseReminderSnapshot(event.payload))
          } catch (error) {
            onError(error)
          }
        }
      )
      try {
        const stopErrors = await listen<string>('reminders:error', (event) =>
          onError(event.payload)
        )
        return () => {
          stopSnapshot()
          stopErrors()
        }
      } catch (error) {
        stopSnapshot()
        throw error
      }
    },
    async create(request) {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseReminderSnapshot(
        await invoke('reminders_create', { request })
      )
    },
    async transition(id, snooze) {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseReminderSnapshot(
        await invoke('reminders_transition', { id, snooze })
      )
    },
    async syncCalendar(id) {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseReminderSnapshot(
        await invoke('reminders_calendar_sync', { id })
      )
    }
  }
}

// Studio-only persistence; never selected after a native operation fails.
export function createDemoRemindersAdapter(
  storage?: Storage,
  clock: () => number = () => Date.now()
): RemindersAdapter {
  const listeners = new Set<(snapshot: ReminderSnapshot) => void>()
  const getStorage = () => storage ?? window.localStorage
  const load = () => {
    const text = getStorage().getItem(remindersStorageKey)
    return parseReminderSnapshot(
      text === null
        ? { version: 1, revision: 0, reminders: [] }
        : JSON.parse(text)
    )
  }
  const change = (edit: (s: ReminderSnapshot, at: number) => void) => {
    const next = load()
    edit(next, instant.parse(clock()))
    next.revision++
    const validated = parseReminderSnapshot(next)
    getStorage().setItem(remindersStorageKey, JSON.stringify(validated))
    for (const listener of listeners) listener(structuredClone(validated))
    return validated
  }
  return {
    kind: 'demo',
    async load() {
      return load()
    },
    async listen(listener, onError) {
      listeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        if (event.key === remindersStorageKey) {
          // Reload through the same validation used for startup.
          try {
            if (event.storageArea === getStorage()) listener(load())
          } catch (error) {
            onError(error)
          }
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
    async create(request) {
      if (request.syncCalendar)
        throw new Error('Google Calendar está disponível na barra nativa')
      return change((s, at) => {
        const parsedMode = mode.parse(request.mode)
        const duration = parsedMode.type === 'duration'
        if (
          duration &&
          (request.scheduledAt !== null ||
            (request.eventDurationSeconds !== null &&
              request.eventDurationSeconds !== 300))
        ) {
          throw new Error('Duration reminders use a fixed five-minute event')
        }
        const originalAt = instant.parse(
          parsedMode.type === 'duration'
            ? at + parsedMode.seconds * 1000
            : request.scheduledAt
        )
        if (originalAt <= at) throw new Error('Reminder must be in the future')
        s.reminders.push({
          id: crypto.randomUUID(),
          message: message.parse(request.message).trim(),
          mode: parsedMode,
          originalAt,
          notifyAt: originalAt,
          eventDurationSeconds: duration
            ? 300
            : seconds.parse(request.eventDurationSeconds),
          status: 'scheduled',
          createdAt: at,
          updatedAt: at,
          googleEventId: null,
          calendarRequested: false,
          calendarError: null
        })
      })
    },
    async transition(id, snooze) {
      return change((s, at) => {
        const r = s.reminders.find((r) => r.id === id)
        if (!r) throw new Error('Reminder not found')
        if (r.status === 'dismissed')
          throw new Error('Reminder already dismissed')
        if (snooze !== null) {
          z.enum(snoozeOptions).parse(snooze)
          r.notifyAt = at + Number(snooze) * 60_000
          r.status = 'scheduled'
        } else {
          r.status = 'dismissed'
        }
        r.updatedAt = Math.max(at, r.createdAt)
      })
    },
    async syncCalendar() {
      throw new Error('Google Calendar está disponível na barra nativa')
    },
    async tick() {
      const snapshot = load()
      const at = instant.parse(clock())
      if (
        !snapshot.reminders.some(
          (r) => r.status === 'scheduled' && r.notifyAt <= at
        )
      )
        return snapshot
      return change((s) => {
        for (const r of s.reminders) {
          if (r.status === 'scheduled' && r.notifyAt <= at) {
            r.status = 'ringing'
            r.updatedAt = Math.max(r.updatedAt, at)
          }
        }
      })
    }
  }
}

export function nextReminder(
  reminders: readonly Reminder[],
  now: number
): Reminder | null {
  return reminders.reduce<Reminder | null>((next, r) => {
    const remaining = r.notifyAt - now
    return r.status === 'scheduled' &&
      remaining > 0 &&
      remaining < 12 * 60 * 60 * 1000 &&
      (!next || r.notifyAt < next.notifyAt)
      ? r
      : next
  }, null)
}
