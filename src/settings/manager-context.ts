import { createContext } from 'react'
import type { Config } from '@/services/configuration/config'
import type { MonitorDraft } from './monitor-layout'
import type { Section } from './layout'

export type ColumnMoveFocus = {
  widgetId: string
  direction: 'left' | 'right'
  target: Section
}

export const ManagerContext = createContext<{
  config: Config
  editor: MonitorDraft
  onChange(next: Config): void
  requestMoveFocus(move: ColumnMoveFocus): void
} | null>(null)
