import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Ghost, TriangleAlert } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Spinner } from './ui/spinner'

interface DataHelperProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: ReactNode
  description: ReactNode
  icon?: ReactNode
}

export function DataUnavaliable({
  title,
  description,
  icon = <Ghost />,
  className,
  ...props
}: DataHelperProps) {
  return (
    <Empty {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function DataError({
  title,
  description,
  icon = <TriangleAlert />,
  className,
  ...props
}: DataHelperProps) {
  return (
    <Empty {...props}>
      <EmptyHeader>
        <EmptyMedia
          className="text-destructive bg-destructive/20"
          variant="icon"
        >
          {icon}
        </EmptyMedia>
        <EmptyTitle className="text-destructive">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function DataLoading({
  title,
  description,
  icon = <Spinner />,
  className,
  ...props
}: DataHelperProps) {
  return (
    <Empty {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

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
