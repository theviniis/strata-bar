import { cn } from '@/lib/utils'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { AnimatePresence, motion } from 'motion/react'
import * as React from 'react'

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, checked, onCheckedChange, defaultChecked, ...props }, ref) => {
  const [isChecked, setIsChecked] = React.useState<boolean>(
    checked === true || defaultChecked === true
  )

  React.useEffect(() => {
    if (checked !== undefined) {
      setIsChecked(checked === true)
    }
  }, [checked])

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      asChild
      checked={isChecked}
      onCheckedChange={(val) => {
        setIsChecked(val === true)
        onCheckedChange?.(val)
      }}
      {...props}
    >
      <button
        className={cn(
          'relative grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          // O Tailwind faz o fade-in suave da cor de fundo, da borda e da cor do texto ao mudar o estado
          'transition-all duration-200 ease-in-out',
          isChecked
            ? 'bg-primary border-primary text-primary-foreground'
            : 'bg-transparent border-primary',
          className
        )}
      >
        <AnimatePresence>
          {isChecked && (
            <CheckboxPrimitive.Indicator asChild forceMount>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.85 }} // Fade com scale negativo ao desabilitar
                transition={{ duration: 0.1 }}
                className="absolute inset-0 grid place-content-center text-current"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <motion.path
                    d="M20 6L9 17l-5-5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      // Espera o fade do background terminar (0.2s) para então desenhar o ícone
                      delay: 0.18,
                      duration: 0.25,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  />
                </svg>
              </motion.span>
            </CheckboxPrimitive.Indicator>
          )}
        </AnimatePresence>
      </button>
    </CheckboxPrimitive.Root>
  )
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
