import { claimPopup, releasePopup } from './coordinator'

export type PopupClosed = {
  session: string
  docked?: boolean
  restoreFocus?: boolean
  attached?: boolean
  reattach?: boolean
  revision?: number
  widget?: string
  component?: string
}

export type PopupLifetimeAdapter = {
  mode: 'native' | 'demo'
  /** Validate and measure before replacing another owner. */
  prepare(): ((session: string) => void | Promise<unknown>) | undefined
  hide(session: string): void | Promise<unknown>
  beforeOpen(): void
  dock(): void
  cleanup(): void
  restoreFocus(): void
}

/** One widget's ownership in its document; native cross-window ownership stays native. */
export class PopupLifetime {
  private owner = crypto.randomUUID()
  private active: string | null = null
  private exiting: string | null = null
  private state = { open: false, closing: false, error: '', session: '' }
  private listeners = new Set<() => void>()

  constructor(private adapter: PopupLifetimeAdapter) {}

  setAdapter(adapter: PopupLifetimeAdapter) {
    this.adapter = adapter
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.state

  private ownership(session: string) {
    // Studio retains one owner across reopening during its exit animation.
    return this.adapter.mode === 'native' ? session : this.owner
  }

  private update(patch: Partial<typeof this.state>) {
    const next = { ...this.state, ...patch }
    if (
      next.open === this.state.open &&
      next.closing === this.state.closing &&
      next.error === this.state.error &&
      next.session === this.state.session
    )
      return
    this.state = next
    this.listeners.forEach((listener) => listener())
  }

  toggle = () => this.setOpen(!this.active)

  /** Transfer ownership without requesting a close of the detached surface. */
  detach = () => {
    if (this.active) releasePopup(this.ownership(this.active))
    this.active = null
    this.exiting = null
    this.update({ open: false, closing: false })
  }

  attach = (session: string) => {
    this.active = session
    this.exiting = null
    claimPopup(this.ownership(session), () => {
      void this.setOpen(false).catch(console.error)
    })
    this.update({ open: true, closing: false, session })
  }

  setOpen = async (next: boolean): Promise<void> => {
    if (!next) {
      const session = this.active
      if (this.adapter.mode === 'demo') {
        // Radix keeps the content and ownership until its exit completes.
        this.update({ closing: true })
      } else {
        if (session) this.exiting = session
        this.active = null
        this.update({ open: false })
        if (session) {
          releasePopup(this.ownership(session))
          await this.adapter.hide(session)
        }
      }
      return
    }

    this.adapter.beforeOpen()
    this.exiting = null
    const session = crypto.randomUUID()
    const native = this.adapter.mode === 'native'
    if (native) {
      this.active = session
      this.update({ error: '' })
    } else this.update({ closing: false })
    let claimed = false
    try {
      const show = this.adapter.prepare()
      if (!show) {
        if (this.active === session) this.active = null
        return
      }
      this.active = session
      if (!native) this.update({ error: '' })
      claimPopup(this.ownership(session), () => {
        if (native) void this.setOpen(false).catch(console.error)
        else {
          // Studio replacement removes the old content without docking it.
          this.active = null
          this.update({ open: false, closing: false })
        }
      })
      claimed = true
      const shown = show(session)
      if (native) await shown
      if (this.active === session) this.update({ open: true, session })
    } catch (error) {
      if (this.active === session) this.active = null
      if (native || claimed) releasePopup(this.ownership(session))
      // Preserve existing error reporting, including a late native rejection.
      this.update({ error: String(error) })
    }
  }

  closed = ({ session, docked, restoreFocus }: PopupClosed) => {
    if (this.adapter.mode === 'demo' && !this.state.closing) return
    if (session !== this.active && session !== this.exiting) return
    if (docked && (!this.active || this.active === session)) this.adapter.dock()
    this.exiting = null
    if (this.active && this.active !== session) return
    releasePopup(this.ownership(session))
    this.active = null
    this.update({ open: false, closing: false })
    if (restoreFocus) this.adapter.restoreFocus()
  }

  dispose = () => {
    this.adapter.cleanup()
    const session = this.active
    this.active = null
    this.exiting = null
    if (session) {
      releasePopup(this.ownership(session))
      if (this.adapter.mode === 'native')
        void Promise.resolve(this.adapter.hide(session)).catch(console.error)
    }
  }
}
