import type { ComponentProps } from 'react'
import strataLogo from '../../src-tauri/icon.svg'
import transparentLogo from '@/assets/logo-transparent.svg'
import { cn } from '@/lib/utils'

/** Shares the application's official artwork with the frontend. */
export function Logo({
  alt = 'Strata',
  background = true,
  className,
  ...props
}: Omit<ComponentProps<'img'>, 'src'> & { background?: boolean }) {
  return (
    <img
      src={background ? strataLogo : transparentLogo}
      alt={alt}
      width={256}
      height={256}
      className={cn('size-6 shrink-0', className)}
      {...props}
    />
  )
}
