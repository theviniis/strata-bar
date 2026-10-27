import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { workspacesFixture } from '../src/fixtures'
import { useWorkspaceIndicator } from '../src/use-workspace-indicator'
import { WorkspacesWidget } from '../widget/workspaces.widget'

const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Workspaces',
  component: WorkspacesWidget,
  decorators: [
    (Story) => (
      <div className="flex h-8 items-center">
        <Story />
      </div>
    )
  ],
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
      <WorkspacesWidget
        {...args}
        workspaceProps={{ ...args.workspaceProps, ...refs }}
      />
    )
  },
  args: {
    event: { status: 'ready', data: workspacesFixture() },
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
} satisfies Meta<typeof WorkspacesWidget>
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
