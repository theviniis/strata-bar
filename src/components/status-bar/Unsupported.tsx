/** Explicit presentation shared by native and studio placeholders. */
export function Unsupported({ label }: { label: string }) {
  return (
    <span
      className="px-1 text-[10px] text-muted-foreground"
      aria-label={`${label} indisponível`}
    >
      —
    </span>
  )
}
