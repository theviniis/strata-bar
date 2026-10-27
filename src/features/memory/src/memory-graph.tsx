import { ResourceGraph } from '@/components/resource-graph'
import type { MemoryPoint } from '@/services/system/memory.generated'

export function MemoryGraph({
  history,
  now
}: {
  history: MemoryPoint[]
  now: number
}) {
  return (
    <ResourceGraph
      points={history.map((point) => ({ ...point, value: point.percent }))}
      now={now}
      label="Utilização"
      description="Utilização da memória"
      unit="%"
    />
  )
}
