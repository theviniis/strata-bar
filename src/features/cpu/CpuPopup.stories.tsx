import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card } from '@/components/ui/card'
import { CpuPopup } from './CpuPopup'
import { cpuFixture, CPU_FIXTURE_TIME } from './fixtures'

const meta = {
  tags: ['autodocs'],
  title: 'Popups/CPU',
  component: CpuPopup,
  decorators: [
    (Story) => (
      <Card className="w-100">
        <Story />
      </Card>
    )
  ],
  args: {
    event: { status: 'ready', data: cpuFixture() },
    now: CPU_FIXTURE_TIME,
    lastData: undefined,
    demo: false
  }
} satisfies Meta<typeof CpuPopup>
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
    lastData: cpuFixture(),
    now: CPU_FIXTURE_TIME + 10000
  }
}
export const WithoutTemperature: Story = {
  args: {
    event: {
      status: 'ready',
      data: {
        ...cpuFixture(),
        temperatureCelsius: {
          status: 'unavailable',
          value: null,
          updatedAt: null,
          error: 'Sensor ausente'
        },
        temperatureSensor: null
      }
    }
  }
}
