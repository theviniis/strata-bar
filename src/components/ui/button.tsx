import { cn } from '@/lib/utils'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { motion, type HTMLMotionProps } from 'motion/react' // ou 'framer-motion'
import type { ReactNode } from 'react'
import { Spinner } from './spinner'

// Criamos uma versão animada do ButtonPrimitive do Base UI
const MotionButtonPrimitive = motion.create(ButtonPrimitive)
const MotionSlot = motion.create(Slot)

const buttonVariants = cva(
  "group/button cursor-pointer inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-control whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        outline:
          'border-border/50 bg-muted/30 glass-surface shadow-sm shadow-foreground/5 hover:bg-muted/50 hover:text-foreground aria-expanded:bg-muted/50 aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-control in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-control in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

// Tipagem combinando as propriedades do botão do Base UI com as props de animação do Motion
export type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> &
  HTMLMotionProps<'button'> & {
    asChild?: boolean
    loading?: {
      isLoading?: boolean
      text?: ReactNode
    }
  }

function Button({
  className,
  children,
  variant = 'default',
  size = 'default',
  asChild = false,
  disabled = false,
  loading = {
    isLoading: false,
    text: 'Carregando...'
  },
  ...props
}: ButtonProps) {
  const Comp = asChild ? MotionSlot : MotionButtonPrimitive

  return (
    <Comp
      data-slot="button"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={loading.isLoading || disabled}
      {...props}
    >
      <>
        {loading.isLoading && <Spinner aria-hidden="true" />}
        {loading.isLoading ? loading.text : children}
      </>
    </Comp>
  )
}

export { Button, buttonVariants }
