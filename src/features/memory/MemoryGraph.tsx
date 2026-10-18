import { useState } from 'react'
import type { MemoryPoint } from '@/services/system/memory.generated'

export function MemoryGraph({
  history,
  now
}: {
  history: MemoryPoint[]
  now: number
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const samples = history.filter(
    (point) => point.timestamp >= now - 60000 && point.timestamp <= now
  )
  const inspected = samples.find((point) => point.sequence === selected)
  let path = ''
  let previous: MemoryPoint | undefined
  for (const point of samples) {
    if (point.percent === null) {
      previous = undefined
      continue
    }
    const x = ((point.timestamp - now + 60000) / 60000) * 288
    const y = 100 - point.percent
    const connected = previous && point.timestamp - previous.timestamp <= 3000
    path += `${connected ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `
    previous = point
  }
  const missing = samples.filter((point) => point.percent === null).length
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Utilização · 60 segundos</span>
        <span>100%</span>
      </div>
      <div className="relative h-28 rounded border border-border bg-muted/20">
        <svg
          role="img"
          aria-label="Utilização da memória nos últimos 60 segundos, escala de 0 a 100%"
          viewBox="0 0 288 100"
          preserveAspectRatio="none"
          className="h-full w-full text-primary"
        >
          <path
            d="M0 25H288 M0 50H288 M0 75H288"
            stroke="currentColor"
            strokeOpacity="0.12"
            fill="none"
          />
          <path
            d={path}
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {samples.map(
          (point) =>
            point.percent !== null && (
              <button
                key={point.sequence}
                type="button"
                aria-label={`${point.percent.toFixed(1)}% · ${new Date(point.timestamp).toLocaleTimeString()}`}
                onPointerEnter={() => setSelected(point.sequence)}
                onFocus={() => setSelected(point.sequence)}
                onClick={() => setSelected(point.sequence)}
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-transparent hover:border-primary focus-visible:border-primary focus-visible:outline-none"
                style={{
                  left: `${((point.timestamp - now + 60000) / 60000) * 100}%`,
                  top: `${100 - point.percent}%`
                }}
              />
            )
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>60 s atrás</span>
        <span>Agora · 0%</span>
      </div>
      {inspected && (
        <p role="status" className="mt-1 text-xs tabular-nums">
          {inspected.percent?.toFixed(1)}% ·{' '}
          {new Date(inspected.timestamp).toLocaleTimeString()}
        </p>
      )}
      {missing > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {missing}{' '}
          {missing === 1 ? 'leitura indisponível' : 'leituras indisponíveis'} ·
          lacunas preservadas
        </p>
      )}
      {!samples.length && (
        <p className="mt-1 text-xs text-muted-foreground">
          Aguardando histórico observado
        </p>
      )}
    </div>
  )
}
