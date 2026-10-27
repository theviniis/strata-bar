import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { agentsFixture } from '../src/fixtures'
import { OpenCodeSessions } from '../src/open-code-sessions'
const meta = {
  tags: ['autodocs'],
  title: 'Agents/OpenCodeSessions',
  component: OpenCodeSessions,
  args: {
    connection: agentsFixture().opencode,
    stale: false,
    pending: false,
    error: null,
    creating: true,
    directory: 'D:/project',
    created: null,
    prompt: '',
    replyNotice: null,
    promptTooLong: false,
    canCreate: true,
    renderActions: undefined,
    onCreateSubmit: fn(),
    onStartCreating: fn(),
    onCancelCreating: fn(),
    onDirectoryChange: fn(),
    onPromptChange: fn()
  }
} satisfies Meta<typeof OpenCodeSessions>
export default meta
type Story = StoryObj<typeof meta>
export const Create: Story = {}
export const Pending: Story = { args: { pending: true } }
export const Error: Story = {
  args: { error: 'Conexão perdida', stale: true, canCreate: false }
}
