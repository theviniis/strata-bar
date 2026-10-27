import type {
  MediaAction,
  MediaData,
  MediaRequest
} from '@/services/system/media.generated'

type ActionGroup = 'playback' | 'favorite' | 'volume' | 'shuffle' | 'repeat'
type Identity = Pick<MediaData, 'sessionId' | 'trackId'>
type Job = { action: MediaAction; resolve(success: boolean): void }
type InteractionState = {
  pending: Record<ActionGroup, boolean>
  error: string
  volumeDraft: number | null
  muteDraft: boolean | null
  seekDraft: number | null
  confirmedSeek: { positionMs: number } | null
}

function groupOf(action: MediaAction): ActionGroup {
  switch (action.action) {
    case 'favorite':
      return 'favorite'
    case 'volume':
    case 'mute':
      return 'volume'
    case 'shuffle':
      return 'shuffle'
    case 'repeat':
      return 'repeat'
    default:
      return 'playback'
  }
}

function initialState(): InteractionState {
  return {
    pending: {
      playback: false,
      favorite: false,
      volume: false,
      shuffle: false,
      repeat: false
    },
    error: '',
    volumeDraft: null,
    muteDraft: null,
    seekDraft: null,
    confirmedSeek: null
  }
}

/** One window's music interaction lifetime; transport calls cannot be cancelled. */
export class MusicInteractions {
  private identity: Identity | null
  private state = initialState()
  private listeners = new Set<() => void>()
  private queues = new Map<ActionGroup, Job[]>()
  private epoch = 0
  private active = false
  private volumeEcho: number | null = null
  private muteEcho: boolean | null = null
  private lastVolume: number | null = null
  private volumeTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    identity: Identity | null,
    private send?: (request: MediaRequest) => Promise<unknown>
  ) {
    this.identity = identity
      ? { sessionId: identity.sessionId, trackId: identity.trackId }
      : null
  }

  getSnapshot = () => this.state
  setTransport(send: (request: MediaRequest) => Promise<unknown>) {
    this.send = send
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Reopening creates a new epoch, including React's setup/cleanup replay. */
  open() {
    this.close()
    this.active = true
    const epoch = this.epoch
    return () => {
      if (this.epoch === epoch) this.close()
    }
  }

  setSeek = (positionMs: number | null) => {
    if (this.active && this.identity) this.publish({ seekDraft: positionMs })
  }

  setVolume = (level: number) => {
    void this.dispatch({ action: 'volume', level })
  }

  observeVolume(level: number | null, muted: boolean | null) {
    this.volumeEcho = level
    this.muteEcho = muted
    this.scheduleVolumeReset()
  }

  dispatch = (action: MediaAction): Promise<boolean> => {
    if (!this.active || !this.identity || !this.send)
      return Promise.resolve(false)
    const group = groupOf(action)
    if (
      group !== 'volume' &&
      action.action !== 'seek' &&
      this.state.pending[group]
    )
      return Promise.resolve(false)
    if (action.action === 'volume') {
      if (this.lastVolume === action.level) return Promise.resolve(false)
      this.lastVolume = action.level
      clearTimeout(this.volumeTimer)
      this.publish({ volumeDraft: action.level })
    } else if (action.action === 'mute') {
      this.lastVolume = null
      clearTimeout(this.volumeTimer)
      this.publish({ muteDraft: action.muted })
    }

    return new Promise((resolve) => {
      const queue = this.queues.get(group) ?? []
      const tail = queue.at(-1)
      // Mute is a fence: only consecutive, unsent volume values coalesce.
      if (
        (action.action === 'volume' && tail?.action.action === 'volume') ||
        (action.action === 'seek' && tail?.action.action === 'seek')
      ) {
        queue.pop()!.resolve(false)
      }
      queue.push({ action, resolve })
      this.queues.set(group, queue)
      this.publish({ error: '' })
      if (!this.state.pending[group]) {
        this.publish({ pending: { ...this.state.pending, [group]: true } })
        void this.drain(group, this.epoch)
      }
    })
  }

  private async drain(group: ActionGroup, epoch: number) {
    const queue = this.queues.get(group)!
    while (this.current(epoch) && queue.length) {
      const job = queue.shift()!
      try {
        await this.send!({ ...this.identity!, action: job.action })
        if (!this.current(epoch)) {
          job.resolve(false)
          return
        }
        if (job.action.action === 'seek')
          this.publish({ confirmedSeek: { positionMs: job.action.positionMs } })
        job.resolve(true)
      } catch (error) {
        job.resolve(false)
        if (!this.current(epoch)) return
        for (const queued of queue.splice(0)) queued.resolve(false)
        this.publish({
          error: String(error),
          ...(group === 'volume' ? { volumeDraft: null, muteDraft: null } : {})
        })
        if (group === 'volume') this.lastVolume = null
      }
    }
    if (!this.current(epoch)) return
    this.publish({
      pending: { ...this.state.pending, [group]: false },
      ...(group === 'playback' ? { seekDraft: null } : {})
    })
    if (group === 'volume') this.scheduleVolumeReset()
  }

  private current(epoch: number) {
    return this.active && this.epoch === epoch
  }

  private scheduleVolumeReset() {
    clearTimeout(this.volumeTimer)
    if (
      !this.active ||
      this.state.pending.volume ||
      (this.state.volumeDraft === null && this.state.muteDraft === null)
    )
      return
    const epoch = this.epoch
    this.volumeTimer = setTimeout(
      () => {
        if (!this.current(epoch)) return
        this.lastVolume = null
        this.publish({ volumeDraft: null, muteDraft: null })
      },
      (this.state.volumeDraft === null ||
        this.volumeEcho === this.state.volumeDraft) &&
        (this.state.muteDraft === null ||
          this.muteEcho === this.state.muteDraft)
        ? 0
        : 3000
    )
  }

  private close() {
    this.active = false
    this.epoch += 1
    clearTimeout(this.volumeTimer)
    for (const queue of this.queues.values())
      for (const job of queue.splice(0)) job.resolve(false)
    this.queues.clear()
    this.lastVolume = null
    this.state = initialState()
    for (const listener of this.listeners) listener()
  }

  private publish(patch: Partial<ReturnType<typeof initialState>>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
}
