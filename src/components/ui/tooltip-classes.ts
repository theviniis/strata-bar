/**
 * The shadcn tooltip look, kept in one place so the studio tooltip and the
 * native overlay surface cannot drift. Positioning, state animations and the
 * `kbd` slot stay with `TooltipContent`; everything here describes the pill
 * itself and its arrow.
 *
 * The pill and arrow share the active palette's popover tokens in both modes.
 */
export const tooltipPillClasses =
  'z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md bg-popover px-3 py-1.5 font-sans text-caption font-normal text-popover-foreground'

export const tooltipArrowClasses =
  'z-50 size-2.5 rotate-45 rounded-[2px] bg-popover fill-popover'
