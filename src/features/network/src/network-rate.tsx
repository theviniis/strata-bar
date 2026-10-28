import { BigNumbers } from '@/components/big-numbers'
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
      <>
        <BigNumbers.Header>
          <BigNumbers.Icon icon={icon} />
          <BigNumbers.Title>{label}</BigNumbers.Title>
          <BigNumbers.Description>{speedUnit}</BigNumbers.Description>
        </BigNumbers.Header>
        <BigNumbers.Output aria-label={label} aria-description={formatted}>
          {amount}
          <span className="sr-only">{suffix ? ` ${suffix}` : ''}</span>
        </BigNumbers.Output>
      </>
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
