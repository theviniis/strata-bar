import type { ReactNode } from 'react'
import { DataError, DataLoading, DataUnavaliable } from './popup-helpers'

type ComponentStatus = 'loading' | 'error' | 'unavailable' | 'ready'

/** Capitalizes the first letter so status titles read as sentences. */
function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Picks the plural form for names that already end in "s" ("discos"), while
 * singular names such as CPU or memória keep "indisponível".
 */
function unavailableTitle(componentName: string) {
  const plural = componentName.endsWith('s') ? 'indisponíveis' : 'indisponível'
  return `${titleCase(componentName)} ${plural}`
}

export function mapDataStatus(componentName: string, status: ComponentStatus) {
  if (status === 'ready') return null

  const map = new Map<ComponentStatus, ReactNode>([
    [
      'error',
      <DataError
        title={`Erro ao obter dados de ${componentName}`}
        description={`Ocorreu um erro ao obter os dados de ${componentName}`}
      />
    ],
    [
      'unavailable',
      <DataUnavaliable
        title={unavailableTitle(componentName)}
        description={`Não conseguimos obter os dados de ${componentName}`}
      />
    ],
    [
      'loading',
      <DataLoading
        title={`Carregando ${componentName}`}
        description={`Aguarde enquanto obtemos os dados de ${componentName}`}
      />
    ]
  ])

  return map.get(status) || null
}
