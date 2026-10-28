import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'
import { NetworkSpeedTest } from '../src/network-speed-test'
import { networkFixture } from '../src/fixtures'

const data = networkFixture(1_800_000_000_000)
const meta = {
  title: 'Widgets/Network/Speed Test',
  component: NetworkSpeedTest,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Demonstração com medições ilustrativas; não transfere dados pela rede.'
      }
    }
  },
  args: {
    test: data.speedTest,
    quality: data.quality,
    busy: false,
    onStart: fn(),
    onCancel: fn()
  },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full rounded border border-border bg-background p-4">
        <Story />
      </div>
    )
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Teste de velocidade' })
    )
  }
} satisfies Meta<typeof NetworkSpeedTest>
export default meta
type Story = StoryObj<typeof meta>
export const Idle: Story = {}
export const Download: Story = {
  args: {
    test: {
      ...data.speedTest,
      phase: 'download',
      downloadMbps: 83.75,
      elapsedMs: 5000,
      stageProgress: 0.33,
      transferredBytes: 50_000_000
    }
  }
}
export const Upload: Story = {
  args: {
    test: {
      ...data.speedTest,
      phase: 'upload',
      downloadMbps: 94.97,
      uploadMbps: 93.57,
      elapsedMs: 18000,
      stageProgress: 0.2,
      transferredBytes: 120_000_000
    }
  }
}
export const Complete: Story = {
  args: {
    test: {
      ...data.speedTest,
      phase: 'complete',
      downloadMbps: 94.97,
      uploadMbps: 93.57,
      elapsedMs: 23000,
      stageProgress: 1,
      transferredBytes: 180_000_000
    }
  }
}
export const Failed: Story = {
  args: {
    test: {
      ...data.speedTest,
      phase: 'error',
      error: 'Não foi possível concluir a medição.'
    }
  }
}
export const Gigabit: Story = {
  args: {
    test: {
      ...data.speedTest,
      phase: 'download',
      downloadMbps: 2400,
      elapsedMs: 3000,
      stageProgress: 0.8,
      transferredBytes: 200_000_000
    }
  }
}
