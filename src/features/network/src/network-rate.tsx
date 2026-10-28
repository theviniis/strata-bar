import { showLabel } from '@/components/status-bar/presentation'
import {
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput
} from '@/components/widget-item'
import { cn } from '@/lib/utils'
import type { WidgetConfig } from '@/services/configuration/config'
import type { NetworkUnit } from '@/services/system/network.generated'
import type { ElementType } from 'react'
import { formatRate } from '../src/presentation'

const barFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

const speedFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function NetworkRate({
  label,
  bytes,
  unit,
  format,
  icon,
  appearance = 'bar'
}: {
  label: string
  bytes: number | null | undefined
  unit: NetworkUnit
  format: WidgetConfig['format']
  icon: ElementType
  appearance?: 'bar' | 'popup' | 'speed-test'
}) {
  const speedUnit = bytes != null && bytes * 8 < 1_000_000 ? 'Kbps' : 'Mbps'
  const speedDivisor = speedUnit === 'Kbps' ? 1000 : 1_000_000
  const formatted =
    appearance === 'speed-test' || appearance === 'bar'
      ? bytes == null
        ? '—'
        : `${(appearance === 'bar' ? barFormat : speedFormat).format((bytes * 8) / speedDivisor)} ${speedUnit}`
      : formatRate(bytes, unit)
  const [amount, suffix] = formatted.split(' ')
  if (appearance === 'speed-test') {
    return (
      <div className="flex min-w-0 flex-col items-center gap-2">
        <div className="flex items-center justify-center gap-1 text-body">
          <WidgetItemIcon
            icon={icon}
            size={14}
            className="text-inherit"
            aria-hidden
          />
          <span className="uppercase text-foreground">{label}</span>
          <span className="text-muted-foreground">{speedUnit}</span>
        </div>
        <WidgetItemOutput
          aria-label={label}
          aria-description={formatted}
          className={cn(
            'justify-center font-light leading-none tracking-tight text-foreground tabular-nums',
            amount.length > 7
              ? 'text-2xl'
              : amount.length > 6
                ? 'text-3xl'
                : 'text-4xl'
          )}
        >
          {amount}
          <span className="sr-only">{suffix ? ` ${suffix}` : ''}</span>
        </WidgetItemOutput>
      </div>
    )
  }
  return (
    <>
      <WidgetItemIcon icon={icon} strokeWidth={1.7} size={12} aria-hidden />
      <WidgetItemOutput
        aria-label={label}
        aria-description={formatted}
        className={cn(
          'whitespace-nowrap tabular-nums',
          appearance === 'popup' && 'text-body font-medium text-foreground'
        )}
      >
        <span>{amount}</span>{' '}
        {suffix && showLabel(format) && (
          <WidgetItemLabel
            className={cn(
              'text-muted-foreground',
              appearance !== 'bar' && 'text-body font-normal text-inherit'
            )}
          >
            {suffix}
          </WidgetItemLabel>
        )}
      </WidgetItemOutput>
    </>
  )
}
