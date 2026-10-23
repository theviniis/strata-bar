import { expect, it } from 'vitest'
import { islandRegion } from '@/components/status-bar/bar-region'

it('matches curved island edges while leaving transparent corners outside', () => {
  const [island] = islandRegion(
    { x: 100, y: 0, width: 200, height: 36 },
    'center',
    18,
    false
  )
  expect(island[0]).toEqual({ x: 100, y: 0 })
  expect(island[36]).toEqual({ x: 118, y: 18 })
  expect(island[72]).toEqual({ x: 136, y: 36 })
  expect(island[73]).toEqual({ x: 264, y: 36 })
})

it.each(['left', 'center', 'right'])(
  'mirrors %s islands and decorative corners for bottom bars',
  (section) => {
    const rect = { x: 30, y: 18, width: 200, height: 36 }
    const top = islandRegion(rect, section, 18, false)
    const bottom = islandRegion(rect, section, 18, true)
    expect(bottom).toEqual(
      top.map((polygon) => polygon.map((p) => ({ x: p.x, y: 72 - p.y })))
    )
    expect(top).toHaveLength(section === 'center' ? 1 : 2)
  }
)

it('supports square corners and empty strips without non-finite coordinates', () => {
  const polygons = islandRegion(
    { x: 0, y: 0, width: 100, height: 36 },
    'left',
    0,
    false
  )
  expect(polygons).toHaveLength(1)
  expect(
    polygons.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  ).toBe(true)
  expect(Math.min(...polygons[0].map((p) => p.x))).toBe(0)
  expect(Math.max(...polygons[0].map((p) => p.x))).toBe(100)
})
