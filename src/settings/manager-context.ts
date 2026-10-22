import { createContext } from 'react'
import type { Config } from '@/services/configuration/config'
import type { SettingsMonitor } from '@/services/system/config.generated'
import type { Scope } from './monitor-layout'

export const ManagerContext = createContext<{
  config: Config
  scope: Scope
  monitors: SettingsMonitor[]
  onChange(next: Config): void
} | null>(null)
