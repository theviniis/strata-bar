import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
const transport = vi.hoisted(() => ({ subscribe: vi.fn() }))
vi.mock('@/services/system/bridge', async (original) => ({
  ...(await original<typeof import('@/services/system/bridge')>()),
  bridge: { mode: 'native', subscribe: transport.subscribe }
}))
import {
  liveWidgetRuntime,
  retainChannel
} from '@/services/system/widget-runtime'
import { useSystemChannel } from '@/hooks/use-system-channel'
function Reading() {
  return <p>{useSystemChannel('volume').status}</p>
}
it('reopens with the retained reading before the next async subscription resolves', async () => {
  transport.subscribe.mockImplementationOnce(async (_channel, listener) => {
    listener({ status: 'ready', data: { level: 42, muted: false } })
    return vi.fn()
  })
  const first = render(<Reading />)
  await act(async () => {})
  expect(screen.getByText('ready')).toBeInTheDocument()
  first.unmount()
  transport.subscribe.mockImplementationOnce(() => new Promise(() => {}))
  render(<Reading />)
  expect(screen.getByText('ready')).toBeInTheDocument()
  expect(liveWidgetRuntime.initial('volume').status).toBe('ready')
})

it('expires retained readings and preserves explicit native failure', () => {
  vi.useFakeTimers()
  try {
    retainChannel('volume', {
      status: 'ready',
      data: { level: 12, muted: true }
    })
    expect(liveWidgetRuntime.initial('volume').status).toBe('ready')
    vi.advanceTimersByTime(5001)
    expect(liveWidgetRuntime.initial('volume').status).toBe('loading')
    retainChannel('volume', { status: 'error', error: 'Endpoint disconnected' })
    expect(liveWidgetRuntime.initial('volume')).toEqual({
      status: 'error',
      error: 'Endpoint disconnected'
    })
  } finally {
    vi.useRealTimers()
  }
})
