import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ResourceGraph } from '@/components/ResourceGraph'
import {
  newestTimestamp,
  projectResourceWindow,
  type ResourceGraphPoint
} from '@/components/resource-graph'

const at = 100000
const point = (
  sequence: number,
  timestamp: number,
  value: number | null
): ResourceGraphPoint => ({ sequence, timestamp, value })

const areaPoints = (container: HTMLElement) => {
  const path =
    container.querySelector('.recharts-area-curve')?.getAttribute('d') ?? ''
  return [...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(([, x, y]) => ({
    x: Number(x),
    y: Number(y)
  }))
}

it('projects observed points onto the trailing 60-second window', () => {
  const { samples, series } = projectResourceWindow(
    [point(1, at - 80000, 91), point(2, at - 2000, 40), point(3, at, 56.25)],
    at
  )
  expect(samples.map((sample) => sample.sequence)).toEqual([2, 3])
  expect(series).toEqual([
    { offset: 58, value: 40 },
    { offset: 60, value: 56.25 }
  ])
})

it('anchors the window to the newest observation, not to the clock', () => {
  expect(
    newestTimestamp([point(1, at - 5000, 40), point(2, at, 42)], at + 900)
  ).toBe(at)
  expect(newestTimestamp([], at + 900)).toBe(at + 900)
})

it('breaks the line across missing readings and transport gaps', () => {
  const { series } = projectResourceWindow(
    [point(1, at - 2000, 40), point(2, at - 1000, null), point(3, at, 56.25)],
    at
  )
  expect(series).toEqual([
    { offset: 58, value: 40 },
    { offset: 59, value: null },
    { offset: 60, value: 56.25 }
  ])

  // A silence longer than one polling interval starts a new segment.
  const silent = projectResourceWindow(
    [point(1, at - 30000, 40), point(2, at, 56.25)],
    at
  )
  expect(silent.series).toEqual([
    { offset: 30, value: 40 },
    { offset: 45, value: null },
    { offset: 60, value: 56.25 }
  ])
})

it('draws an interactive area, the scale and the window labels', () => {
  const { container } = render(
    <ResourceGraph
      points={[point(1, at - 2000, 40), point(2, at, 56.25)]}
      now={at}
      label="Utilização"
      description="Utilização da memória"
      unit="%"
    />
  )
  expect(
    screen.getByRole('group', {
      name: 'Utilização da memória nos últimos 60 segundos, escala de 0 a 100%'
    })
  ).toBeVisible()
  expect(screen.getByRole('application')).toBeVisible()
  const curve = container.querySelector('.recharts-area-curve')
  expect(curve).not.toBeNull()
  expect(curve).toHaveAttribute('stroke', 'var(--color-value)')
  expect(container.querySelector('.recharts-area-area')).toHaveAttribute(
    'fill',
    'var(--color-value)'
  )
  expect(screen.getByText('Utilização · 60 segundos')).toBeVisible()
  expect(screen.getByText('100%')).toBeVisible()
  expect(screen.getByText('60 s atrás')).toBeVisible()
  expect(screen.getByText('Agora · 0%')).toBeVisible()
})

it('reports the scale of a non-percent graph', () => {
  render(
    <ResourceGraph
      points={[point(1, at, 121)]}
      now={at}
      label="Temperatura"
      description="Temperatura do pacote da CPU"
      unit="°C"
      maximum={130}
    />
  )
  expect(
    screen.getByRole('group', { name: /Temperatura.*escala de 0 a 130 °C/ })
  ).toBeVisible()
  expect(screen.getByText('130 °C')).toBeVisible()
  expect(screen.getByText('Agora · 0°C')).toBeVisible()
})

it('splits the area at a gap instead of bridging it', () => {
  const segments = (points: ResourceGraphPoint[]) => {
    const { container } = render(
      <ResourceGraph
        points={points}
        now={at}
        label="Utilização"
        description="Utilização da memória"
        unit="%"
      />
    )
    return (
      container.querySelector('.recharts-area-curve')?.getAttribute('d') ?? ''
    )
  }
  const whole = segments([
    point(1, at - 5000, 40),
    point(2, at - 4000, 42),
    point(3, at - 1000, 54),
    point(4, at, 56.25)
  ])
  expect(whole.match(/M/g), `whole=${whole}`).toHaveLength(1)

  const gapped = segments([
    point(1, at - 5000, 40),
    point(2, at - 4000, 42),
    point(3, at - 3000, null),
    point(4, at - 1000, 54),
    point(5, at, 56.25)
  ])
  // One subpath per observed segment; the gap must not be filled in.
  expect(gapped.match(/M/g), `gapped=${gapped}`).toHaveLength(2)
})

it('draws the area across the whole chart surface', () => {
  const { container } = render(
    <ResourceGraph
      points={[
        point(1, at - 5000, 0),
        point(2, at - 4000, 42),
        point(3, at - 1000, 54),
        point(4, at, 100)
      ]}
      now={at}
      label="Utilização"
      description="Utilização da memória"
      unit="%"
    />
  )
  const svg = container.querySelector('svg')
  const width = Number(svg?.getAttribute('width'))
  const height = Number(svg?.getAttribute('height'))
  const points = areaPoints(container)
  // No padding: the oldest and newest readings sit on the plot edges, the
  // maximum touches the top border and the minimum sits on the baseline.
  expect(points[0].x).toBe(0)
  expect(points[points.length - 1].x).toBe(width)
  expect(Math.min(...points.map((p) => p.y))).toBe(0)
  expect(Math.max(...points.map((p) => p.y))).toBe(height)
})

it('keeps the chart still while only the clock advances', () => {
  const pathAt = (now: number) =>
    render(
      <ResourceGraph
        points={[
          point(1, at - 5000, 40),
          point(2, at - 4000, 42),
          point(3, at - 1000, 54),
          point(4, at, 56.25)
        ]}
        now={now}
        label="Utilização"
        description="Utilização da memória"
        unit="%"
      />
    )
      .container.querySelector('.recharts-area-curve')
      ?.getAttribute('d')
  // The channel ticks its clock every second while readings arrive every two.
  // The tick that precedes a reading is behind it, so a clock-anchored window
  // would read the newest reading as future-dated and drop it from the line
  // until the next tick caught up.
  expect(pathAt(at - 900)).toBe(pathAt(at))
  expect(pathAt(at + 1000)).toBe(pathAt(at))
  expect(pathAt(at + 2000)).toBe(pathAt(at))
})

it('lets callers restyle the line with a colour or a class', () => {
  const chart = (props: { color?: string; className?: string } = {}) => (
    <ResourceGraph
      points={[point(1, at - 2000, 40), point(2, at, 56.25)]}
      now={at}
      label="Utilização"
      description="Utilização da memória"
      unit="%"
      {...props}
    />
  )
  const { container, rerender } = render(chart())
  const style = () => container.querySelector('style')?.textContent ?? ''
  const surface = () => container.querySelector('[data-slot="chart"]')
  expect(style()).toContain('--color-value: var(--chart-1);')
  expect(surface()).not.toHaveClass('line-swatch')

  rerender(
    chart({
      color: 'var(--chart-5)',
      className: 'line-swatch [&_path]:opacity-80'
    })
  )
  expect(style()).toContain('--color-value: var(--chart-5);')
  expect(surface()).toHaveClass('line-swatch')
})

it('announces unavailable readings and waits for the first observation', () => {
  const view = render(
    <ResourceGraph
      points={[point(1, at - 2000, 40), point(2, at, null)]}
      now={at}
      label="Utilização"
      description="Utilização da memória"
      unit="%"
    />
  )
  expect(screen.getByText(/1 leitura indisponível/)).toBeVisible()
  expect(
    screen.queryByText('Aguardando histórico observado')
  ).not.toBeInTheDocument()

  view.rerender(
    <ResourceGraph
      points={[]}
      now={at}
      label="Utilização"
      description="Utilização da memória"
      unit="%"
    />
  )
  expect(screen.getByText('Aguardando histórico observado')).toBeVisible()
  expect(screen.queryByText(/leitura indisponível/)).not.toBeInTheDocument()
})
