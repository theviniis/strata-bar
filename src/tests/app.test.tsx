import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect, vi, beforeEach } from 'vitest'
import App from '../app/App'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
})

it('renders the demo shell and applies visual preferences', () => {
  render(<App />)
  expect(screen.getByText('BROWSER PREVIEW')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'bottom' }))
  expect(screen.getByRole('button', { name: 'bottom' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(
    screen.getByRole('navigation', { name: 'Status bar' })
  ).toBeInTheDocument()
})
