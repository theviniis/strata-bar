'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'
import * as React from 'react'

import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const sliderTrackVariants = cva(
  'relative h-1.5 w-full grow overflow-hidden rounded-full',
  {
    variants: {
      variant: {
        default: 'bg-primary/20',
        secondary: 'bg-secondary/20'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

const sliderRangeVariants = cva('absolute h-full', {
  variants: {
    variant: {
      default: 'bg-primary',
      secondary: 'bg-secondary'
    }
  },
  defaultVariants: { variant: 'default' }
})

const sliderThumbVariants = cva(
  'block h-4 w-4 rounded-full bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border border-primary/50',
        secondary: 'border border-secondary/50'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

export interface SliderProps
  extends
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
    VariantProps<typeof sliderTrackVariants> {}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, variant = 'default', ...props }, ref) => {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className={sliderTrackVariants({ variant })}>
        <SliderPrimitive.Range className={sliderRangeVariants({ variant })} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={props['aria-label']}
        className={sliderThumbVariants({ variant })}
      />
    </SliderPrimitive.Root>
  )
})

Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
