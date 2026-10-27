import { WorkspacesWidget } from '../features/workspaces/widget/workspaces.widget'
import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { Workspaces } from '../features/workspaces/src/workspaces'
import type { Workspace } from '../services/system/bridge'

const visualProps = {
  offline: false,
  showTitles: false,
  describedBy: undefined,
  containerRef: undefined,
  indicatorRef: undefined,
  itemRef: undefined,
  onSelect: () => {}
}

const workspaces: Workspace[] = [
  { index: 0, name: null, status: 'populated', layer: 'Tiling', windows: 2 },
  { index: 1, name: 'web', status: 'active', layer: 'Tiling', windows: 1 },
  { index: 2, name: null, status: 'empty', layer: 'Floating', windows: 0 }
]

it('marks the active workspace and reports selections', () => {
  const onSelect = vi.fn()
  render(
    <Workspaces {...visualProps} workspaces={workspaces} onSelect={onSelect} />
  )
  expect(
    screen.getByRole('button', { name: 'Workspace 2 (active)' })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    screen.getByRole('button', { name: 'Workspace 1 (populated)' })
  ).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Workspace 3 (empty)' }))
  expect(onSelect).toHaveBeenCalledWith(2)
})

it('shows an offline label instead of stale workspaces', () => {
  render(<Workspaces {...visualProps} workspaces={workspaces} offline />)
  expect(screen.getByText('Workspaces Offline')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('labels the widget with the active workspace name and falls back to its number', () => {
  const data = { monitor: 0, floatOverride: false, workspaces }
  const { rerender } = render(
    <WorkspacesWidget
      event={{ status: 'ready', data }}
      format="label"
      workspaceProps={visualProps}
    />
  )
  expect(screen.getByText('web')).toBeInTheDocument()
  expect(screen.queryByText('Áreas')).not.toBeInTheDocument()
  rerender(
    <WorkspacesWidget
      event={{
        status: 'ready',
        data: {
          ...data,
          workspaces: workspaces.map((w) => ({ ...w, name: null }))
        }
      }}
      format="label"
      workspaceProps={visualProps}
    />
  )
  expect(screen.getByText('Área 2')).toBeInTheDocument()
  rerender(
    <WorkspacesWidget
      event={{ status: 'ready', data }}
      format="compact"
      workspaceProps={visualProps}
    />
  )
  expect(screen.queryByText('web')).not.toBeInTheDocument()
})
