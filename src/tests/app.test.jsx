import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect } from 'vitest'
import App from '../app/App'
it('renders the demo shell and applies visual preferences', () => {
  render(<App />)
  expect(screen.getByText('BROWSER PREVIEW')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'bottom', exact: true }))
  expect(
    screen.getByRole('button', { name: 'bottom', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    screen.getByRole('navigation', { name: 'Status bar' })
  ).toBeInTheDocument()
})
