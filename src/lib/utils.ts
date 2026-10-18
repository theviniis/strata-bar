import type { SystemEvent } from '@/services/system/bridge'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function renderOutput(
  value: SystemEvent<{
    percent: number
  }>
) {
  const map = new Map([
    ['ready', Math.round(value.data?.percent || 0).toString()],
    ['loading', '...']
  ])

  return map.get(value.status) || 'Erro'
}
