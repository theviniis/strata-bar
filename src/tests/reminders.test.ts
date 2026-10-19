import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDemoRemindersAdapter,
  createNativeRemindersAdapter,
  nextReminder,
  parseReminderSnapshot,
  remindersStorageKey,
  type CreateReminder,
  type ReminderSnapshot,
  type RemindersAdapter
} from '@/services/system/reminders'
import { createRemindersStore } from '@/stores/reminders'

const native = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => native.invoke(...args)
}))

const request: CreateReminder = {
  message: 'Tea',
  mode: { type: 'duration', seconds: 60 },
  scheduledAt: null,
  eventDurationSeconds: null
}
const empty = (): ReminderSnapshot => ({
  version: 1,
  revision: 0,
  reminders: []
})

beforeEach(() => {
  localStorage.clear()
  native.invoke.mockReset()
})

describe('reminders persistence and state', () => {
  it('reloads records, snooze and dismissal without changing original event', async () => {
    const adapter = createDemoRemindersAdapter(localStorage, () => 1000)
    const created = await adapter.create(request)
    const original = created.reminders[0]
    expect(original.eventDurationSeconds).toBe(300)
    expect(original.originalAt).toBe(61000)
    const snoozed = await adapter.transition(original.id, '10')
    expect(snoozed.reminders[0]).toMatchObject({
      notifyAt: 601000,
      originalAt: original.originalAt,
      googleEventId: null
    })
    const reloaded = createDemoRemindersAdapter(localStorage, () => 2000)
    expect((await reloaded.load()).revision).toBe(2)
    await reloaded.transition(original.id, null)
    expect((await adapter.load()).reminders[0].status).toBe('dismissed')
    await expect(adapter.transition(original.id, '5')).rejects.toThrow(
      'dismissed'
    )
  })

  it('preserves corrupt and unsupported documents and blocks mutations', async () => {
    const adapter = createDemoRemindersAdapter()
    for (const text of ['broken', JSON.stringify({ ...empty(), version: 2 })]) {
      localStorage.setItem(remindersStorageKey, text)
      await expect(adapter.load()).rejects.toThrow()
      await expect(adapter.create(request)).rejects.toThrow()
      expect(localStorage.getItem(remindersStorageKey)).toBe(text)
    }
  })

  it('does not change stores or publish when persistence fails', async () => {
    const adapter = createDemoRemindersAdapter(localStorage, () => 1000)
    const store = createRemindersStore(adapter)
    const dispose = await store.getState().connect()
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('disk full')
      })
    try {
      expect(await store.getState().create(request)).toBe(false)
      expect(store.getState().snapshot).toEqual(empty())
      expect(store.getState().error).toBe('disk full')
    } finally {
      spy.mockRestore()
      dispose()
    }
  })

  it('synchronizes consumers and disconnects listeners', async () => {
    const adapter = createDemoRemindersAdapter(localStorage, () => 1000)
    const a = createRemindersStore(adapter)
    const b = createRemindersStore(adapter)
    const disposeA = await a.getState().connect()
    const disposeB = await b.getState().connect()
    await a.getState().create(request)
    expect(b.getState().snapshot).toEqual(a.getState().snapshot)
    disposeB()
    await a.getState().snooze(a.getState().snapshot!.reminders[0].id, '5')
    expect(b.getState().snapshot!.revision).toBe(1)
    disposeA()
  })

  it('installs the listener before loading and ignores older initial or mutation snapshots', async () => {
    let listener: (s: ReminderSnapshot) => void = () => {}
    const adapter: RemindersAdapter = {
      kind: 'native',
      listen: async (callback) => {
        listener = callback
        return () => {}
      },
      load: async () => {
        listener({ ...empty(), revision: 2 })
        return empty()
      },
      create: async () => ({ ...empty(), revision: 1 }),
      transition: async () => empty(),
      syncCalendar: async () => empty()
    }
    const store = createRemindersStore(adapter)
    const dispose = await store.getState().connect()
    await store.getState().create(request)
    expect(store.getState().snapshot!.revision).toBe(2)
    dispose()
    listener({ ...empty(), revision: 3 })
    expect(store.getState().snapshot!.revision).toBe(2)
  })

  it('validates date/time and duration inputs and custom event duration', async () => {
    const adapter = createDemoRemindersAdapter(localStorage, () => 1000)
    for (const invalid of [
      { ...request, message: ' ' },
      { ...request, mode: { type: 'duration' as const, seconds: 0 } },
      { ...request, eventDurationSeconds: 900 },
      { ...request, mode: { type: 'dateTime' as const }, scheduledAt: 999 }
    ]) {
      await expect(adapter.create(invalid)).rejects.toThrow()
    }
    const s = await adapter.create({
      ...request,
      mode: { type: 'dateTime' },
      scheduledAt: 10000,
      eventDurationSeconds: 900
    })
    expect(s.reminders[0].eventDurationSeconds).toBe(900)
    expect(s.revision).toBe(1)
    expect(() =>
      parseReminderSnapshot({
        ...s,
        reminders: [s.reminders[0], s.reminders[0]]
      })
    ).toThrow()
  })

  it('counts down only future scheduled reminders strictly below twelve hours', async () => {
    const adapter = createDemoRemindersAdapter(localStorage, () => 1000)
    const r = (await adapter.create(request)).reminders[0]
    const now = 2000
    const hours = 12 * 60 * 60 * 1000
    expect(nextReminder([{ ...r, notifyAt: now }], now)).toBeNull()
    expect(nextReminder([{ ...r, notifyAt: now - 1 }], now)).toBeNull()
    expect(nextReminder([{ ...r, notifyAt: now + hours }], now)).toBeNull()
    expect(
      nextReminder([{ ...r, notifyAt: now + hours - 1 }], now)
    ).not.toBeNull()
    expect(nextReminder([{ ...r, status: 'dismissed' }], now)).toBeNull()
    expect(nextReminder([{ ...r, status: 'ringing' }], now)).toBeNull()
    expect(
      nextReminder(
        [
          { ...r, notifyAt: now + 200 },
          { ...r, notifyAt: now + 100 }
        ],
        now
      )?.notifyAt
    ).toBe(now + 100)
  })

  it('reports native failure without accessing demo persistence', async () => {
    native.invoke.mockRejectedValue(new Error('native unavailable'))
    const adapter = createNativeRemindersAdapter()
    const spy = vi.spyOn(Storage.prototype, 'getItem')
    try {
      await expect(adapter.load()).rejects.toThrow('native unavailable')
      await expect(adapter.create(request)).rejects.toThrow(
        'native unavailable'
      )
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('receives validated storage events from another studio window', async () => {
    const adapter = createDemoRemindersAdapter(localStorage, () => 1000)
    const store = createRemindersStore(adapter)
    const dispose = await store.getState().connect()
    const external = createDemoRemindersAdapter(localStorage, () => 1000)
    const changed = await external.create(request)
    expect(store.getState().snapshot!.revision).toBe(0)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: remindersStorageKey,
        storageArea: localStorage,
        newValue: JSON.stringify(changed)
      })
    )
    expect(store.getState().snapshot).toEqual(changed)
    localStorage.setItem(remindersStorageKey, 'corrupt')
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: remindersStorageKey,
        storageArea: localStorage,
        newValue: 'corrupt'
      })
    )
    expect(store.getState().error).not.toBeNull()
    expect(store.getState().snapshot).toEqual(changed)
    dispose()
  })

  it('the demo scheduler persists overdue notifications and wakes again only after snooze', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const adapter = createDemoRemindersAdapter()
    const store = createRemindersStore(adapter)
    const dispose = await store.getState().connect()
    const stop = store.getState().startDemoScheduler()
    try {
      await store
        .getState()
        .create({ ...request, mode: { type: 'duration', seconds: 1 } })
      await vi.advanceTimersByTimeAsync(1000)
      const r = store.getState().snapshot!.reminders[0]
      expect(r.status).toBe('ringing')
      expect(
        (await createDemoRemindersAdapter().load()).reminders[0].status
      ).toBe('ringing')
      const revision = store.getState().snapshot!.revision
      await vi.advanceTimersByTimeAsync(5000)
      expect(store.getState().snapshot!.revision).toBe(revision)
      await store.getState().snooze(r.id, '5')
      expect(store.getState().snapshot!.reminders[0].status).toBe('scheduled')
      await vi.advanceTimersByTimeAsync(300_000)
      expect(store.getState().snapshot!.reminders[0].status).toBe('ringing')
      expect(store.getState().snapshot!.reminders[0].originalAt).toBe(
        r.originalAt
      )
      await store.getState().dismiss(r.id)
      await vi.advanceTimersByTimeAsync(1000)
      expect(store.getState().snapshot!.reminders[0].status).toBe('dismissed')
    } finally {
      stop()
      dispose()
      vi.useRealTimers()
    }
  })
})
