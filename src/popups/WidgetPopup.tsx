import * as Popover from '@radix-ui/react-popover'
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
import { overlay } from '../services/system/overlay'
import { overlayTextClasses } from '../overlay/typography'
import { popupMetadata, type PopupId } from './catalog'
import { resolvePopup, type PopupParams } from './registry'
import { claimPopup, releasePopup } from './coordinator'
import { PopupHost } from './PopupHost'

interface TriggerContextValue {
  native: boolean
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
  const anchor = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const native = overlay.mode === 'native'
  const { open, toggle, triggerRef, error } = useOverlayPopover(
    popup,
    params,
    anchor
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [theme, setTheme] = useState('dark')
  const owner = useId()
  const changePreview = useCallback(
    (next: boolean) => {
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
        claimPopup(owner, () => setPreviewOpen(false))
      } else releasePopup(owner)
      setPreviewOpen(next)
    },
    [popup, params, owner]
  )
  useEffect(() => () => releasePopup(owner), [owner])
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
    open: native ? open : previewOpen,
    triggerRef: setTrigger,
    anchorRef: setAnchor,
    toggle
  }
  const metadata = popupMetadata(popup)
  return (
    <TriggerContext.Provider value={context}>
      {native ? (
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
              collisionPadding={0}
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
                style={{ width: metadata.width, maxWidth: '100vw' }}
              >
                <PreviewContent
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
  close
}: {
  popup: PopupId
  params: unknown
  close(): void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<{
    side: 'top' | 'bottom'
    arrowX?: number
  }>({ side: 'bottom' })
  useEffect(() => {
    const node = root.current
    if (!node) return
    const update = () => {
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
  }, [])
  return (
    <div ref={root}>
      <PopupHost
        id={popup}
        params={params}
        mode="demo"
        {...placement}
        close={close}
      />
      <Popover.Arrow className="invisible" width={0} height={0} />
    </div>
  )
}

function Anchor({
  asChild = false,
  ...props
}: ComponentPropsWithoutRef<'div'> & { asChild?: boolean }) {
  const { native, anchorRef } = useTrigger()
  if (!native)
    return <Popover.Anchor asChild={asChild} {...props} ref={anchorRef} />
  const Component = asChild ? Slot : 'div'
  return <Component {...props} ref={anchorRef} />
}
function Trigger({
  asChild = false,
  onClick,
  ...props
}: ComponentPropsWithoutRef<'button'> & { asChild?: boolean }) {
  const { native, triggerRef, open, toggle } = useTrigger()
  if (!native)
    return (
      <Popover.Trigger
        type="button"
        asChild={asChild}
        {...props}
        onClick={onClick}
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
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) void toggle()
      }}
    />
  )
}

export const WidgetPopup = { Root, Anchor, Trigger }
