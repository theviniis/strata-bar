'use client'

import * as React from 'react'
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { type VariantProps } from 'class-variance-authority'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

import { toggleVariants } from '@/components/ui/toggle'
import { SlidingHighlight } from './sliding-highlight'

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: 'horizontal' | 'vertical'
    selected?: readonly string[]
    selectionId?: string
    multiple?: boolean
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 2,
  orientation: 'horizontal'
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = 'horizontal',
  value,
  defaultValue,
  onValueChange,
  multiple,
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: 'horizontal' | 'vertical'
  }) {
  const selectionId = React.useId()
  const [uncontrolledValue, setUncontrolledValue] = React.useState<string[]>(
    () => [...(defaultValue ?? [])]
  )
  const selected = value ?? uncontrolledValue

  return (
    <SlidingHighlight highlightClassName="bg-accent/30 glass-surface inset-shadow-transparent shadow-none">
      <ToggleGroupPrimitive
        data-slot="toggle-group"
        data-variant={variant}
        data-size={size}
        data-spacing={spacing}
        data-orientation={orientation}
        style={{ '--gap': spacing } as React.CSSProperties}
        value={value}
        defaultValue={defaultValue}
        multiple={multiple}
        onValueChange={(next, details) => {
          if (value === undefined) setUncontrolledValue(next)
          onValueChange?.(next, details)
        }}
        className={cn(
          'group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-vertical:flex-col data-vertical:items-stretch',
          className
        )}
        {...props}
      >
        <ToggleGroupContext.Provider
          value={{
            variant,
            size,
            spacing,
            orientation,
            selected,
            selectionId,
            multiple
          }}
        >
          {children}
        </ToggleGroupContext.Provider>
      </ToggleGroupPrimitive>
    </SlidingHighlight>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant = 'default',
  size = 'default',
  value,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)
  const reducedMotion = useReducedMotion()
  const pressed =
    value !== undefined && context.selected?.includes(value) === true

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      data-sliding-highlight-item=""
      value={value}
      className={cn(
        'data-pressed:text-accent-foreground',
        'relative shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t',
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size
        }),
        'border-border/50 bg-muted/30 glass-surface inset-shadow-transparent shadow-none hover:bg-muted/30 hover:text-foreground data-pressed:border-transparent data-pressed:hover:text-accent-foreground hover:border-transparent',
        className
      )}
      {...props}
    >
      {pressed && (
        <motion.span
          aria-hidden="true"
          layoutId={
            reducedMotion || context.multiple ? undefined : context.selectionId
          }
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="pointer-events-none absolute inset-0 -z-10 bg-accent glass-surface inset-shadow-transparent shadow-none"
          style={{ borderRadius: 'inherit' }}
        />
      )}
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
