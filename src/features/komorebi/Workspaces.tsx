import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, Ref } from 'react'
import type { KomorebiWorkspace } from '../../services/system/bridge'

export interface WorkspacesProps {
  workspaces: KomorebiWorkspace[]
  offline: boolean
  onSelect: (workspace: number) => void
  describedBy: string | undefined
  showTitles: boolean
  containerRef: Ref<HTMLDivElement> | undefined
  indicatorRef: Ref<HTMLSpanElement> | undefined
  itemRef:
    ((index: number, element: HTMLButtonElement | null) => void) | undefined
}

const INDICATOR_WIDTH = 24

export function Workspaces({
  workspaces,
  offline,
  onSelect,
  describedBy,
  showTitles,
  containerRef,
  indicatorRef,
  itemRef
}: WorkspacesProps) {
  const activeIndex = workspaces.find(
    (workspace) => workspace.status === 'active'
  )?.index

  if (offline) {
    return (
      <span className="text-micro text-muted-foreground">Komorebi Offline</span>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative flex min-w-0 items-center gap-1.5"
    >
      {workspaces.map((workspace) => (
        <WorkspaceItem
          key={workspace.index}
          ref={(element) => itemRef?.(workspace.index, element)}
          aria-label={`Workspace ${workspace.index + 1} (${workspace.status})`}
          aria-pressed={workspace.status === 'active'}
          aria-describedby={describedBy}
          // The native bar shows the overlay tooltip; only the studio keeps
          // the OS tooltip, where no overlay window exists.
          title={
            showTitles
              ? `${workspace.name ?? `Workspace ${workspace.index + 1}`} · ${workspace.windows} janela(s) · ${workspace.layer}`
              : undefined
          }
          onClick={() => onSelect(workspace.index)}
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
