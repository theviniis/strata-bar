import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
const { setVolume, quit } = vi.hoisted(() => ({
  setVolume: vi.fn(async () => ({ level: 64, muted: false })),
  quit: vi.fn(async () => {})
}))
vi.mock('../services/system/bridge', () => ({
  bridge: { mode: 'native', setVolume, quit },
  connect: (_bridge, channel, _options, onValue) => {
    const data = {
      cpu: { percent: 23.4 },
      memory: {
        percent: 48.2,
        usedBytes: 8 * 1073741824,
        totalBytes: 16 * 1073741824
      },
      volume: { level: 64, muted: false }
    }
    onValue({ status: 'ready', data: data[channel] })
    return () => {}
  }
}))
import NativeBar from '../components/status-bar/NativeBar'
it('renders real adapter snapshots and commits volume controls', async () => {
  render(<NativeBar />)
  expect(screen.getByLabelText('Uso da CPU')).toHaveTextContent('23%')
  expect(screen.getByLabelText('Uso da RAM')).toHaveTextContent('48%')
  fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), {
    target: { value: '42' }
  })
  fireEvent.pointerUp(screen.getByRole('slider', { name: 'Volume' }))
  await waitFor(() => expect(setVolume).toHaveBeenCalledWith({ level: 42 }))
  fireEvent.click(screen.getByRole('button', { name: 'Silenciar' }))
  await waitFor(() => expect(setVolume).toHaveBeenCalledWith({ muted: true }))
})
it('offers a deliberate exit for all monitor bars', async () => {
  render(<NativeBar />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair do Strata' }))
  await waitFor(() => expect(quit).toHaveBeenCalled())
})
