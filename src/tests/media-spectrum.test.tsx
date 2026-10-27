import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaSpectrum } from '@/features/media-spectrum/widget/media-spectrum.widget'
import {
  demoSpectrum,
  spectrumEventGuard
} from '@/services/system/media-spectrum'
import { widgetSchema } from '@/services/configuration/config'
import { typeLabels } from '@/settings/layout'

const preferences = vi.hoisted(() => ({ reduced: true }))
vi.mock('motion/react', async (original) => ({
  ...(await original<typeof import('motion/react')>()),
  useReducedMotion: () => preferences.reduced
}))

describe('media spectrum', () => {
  afterEach(() => vi.useRealTimers())
  it('renders exactly six frequency bars and labels demonstration data', () => {
    const { container } = render(<MediaSpectrum data={demoSpectrum()} demo />)
    expect(
      screen.getByRole('img', { name: 'Espectro de mídia · demonstração' })
    ).toBeVisible()
    expect(container.querySelectorAll('[data-spectrum-band]')).toHaveLength(6)
  })

  it('waits 30 seconds before hiding and shows zero levels while inactive', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(
      <MediaSpectrum data={{ ...demoSpectrum(), bands: [0, 0, 0, 0, 0, 0] }} />
    )
    for (const bar of container.querySelectorAll('[data-spectrum-band]'))
      expect(bar.getAttribute('style')).toContain('scaleY(0.05)')
    rerender(<MediaSpectrum data={null} />)
    await act(() => vi.advanceTimersByTimeAsync(29_999))
    expect(screen.getByRole('img')).toBeVisible()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(container).toBeEmptyDOMElement()
  })

  it('cancels hiding when playback resumes and restarts the idle delay', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<MediaSpectrum data={demoSpectrum()} />)
    rerender(<MediaSpectrum data={null} />)
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    rerender(<MediaSpectrum data={demoSpectrum()} />)
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(screen.getByRole('img')).toBeVisible()
    rerender(<MediaSpectrum data={null} />)
    await act(() => vi.advanceTimersByTimeAsync(29_999))
    expect(screen.getByRole('img')).toBeVisible()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    rerender(<MediaSpectrum data={demoSpectrum()} />)
    expect(screen.getByRole('img')).toBeVisible()
  })

  it('registers an independently configurable widget without changing defaults', () => {
    expect(
      widgetSchema.parse({ id: 'spectrum', type: 'mediaSpectrum' }).type
    ).toBe('mediaSpectrum')
    expect(typeLabels.mediaSpectrum).toBe('Espectro de mídia')
  })

  it('rejects malformed intensities, lengths and non-finite values', () => {
    for (const bands of [
      [0, 1],
      [0, 0, 0, 0, 0, 2],
      [0, 0, 0, 0, 0, NaN],
      [0, 0, 0, 0, 0, -1]
    ]) {
      const event = spectrumEventGuard()({
        status: 'ready',
        data: { ...demoSpectrum(), bands }
      })
      expect(event?.status).toBe('error')
    }
  })

  it('discards old capture generations, sequences and pre-clear events', () => {
    const accept = spectrumEventGuard()
    const event = (
      generation: number,
      sequence: number,
      timestamp: number
    ) => ({
      status: 'ready' as const,
      data: { ...demoSpectrum(), generation, sequence },
      timestamp
    })
    expect(accept(event(1, 10, 100))?.status).toBe('ready')
    expect(accept(event(2, 1, 110))?.status).toBe('ready')
    expect(accept(event(1, 11, 111))).toBeNull()
    expect(accept(event(2, 1, 112))).toBeNull()
    expect(accept({ status: 'unavailable', timestamp: 120 })?.status).toBe(
      'unavailable'
    )
    expect(accept(event(2, 2, 115))).toBeNull()
    expect(accept(event(3, 1, 125))?.status).toBe('ready')
  })
})
