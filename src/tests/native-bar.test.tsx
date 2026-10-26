import { demoMedia } from '../services/system/media'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import type {
  Channel,
  SubscribeOptions,
  SystemEvent
} from '../services/system/bridge'

const { setVolume, quit, workspacesAction } = vi.hoisted(() => ({
  setVolume: vi.fn(async () => ({ level: 64, muted: false })),
  quit: vi.fn(async () => {}),
  workspacesAction: vi.fn(async () => {})
}))

vi.mock('../services/system/bridge', () => ({
  bridge: { mode: 'native', setVolume, quit, workspacesAction },
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
      media: demoMedia(),
      cpu: { percent: metric(23.4) },
      gpu: { percent: metric(27.3) },
      disk: {
        sequence: 1,
        sampledAt: Date.now(),
        volumes: [
          {
            mount: 'C:',
            label: 'System',
            kind: 'fixed',
            totalBytes: 100,
            freeBytes: 56,
            usedBytes: 44,
            percent: 44
          },
          {
            mount: 'D:',
            label: null,
            kind: 'fixed',
            totalBytes: 100,
            freeBytes: 45,
            usedBytes: 55,
            percent: 55
          }
        ]
      },
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
      microphone: { level: 72, muted: true },
      volume: { level: 64, muted: false },
      workspaces: {
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

it('preserves the widget pill shape through popup trigger composition', () => {
  render(<NativeBar />)
  for (const name of [
    'Detalhes da CPU',
    'Detalhes da GPU',
    'Detalhes dos discos'
  ]) {
    const widget = screen.getByRole('button', { name })
    expect(widget).toHaveClass('rounded-full')
    expect(widget).not.toHaveClass('rounded')
  }
})

it('paints the hover highlight inside the positioned bar above its background', () => {
  render(<NativeBar />)
  const bar = screen.getByRole('navigation')
  const highlight = bar.querySelector('[data-sliding-highlight]')
  expect(highlight).not.toBeNull()
  expect(highlight?.parentElement).toBe(bar)
  expect(bar).toHaveClass('relative', 'isolate')
})

it('renders real adapter snapshots and the audio popup trigger', () => {
  render(<NativeBar />)
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent(/^23.4%?$/)
  expect(screen.getByLabelText('Uso da GPU')).toHaveTextContent(/^27.3%?$/)
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent(/^56.3%?$/)
  expect(
    screen.getByRole('button', { name: 'Detalhes dos discos' })
  ).toHaveTextContent('C: 44%')
  expect(
    screen.getByRole('progressbar', { name: 'Uso do disco D:' })
  ).toHaveAttribute('aria-valuenow', '55')
  expect(
    screen.getByRole('button', { name: 'Detalhes dos discos' })
  ).toHaveAttribute('aria-haspopup', 'dialog')
  expect(
    screen.getByRole('button', { name: 'Saída de áudio' })
  ).toHaveAttribute('aria-haspopup', 'dialog')
})

it('renders workspaces and focuses the clicked one', async () => {
  render(<NativeBar />)
  expect(
    screen.getByRole('button', { name: 'Workspace 2 (active)' })
  ).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Workspace 3 (empty)' }))
  await waitFor(() =>
    expect(workspacesAction).toHaveBeenCalledWith({
      action: 'focusWorkspace',
      monitor: 0,
      workspace: 2
    })
  )
})

it('places music before the audio controls', () => {
  render(<NativeBar />)
  const music = screen.getByLabelText('Música')
  const audio = screen.getByRole('button', { name: 'Saída de áudio' })
  expect(
    music.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  const microphone = screen.getByRole('button', {
    name: 'Entrada de \u00e1udio'
  })
  expect(microphone.querySelector('.lucide-mic-off')).toBeInTheDocument()
})
