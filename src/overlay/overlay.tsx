import { useDocumentTheme } from '@/hooks/use-document-theme'
import { useConfig } from '@/stores/config'
import { themeStyle } from '@/services/theme/palettes'
import { useCallback, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { preparePopup } from '@/popups/prepare'
import { getRemindersStore } from '@/stores/reminders'
import type { OverlayRender, OverlaySnapshot } from '../services/system/overlay'
import { PopupHost } from '../popups/popup-host'
import { warmPopupContents } from '../popups/warmup'
import { overlay } from '../services/system/overlay'
import { TooltipSurface } from './tooltip-surface'
import { overlayTextClasses } from './typography'

/**
 * The overlay window's whole document. It renders one surface at a time and
 * nothing while idle after a finite module warmup: no polling or layout work. Rust owns
 * the window, its size and its position; popup content owns its subscriptions.
 */
export default function Overlay() {
  const [queries] = useState(() => new QueryClient())
  const [render, setRender] = useState<OverlayRender | null>(null)
  const bar = useConfig((state) => state.config.bar)
  const appearance = render?.appearance ?? bar
  const mode = useDocumentTheme(appearance)
  const [closing, setClosing] = useState<string | null>(null)
  const popupSession = render?.popup_session
  const closePopup = useCallback(() => {
    void overlay.hide(popupSession).catch(console.error)
  }, [popupSession])
  const completeExit = useCallback(() => {
    void import('@tauri-apps/api/core')
      .then(({ invoke }) =>
        invoke('overlay_exit_complete', { session: popupSession })
      )
      .catch(console.error)
  }, [popupSession])
  useEffect(() => {
    if (render?.component !== 'reminders') return
    let cancelled = false
    let stop: (() => void) | undefined
    void getRemindersStore()
      .getState()
      .connect()
      .then((dispose) => {
        if (cancelled) dispose()
        else stop = dispose
      })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [render?.popup_session, render?.component])
  useEffect(() => {
    // The overlay is only meaningful inside the native host.
    if (!window.__TAURI_INTERNALS__) return
    let latest = 0
    let cancelled = false
    let dispose: (() => void) | undefined
    let stopWarmup: (() => void) | undefined
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const { getCurrentWebviewWindow } =
          await import('@tauri-apps/api/webviewWindow')
        const target = { target: getCurrentWebviewWindow().label }
        let preparation = 0
        const accept = async (payload: OverlayRender) => {
          if (cancelled) return
          const session = payload.session ?? 0
          if (session < latest) return
          latest = session
          const ticket = ++preparation
          if (
            getCurrentWebviewWindow().label.startsWith('popup-') &&
            payload.component
          ) {
            try {
              await preparePopup(payload.component, queries)
            } catch (error) {
              console.error('Popup preparation', error)
            }
            if (cancelled || ticket !== preparation || session !== latest)
              return
          }
          setClosing(payload.closing ? (payload.popup_session ?? null) : null)
          setRender((current) =>
            current?.popup_session === payload.popup_session &&
            (current?.revision ?? 0) > (payload.revision ?? 0)
              ? current
              : payload
          )
        }
        const stopRender = await listen<OverlayRender>(
          'overlay:render',
          (event) => {
            void accept(event.payload)
          },
          target
        )
        const stopMode = await listen<{
          session: string
          pinned: boolean
          revision: number
          side: OverlayRender['side']
          arrowX: number
        }>(
          'popup:mode',
          ({ payload }) => {
            if (cancelled) return
            setRender((current) => {
              if (
                !current ||
                current.popup_session !== payload.session ||
                payload.revision <= (current.revision ?? 0)
              )
                return current
              return {
                ...current,
                pinned: payload.pinned,
                revision: payload.revision,
                side: payload.side,
                arrowX: payload.arrowX
              }
            })
          },
          target
        )
        const stopClosing = await listen<string>(
          'overlay:closing',
          (event) => {
            if (!cancelled) setClosing(event.payload)
          },
          target
        )
        const stopClear = await listen<number>(
          'overlay:clear',
          (event) => {
            const session = event.payload ?? latest
            if (session < latest) return
            latest = session
            ++preparation
            setClosing(null)
            setRender(null)
          },
          target
        )
        if (cancelled) {
          stopRender()
          stopMode()
          stopClosing()
          stopClear()
        } else {
          dispose = () => {
            stopRender()
            stopMode()
            stopClosing()
            stopClear()
          }
          const { invoke } = await import('@tauri-apps/api/core')
          const prepared = await invoke<OverlaySnapshot | null>('overlay_ready')
          if (!cancelled) stopWarmup = warmPopupContents()
          if (prepared && !cancelled && prepared.session >= latest) {
            if (prepared.render) accept(prepared.render)
            else {
              latest = prepared.session
              setRender(null)
            }
          }
        }
      })
      .catch((error) => console.error('Overlay listener', error))
    return () => {
      cancelled = true
      stopWarmup?.()
      dispose?.()
    }
  }, [queries])
  return (
    // Same typography/colour context as the native bar, so future popovers and
    // tooltip content inherit the bar's text instead of the bare document.
    <QueryClientProvider client={queries}>
      {render && (
        <div
          aria-hidden={render.kind === 'tooltip' ? true : undefined}
          className={`group ${mode} ${overlayTextClasses}`}
          data-theme={mode}
          data-color-theme={appearance.colorTheme}
          style={themeStyle(appearance.colorTheme, mode)}
        >
          {render.kind === 'tooltip' ? (
            <TooltipSurface
              key={render.session}
              text={render.text}
              side={render.side}
              arrowX={render.arrowX}
            />
          ) : render.kind === 'popover' ? (
            <PopupHost
              id={render.component}
              pinned={render.pinned}
              params={render.params}
              mode="native"
              closing={closing !== null && closing === render.popup_session}
              onExited={completeExit}
              close={closePopup}
              key={render.session}
              session={render.popup_session}
              side={render.side}
              arrowX={render.arrowX}
            />
          ) : null}
        </div>
      )}
    </QueryClientProvider>
  )
}
