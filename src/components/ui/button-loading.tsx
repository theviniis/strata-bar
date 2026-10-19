import { cn } from '@/lib/utils'
import { Slottable } from '@radix-ui/react-slot'
import type { ComponentProps } from 'react'
import { Button } from './button'
type ButtonProps = ComponentProps<typeof Button>
import { Spinner } from './spinner'

export interface ButtonLoadingProps extends ButtonProps {
  isLoading?: boolean
}

export function ButtonLoading({
  isLoading,
  disabled,
  children,
  className,
  ...props
}: ButtonLoadingProps) {
  return (
    <Button
      className={cn(className, 'relative')}
      disabled={isLoading ? true : disabled}
      {...props}
    >
      <Slottable>{children}</Slottable>
      {isLoading && (
        <Spinner className="text-primary absolute z-10 top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]" />
      )}
    </Button>
  )
}
