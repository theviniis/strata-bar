import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { NetworkPopup } from '../popup/network.popup'
import { networkFixture } from '../src/fixtures'
const data = networkFixture(1_800_000_000_000)
const meta = {
  title: 'Widgets/Network/Popup',
  component: NetworkPopup,
  tags: ['autodocs'],
  args: {
    event: { status: 'ready', data },
    now: data.sampledAt,
    demo: true,
    onStart: fn(),
    onCancel: fn()
  }
} satisfies Meta<typeof NetworkPopup>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Disconnected: Story = {
  args: {
    event: {
      status: 'ready',
      data: {
        ...data,
        download: null,
        upload: null,
        error: 'Interface desconectada'
      }
    }
  }
}
export const ProbeBlocked: Story = {
  args: {
    event: {
      status: 'ready',
      data: {
        ...data,
        quality: {
          ...data.quality,
          pingMs: null,
          jitterMs: null,
          lossPercent: 100,
          lost: 60
        }
      }
    }
  }
}
export const Testing: Story = {
  args: {
    event: {
      status: 'ready',
      data: {
        ...data,
        speedTest: {
          ...data.speedTest,
          phase: 'download',
          downloadMbps: 350,
          elapsedMs: 5000,
          transferredBytes: 50_000_000
        }
      }
    }
  }
}
export const Error: Story = {
  args: { event: { status: 'error', error: 'Coleta indisponível' } }
}
