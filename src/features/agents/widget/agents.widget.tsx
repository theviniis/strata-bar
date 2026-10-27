import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  type WidgetItemProps
} from '@/components/widget-item'
import { Bot } from 'lucide-react'
export interface AgentsProps extends WidgetItemProps {
  count: number
  paused: boolean
  describedBy: string | undefined
}
export function Agents({
  count,
  paused,
  describedBy,
  ...triggerProps
}: AgentsProps) {
  return (
    <WidgetItem
      type="button"
      aria-label={
        count > 0
          ? `Abrir agentes de IA, ${count} alertas`
          : 'Abrir agentes de IA'
      }
      aria-describedby={describedBy}
      {...triggerProps}
    >
      <WidgetItemIcon
        icon={Bot}
        aria-hidden="true"
        className={count > 0 || paused ? 'text-destructive' : undefined}
      />
      <AgentAlertCount count={count} />
    </WidgetItem>
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
