import type { Meta, StoryObj } from '@storybook/react-vite'
import { Unsupported } from '@/components/status-bar/Unsupported'
const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Unavailable',
  component: Unsupported,
  args: { label: 'Rede' }
} satisfies Meta<typeof Unsupported>
export default meta
type Story = StoryObj<typeof meta>
export const Network: Story = {}
export const ActiveWindow: Story = { args: { label: 'Janela ativa' } }
