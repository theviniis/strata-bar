import * as Popover from '@radix-ui/react-popover'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import { Slot } from '@radix-ui/react-slot'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode
} from 'react'
import { useOverlayPopover } from '../hooks/useOverlayPopover'
import { cn } from '../lib/utils'
import { overlayTextClasses } from '../overlay/typography'
import { overlay } from '../services/system/overlay'
import { POPUP_GAP } from './constants'
import { claimPopup, releasePopup } from './coordinator'
import { bouncePopupAnchor } from './motion'
import { PopupHost } from './PopupHost'
import { resolvePopup, type PopupId, type PopupParams } from './resolve'

interface TriggerContextValue {
  native: boolean
  preview: boolean
  open: boolean
  triggerRef(node: HTMLElement | null): void
  anchorRef(node: HTMLElement | null): void
  toggle(): Promise<void>
}
const TriggerContext = createContext<TriggerContextValue | null>(null)
function useTrigger() {
  const context = useContext(TriggerContext)
  if (!context)
    throw new Error('WidgetPopup.Trigger/Anchor require WidgetPopup.Root')
  return context
}

type RootProps<K extends PopupId> = {
  popup: K
  children: ReactNode
} & (undefined extends PopupParams<K>
  ? { params?: PopupParams<K> }
  : { params: PopupParams<K> })

function Root<K extends PopupId>({ popup, params, children }: RootProps<K>) {
  const preview = useWidgetPreview()
  const anchor = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const native = overlay.mode === 'native'
  const { open, toggle, triggerRef, error } = useOverlayPopover(
    popup,
    params,
    anchor
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewClosing, setPreviewClosing] = useState(false)
  const previewClosingRef = useRef(false)
  const bounce = useRef<ReturnType<typeof bouncePopupAnchor>>(undefined)
  const [previewError, setPreviewError] = useState('')
  const [theme, setTheme] = useState('dark')
  const owner = useId()
  const changePreview = useCallback(
    (next: boolean) => {
      if (preview) return
      if (!next) {
        previewClosingRef.current = true
        setPreviewClosing(true)
        return
      }
      bounce.current?.complete()
      previewClosingRef.current = false
      setPreviewClosing(false)
      if (next) {
        try {
          resolvePopup(popup, params)
        } catch (e) {
          setPreviewError(String(e))
          return
        }
        setPreviewError('')
        setTheme(
          trigger.current
            ?.closest('[data-theme]')
            ?.getAttribute('data-theme') ?? 'dark'
        )
        claimPopup(owner, () => {
          previewClosingRef.current = false
          setPreviewOpen(false)
          setPreviewClosing(false)
        })
      } else releasePopup(owner)
      setPreviewOpen(next)
    },
    [popup, params, owner, preview]
  )
  useEffect(
    () => () => {
      bounce.current?.stop()
      releasePopup(owner)
    },
    [owner]
  )
  const setAnchor = useCallback((node: HTMLElement | null) => {
    anchor.current = node
  }, [])
  const setTrigger = useCallback(
    (node: HTMLElement | null) => {
      trigger.current = node
      triggerRef(node)
    },
    [triggerRef]
  )
  const context = {
    native,
    preview,
    open: native ? open : previewOpen,
    triggerRef: setTrigger,
    anchorRef: setAnchor,
    toggle
  }
  return (
    <TriggerContext.Provider value={context}>
      {native || preview ? (
        children
      ) : (
        <Popover.Root open={previewOpen} onOpenChange={changePreview}>
          {children}
          <Popover.Portal>
            <Popover.Content
              asChild
              role="presentation"
              side="bottom"
              align="center"
              sideOffset={0}
              collisionPadding={{ left: POPUP_GAP, right: POPUP_GAP }}
              sticky="always"
              onEscapeKeyDown={(event) => {
                event.preventDefault()
                changePreview(false)
                trigger.current?.focus()
              }}
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => {
                event.preventDefault()
              }}
            >
              <div
                data-theme={theme}
                className={`group z-50 ${overlayTextClasses}`}
              >
                <PreviewContent
                  closing={previewClosing}
                  anchor={anchor}
                  trigger={trigger}
                  onExited={() => {
                    if (!previewClosingRef.current) return
                    previewClosingRef.current = false
                    setPreviewOpen(false)
                    setPreviewClosing(false)
                    releasePopup(owner)
                    bounce.current?.stop()
                    bounce.current = bouncePopupAnchor(
                      anchor.current ?? trigger.current
                    )
                  }}
                  popup={popup}
                  params={params}
                  close={() => {
                    changePreview(false)
                    trigger.current?.focus()
                  }}
                />
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {(error || previewError) && (
        <span role="alert">{error || previewError}</span>
      )}
    </TriggerContext.Provider>
  )
}

/** Read Radix's collision-adjusted arrow location, including edge constraints. */
function PreviewContent({
  popup,
  params,
  closing,
  anchor,
  trigger,
  onExited,
  close
}: {
  popup: PopupId
  params: unknown
  closing: boolean
  anchor: React.RefObject<HTMLElement | null>
  trigger: React.RefObject<HTMLElement | null>
  onExited(): void
  close(): void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [anchorSize, setAnchorSize] = useState<{
    width: number
    height: number
  }>()
  const [placement, setPlacement] = useState<{
    side: 'top' | 'bottom'
    arrowX?: number
  }>({ side: 'bottom' })
  useEffect(() => {
    const node = root.current
    if (!node) return
    const update = () => {
      const rect = (anchor.current ?? trigger.current)?.getBoundingClientRect()
      if (rect)
        setAnchorSize((old) =>
          old?.width === rect.width && old?.height === rect.height
            ? old
            : { width: rect.width, height: rect.height }
        )
      const content = node.closest('[data-radix-popper-content-wrapper]')
        ?.firstElementChild as HTMLElement | null
      if (!content) return
      const origin = getComputedStyle(content)
        .getPropertyValue('--radix-popover-content-transform-origin')
        .split(' ')[0]
      const arrowX = Number.parseFloat(origin)
      const side = content.dataset.side === 'top' ? 'top' : 'bottom'
      setPlacement((old) =>
        old.side === side && old.arrowX === arrowX
          ? old
          : { side, arrowX: Number.isFinite(arrowX) ? arrowX : undefined }
      )
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(update)
    observer?.observe(node)
    const mutation = new MutationObserver(update)
    if (node.parentElement)
      mutation.observe(node.parentElement, {
        attributes: true,
        attributeFilter: ['style', 'data-side']
      })
    update()
    return () => {
      observer?.disconnect()
      mutation.disconnect()
    }
  }, [anchor, trigger])
  return (
    <div ref={root}>
      <PopupHost
        id={popup}
        params={params}
        mode="demo"
        closing={closing}
        onExited={onExited}
        anchorSize={anchorSize}
        {...placement}
        close={close}
      />
      <Popover.Arrow className="invisible" width={0} height={0} />
    </div>
  )
}

function Anchor({
  asChild = false,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & { asChild?: boolean }) {
  const { native, preview, anchorRef, open } = useTrigger()
  const anchorProps = {
    ...props,
    'data-popup-open': open,
    className: cn(
      !asChild && 'rounded',
      'data-[popup-open=true]:bg-muted',
      className
    )
  }
  if (!native && !preview)
    return <Popover.Anchor asChild={asChild} {...anchorProps} ref={anchorRef} />
  const Component = asChild ? Slot : 'div'
  return <Component {...anchorProps} ref={anchorRef} />
}
function Trigger({
  asChild = false,
  className,
  onClick,
  ...props
}: ComponentPropsWithoutRef<'button'> & { asChild?: boolean }) {
  const { native, preview, triggerRef, open, toggle } = useTrigger()
  if (!native && !preview)
    return (
      <Popover.Trigger
        type="button"
        asChild={asChild}
        {...props}
        onClick={onClick}
        data-popup-open={open}
        className={cn(
          !asChild && 'rounded',
          'data-[popup-open=true]:bg-muted',
          className
        )}
        ref={triggerRef}
      />
    )
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      type="button"
      {...props}
      ref={triggerRef}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-popup-open={open}
      className={cn(
        !asChild && 'rounded',
        'data-[popup-open=true]:bg-muted',
        className
      )}
      onClick={(event) => {
        if (preview) {
          event.preventDefault()
          return
        }
        onClick?.(event)
        if (!event.defaultPrevented) void toggle()
      }}
    />
  )
}

export const WidgetPopup = { Root, Anchor, Trigger }
