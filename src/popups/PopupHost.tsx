import { Spinner } from '@/components/ui/spinner'
import { Component, Suspense, type ReactNode } from 'react'
import type { OverlaySide } from '../services/system/overlay'
import { PopupContext } from './context'
import { PopupSurface } from './PopupSurface'
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
  let resolved: ReturnType<typeof resolvePopup> | undefined
  let error = ''
  try {
    resolved = resolvePopup(id, params)
  } catch (e) {
    error = String(e)
  }
  const metadata = isPopupId(id) ? popupMetadata(id) : { label: 'Popup' }
  const Content = resolved?.Content
  return (
    <PopupSurface
      {...placement}
      mode={mode}
      label={metadata.label}
      className={'className' in metadata ? metadata.className : undefined}
      close={close}
      closeOnEscape={id !== 'reminderAlert'}
      autoFocus={id !== 'reminderAlert'}
    >
      {mode === 'demo' && (
        <p className="m-4 text-micro text-muted-foreground">
          Demonstração interativa · sem acesso ao Windows
        </p>
      )}
      {resolved && Content ? (
        <PopupContext.Provider
          value={{
            id: resolved.id,
            params: resolved.params,
            mode,
            side: placement.side ?? 'bottom',
            closing: placement.closing ?? false,
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
      ) : (
        <div role="alert">
          <p>{error}</p>
          <button onClick={close}>Fechar</button>
        </div>
      )}
    </PopupSurface>
  )
}
