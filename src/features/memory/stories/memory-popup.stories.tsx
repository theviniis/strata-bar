import { Card } from '@/components/ui/card'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryPopup } from '../popup/memory.popup'
import { MEMORY_FIXTURE_TIME, memoryFixture } from '../src/fixtures'

const meta = {
  tags: ['autodocs'],
  title: 'Popups/RAM',
  component: MemoryPopup,
  decorators: [
    (Story) => (
      <Card className="w-100">
        <Story />
      </Card>
    )
  ],
  args: {
    event: { status: 'ready', data: memoryFixture() },
    now: MEMORY_FIXTURE_TIME,
    lastData: undefined,
    demo: false
  }
} satisfies Meta<typeof MemoryPopup>
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
    lastData: memoryFixture(),
    now: MEMORY_FIXTURE_TIME + 10000
  }
}

export const PartialFailure: Story = {
  args: {
    event: {
      status: 'ready',
      data: {
        ...memoryFixture(),
        cachedBytes: {
          status: 'unavailable',
          value: null,
          updatedAt: null,
          error: 'Contador ausente'
        },
        pagingFileBytes: {
          status: 'notConfigured',
          value: null,
          updatedAt: MEMORY_FIXTURE_TIME,
          error: null
        }
      }
    }
  }
}
export const Demo: Story = { args: { demo: true } }
