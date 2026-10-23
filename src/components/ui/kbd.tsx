import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const kbdVariants = cva(
  "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 font-sans text-xs font-medium select-none [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default:
          'bg-muted text-muted-foreground [slot=tooltip-content]:text-background in-data-[slot=tooltip-content]:bg-background/20 dark:in-data-[slot=tooltip-content]:bg-background/10',
        primary:
          'bg-muted/20 text-primary-foreground shadow-sm [slot=tooltip-content]:text-primary-foreground in-data-[slot=tooltip-content]:bg-primary/20'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Kbd({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'kbd'> & VariantProps<typeof kbdVariants>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(kbdVariants({ variant, className }))}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
