import { useState } from 'react'

type GraphPoint = { sequence: number; timestamp: number; value: number | null }
export function ResourceGraph({
  points,
  now,
  label,
  description,
  unit,
  maximum = 100
}: {
  points: GraphPoint[]
  now: number
  label: string
  description: string
  unit: '%' | '°C'
  maximum?: number
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const samples = points.filter(
    (point) => point.timestamp >= now - 60000 && point.timestamp <= now
  )
  const inspected = samples.find((point) => point.sequence === selected)
  const format = (value: number) =>
    `${value.toFixed(1)}${unit === '%' ? '' : ' '}${unit}`
  let path = ''
  let previous: GraphPoint | undefined
  for (const point of samples) {
    if (point.value === null) {
      previous = undefined
      continue
    }
    const x = ((point.timestamp - now + 60000) / 60000) * 288
    const y = 100 - (point.value / maximum) * 100
    const connected = previous && point.timestamp - previous.timestamp <= 3000
    path += `${connected ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `
    previous = point
  }
  const missing = samples.filter((point) => point.value === null).length
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{label} · 60 segundos</span>
        <span>
          {maximum}
          {unit === '%' ? '' : ' '}
          {unit}
        </span>
      </div>
      <div className="relative h-28 rounded border border-border bg-muted/20">
        <svg
          role="img"
          aria-label={`${description} nos últimos 60 segundos, escala de 0 a ${maximum}${unit}`}
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
            point.value !== null && (
              <button
                key={point.sequence}
                type="button"
                aria-label={`${format(point.value)} · ${new Date(point.timestamp).toLocaleTimeString()}`}
                onPointerEnter={() => setSelected(point.sequence)}
                onFocus={() => setSelected(point.sequence)}
                onClick={() => setSelected(point.sequence)}
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-transparent hover:border-primary focus-visible:border-primary focus-visible:outline-none"
                style={{
                  left: `${((point.timestamp - now + 60000) / 60000) * 100}%`,
                  top: `${100 - (point.value / maximum) * 100}%`
                }}
              />
            )
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>60 s atrás</span>
        <span>Agora · 0{unit}</span>
      </div>
      {inspected && inspected.value !== null && (
        <p role="status" className="mt-1 text-xs tabular-nums">
          {format(inspected.value)} ·{' '}
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
