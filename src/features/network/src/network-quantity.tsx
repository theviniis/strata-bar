/** Unit labels inherit the same colour as their measured value. */
export function NetworkQuantity({ formatted }: { formatted: string }) {
  const separator = formatted.lastIndexOf(' ')
  if (separator < 0) return <>{formatted}</>
  return (
    <>
      {formatted.slice(0, separator)}{' '}
      <span className="text-inherit">{formatted.slice(separator + 1)}</span>
    </>
  )
}
