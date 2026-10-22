import { useState } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { configSchema } from '../services/configuration/config'
import { LayoutEditor } from '../settings/LayoutEditor'

function Editor() {
  const [draft, setDraft] = useState(() =>
    configSchema.parse({
      version: 1,
      bar: {},
      widgets: {
        left: [
          { id: 'cpu', type: 'cpu' },
          { id: 'memory', type: 'memory' }
        ],
        center: [],
        right: []
      }
    })
  )
  return (
    <>
      <LayoutEditor draft={draft} onChange={setDraft} />
      <output aria-label="Draft">{JSON.stringify(draft)}</output>
    </>
  )
}

it('moves a widget to an empty section and retains its settings', () => {
  render(<Editor />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Mover CPU para' }), {
    target: { value: 'right' }
  })
  expect(
    within(screen.getByRole('region', { name: 'Seção Direita' })).getByRole(
      'checkbox',
      { name: 'Ativar CPU' }
    )
  ).toBeChecked()
  expect(
    within(screen.getByRole('region', { name: 'Seção Esquerda' })).queryByRole(
      'checkbox',
      { name: 'Ativar CPU' }
    )
  ).not.toBeInTheDocument()
})

it('adds collision-free widget IDs with valid defaults, toggles and removes', () => {
  render(<Editor />)
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Adicionar widget em Centro' }),
    {
      target: { value: 'cpu' }
    }
  )
  const center = screen.getByRole('region', { name: 'Seção Centro' })
  expect(within(center).getByTitle('cpu-2')).toBeInTheDocument()
  expect(
    within(center).getByRole('checkbox', { name: 'Ativar CPU' })
  ).toBeChecked()
  expect(
    configSchema.safeParse(
      JSON.parse(screen.getByLabelText('Draft').textContent!)
    ).success
  ).toBe(true)
  fireEvent.click(within(center).getByRole('checkbox', { name: 'Ativar CPU' }))
  expect(
    within(center).getByRole('checkbox', { name: 'Ativar CPU' })
  ).not.toBeChecked()
  fireEvent.click(within(center).getByRole('button', { name: 'Remover CPU' }))
  expect(within(center).queryByTitle('cpu-2')).not.toBeInTheDocument()
})

it('reorders adjacent widgets using the drag handle keyboard controls', async () => {
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const item = this.closest('[data-widget]')
      const index = item
        ? Array.from(item.parentElement!.children).indexOf(item)
        : 0
      return {
        x: 0,
        y: index * 60,
        top: index * 60,
        left: 0,
        right: 200,
        bottom: index * 60 + 50,
        width: 200,
        height: 50,
        toJSON() {}
      }
    })
  try {
    render(<Editor />)
    const handle = screen.getByRole('button', {
      name: 'Mover CPU'
    })
    handle.focus()
    fireEvent.keyDown(handle, { code: 'Space' })
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.keyDown(handle, { code: 'ArrowDown' })
    await act(async () => {})
    fireEvent.keyDown(handle, { code: 'Space' })
    await waitFor(() => {
      const section = screen.getByRole('region', { name: 'Seção Esquerda' })
      expect(
        within(section)
          .getAllByRole('checkbox')
          .map((item) => item.getAttribute('aria-label'))
      ).toEqual(['Ativar RAM', 'Ativar CPU'])
    })
  } finally {
    rect.mockRestore()
  }
})
