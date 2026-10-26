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
  ...props
}: DataHelperProps) {
  return (
    <Empty role="status" {...props}>
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
  ...props
}: DataHelperProps) {
  return (
    <Empty role="status" {...props}>
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
  icon = <Spinner aria-hidden="true" />,
  ...props
}: DataHelperProps) {
  return (
    <Empty role="status" {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
