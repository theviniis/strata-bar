import { expect, it, vi } from 'vitest'
import { createAgentsStore } from '@/stores/agents'
import {
  parseAgentsSnapshot,
  type AgentsAdapter
} from '@/services/system/agents'
import type { AgentsSnapshot } from '@/services/system/agents.generated'

const snapshot = (revision: number): AgentsSnapshot => ({
  version: 3,
  antigravity: { status: 'disabled', sessions: [], error: null },
  revision,
  observedAt: revision * 1000,
  applications: [
    { agent: 'chatgpt', running: true },
    { agent: 'opencode', running: false },
    { agent: 'antigravity', running: false }
  ],
  error: null,
  opencode: { status: 'disabled', sessions: [], hasMore: false, error: null }
})

it('releases a listener that finishes connecting after its consumer closes', async () => {
  let finish: ((stop: () => void) => void) | undefined
  const stop = vi.fn()
  const load = vi.fn(async () => snapshot(1))
  const store = createAgentsStore({
    kind: 'native',
    setAntigravity: async () => snapshot(3),
    createOpenCode: async () => 'ses_created',
    setOpenCode: async () => snapshot(3),
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
    setAntigravity: async () => snapshot(3),
    createOpenCode: async () => 'ses_created',
    setOpenCode: async () => snapshot(3),
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

it('keeps a process enumeration failure separate from the session transport', async () => {
  const value = snapshot(1)
  value.error = 'Process enumeration unavailable'
  value.applications = value.applications.map((application) => ({
    ...application,
    running: null
  }))
  value.opencode.status = 'connected'
  const store = createAgentsStore({
    kind: 'native',
    setAntigravity: async () => snapshot(3),
    createOpenCode: async () => 'ses_created',
    setOpenCode: async () => value,
    listen: async () => () => {},
    load: async () => value
  })
  const disconnect = store.getState().connect()
  await vi.waitFor(() => expect(store.getState().snapshot?.revision).toBe(1))
  expect(store.getState().error).toBeNull()
  expect(store.getState().snapshot?.opencode.status).toBe('connected')
  disconnect()
})

it('rejects snapshots that omit a tool or duplicate its application entry', () => {
  const value = snapshot(1)
  value.applications[1] = { agent: 'chatgpt', running: false }
  expect(() => parseAgentsSnapshot(value)).toThrow()
})

it('accepts Antigravity UUID sessions but rejects sessions assigned to the wrong connector', () => {
  const value = snapshot(1)
  value.antigravity = {
    status: 'connected',
    error: null,
    sessions: [
      {
        id: 'ec33ebf9-0cba-4100-8142-c61503f6c587',
        agent: 'antigravity',
        connectionId: 'antigravity-hooks',
        title: 'Sessão ec33ebf9',
        directory: 'D:\\project',
        status: 'attention',
        updatedAt: 1000
      }
    ]
  }
  expect(parseAgentsSnapshot(value).antigravity.sessions[0].status).toBe(
    'attention'
  )
  value.antigravity.sessions[0].agent = 'opencode'
  expect(() => parseAgentsSnapshot(value)).toThrow()
})

it('rechecks discovery when reopening instead of retaining a previous transport error', async () => {
  let reportError: (error: unknown) => void = () => {}
  const store = createAgentsStore({
    kind: 'native',
    setAntigravity: async () => snapshot(3),
    createOpenCode: async () => 'ses_created',
    setOpenCode: async () => snapshot(3),
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
    setAntigravity: async () => snapshot(3),
    createOpenCode: async () => 'ses_created',
    setOpenCode: async () => snapshot(3),
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

it('keeps live discovery working when the initial snapshot request fails', async () => {
  let publish: (value: AgentsSnapshot) => void = () => {}
  const stop = vi.fn()
  const load = vi.fn(async () => {
    throw new Error('Snapshot request failed')
  })
  const store = createAgentsStore({
    kind: 'native',
    setAntigravity: async () => snapshot(3),
    createOpenCode: async () => 'ses_created',
    setOpenCode: async () => snapshot(3),
    async listen(listener) {
      publish = listener
      listener(snapshot(2))
      return stop
    },
    load
  })
  const disconnect = store.getState().connect()
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce())
  expect(store.getState().snapshot?.revision).toBe(2)
  expect(store.getState().error).toBeNull()
  expect(stop).not.toHaveBeenCalled()
  publish(snapshot(3))
  expect(store.getState().snapshot?.revision).toBe(3)
  disconnect()
  expect(stop).toHaveBeenCalledOnce()
})
