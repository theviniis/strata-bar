import { cn } from '@/lib/utils'
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useIsPresent,
  useReducedMotion
} from 'motion/react'
import {
  createContext,
  useContext,
  useId,
  useImperativeHandle,
  useRef,
  type ComponentProps
} from 'react'
import { SlidingHighlight } from './sliding-highlight'

type StyledProps<T> = Omit<T, 'className'> & { className?: string }
type TabsSize = VariantProps<typeof tabsListVariants>['size']

const TabsSizeContext = createContext<NonNullable<TabsSize>>('default')

function PanelElement({
  elementProps,
  ref,
  ...props
}: ComponentProps<'div'> & { elementProps: ComponentProps<'div'> }) {
  const present = useIsPresent()
  const panelRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => panelRef.current!)
  useImperativeHandle(elementProps.ref, () => panelRef.current!)

  return (
    <div
      {...elementProps}
      {...props}
      ref={panelRef}
      style={{ ...elementProps.style, ...props.style }}
      inert={!present || elementProps.inert}
      aria-hidden={!present || elementProps['aria-hidden']}
    >
      {elementProps.children}
    </div>
  )
}

const MotionPanel = motion.create(PanelElement)

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
  'relative isolate inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground',
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
        className={cn('relative flex flex-col gap-2', className)}
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
  const id = useId()

  return (
    <TabsSizeContext.Provider value={resolvedSize}>
      <LayoutGroup id={id}>
        <SlidingHighlight highlightClassName="rounded-md bg-background/60">
          <TabsPrimitive.List
            data-slot="tabs-list"
            data-size={resolvedSize}
            className={cn(
              tabsListVariants({ size: resolvedSize }),
              'gap-1',
              className
            )}
            {...props}
          />
        </SlidingHighlight>
      </LayoutGroup>
    </TabsSizeContext.Provider>
  )
}

function TabsTrigger({
  className,
  ...props
}: StyledProps<ComponentProps<typeof TabsPrimitive.Tab>>) {
  const size = useContext(TabsSizeContext)
  const reducedMotion = useReducedMotion()

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      data-sliding-highlight-item=""
      data-size={size}
      className={cn(tabsTriggerVariants({ size }), className)}
      render={(elementProps, state) => (
        <button {...elementProps}>
          {state.active && (
            <motion.span
              aria-hidden="true"
              data-slot="tabs-indicator"
              layoutId="tabs-indicator"
              className="pointer-events-none absolute inset-0 -z-10 rounded-md bg-background shadow"
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 500, damping: 38 }
              }
            />
          )}
          {elementProps.children}
        </button>
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  keepMounted = false,
  ...props
}: StyledProps<ComponentProps<typeof TabsPrimitive.Panel>>) {
  const reducedMotion = useReducedMotion()

  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      keepMounted
      render={(elementProps, state) => {
        const direction =
          state.tabActivationDirection === 'left' ||
          state.tabActivationDirection === 'up'
            ? -1
            : state.tabActivationDirection === 'none'
              ? 0
              : 1
        const offset = reducedMotion ? 0 : direction * 16
        const movement =
          state.orientation === 'vertical' ? { y: offset } : { x: offset }
        const exitMovement =
          state.orientation === 'vertical' ? { y: -offset } : { x: -offset }

        // `hidden` settles after Base UI's transition lifecycle. `inert`
        // follows selection immediately, so the outgoing panel must leave
        // normal flow now instead of stacking above the incoming panel.
        return (
          <AnimatePresence
            initial={false}
            mode="popLayout"
            custom={exitMovement}
          >
            {(!elementProps.inert || keepMounted) && (
              <MotionPanel
                elementProps={elementProps}
                key="panel"
                initial={{ opacity: 0, ...movement }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit="exit"
                variants={{
                  exit: (movement: { x?: number; y?: number }) => ({
                    opacity: 0,
                    ...movement
                  })
                }}
                transition={{
                  duration: reducedMotion ? 0 : 0.18,
                  ease: 'easeOut'
                }}
              />
            )}
          </AnimatePresence>
        )
      }}
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
