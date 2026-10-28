import * as ProgressPrimitive from '@radix-ui/react-progress'
import { motion } from 'motion/react'
import * as React from 'react'

import { cn } from '@/lib/utils'

// Criamos uma versão animada do Indicator do Radix
const MotionProgressIndicator = motion.create(ProgressPrimitive.Indicator)

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    disableAnimation?: boolean
  }
>(({ className, value = 0, disableAnimation = false, ...props }, ref) => {
  // Garantimos que o valor fique entre 0 e 100 de forma segura
  const safeValue = Math.min(100, Math.max(0, value || 0))

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={safeValue}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-secondary/20',
        className
      )}
      {...props}
    >
      <MotionProgressIndicator
        className="h-full w-full flex-1 bg-secondary"
        // O Motion anima a propriedade transform de forma fluida baseada no value
        initial={disableAnimation ? false : { x: '-100%' }}
        style={
          disableAnimation
            ? { transform: `translateX(-${100 - safeValue}%)` }
            : undefined
        }
        animate={disableAnimation ? undefined : { x: `-${100 - safeValue}%` }}
        transition={{
          ...(disableAnimation ? { duration: 0 } : { type: 'spring' as const }),
          stiffness: 200, // Rigidez moderada para um movimento fluido
          damping: 25 // Amortecimento equilibrado para não balançar excessivamente
        }}
      />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
