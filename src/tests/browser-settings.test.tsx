import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SettingsView } from '../settings/SettingsView'

it('does not expose a configuration editor outside the native runtime', () => {
  render(<SettingsView />)
  expect(
    screen.getByText('Open Settings from the Windows tray to configure Strata.')
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /aplicar|apply/i })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
