import { render, screen } from '@testing-library/react'
import { it, expect, vi, beforeEach } from 'vitest'
import App from '../app/app'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
})

it('renders a labelled display-only demo without configuration editors', () => {
  render(<App />)
  expect(screen.getByText('BROWSER PREVIEW')).toBeInTheDocument()
  expect(screen.getByText('DISPLAY-ONLY DEMO')).toBeInTheDocument()
  expect(
    screen.getByRole('navigation', { name: 'Status bar', hidden: true })
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'bottom' })
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
  expect(screen.queryByText('On your bar')).not.toBeInTheDocument()
  expect(screen.queryByText('Edit JSON configuration')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(
    screen
      .getByRole('navigation', { name: 'Status bar', hidden: true })
      .closest('[inert]')
  ).not.toBeNull()
})
