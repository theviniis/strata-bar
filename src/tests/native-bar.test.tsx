import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import type {
  Channel,
  SubscribeOptions,
  SystemEvent
} from '../services/system/bridge'

const { setVolume, quit, komorebiAction } = vi.hoisted(() => ({
  setVolume: vi.fn(async () => ({ level: 64, muted: false })),
  quit: vi.fn(async () => {}),
  komorebiAction: vi.fn(async () => {})
}))

vi.mock('../services/system/bridge', () => ({
  bridge: { mode: 'native', setVolume, quit, komorebiAction },
  connect: (
    _bridge: unknown,
    channel: Channel,
    _options: SubscribeOptions,
    onValue: (event: SystemEvent<unknown>) => void
  ) => {
    const metric = (value: number) => ({
      status: 'ready',
      value,
      updatedAt: Date.now(),
      error: null
    })
    const data: Partial<Record<Channel, unknown>> = {
      cpu: { percent: 23.4 },
      memory: {
        sequence: 1,
        sampledAt: Date.now(),
        history: [],
        percent: metric(56.25),
        usedBytes: metric(9663676416),
        totalBytes: metric(17179869184),
        availableBytes: metric(6442450944),
        cachedBytes: metric(4294967296),
        pagingFileBytes: metric(1073741824)
      },
      volume: { level: 64, muted: false },
      komorebi: {
        monitor: 0,
        floatOverride: false,
        workspaces: [
          {
            index: 0,
            name: null,
            status: 'populated',
            layer: 'Tiling',
            windows: 2
          },
          {
            index: 1,
            name: 'web',
            status: 'active',
            layer: 'Tiling',
            windows: 1
          },
          { index: 2, name: null, status: 'empty', layer: 'Tiling', windows: 0 }
        ]
      }
    }
    onValue({ status: 'ready', data: data[channel] })
    return () => {}
  }
}))
import NativeBar from '../components/status-bar/NativeBar'

it('renders real adapter snapshots and the audio popup trigger', () => {
  render(<NativeBar />)
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent(/^23%?$/)
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent(/^56.3%?$/)
  expect(
    screen.getByRole('button', { name: 'Saída de áudio' })
  ).toHaveAttribute('aria-haspopup', 'dialog')
})

it('renders komorebi workspaces and focuses the clicked one', async () => {
  render(<NativeBar />)
  expect(
    screen.getByRole('button', { name: 'Workspace 2 (active)' })
  ).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Workspace 3 (empty)' }))
  await waitFor(() =>
    expect(komorebiAction).toHaveBeenCalledWith({
      action: 'focusWorkspace',
      monitor: 0,
      workspace: 2
    })
  )
})
