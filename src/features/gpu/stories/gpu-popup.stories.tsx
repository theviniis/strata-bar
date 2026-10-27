import { Card } from '@/components/ui/card'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GpuPopup } from '../popup/gpu.popup'
import { GPU_FIXTURE_TIME, gpuFixture } from '../src/fixtures'

const meta = {
  tags: ['autodocs'],
  title: 'Popups/GPU',
  component: GpuPopup,
  decorators: [
    (Story) => (
      <Card className="w-100">
        <Story />
      </Card>
    )
  ],
  args: {
    event: { status: 'ready', data: gpuFixture() },
    now: GPU_FIXTURE_TIME,
    lastData: undefined,
    demo: false
  }
} satisfies Meta<typeof GpuPopup>
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
    lastData: gpuFixture(),
    now: GPU_FIXTURE_TIME + 10000
  }
}
export const WithoutThermalSensors: Story = {
  args: {
    event: {
      status: 'ready',
      data: {
        ...gpuFixture(),
        temperatureCelsius: {
          status: 'unavailable',
          value: null,
          updatedAt: null,
          error: 'Sensor ausente'
        },
        temperatureSensor: null,
        powerWatts: {
          status: 'unavailable',
          value: null,
          updatedAt: null,
          error: 'Sensor ausente'
        },
        fanPercent: {
          status: 'unavailable',
          value: null,
          updatedAt: null,
          error: 'Sensor ausente'
        },
        history: gpuFixture().history.map((point) => ({
          ...point,
          temperatureCelsius: null,
          temperatureUpdatedAt: null
        }))
      }
    }
  }
}
