import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { WidgetItem } from '@/components/widget-item'
import { SlidingHighlight } from './sliding-highlight'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

const meta = {
  title: 'UI/SlidingHighlight',
  component: SlidingHighlight,
  parameters: { layout: 'centered' },
  argTypes: {
    children: {
      control: false,
      description: 'Um único elemento DOM ou com ref encaminhada.'
    },
    highlightClassName: {
      control: 'text',
      description: 'Classes do fundo decorativo.'
    },
    spring: {
      control: 'object',
      description: 'Configuração da mola do Motion.'
    }
  },
  args: {
    children: (
      <div className="flex gap-2 rounded-lg border bg-background p-2">
        {['Visão geral', 'Atividade', 'Configurações'].map((label) => (
          <button
            key={label}
            data-sliding-highlight-item
            className="rounded px-3 py-2 focus-visible:outline-accent"
          >
            {label}
          </button>
        ))}
        <button
          data-sliding-highlight-item
          disabled
          className="rounded px-3 py-2 opacity-40"
        >
          Indisponível
        </button>
      </div>
    )
  }
} satisfies Meta<typeof SlidingHighlight>

export default meta
type Story = StoryObj<typeof meta>

export const Horizontal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = canvas.getByRole('button', { name: 'Visão geral' })
    const second = canvas.getByRole('button', { name: 'Configurações' })
    const highlight = canvasElement.querySelector('[data-sliding-highlight]')!
    await userEvent.hover(first)
    await waitFor(() => expect(highlight).toHaveStyle({ opacity: '1' }))
    await userEvent.unhover(first)
    await userEvent.hover(second)
    await waitFor(() => {
      expect(
        Math.abs(
          highlight.getBoundingClientRect().left -
            second.getBoundingClientRect().left
        )
      ).toBeLessThan(1)
      expect(
        Math.abs(
          highlight.getBoundingClientRect().width -
            second.getBoundingClientRect().width
        )
      ).toBeLessThan(1)
    })
    await userEvent.unhover(second)
    await waitFor(() => expect(highlight).toHaveStyle({ opacity: '0' }))
  }
}

export const Vertical: Story = {
  args: {
    children: (
      <div className="flex w-56 flex-col gap-1 rounded-lg border bg-background p-2">
        {['Início', 'Biblioteca', 'Preferências'].map((label) => (
          <button
            key={label}
            data-sliding-highlight-item
            className="rounded px-3 py-2 text-left focus-visible:outline-accent"
          >
            {label}
          </button>
        ))}
      </div>
    )
  }
}

export const Customized: Story = {
  args: {
    highlightClassName: 'bg-accent/20',
    spring: { stiffness: 350, damping: 24, mass: 1 }
  }
}

export const ItemShapes: Story = {
  args: {
    children: (
      <div className="flex gap-3 rounded-lg border bg-background p-2">
        <WidgetItem className="rounded-full bg-transparent">Cápsula</WidgetItem>
        <WidgetItem className="rounded-none bg-transparent">Reto</WidgetItem>
        <WidgetItem className="rounded-tl-2xl rounded-tr-sm rounded-br-xl rounded-bl-none bg-transparent">
          Assimétrico
        </WidgetItem>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const highlight = canvasElement.querySelector('[data-sliding-highlight]')!
    for (const name of ['Cápsula', 'Reto', 'Assimétrico']) {
      const item = canvas.getByRole('button', { name })
      await userEvent.hover(item)
      await waitFor(() => {
        const expected = getComputedStyle(item)
        const actual = getComputedStyle(highlight)
        for (const corner of [
          'borderTopLeftRadius',
          'borderTopRightRadius',
          'borderBottomRightRadius',
          'borderBottomLeftRadius'
        ] as const) {
          expect(actual[corner]).toBe(expected[corner])
        }
      })
      await userEvent.unhover(item)
    }
  }
}

export const Widgets: Story = {
  args: {
    children: (
      <nav
        aria-label="Widgets de exemplo"
        className="flex gap-2 rounded-lg border bg-background p-2"
      >
        <WidgetItem>CPU 24%</WidgetItem>
        <WidgetItem>RAM 56%</WidgetItem>
        <WidgetItem>Volume 80%</WidgetItem>
      </nav>
    )
  }
}

export const TabTriggers: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Exemplo de tabs">
        <TabsTrigger value="overview">Visão geral</TabsTrigger>
        <TabsTrigger value="activity">Atividade</TabsTrigger>
        <TabsTrigger value="settings">Configurações</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Indisponível
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Resumo da atividade.</TabsContent>
      <TabsContent value="activity">Atividade recente.</TabsContent>
      <TabsContent value="settings">Preferências do aplicativo.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = canvas.getByRole('tab', { name: 'Visão geral' })
    const second = canvas.getByRole('tab', { name: 'Atividade' })
    const highlight = canvasElement.querySelector('[data-sliding-highlight]')!
    await userEvent.hover(second)
    await waitFor(() => expect(highlight).toHaveStyle({ opacity: '1' }))
    await expect(first).toHaveAttribute('aria-selected', 'true')
    await expect(second).toHaveAttribute('aria-selected', 'false')
    await userEvent.click(second)
    await expect(second).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowRight}')
    await expect(
      canvas.getByRole('tab', { name: 'Configurações' })
    ).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(second).toHaveFocus()
    await expect(
      canvas.getByRole('tab', { name: 'Indisponível' })
    ).toHaveAttribute('aria-selected', 'false')
    await userEvent.unhover(second)
    await waitFor(() => expect(highlight).toHaveStyle({ opacity: '0' }))
  }
}
