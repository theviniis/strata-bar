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
import { configSchema, type WidgetType } from '../services/configuration/config'
import { LayoutEditor } from '../settings/LayoutEditor'

function Editor({ centerTypes = [] }: { centerTypes?: WidgetType[] }) {
  const [draft, setDraft] = useState(() =>
    configSchema.parse({
      version: 1,
      bar: {},
      widgets: {
        left: [
          { id: 'cpu', type: 'cpu' },
          { id: 'memory', type: 'memory' }
        ],
        center: centerTypes.map((type) => ({ id: type, type })),
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

function mockPointerLayout() {
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId = 1
      isPrimary = true
    }
  )
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const section =
        this.closest('[data-section]')?.getAttribute('data-section')
      const x = section === 'center' ? 300 : section === 'right' ? 600 : 0
      const item = this.closest('[data-widget]')
      const y = item
        ? 80 + Array.from(item.parentElement!.children).indexOf(item) * 80
        : 0
      const height = item ? 70 : 400
      return {
        x,
        y,
        top: y,
        left: x,
        right: x + 250,
        bottom: y + height,
        width: 250,
        height,
        toJSON() {}
      }
    })

  return () => {
    rect.mockRestore()
    vi.unstubAllGlobals()
  }
}

it.each([
  { x: 350, section: 'Centro' },
  { x: 900, section: 'Esquerda' }
])(
  'keeps the dragged card visible and drops at $x into $section or preserves its source outside the sections',
  async ({ x, section }) => {
    const cleanup = mockPointerLayout()
    try {
      render(<Editor />)
      const handle = screen.getByRole('button', { name: 'Mover CPU' })
      fireEvent.pointerDown(handle, { button: 0, clientX: 20, clientY: 100 })
      fireEvent.pointerMove(document, { clientX: 30, clientY: 100 })
      await act(async () => {})
      fireEvent.pointerMove(document, { clientX: x, clientY: 110 })
      expect(
        await screen.findByRole('img', { name: 'Movendo CPU' })
      ).toBeVisible()
      if (section === 'Centro') {
        expect(
          within(
            screen.getByRole('region', { name: 'Seção Centro' })
          ).getByRole('checkbox', { name: 'Ativar CPU' })
        ).toBeChecked()
        expect(
          JSON.parse(screen.getByLabelText('Draft').textContent!).widgets.center
        ).toEqual([])
      }
      fireEvent.pointerUp(document)
      await waitFor(() => {
        const target = screen.getByRole('region', { name: `Seção ${section}` })
        expect(
          within(target).getByRole('checkbox', { name: 'Ativar CPU' })
        ).toBeChecked()
      })
      expect(
        screen.queryByRole('img', { name: 'Movendo CPU' })
      ).not.toBeInTheDocument()
    } finally {
      cleanup()
    }
  }
)

it('cancels a drag with Escape without moving the widget or leaving its preview behind', async () => {
  render(<Editor />)
  const handle = screen.getByRole('button', { name: 'Mover CPU' })
  handle.focus()
  fireEvent.keyDown(handle, { code: 'Space' })
  expect(await screen.findByRole('img', { name: 'Movendo CPU' })).toBeVisible()
  fireEvent.keyDown(document, { code: 'Escape' })
  await waitFor(() =>
    expect(
      screen.queryByRole('img', { name: 'Movendo CPU' })
    ).not.toBeInTheDocument()
  )
  expect(
    within(screen.getByRole('region', { name: 'Seção Esquerda' })).getByRole(
      'checkbox',
      { name: 'Ativar CPU' }
    )
  ).toBeChecked()
})

it.each(['drop', 'cancel', 'outside'] as const)(
  'reorganizes another section before release and handles %s',
  async (finish) => {
    const cleanup = mockPointerLayout()
    try {
      render(<Editor centerTypes={['gpu', 'volume']} />)
      const handle = screen.getByRole('button', { name: 'Mover CPU' })
      fireEvent.pointerDown(handle, { button: 0, clientX: 20, clientY: 100 })
      fireEvent.pointerMove(document, { clientX: 30, clientY: 100 })
      await act(async () => {})
      fireEvent.pointerMove(document, { clientX: 350, clientY: 145 })
      const center = screen.getByRole('region', { name: 'Seção Centro' })
      expect(center).toHaveAttribute('data-drag-over', 'true')
      await waitFor(() =>
        expect(
          within(center)
            .getAllByRole('checkbox')
            .map((item) => item.getAttribute('aria-label'))
        ).toEqual(['Ativar GPU', 'Ativar CPU', 'Ativar Volume'])
      )
      expect(
        JSON.parse(screen.getByLabelText('Draft').textContent!).widgets.left[0]
          .id
      ).toBe('cpu')
      if (finish === 'cancel') fireEvent.keyDown(document, { code: 'Escape' })
      else {
        fireEvent.pointerMove(document, {
          clientX: finish === 'outside' ? 900 : 350,
          clientY: 300
        })
        if (finish === 'drop') {
          await waitFor(() =>
            expect(
              within(center)
                .getAllByRole('checkbox')
                .map((item) => item.getAttribute('aria-label'))
            ).toEqual(['Ativar GPU', 'Ativar Volume', 'Ativar CPU'])
          )
        }
        fireEvent.pointerUp(document)
      }
      await waitFor(() =>
        expect(
          screen.queryByRole('img', { name: 'Movendo CPU' })
        ).not.toBeInTheDocument()
      )
      const savedDraft = JSON.parse(screen.getByLabelText('Draft').textContent!)
      expect(center).toHaveAttribute('data-drag-over', 'false')
      expect(
        savedDraft.widgets.center.map((item: { id: string }) => item.id)
      ).toEqual(
        finish === 'drop' ? ['gpu', 'volume', 'cpu'] : ['gpu', 'volume']
      )
    } finally {
      cleanup()
    }
  }
)
