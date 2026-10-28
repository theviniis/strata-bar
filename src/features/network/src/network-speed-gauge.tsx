import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowDownCircle, ArrowUpCircle, Play } from 'lucide-react'
import { motion, useSpring, useTransform } from 'motion/react'
import { useEffect, useId } from 'react'

const steps = [0, 5, 10, 50, 100, 250, 500, 750, 1000]
const speedFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
function polar(radius: number, ratio: number) {
  const radians = ((135 + ratio * 270) * Math.PI) / 180
  return {
    x: 120 + Math.cos(radians) * radius,
    y: 108 + Math.sin(radians) * radius
  }
}
function fraction(value: number, maximum: number) {
  const normalized = Math.max(0, Math.min(1000, (value / maximum) * 1000))
  const index = steps.findIndex((step) => step >= normalized)
  if (index <= 0) return 0
  return (
    (index -
      1 +
      (normalized - steps[index - 1]) / (steps[index] - steps[index - 1])) /
    (steps.length - 1)
  )
}
function AnimatedSpeed({
  value,
  animated
}: {
  value: number
  animated: boolean
}) {
  const displayed = useSpring(value, { stiffness: 110, damping: 25, mass: 0.6 })
  const text = useTransform(displayed, (speed) =>
    speedFormat.format(Math.max(0, speed))
  )
  useEffect(() => {
    if (animated) displayed.set(value)
    else displayed.jump(value)
  }, [value, animated, displayed])
  return <motion.span aria-hidden>{text}</motion.span>
}

export function NetworkSpeedGauge({
  value,
  maximum,
  direction,
  animated,
  idle,
  busy,
  onStart
}: {
  value: number | null
  maximum: number
  direction: 'download' | 'upload'
  animated: boolean
  idle: boolean
  busy: boolean
  onStart(): void
}) {
  const gradient = useId().replaceAll(':', '')
  const start = polar(94, 0)
  const end = polar(94, 1)
  const arc = `M ${start.x} ${start.y} A 94 94 0 1 1 ${end.x} ${end.y}`
  const progress = fraction(value ?? 0, maximum)
  const needle = polar(62, progress)
  const Icon = direction === 'download' ? ArrowDownCircle : ArrowUpCircle
  const transition = animated
    ? { type: 'spring' as const, stiffness: 95, damping: 23 }
    : { duration: 0 }
  return (
    <div
      className={cn(
        'relative mx-auto aspect-square w-full max-w-64',
        direction === 'download' ? 'text-chart-1' : 'text-chart-2'
      )}
    >
      <div
        className="absolute inset-0"
        role="meter"
        aria-label={`Velocidade de ${direction}`}
        aria-valuemin={0}
        aria-valuemax={maximum}
        aria-valuenow={value ?? 0}
        aria-valuetext={
          value == null
            ? 'Aguardando medição'
            : `${speedFormat.format(value)} Mbps`
        }
      >
        <svg
          viewBox="0 0 240 240"
          className="size-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
              <stop
                stopColor={
                  direction === 'download' ? 'var(--chart-1)' : 'var(--chart-2)'
                }
              />
              <stop offset="1" stopColor="var(--primary)" />
            </linearGradient>
          </defs>
          <path
            d={arc}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={12}
            strokeLinecap="round"
          />
          <motion.path
            d={arc}
            fill="none"
            stroke={`url(#${gradient})`}
            strokeWidth={12}
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: progress, opacity: value == null ? 0 : 1 }}
            transition={transition}
          />
          {steps.map((step, index) => {
            const point = polar(73, index / (steps.length - 1))
            return (
              <text
                key={step}
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className={cn(
                  'text-micro tabular-nums',
                  value != null && (step * maximum) / 1000 <= value
                    ? 'fill-foreground'
                    : 'fill-muted-foreground'
                )}
              >
                {(step * maximum) / 1000}
              </text>
            )
          })}
          {!idle && value != null && (
            <>
              <motion.line
                x1={120}
                y1={108}
                initial={false}
                animate={{ x2: needle.x, y2: needle.y }}
                transition={transition}
                stroke="currentColor"
                strokeWidth={4}
                strokeLinecap="round"
              />
              <circle cx={120} cy={108} r={5} fill="var(--foreground)" />
            </>
          )}
        </svg>
      </div>
      {idle ? (
        <div className="absolute inset-0 flex items-center justify-center pb-4">
          <Button
            variant="outline"
            className="size-22 flex-col rounded-full"
            aria-label="Testar velocidade"
            onClick={onStart}
            disabled={busy}
          >
            <Play data-icon="inline-start" />
            Iniciar
          </Button>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center gap-1">
          <div
            className={cn(
              'font-light tracking-tight text-foreground tabular-nums',
              value != null && value >= 1000 ? 'text-3xl' : 'text-4xl'
            )}
          >
            {value == null ? (
              '—'
            ) : (
              <AnimatedSpeed value={value} animated={animated} />
            )}
          </div>
          <motion.div
            key={direction}
            initial={animated ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: animated ? 0.2 : 0 }}
            className="flex items-center gap-1 text-body"
          >
            <Icon size={14} aria-hidden />
            <span className="text-foreground">Mbps</span>
          </motion.div>
        </div>
      )}
    </div>
  )
}
