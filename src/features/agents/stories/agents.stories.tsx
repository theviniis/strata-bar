import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Agents } from '../widget/agents.widget'
const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Agents',
  component: Agents,
  args: { count: 0, paused: false, describedBy: undefined, onClick: fn() }
} satisfies Meta<typeof Agents>
export default meta
type Story = StoryObj<typeof meta>
export const Idle: Story = {}
export const Alerts: Story = { args: { count: 3 } }
export const Paused: Story = { args: { paused: true } }
