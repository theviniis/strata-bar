import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AgentAlerts } from '../src/agent-alerts'
import { agentsFixture } from '../src/fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Agents/Alerts',
  component: AgentAlerts,
  args: {
    alerts: agentsFixture().alerts,
    notifications: agentsFixture().notifications,
    times: { alert_demo: { iso: '2023-11-14T22:13:20.000Z', text: '19:13' } },
    pending: false,
    error: null,
    onDismiss: fn()
  }
} satisfies Meta<typeof AgentAlerts>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Empty: Story = {
  args: { alerts: { items: [], paused: false, overflowCount: 0 } }
}
export const Pending: Story = { args: { pending: true } }
export const Error: Story = { args: { error: 'Falha ao dispensar' } }
export const Paused: Story = {
  args: {
    alerts: { ...agentsFixture().alerts, paused: true, overflowCount: 2 }
  }
}
