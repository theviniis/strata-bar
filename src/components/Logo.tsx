import type { ComponentProps } from 'react'
import strataLogo from '../../src-tauri/icon.svg'
import { cn } from '@/lib/utils'

/** Shares the application's official artwork with the frontend. */
export function Logo({
  alt = 'Strata',
  className,
  ...props
}: Omit<ComponentProps<'img'>, 'src'>) {
  return (
    <img
      src={strataLogo}
      alt={alt}
      width={256}
      height={256}
      className={cn('size-6 shrink-0', className)}
      {...props}
    />
  )
}
