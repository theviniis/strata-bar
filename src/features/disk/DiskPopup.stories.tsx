import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card } from '@/components/ui/card'
import { DiskPopup } from './disk.popup'
import { diskFixture, DISK_FIXTURE_TIME } from './fixtures'

const meta = {
  tags: ['autodocs'],
  title: 'Popups/Discos',
  component: DiskPopup,
  decorators: [
    (Story) => (
      <Card className="w-100">
        <Story />
      </Card>
    )
  ],
  args: {
    event: { status: 'ready', data: diskFixture() },
    now: DISK_FIXTURE_TIME,
    lastData: undefined,
    demo: false
  }
} satisfies Meta<typeof DiskPopup>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Loading: Story = { args: { event: { status: 'loading' } } }
export const Unavailable: Story = {
  args: { event: { status: 'unavailable', data: null } }
}
export const Error: Story = {
  args: { event: { status: 'error', error: 'IPC offline' } }
}
export const Stale: Story = {
  args: {
    event: { status: 'error', error: 'IPC offline' },
    lastData: diskFixture(),
    now: DISK_FIXTURE_TIME + 10000
  }
}

export const Empty: Story = {
  args: { event: { status: 'ready', data: { ...diskFixture(), volumes: [] } } }
}
export const Demo: Story = { args: { demo: true } }
