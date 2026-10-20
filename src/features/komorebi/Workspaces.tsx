import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import { useLayoutEffect, useRef, type ComponentProps } from 'react'
import type { KomorebiWorkspace } from '../../services/system/bridge'
import { overlay } from '../../services/system/overlay'

interface WorkspacesProps {
  workspaces: KomorebiWorkspace[]
  offline?: boolean
  onSelect?: (workspace: number) => void
  describedBy?: string
}

const INDICATOR_WIDTH = 24
const ANIMATION_DURATION = 450

export function Workspaces({
  workspaces,
  offline = false,
  onSelect,
  describedBy
}: WorkspacesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const itemsRef = useRef(new Map<number, HTMLButtonElement>())

  const previousIndexRef = useRef<number | null>(null)
  const animationRef = useRef<Animation | null>(null)

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.status === 'active'
  )

  const activeIndex = activeWorkspace?.index

  useLayoutEffect(() => {
    const container = containerRef.current
    const indicator = indicatorRef.current

    if (!container || !indicator || activeIndex === undefined) {
      return
    }

    const target = itemsRef.current.get(activeIndex)

    if (!target) return

    const getPosition = (element: HTMLElement) =>
      element.offsetLeft + element.offsetWidth / 2 - INDICATOR_WIDTH / 2

    const targetX = getPosition(target)
    const previousIndex = previousIndexRef.current

    // Initial render: position without animation
    if (previousIndex === null) {
      indicator.style.left = `${targetX}px`
      indicator.style.width = `${INDICATOR_WIDTH}px`
      previousIndexRef.current = activeIndex
      return
    }

    if (previousIndex === activeIndex) return

    // Capture current visual position before interrupting
    // an existing animation.
    const indicatorRect = indicator.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const fromLeft = indicatorRect.left - containerRect.left
    const fromRight = fromLeft + indicatorRect.width

    const toLeft = targetX
    const toRight = targetX + INDICATOR_WIDTH

    animationRef.current?.cancel()

    const movingRight = toLeft > fromLeft

    // Stretch towards the destination.
    const stretchedLeft = movingRight ? fromLeft : toLeft

    const stretchedRight = movingRight ? toRight : fromRight

    const stretchedWidth = stretchedRight - stretchedLeft

    const animation = indicator.animate(
      [
        {
          left: `${fromLeft}px`,
          width: `${fromRight - fromLeft}px`,
          offset: 0,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        },
        {
          left: `${stretchedLeft}px`,
          width: `${stretchedWidth}px`,
          offset: 0.5,
          easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)'
        },
        {
          left: `${toLeft}px`,
          width: `${INDICATOR_WIDTH}px`,
          offset: 1
        }
      ],
      {
        duration: ANIMATION_DURATION,
        fill: 'forwards'
      }
    )

    animationRef.current = animation
    previousIndexRef.current = activeIndex

    animation.onfinish = () => {
      indicator.style.left = `${targetX}px`
      indicator.style.width = `${INDICATOR_WIDTH}px`

      animation.cancel()

      if (animationRef.current === animation) {
        animationRef.current = null
      }
    }
  }, [activeIndex])

  if (offline) {
    return <span className="text-[10px] text-[#7d7a8c]">Komorebi Offline</span>
  }

  return (
    <div
      ref={containerRef}
      className="relative flex min-w-0 items-center gap-1.5"
    >
      {workspaces.map((workspace) => (
        <WorkspaceItem
          key={workspace.index}
          ref={(element) => {
            if (element) {
              itemsRef.current.set(workspace.index, element)
            } else {
              itemsRef.current.delete(workspace.index)
            }
          }}
          aria-label={`Workspace ${workspace.index + 1} (${workspace.status})`}
          aria-pressed={workspace.status === 'active'}
          aria-describedby={describedBy}
          // The native bar shows the overlay tooltip; only the studio keeps
          // the OS tooltip, where no overlay window exists.
          title={
            overlay.mode === 'demo'
              ? `${workspace.name ?? `Workspace ${workspace.index + 1}`} · ${workspace.windows} janela(s) · ${workspace.layer}`
              : undefined
          }
          onClick={() => onSelect?.(workspace.index)}
          isActive={workspace.status === 'active'}
        />
      ))}

      {activeIndex !== undefined && (
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 z-10',
            'h-3 -translate-y-1/2 rounded-full bg-secondary'
          )}
          style={{
            width: INDICATOR_WIDTH,
            left: 0
          }}
        />
      )}
    </div>
  )
}

const workspaceVariants = cva(
  'relative h-3 shrink-0 rounded-full cursor-pointer',
  {
    variants: {
      isActive: {
        true: 'w-6 bg-transparent',
        false: 'w-3 bg-muted hover:bg-muted-foreground/50'
      }
    },
    defaultVariants: {
      isActive: false
    }
  }
)

interface WorkspaceItemProps
  extends
    Omit<ComponentProps<'button'>, 'children'>,
    VariantProps<typeof workspaceVariants> {}

function WorkspaceItem({ className, isActive, ...props }: WorkspaceItemProps) {
  return (
    <button
      type="button"
      className={cn(workspaceVariants({ isActive, className }))}
      {...props}
    />
  )
}
