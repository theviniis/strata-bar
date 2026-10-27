import { MotionConfig } from 'motion/react'
import type { ReactNode, SyntheticEvent } from 'react'
import { WidgetPreviewContext } from './widget-preview-context'

function blockInteraction(event: SyntheticEvent) {
  event.preventDefault()
  event.stopPropagation()
}

/** Explicit sample runtime shared by every frozen bar and widget preview. */
export function WidgetPreviewRuntime({ children }: { children: ReactNode }) {
  return (
    <WidgetPreviewContext value={true}>
      <MotionConfig reducedMotion="always">
        <div
          inert
          aria-hidden="true"
          className="contents"
          onClickCapture={blockInteraction}
          onDoubleClickCapture={blockInteraction}
          onKeyDownCapture={blockInteraction}
          onPointerDownCapture={blockInteraction}
          onContextMenuCapture={blockInteraction}
        >
          {children}
        </div>
      </MotionConfig>
    </WidgetPreviewContext>
  )
}
