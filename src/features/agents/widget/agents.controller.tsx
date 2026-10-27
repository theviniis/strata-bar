import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { getAgentsStore } from '@/stores/agents'
import { useConfig } from '@/stores/config'
import { useEffect, useState } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Agents } from './agents.widget'

export function AgentsController() {
  const preview = useWidgetPreview()
  const view = useWidgetView()
  const [useStore] = useState(getAgentsStore)
  const visible = useConfig((state) => state.config.agents.visible)
  const count = useStore((state) =>
    !preview
      ? (state.snapshot?.alerts.items.filter((alert) => visible[alert.agent])
          .length ?? 0)
      : 0
  )
  const paused = useStore(
    (state) => !preview && (state.snapshot?.alerts.paused ?? false)
  )
  useEffect(
    () => (preview ? undefined : useStore.getState().connect()),
    [useStore, preview]
  )
  const text = paused
    ? 'Agentes de IA · novos alertas pausados'
    : count > 0
      ? `Agentes de IA · ${count} alertas`
      : 'Agentes de IA'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="agents">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Agents
            count={count}
            paused={paused}
            describedBy={view.tooltip ? tip.describedBy : undefined}
          />
        </Slot>
      </WidgetPopup.Trigger>
      {view.tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
