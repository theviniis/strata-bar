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

export function Agents() {
  const [useStore] = useState(getAgentsStore)
  const visible = useConfig((state) => state.config.agents.visible)
  const count = useStore(
    (state) =>
      state.snapshot?.alerts.items.filter((alert) => visible[alert.agent])
        .length ?? 0
  )
  const paused = useStore((state) => state.snapshot?.alerts.paused ?? false)
  useEffect(() => useStore.getState().connect(), [useStore])
  const text = paused
    ? 'Agentes de IA · novos alertas pausados'
    : count > 0
      ? `Agentes de IA · ${count} alertas`
      : 'Agentes de IA'
  const tip = useOverlayTooltip(text)
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
          aria-describedby={tip.describedBy}
          {...tip.trigger}
        >
          <WidgetItemIcon
            icon={Bot}
            aria-hidden="true"
            className={count > 0 || paused ? 'text-destructive' : undefined}
          />
          <AgentAlertCount count={count} />
          <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
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
