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

function widgetIds(region: HTMLElement) {
  return within(region)
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('data-widget'))
}

function Editor({ centerTypes = [] }: { centerTypes?: WidgetType[] }) {
  const [draft, setDraft] = useState(() =>
    configSchema.parse({
      version: 2,
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

it('keeps separators in the catalog and adds independent instances', () => {
  render(<Editor />)
  for (let index = 0; index < 2; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Separador' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Adicionar Separador em Centro' })
    )
  }
  const draft = JSON.parse(screen.getByLabelText('Draft').textContent!)
  expect(
    draft.widgets.center.map((widget: { id: string }) => widget.id)
  ).toEqual(['separator', 'separator-2'])
  const center = screen.getByRole('region', { name: 'Seção Centro' })
  fireEvent.click(
    within(center).getAllByRole('button', { name: 'Configurar Separador' })[0]
  )
  fireEvent.change(screen.getByLabelText('Margem horizontal (px)'), {
    target: { value: '10' }
  })
  const changed = JSON.parse(screen.getByLabelText('Draft').textContent!)
  expect(changed.bar.separatorMarginX).toBe(10)
  expect(changed.widgets.center[1].marginX).toBeUndefined()
})

it('moves through adjacent columns with arrows, appends and preserves settings and keyboard focus', async () => {
  render(<Editor centerTypes={['gpu']} />)
  const before = JSON.parse(screen.getByLabelText('Draft').textContent!).widgets
    .left[0]
  expect(
    screen.getByRole('button', { name: 'Mover CPU para a esquerda' })
  ).toBeDisabled()
  const right = screen.getByRole('button', { name: 'Mover CPU para Centro' })
  right.focus()
  fireEvent.click(right)
  const center = screen.getByRole('region', { name: 'Seção Centro' })
  expect(widgetIds(center)).toEqual(['gpu', 'cpu'])
  expect(
    screen.getByRole('button', { name: 'Mover CPU para Direita' })
  ).toHaveFocus()
  fireEvent.click(
    screen.getByRole('button', { name: 'Mover CPU para Direita' })
  )
  expect(
    screen.getByRole('button', { name: 'Mover CPU para a direita' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Mover CPU para Centro' })
  ).toHaveFocus()
  expect(
    JSON.parse(screen.getByLabelText('Draft').textContent!).widgets.right[0]
  ).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Mover CPU para Centro' }))
  expect(
    screen.getByRole('button', { name: 'Mover CPU para Esquerda' })
  ).toHaveFocus()
  fireEvent.click(
    screen.getByRole('button', { name: 'Mover CPU para Esquerda' })
  )
  expect(
    screen.getByRole('button', { name: 'Mover CPU para Centro' })
  ).toHaveFocus()
  expect(
    screen.getByRole('button', { name: 'Mover CPU para a esquerda' })
  ).toBeDisabled()
})

it('adds from the preview catalog, configures without removal and excludes existing types', async () => {
  render(<Editor />)
  const catalog = screen.getByRole('complementary', {
    name: 'Widgets disponíveis'
  })
  expect(
    within(catalog).queryByRole('button', { name: 'Adicionar CPU' })
  ).not.toBeInTheDocument()
  fireEvent.click(
    within(catalog).getByRole('button', { name: 'Adicionar Volume' })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Adicionar Volume em Centro' })
  )
  const center = screen.getByRole('region', { name: 'Seção Centro' })
  expect(within(center).getByTitle('volume')).toBeInTheDocument()
  fireEvent.click(
    within(center).getByRole('button', { name: 'Configurar Volume' })
  )
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar tooltip' }))
  expect(
    screen.getByRole('checkbox', { name: 'Mostrar tooltip' })
  ).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
  expect(
    JSON.parse(screen.getByLabelText('Draft').textContent!).widgets.center[0]
      .tooltip
  ).toBe(false)
  expect(within(center).getByTitle('volume')).toBeInTheDocument()
  expect(
    within(catalog).queryByRole('button', { name: 'Adicionar Volume' })
  ).not.toBeInTheDocument()
  expect(
    configSchema.safeParse(
      JSON.parse(screen.getByLabelText('Draft').textContent!)
    ).success
  ).toBe(true)
  fireEvent.click(
    within(center).getByRole('button', {
      name: 'Excluir definitivamente Volume'
    })
  )
  expect(within(center).queryByTitle('volume')).not.toBeInTheDocument()
  expect(
    within(catalog).getByRole('button', { name: 'Adicionar Volume' })
  ).toBeInTheDocument()
})

it.each(['drop', 'cancel'] as const)(
  'drags a catalog preview into a column and handles %s',
  async (finish) => {
    const cleanup = mockPointerLayout()
    try {
      render(<Editor />)
      const before = screen.getByLabelText('Draft').textContent
      const handle = screen.getByRole('button', {
        name: 'Arrastar Volume do catálogo'
      })
      fireEvent.pointerDown(handle, { button: 0, clientX: 20, clientY: 100 })
      fireEvent.pointerMove(document, { clientX: 30, clientY: 100 })
      await act(async () => {})
      fireEvent.pointerMove(document, { clientX: 350, clientY: 110 })
      expect(
        await screen.findByRole('img', { name: 'Movendo Volume' })
      ).toBeVisible()
      expect(screen.getByLabelText('Draft').textContent).toBe(before)
      if (finish === 'cancel') fireEvent.keyDown(document, { code: 'Escape' })
      else fireEvent.pointerUp(document)
      await waitFor(() =>
        expect(
          screen.queryByRole('img', { name: 'Movendo Volume' })
        ).not.toBeInTheDocument()
      )
      if (finish === 'cancel')
        expect(screen.getByLabelText('Draft').textContent).toBe(before)
      else {
        const center = screen.getByRole('region', { name: 'Seção Centro' })
        expect(within(center).getByTitle('volume')).toBeInTheDocument()
        expect(
          configSchema.safeParse(
            JSON.parse(screen.getByLabelText('Draft').textContent!)
          ).success
        ).toBe(true)
      }
    } finally {
      cleanup()
    }
  }
)

it('adds multiple separators through successive catalog drags', async () => {
  const cleanup = mockPointerLayout()
  try {
    render(<Editor />)
    for (let index = 0; index < 3; index += 1) {
      const handle = screen.getByRole('button', {
        name: 'Arrastar Separador do catálogo'
      })
      fireEvent.pointerDown(handle, { button: 0, clientX: 20, clientY: 100 })
      fireEvent.pointerMove(document, { clientX: 30, clientY: 100 })
      await act(async () => {})
      fireEvent.pointerMove(document, { clientX: 350, clientY: 110 })
      await screen.findByRole('img', { name: 'Movendo Separador' })
      fireEvent.pointerUp(document)
      await waitFor(() => {
        const draft = JSON.parse(screen.getByLabelText('Draft').textContent!)
        expect(draft.layout.center).toHaveLength(index + 1)
        expect(configSchema.safeParse(draft).success).toBe(true)
      })
    }
  } finally {
    cleanup()
  }
})

it('adds a catalog widget with the keyboard drag handle', async () => {
  const cleanup = mockPointerLayout()
  try {
    render(<Editor />)
    const handle = screen.getByRole('button', {
      name: 'Arrastar Volume do catálogo'
    })
    handle.focus()
    fireEvent.keyDown(handle, { code: 'Space' })
    await screen.findByRole('img', { name: 'Movendo Volume' })
    fireEvent.keyDown(handle, { code: 'ArrowRight' })
    await act(async () => {})
    fireEvent.keyDown(document, { code: 'Space' })
    await waitFor(() =>
      expect(
        screen.queryByRole('img', { name: 'Movendo Volume' })
      ).not.toBeInTheDocument()
    )
    expect(
      JSON.parse(screen.getByLabelText('Draft').textContent!).layout.center
    ).toContain('volume')
  } finally {
    cleanup()
  }
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
      expect(widgetIds(section)).toEqual(['memory', 'cpu'])
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
          widgetIds(screen.getByRole('region', { name: 'Seção Centro' }))
        ).toEqual(['cpu'])
        expect(
          JSON.parse(screen.getByLabelText('Draft').textContent!).widgets.center
        ).toEqual([])
      }
      fireEvent.pointerUp(document)
      await waitFor(() => {
        const target = screen.getByRole('region', { name: `Seção ${section}` })
        expect(widgetIds(target)).toContain('cpu')
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
    widgetIds(screen.getByRole('region', { name: 'Seção Esquerda' }))
  ).toEqual(['cpu', 'memory'])
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
        expect(widgetIds(center)).toEqual(['gpu', 'cpu', 'volume'])
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
            expect(widgetIds(center)).toEqual(['gpu', 'volume', 'cpu'])
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

it('keeps an insertion between cards stable while moving through their gap', async () => {
  const cleanup = mockPointerLayout()
  try {
    render(<Editor centerTypes={['gpu', 'volume']} />)
    const handle = screen.getByRole('button', { name: 'Mover CPU' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 20, clientY: 100 })
    fireEvent.pointerMove(document, { clientX: 30, clientY: 100 })
    await act(async () => {})
    const center = screen.getByRole('region', { name: /Centro$/ })
    for (const clientY of [155, 156, 154, 155]) {
      fireEvent.pointerMove(document, { clientX: 350, clientY })
      await waitFor(() =>
        expect(widgetIds(center)).toEqual(['gpu', 'cpu', 'volume'])
      )
    }
    fireEvent.pointerUp(document)
    expect(
      JSON.parse(
        screen.getByLabelText('Draft').textContent!
      ).widgets.center.map((widget: { id: string }) => widget.id)
    ).toEqual(['gpu', 'cpu', 'volume'])
  } finally {
    cleanup()
  }
})
