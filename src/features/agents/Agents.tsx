import { Bot } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemTooltip
} from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { getAgentsStore } from '@/stores/agents'
import { useConfig } from '@/stores/config'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'

export function Agents() {
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
        <WidgetItem
          type="button"
          aria-label={
            count > 0
              ? `Abrir agentes de IA, ${count} alertas`
              : 'Abrir agentes de IA'
          }
          aria-describedby={view.tooltip ? tip.describedBy : undefined}
          {...tip.trigger}
        >
          <WidgetItemIcon
            icon={Bot}
            aria-hidden="true"
            className={count > 0 || paused ? 'text-destructive' : undefined}
          />
          <AgentAlertCount count={count} />
          {view.tooltip && (
            <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
          )}
        </WidgetItem>
      </WidgetPopup.Trigger>
    </WidgetPopup.Root>
  )
}

export function AgentAlertCount({ count }: { count: number }) {
  return count > 0 ? (
    <WidgetItemLabel
      aria-label="Alertas de agentes"
      className="font-medium text-destructive tabular-nums"
    >
      {count}
    </WidgetItemLabel>
  ) : null
}
