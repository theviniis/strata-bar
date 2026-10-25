import { z } from 'zod'
import type { SystemEvent } from './bridge'
import type { MediaSpectrumData } from './media.generated'

const intensity = z.number().finite().min(0).max(1)
const schema = z.strictObject({
  sessionId: z.string().min(1),
  generation: z.number().int().nonnegative().max(4_294_967_295),
  sequence: z.number().int().nonnegative().max(4_294_967_295),
  bands: z.tuple([
    intensity,
    intensity,
    intensity,
    intensity,
    intensity,
    intensity
  ])
}) satisfies z.ZodType<MediaSpectrumData>

/** A guard belongs to one subscription; old captures cannot replace newer ones. */
export function spectrumEventGuard() {
  let generation = -1
  let sequence = -1
  let timestamp = -1
  return (
    event: SystemEvent<unknown>
  ): SystemEvent<MediaSpectrumData> | null => {
    if (event.timestamp !== undefined && event.timestamp < timestamp)
      return null
    if (event.status !== 'ready') {
      if (event.timestamp !== undefined) timestamp = event.timestamp
      return { ...event, data: null }
    }
    const result = schema.safeParse(event.data)
    if (!result.success)
      return {
        status: 'error',
        data: null,
        error: 'Espectro de mídia inválido'
      }
    const data = result.data
    if (
      data.generation < generation ||
      (data.generation === generation && data.sequence <= sequence)
    )
      return null
    generation = data.generation
    sequence = data.sequence
    if (event.timestamp !== undefined) timestamp = event.timestamp
    return { ...event, data }
  }
}

export function demoSpectrum(): MediaSpectrumData {
  return {
    sessionId: 'demo-spectrum',
    generation: 1,
    sequence: 1,
    bands: [0.2, 0.55, 0.95, 0.7, 0.4, 0.15]
  }
}
