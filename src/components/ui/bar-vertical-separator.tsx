/** Decorative layout item; horizontal margin adds to the bar's gap. */
export function BarVerticalSeparator({ marginX = 0 }: { marginX?: number }) {
  return (
    <span
      aria-hidden="true"
      data-bar-separator
      className="inline-block h-3.25 w-px shrink-0 bg-muted"
      style={{ marginInline: marginX }}
    />
  )
}
