export interface RegionPoint {
  x: number
  y: number
}
export interface IslandRect {
  x: number
  y: number
  width: number
  height: number
}

/** Matches groupEdgeMask and the desktop corner without covering clear pixels. */
export function islandRegion(
  rect: IslandRect,
  section: string,
  radius: number,
  bottom: boolean
): RegionPoint[][] {
  const { x, y, width, height } = rect
  const r = Math.min(radius, height / 2)
  const edge = (v: number) => {
    if (!r) return 0
    if (v < r) return Math.sqrt(Math.max(0, r * r - (v - r) ** 2))
    if (v > height - r)
      return 2 * r - Math.sqrt(Math.max(0, r * r - (v - height + r) ** 2))
    return r
  }
  const point = (px: number, py: number) => ({
    x: x + px,
    y: y + (bottom ? height - py : py)
  })
  const rows = Math.max(1, Math.ceil(height * 2))
  const left = Array.from({ length: rows + 1 }, (_, i) => {
    const v = (height * i) / rows
    return point(section === 'left' ? 0 : edge(v), v)
  })
  const right = Array.from({ length: rows + 1 }, (_, i) => {
    const v = (height * (rows - i)) / rows
    return point(width - (section === 'right' ? 0 : edge(v)), v)
  })
  const polygons = [[...left, ...right]]
  if (section !== 'center' && r > 0) {
    const corner = [point(section === 'left' ? 0 : width, height)]
    for (let i = 0; i <= 32; i += 1) {
      const v = (r * i) / 32
      const extent = r - Math.sqrt(Math.max(0, r * r - (v - r) ** 2))
      corner.push(
        point(section === 'left' ? extent : width - extent, height + v)
      )
    }
    polygons.push(corner)
  }
  return polygons
}
