import type { Meta, StoryObj } from '@storybook/react-vite'
import { BarVerticalSeparator } from './bar-vertical-separator'

const meta = {
  title: 'UI/BarVerticalSeparator',
  component: BarVerticalSeparator,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Separador decorativo adicionado explicitamente pelo editor de layout. Todas as instâncias usam a margem global bar.separatorMarginX, somada ao espaçamento geral da barra. A prop marginX permite demonstrar o componente isoladamente.'
      }
    }
  },
  args: { marginX: 0 },
  argTypes: {
    marginX: {
      control: { type: 'number', min: 0, max: 32 },
      description:
        'Margem em pixels CSS de cada lado, adicional ao gap da barra.',
      table: { defaultValue: { summary: '0' } }
    }
  },
  render: (args) => (
    <div className="flex items-center gap-2">
      <span>CPU 12%</span>
      <BarVerticalSeparator {...args} />
      <span>RAM 48%</span>
    </div>
  )
} satisfies Meta<typeof BarVerticalSeparator>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const CustomMargin: Story = { args: { marginX: 12 } }
export const Multiple: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <span>CPU 12%</span>
      <BarVerticalSeparator {...args} />
      <BarVerticalSeparator {...args} />
      <span>RAM 48%</span>
      <BarVerticalSeparator {...args} />
      <span>12:30</span>
    </div>
  )
}
