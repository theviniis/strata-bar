import type { ReactNode } from 'react'
import { DataError, DataLoading, DataUnavaliable } from './popup-helpers'

type ComponentStatus = 'loading' | 'error' | 'unavailable' | 'ready'

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
        title={`Dados de ${componentName} indisponíveis`}
        description={`Não conseguimos obter os dados de ${componentName}`}
      />
    ],
    [
      'loading',
      <DataLoading
        title={`Carregando dados de ${componentName}`}
        description={`Aguarde enquanto obtemos os dados de ${componentName}`}
      />
    ]
  ])

  return map.get(status) || null
}
