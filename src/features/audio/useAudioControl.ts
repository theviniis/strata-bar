import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type {
  ChannelData,
  SystemEvent,
  VolumeChange
} from '@/services/system/bridge'

type Volume = ChannelData['volume']
type Intent = { revision: number; value: number | boolean; accepted: boolean }
const fields = ['level', 'muted'] as const

/** One serial writer, with independent revisions for gain and mute. */
class AudioControl {
  private listeners = new Set<() => void>()
  private confirmed: Volume = { level: 0, muted: false }
  private intents: Partial<Record<keyof Volume, Intent>> = {}
  private queued: VolumeChange = {}
  private writing = false
  private revision = 0
  private disposed = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private lastEvent: SystemEvent<Volume> = { status: 'loading' }
  private lastTimestamp = 0
  private error = ''
  private snapshot = { level: 0, muted: false, error: '' }

  private write: (change: VolumeChange) => Promise<Volume> = () =>
    Promise.reject(new Error('Controle de áudio indisponível'))
  constructor(readonly routeKey: string) {}
  setWriter(write: (change: VolumeChange) => Promise<Volume>) {
    this.write = write
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  private emit() {
    if (this.disposed) return
    this.snapshot = {
      level: Number(this.intents.level?.value ?? this.confirmed.level),
      muted: Boolean(this.intents.muted?.value ?? this.confirmed.muted),
      error: this.error
    }
    for (const listener of this.listeners) listener()
  }
  receive(event: SystemEvent<Volume>) {
    if (event.timestamp !== undefined && event.timestamp < this.lastTimestamp)
      return
    this.lastTimestamp = event.timestamp ?? this.lastTimestamp
    this.lastEvent = event
    if (event.status === 'ready') {
      for (const field of fields) {
        const intent = this.intents[field]
        if (!intent?.accepted || intent.value === event.data[field]) {
          this.confirmed = { ...this.confirmed, [field]: event.data[field] }
        }
        if (intent?.accepted && intent.value === event.data[field]) {
          delete this.intents[field]
        }
      }
    }
    this.emit()
  }
  mute = () => this.change({ muted: !this.snapshot.muted })
  setLevel = (level: number) => {
    this.change({ level })
  }
  private change(change: VolumeChange) {
    if (this.disposed || this.lastEvent.status !== 'ready') return
    for (const field of fields) {
      const value = change[field]
      if (value !== undefined) {
        this.intents[field] = {
          value,
          revision: ++this.revision,
          accepted: false
        }
      }
    }
    Object.assign(this.queued, change)
    this.error = ''
    this.emit()
    void this.flush()
  }
  private async flush() {
    if (this.writing || this.disposed || !Object.keys(this.queued).length)
      return
    const change = this.queued
    const sent = { ...this.intents }
    this.queued = {}
    this.writing = true
    try {
      const confirmed = await this.write(change)
      if (this.disposed) return
      this.confirmed = confirmed
      for (const field of fields) {
        const intent = this.intents[field]
        if (
          change[field] !== undefined &&
          intent?.revision === sent[field]?.revision
        ) {
          if (intent) intent.accepted = true
        }
      }
      // An event can arrive before the command reply. Retain protection until
      // its matching observation, so delayed snapshots never undo the gesture.
      if (this.lastEvent.status === 'ready') {
        for (const field of fields) {
          if (
            this.intents[field]?.accepted &&
            this.intents[field]?.value === this.lastEvent.data[field]
          ) {
            delete this.intents[field]
          }
        }
      }
      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        for (const field of fields) {
          if (this.intents[field]?.accepted) delete this.intents[field]
        }
        this.emit()
      }, 1000)
    } catch (error) {
      if (this.disposed) return
      for (const field of fields) {
        if (
          change[field] !== undefined &&
          this.intents[field]?.revision === sent[field]?.revision
        ) {
          delete this.intents[field]
        }
      }
      this.error = String(error)
    } finally {
      this.writing = false
      this.emit()
      if (!this.disposed) void this.flush()
    }
  }
  activate = () => {
    this.disposed = false
  }
  dispose = () => {
    this.disposed = true
    this.queued = {}
    clearTimeout(this.timer)
  }
}

export function useAudioControl(
  event: SystemEvent<Volume>,
  write: (change: VolumeChange) => Promise<Volume>,
  routeKey: string
) {
  const control = useMemo(() => new AudioControl(routeKey), [routeKey])
  useEffect(() => control.setWriter(write), [control, write])
  useEffect(() => {
    control.activate()
    return control.dispose
  }, [control])
  useEffect(() => control.receive(event), [control, event])
  const state = useSyncExternalStore(control.subscribe, control.getSnapshot)
  return {
    ...state,
    mute: control.mute,
    setLevel: control.setLevel
  }
}
