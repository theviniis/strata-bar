import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Komorebi } from './Komorebi'
import { komorebiFixture } from './fixtures'
import { useWorkspaceIndicator } from './useWorkspaceIndicator'

const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Komorebi',
  component: Komorebi,
  render: function WorkspaceDemo(args) {
    const activeIndex =
      args.event.status === 'ready'
        ? args.event.data.workspaces.find(
            (workspace) => workspace.status === 'active'
          )?.index
        : undefined
    const refs = useWorkspaceIndicator(
      activeIndex,
      args.event.status !== 'ready'
    )
    return (
      <Komorebi
        {...args}
        workspaceProps={{ ...args.workspaceProps, ...refs }}
      />
    )
  },
  args: {
    event: { status: 'ready', data: komorebiFixture() },
    format: 'label',
    workspaceProps: {
      onSelect: fn(),
      showTitles: true,
      describedBy: undefined,
      containerRef: undefined,
      indicatorRef: undefined,
      itemRef: undefined
    }
  }
} satisfies Meta<typeof Komorebi>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Compact: Story = { args: { format: 'compact' } }
export const Loading: Story = { args: { event: { status: 'loading' } } }
export const Offline: Story = {
  args: { event: { status: 'unavailable', data: null } }
}
export const Error: Story = {
  args: { event: { status: 'error', error: 'IPC offline' } }
}
