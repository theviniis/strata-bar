import { Spinner } from '@/components/ui/spinner'
import { Component, Suspense, useMemo, type ReactNode } from 'react'
import type { OverlaySide } from '../services/system/overlay'
import { PopupContext } from './context'
import { PopupSurface } from './popup-surface'
import { isPopupId, popupMetadata, resolvePopup } from './resolve'

class ContentBoundary extends Component<
  { children: ReactNode; close(): void },
  { error: string }
> {
  state = { error: '' }
  static getDerivedStateFromError(error: unknown) {
    return { error: String(error) }
  }
  render() {
    return this.state.error ? (
      <div role="alert">
        <p>{this.state.error}</p>
        <button onClick={this.props.close}>Fechar</button>
      </div>
    ) : (
      this.props.children
    )
  }
}

export interface PopupHostProps {
  pinned?: boolean
  onPinChange?(pinned: boolean): void
  id: unknown
  params?: unknown
  mode: 'native' | 'demo'
  session?: string
  side?: OverlaySide
  arrowX?: number
  closing?: boolean
  onExited?(): void
  anchorSize?: { width: number; height: number }
  close(): void
}

export function PopupHost({
  id,
  params,
  mode,
  close,
  ...placement
}: PopupHostProps) {
  const { resolved, error } = useMemo(() => {
    try {
      return { resolved: resolvePopup(id, params), error: '' }
    } catch (e) {
      return { resolved: undefined, error: String(e) }
    }
  }, [id, params])
  const metadata = isPopupId(id) ? popupMetadata(id) : { label: 'Popup' }
  const Content = resolved?.Content
  const side = placement.side ?? 'bottom'
  const closing = placement.closing ?? false
  const content = useMemo(
    () =>
      resolved && Content ? (
        <PopupContext.Provider
          value={{
            id: resolved.id,
            params: resolved.params,
            mode,
            side,
            closing,
            close
          }}
        >
          <ContentBoundary close={close}>
            <Suspense
              fallback={
                <div className="flex items-center gap-2 px-4 py-2 bg-card text-card-foreground rounded">
                  <Spinner />
                  <p>Carregando...</p>
                </div>
              }
            >
              <Content />
            </Suspense>
          </ContentBoundary>
        </PopupContext.Provider>
      ) : null,
    [resolved, Content, mode, side, closing, close]
  )
  return (
    <PopupSurface
      {...placement}
      mode={mode}
      label={metadata.label}
      className={'className' in metadata ? metadata.className : undefined}
      close={close}
      pinnable={id !== 'reminderAlert'}
      closeOnEscape={id !== 'reminderAlert'}
      autoFocus={id !== 'reminderAlert'}
    >
      {mode === 'demo' && (
        <p className="m-4 text-micro text-muted-foreground">
          Demonstração interativa · sem acesso ao Windows
        </p>
      )}
      {resolved && Content ? (
        content
      ) : (
        <div role="alert">
          <p>{error}</p>
          <button onClick={close}>Fechar</button>
        </div>
      )}
    </PopupSurface>
  )
}
