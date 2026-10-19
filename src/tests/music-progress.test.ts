import { expect, it } from 'vitest'
import { MediaClock } from '@/features/music/progress'
import { demoMedia } from '@/services/system/media'

it('smooths small corrections without stopping or reversing playback', () => {
  const clock = new MediaClock()
  const sample = { ...demoMedia().progress.value!, measuredAt: 10000 }
  clock.update(sample, true, 0, 10000)
  expect(clock.read(1000)).toBe(33000)
  clock.update(
    { ...sample, positionMs: 32500, measuredAt: 11000 },
    true,
    1000,
    11000
  )
  expect(clock.read(1000)).toBe(33000)
  expect(clock.read(2000)).toBe(33900)
  expect(clock.read(6000)).toBe(37500)
})

it('ignores stale samples and freezes on pause', () => {
  const clock = new MediaClock()
  const sample = { ...demoMedia().progress.value!, measuredAt: 10000 }
  clock.update(sample, true, 0, 10000)
  clock.update(
    { ...sample, positionMs: 10000, measuredAt: 9000 },
    true,
    1000,
    11000
  )
  expect(clock.read(1000)).toBe(33000)
  clock.update(
    { ...sample, positionMs: 33000, measuredAt: 11000, rate: 0 },
    false,
    1000,
    11000
  )
  expect(clock.read(9000)).toBe(33000)
})

it('preserves an explicit seek while waiting for the native acknowledgement', () => {
  const clock = new MediaClock()
  const sample = { ...demoMedia().progress.value!, measuredAt: 10000 }
  clock.update(sample, true, 0, 10000)
  clock.seek(10000, 1000)
  clock.update(
    { ...sample, positionMs: 33500, measuredAt: 11500 },
    true,
    1500,
    11500
  )
  expect(clock.read(1500)).toBe(10500)
  clock.update(
    { ...sample, positionMs: 10500, measuredAt: 11500 },
    true,
    1500,
    11500
  )
  expect(clock.read(2000)).toBe(11000)
})
