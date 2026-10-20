import { cn } from '@/lib/utils'
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { createContext, useContext, type ComponentProps } from 'react'

type StyledProps<T> = Omit<T, 'className'> & { className?: string }
type TabsSize = VariantProps<typeof tabsListVariants>['size']

const TabsSizeContext = createContext<NonNullable<TabsSize>>('default')

const tabsListVariants = cva(
  'inline-flex items-center justify-center rounded-lg bg-muted text-muted-foreground',
  {
    variants: {
      size: {
        default: 'h-9 p-1',
        sm: 'h-7 p-1',
        xs: 'h-6 p-0.5'
      }
    },
    defaultVariants: {
      size: 'default'
    }
  }
)

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-active:bg-background data-active:text-foreground data-active:shadow',
  {
    variants: {
      size: {
        default: 'px-3 py-1 text-sm',
        sm: 'px-2.5 py-0.5 text-xs',
        xs: 'px-2 py-0.5 text-[11px]'
      }
    },
    defaultVariants: {
      size: 'default'
    }
  }
)

function Tabs({
  className,
  size = 'default',
  ...props
}: StyledProps<ComponentProps<typeof TabsPrimitive.Root>> & {
  size?: NonNullable<TabsSize>
}) {
  return (
    <TabsSizeContext.Provider value={size}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-size={size}
        className={cn('flex flex-col gap-2', className)}
        {...props}
      />
    </TabsSizeContext.Provider>
  )
}

function TabsList({
  className,
  size,
  ...props
}: StyledProps<ComponentProps<typeof TabsPrimitive.List>> & {
  size?: NonNullable<TabsSize>
}) {
  const inheritedSize = useContext(TabsSizeContext)
  const resolvedSize = size ?? inheritedSize

  return (
    <TabsSizeContext.Provider value={resolvedSize}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-size={resolvedSize}
        className={cn(tabsListVariants({ size: resolvedSize }), className)}
        {...props}
      />
    </TabsSizeContext.Provider>
  )
}

function TabsTrigger({
  className,
  ...props
}: StyledProps<ComponentProps<typeof TabsPrimitive.Tab>>) {
  const size = useContext(TabsSizeContext)

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      data-size={size}
      className={cn(tabsTriggerVariants({ size }), className)}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: StyledProps<ComponentProps<typeof TabsPrimitive.Panel>>) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
export type { TabsSize }
