import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'
import type { AgentType } from '@/services/system/agents.generated'
import { Card } from '@/components/ui/card'
import { AgentsPopup } from './AgentsPopup'
import { AgentSessionList } from './AgentSessionList'
import { CodexSessions } from './CodexSessions'
import { AntigravitySessions } from './AntigravitySessions'
import { agentsFixture } from './fixtures'
const fixture = agentsFixture()
const meta = {
  tags: ['autodocs'],
  title: 'Popups/Agents',
  component: AgentsPopup,
  decorators: [
    (Story) => (
      <Card className="w-fit">
        <Story />
      </Card>
    )
  ],
  args: {
    snapshot: fixture,
    error: null,
    demo: true,
    applications: fixture.applications,
    activeAgent: 'opencode',
    alerts: null,
    sessions: {
      opencode: (
        <AgentSessionList
          sessions={fixture.opencode.sessions}
          label="Sessões do OpenCode"
          stale={false}
          renderActions={undefined}
        />
      ),
      codex: <CodexSessions connection={fixture.codex} stale={false} />,
      antigravity: (
        <AntigravitySessions connection={fixture.antigravity} stale={false} />
      )
    },
    onAgentChange: fn()
  }
} satisfies Meta<typeof AgentsPopup>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Loading: Story = { args: { snapshot: null, applications: [] } }
export const Error: Story = {
  args: { error: 'Detecção indisponível', snapshot: null, applications: [] }
}
export const Stale: Story = { args: { error: 'Conexão perdida' } }
export const Empty: Story = { args: { applications: [] } }
export const Interactive: Story = {
  render: function AgentsDemo(args) {
    const [agent, setAgent] = useState<AgentType>('opencode')
    return (
      <AgentsPopup
        {...args}
        activeAgent={agent}
        onAgentChange={(value) => {
          const app = args.applications.find((item) => item.agent === value)
          if (app) setAgent(app.agent)
        }}
      />
    )
  }
}
