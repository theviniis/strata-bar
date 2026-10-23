import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AgentPermissionCard } from './AgentPermissionCard'
import { agentPermissionFixture } from './fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Agents/Permission',
  component: AgentPermissionCard,
  args: {
    permission: agentPermissionFixture(),
    pending: false,
    attempted: false,
    error: null,
    blocked: false,
    onDecision: fn()
  }
} satisfies Meta<typeof AgentPermissionCard>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Pending: Story = { args: { pending: true, blocked: true } }
export const Error: Story = {
  args: { error: 'Decisão sem confirmação', attempted: true, blocked: true }
}
