import { Profiler } from 'react'
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MediaSpectrumController } from '@/features/media-spectrum/widget/media-spectrum.controller'
import { WidgetRuntimeContext } from '@/components/status-bar/widget-runtime-context'
import { liveWidgetRuntime } from '@/services/system/widget-runtime'
import { demoSpectrum } from '@/services/system/media-spectrum'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'

it('paints every spectrum frame without a React commit per frame and disposes on close', () => {
  let emit: (
    event: SystemEvent<ChannelData['mediaSpectrum']>
  ) => void = () => {}
  const dispose = vi.fn()
  const runtime = {
    ...liveWidgetRuntime,
    subscribe: vi.fn((_channel, _options, listener) => {
      emit = listener
      return dispose
    })
  }
  const commits = vi.fn()
  const view = render(
    <WidgetRuntimeContext value={runtime}>
      <Profiler id="spectrum" onRender={commits}>
        <MediaSpectrumController />
      </Profiler>
    </WidgetRuntimeContext>
  )
  act(() => emit({ status: 'ready', data: demoSpectrum() }))
  commits.mockClear()
  for (let sequence = 2; sequence <= 30; sequence++) {
    const value = sequence / 30
    act(() =>
      emit({
        status: 'ready',
        data: { ...demoSpectrum(), sequence, bands: [value, 0, 0, 0, 0, 0] }
      })
    )
    expect(
      view.container.querySelector('[data-spectrum-band="0"]')
    ).toHaveStyle({
      transform: `scaleY(${0.05 + value * 0.95})`
    })
  }
  expect(commits).not.toHaveBeenCalled()
  act(() => emit({ status: 'unavailable', data: null }))
  expect(view.container.querySelector('[data-spectrum-band="0"]')).toHaveStyle({
    transform: 'scaleY(0.05)'
  })
  view.unmount()
  expect(dispose).toHaveBeenCalledTimes(1)
})
