/** Explicit presentation shared by native and studio placeholders. */
export function Unsupported({ label }: { label: string }) {
  return (
    <span
      className="flex self-stretch items-center px-1 text-micro text-muted-foreground"
      aria-label={`${label} indisponível`}
    >
      —
    </span>
  )
}
