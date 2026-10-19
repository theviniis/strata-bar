import { expect, it, vi } from 'vitest'
import { createAgentsStore } from '@/stores/agents'
import {
  parseAgentsSnapshot,
  type AgentsAdapter
} from '@/services/system/agents'
import type { AgentsSnapshot } from '@/services/system/agents.generated'

const snapshot = (revision: number): AgentsSnapshot => ({
  version: 1,
  revision,
  observedAt: revision * 1000,
  applications: [
    { agent: 'chatgpt', running: true },
    { agent: 'opencode', running: false },
    { agent: 'antigravity', running: false }
  ],
  error: null
})

it('releases a listener that finishes connecting after its consumer closes', async () => {
  let finish: ((stop: () => void) => void) | undefined
  const stop = vi.fn()
  const load = vi.fn(async () => snapshot(1))
  const store = createAgentsStore({
    kind: 'native',
    listen: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    load
  })
  const disconnect = store.getState().connect()
  disconnect()
  finish!(stop)
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
  expect(load).not.toHaveBeenCalled()
  expect(store.getState().snapshot).toBeNull()
})

it('reports a native connection failure without populating demo applications', async () => {
  const store = createAgentsStore({
    kind: 'native',
    async listen() {
      throw new Error('Access denied')
    },
    async load() {
      return snapshot(1)
    }
  })
  const disconnect = store.getState().connect()
  await vi.waitFor(() => expect(store.getState().error).toBe('Access denied'))
  expect(store.getState().snapshot).toBeNull()
  disconnect()
})

it('rejects snapshots that omit a tool or duplicate its application entry', () => {
  const value = snapshot(1)
  value.applications[1] = { agent: 'chatgpt', running: false }
  expect(() => parseAgentsSnapshot(value)).toThrow()
})

it('rechecks discovery when reopening instead of retaining a previous transport error', async () => {
  let reportError: (error: unknown) => void = () => {}
  const store = createAgentsStore({
    kind: 'native',
    async listen(_listener, onError) {
      reportError = onError
      return () => {}
    },
    async load() {
      return snapshot(1)
    }
  })
  const disconnect = store.getState().connect()
  await vi.waitFor(() => expect(store.getState().snapshot?.revision).toBe(1))
  reportError('Malformed event')
  disconnect()
  const disconnectAgain = store.getState().connect()
  await vi.waitFor(() => expect(store.getState().error).toBeNull())
  disconnectAgain()
})

it('keeps a live observation when the initial snapshot arrives late', async () => {
  const stop = vi.fn()
  const adapter: AgentsAdapter = {
    kind: 'native',
    async listen(listener) {
      listener(snapshot(2))
      return stop
    },
    async load() {
      return snapshot(1)
    }
  }
  const store = createAgentsStore(adapter)
  const disconnect = store.getState().connect()
  await vi.waitFor(() => expect(store.getState().snapshot?.revision).toBe(2))
  disconnect()
  expect(stop).toHaveBeenCalledOnce()
})
