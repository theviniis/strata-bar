import { z } from 'zod'
import type { SystemEvent } from './bridge'
import type { MediaData, MediaProgress } from './media.generated'

const availability = z.enum([
  'ready',
  'unsupported',
  'unauthenticated',
  'unavailable',
  'error'
])
function resource<T extends z.ZodType>(schema: T) {
  return z
    .object({
      status: availability,
      value: schema.nullable(),
      reason: z.string().nullable()
    })
    .strict()
    .refine(
      (r) =>
        'value' in r &&
        (r.status === 'ready' ? r.value !== null : r.value === null)
    )
}
const ms = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const progress = z
  .object({
    positionMs: ms,
    durationMs: ms,
    minSeekMs: ms,
    maxSeekMs: ms,
    rate: z.number().finite(),
    measuredAt: ms
  })
  .strict()
  .refine(
    (p) =>
      p.positionMs <= p.durationMs &&
      p.minSeekMs <= p.maxSeekMs &&
      p.maxSeekMs <= p.durationMs
  )
const mediaSchema = z
  .object({
    sessionId: z.string().min(1),
    trackId: z.string().min(1),
    playerId: z.string(),
    playerName: z.string(),
    title: z.string(),
    artist: z.string(),
    album: z.string(),
    artwork: resource(
      z
        .string()
        .max(7 * 1024 * 1024)
        .regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/)
    ),
    playback: z.enum(['playing', 'paused', 'stopped', 'unknown']),
    progress: resource(progress),
    volume: resource(
      z
        .object({
          level: z.number().finite().min(0).max(100),
          muted: z.boolean(),
          source: z.literal('applicationSession')
        })
        .strict()
    ),
    favorite: resource(z.boolean()),
    spotifyUri: z
      .string()
      .regex(/^spotify:track:[A-Za-z0-9]{22}$/)
      .nullable(),
    capabilities: z
      .object({
        previous: z.boolean(),
        playPause: z.boolean(),
        next: z.boolean(),
        seek: z.boolean(),
        volume: z.boolean(),
        mute: z.boolean(),
        favorite: z.boolean(),
        openPlayer: z.boolean()
      })
      .strict()
  })
  .strict() satisfies z.ZodType<MediaData>

export function parseMediaEvent(
  event: SystemEvent<unknown>
): SystemEvent<MediaData> {
  if (event.status !== 'ready') return { ...event, data: null }
  const parsed = mediaSchema.safeParse(event.data)
  return parsed.success
    ? { ...event, data: parsed.data }
    : {
        status: 'error',
        error: 'Invalid native media payload',
        data: null,
        timestamp: event.timestamp
      }
}

/** Position is derived locally; rendering a progress bar does not require polling IPC. */
export function mediaPosition(progress: MediaProgress, now = Date.now()) {
  return Math.min(
    progress.durationMs,
    Math.max(
      0,
      progress.positionMs +
        Math.max(0, now - progress.measuredAt) * progress.rate
    )
  )
}

export function demoMedia(): MediaData {
  return {
    sessionId: 'demo-session',
    trackId: 'demo-track-1',
    playerId: 'strata-demo',
    playerName: 'Demonstração',
    title: 'Dragonaut',
    artist: 'Sleep',
    album: 'Holy Mountain',
    artwork: {
      status: 'unavailable',
      value: null,
      reason: 'Demonstração sem capa'
    },
    playback: 'playing',
    progress: {
      status: 'ready',
      value: {
        positionMs: 32000,
        durationMs: 343000,
        minSeekMs: 0,
        maxSeekMs: 343000,
        rate: 1,
        measuredAt: Date.now()
      },
      reason: null
    },
    volume: {
      status: 'ready',
      value: { level: 64, muted: false, source: 'applicationSession' },
      reason: null
    },
    favorite: { status: 'unsupported', value: null, reason: 'Demonstração' },
    spotifyUri: null,
    capabilities: {
      previous: true,
      playPause: true,
      next: true,
      seek: true,
      volume: true,
      mute: true,
      favorite: false,
      openPlayer: false
    }
  }
}
