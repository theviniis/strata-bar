import * as SwitchPrimitives from '@radix-ui/react-switch'
import { motion } from 'motion/react' // ou 'framer-motion'
import * as React from 'react'

import { cn } from '@/lib/utils'

// Criamos uma versão animada do Thumb do Radix
const MotionThumb = motion.create(SwitchPrimitives.Thumb)

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <MotionThumb
      // O Motion lê automaticamente o data-[state=checked] do Radix para alternar o estado animate
      animate={{
        x: props.checked || props.defaultChecked ? 16 : 0 // 16px é a distância equivalente ao translate-x-4
      }}
      // Se você estiver usando o switch de forma controlada/não controlada, o seletor de atributos do CSS/Motion também funciona perfeitamente:
      initial={false}
      transition={{
        type: 'spring',
        stiffness: 500, // Rigidez alta para um movimento rápido
        damping: 12 // Amortecimento baixo para criar o efeito elástico (bounce)
      }}
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0'
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
