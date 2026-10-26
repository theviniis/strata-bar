import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'

it('opens and reopens an already-checked setting with its indicator fully drawn', () => {
  render(
    <Popover>
      <PopoverTrigger>Configurar</PopoverTrigger>
      <PopoverContent>
        <Checkbox defaultChecked aria-label="Mostrar tooltip" />
      </PopoverContent>
    </Popover>
  )

  for (let opening = 0; opening < 2; opening++) {
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }))
    const checkbox = screen.getByRole('checkbox', { name: 'Mostrar tooltip' })
    expect(checkbox).toBeChecked()
    expect(checkbox.querySelector('span')).toHaveStyle({ opacity: '1' })
    expect(checkbox.querySelector('path')).toHaveAttribute(
      'stroke-dasharray',
      '1 1'
    )
    fireEvent.keyDown(checkbox, { key: 'Escape' })
  }
})
