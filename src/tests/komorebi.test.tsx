import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { Workspaces } from '../features/komorebi/Workspaces'
import type { KomorebiWorkspace } from '../services/system/bridge'

const workspaces: KomorebiWorkspace[] = [
  { index: 0, name: null, status: 'populated', layer: 'Tiling', windows: 2 },
  { index: 1, name: 'web', status: 'active', layer: 'Tiling', windows: 1 },
  { index: 2, name: null, status: 'empty', layer: 'Floating', windows: 0 }
]

it('marks the active workspace and reports selections', () => {
  const onSelect = vi.fn()
  render(<Workspaces workspaces={workspaces} onSelect={onSelect} />)
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
  render(<Workspaces workspaces={workspaces} offline />)
  expect(screen.getByText('Komorebi Offline')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
