import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useAudioSelection } from '@/features/audio/src/use-audio-selection'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { useConfig } from '@/stores/config'

type Devices = ChannelData['audioOutputs']
const volume: SystemEvent<ChannelData['volume']> = {
  status: 'ready',
  data: { level: 64, muted: false }
}
const original: Devices = {
  devices: [
    { id: 'first', name: 'First' },
    { id: 'second', name: 'Second' }
  ],
  defaultDeviceId: 'first'
}

it.each(['input', 'output'] as const)(
  '%s selection keeps a newer observation when an older command completes',
  async (direction) => {
    let resolve!: (value: Devices) => void
    const selectDevice = vi.fn(
      () =>
        new Promise<Devices>((done) => {
          resolve = done
        })
    )
    const { result, rerender } = renderHook(
      ({ devices }: { devices: SystemEvent<Devices> }) =>
        useAudioSelection({
          direction,
          devices,
          volume,
          selectDevice,
          writeVolume: async (change) => ({
            level: 64,
            muted: false,
            ...change
          })
        }),
      { initialProps: { devices: { status: 'ready', data: original } } }
    )
    act(() => {
      result.current.select('second')
      result.current.select('first')
    })
    expect(selectDevice).toHaveBeenCalledTimes(1)
    const newer = { ...original, defaultDeviceId: null }
    rerender({ devices: { status: 'ready', data: newer } })
    await act(async () => resolve({ ...original, defaultDeviceId: 'second' }))
    expect(result.current.data).toEqual(newer)
    expect(result.current.pending).toBeNull()
  }
)

it.each([
  { direction: 'input', source: 'windows' },
  { direction: 'output', source: 'windows' },
  { direction: 'input', source: 'voicemeeter' },
  { direction: 'output', source: 'voicemeeter' }
] as const)(
  '$direction keeps queued gain bound to its $source destination across an endpoint change',
  async ({ direction, source }) => {
    const config = useConfig.getState().config
    useConfig.setState({
      config: {
        ...config,
        audio: { ...config.audio, [direction]: { source, targetIndex: 0 } }
      }
    })
    let resolve!: (value: ChannelData['volume']) => void
    const writeVolume = vi.fn(async (change) => ({
      level: 64,
      muted: false,
      ...change
    }))
    writeVolume.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    try {
      const { result, rerender } = renderHook(
        ({ devices }: { devices: SystemEvent<Devices> }) =>
          useAudioSelection({
            direction,
            devices,
            volume,
            selectDevice: async () => original,
            writeVolume
          }),
        { initialProps: { devices: { status: 'ready', data: original } } }
      )
      act(() => {
        result.current.setLevel(70)
        result.current.setLevel(80)
      })
      expect(writeVolume).toHaveBeenCalledTimes(1)
      rerender({
        devices: {
          status: 'ready',
          data: { ...original, defaultDeviceId: 'second' }
        }
      })
      await act(async () => resolve({ level: 70, muted: false }))
      expect(writeVolume).toHaveBeenCalledTimes(source === 'windows' ? 1 : 2)
    } finally {
      act(() => useConfig.setState({ config }))
    }
  }
)
