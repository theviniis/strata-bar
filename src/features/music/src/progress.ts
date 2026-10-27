import type { MediaProgress } from '@/services/system/media.generated'
import { mediaPosition } from '@/services/system/media'

/** Native samples correct a continuous monotonic clock, never restart its timer. */
export class MediaClock {
  private sample: MediaProgress | null = null
  private playing = false
  private anchor = 0
  private at = 0
  private correction = 0
  private seekUntil = 0

  read(now = performance.now()) {
    if (!this.sample) return 0
    const elapsed = Math.max(0, now - this.at)
    const rate = this.playing ? Math.max(0, this.sample.rate) : 0
    return Math.min(
      this.sample.durationMs,
      Math.max(
        0,
        this.anchor +
          elapsed * rate +
          this.correction * Math.min(1, elapsed / 5000)
      )
    )
  }

  update(
    sample: MediaProgress | null,
    playing: boolean,
    now = performance.now(),
    wall = Date.now()
  ) {
    if (!sample) {
      this.sample = null
      return
    }
    const previous = this.sample
    const position = this.read(now)
    const measured = mediaPosition(
      { ...sample, rate: playing ? sample.rate : 0 },
      wall
    )
    if (
      previous &&
      playing === this.playing &&
      sample.rate === previous.rate &&
      sample.durationMs === previous.durationMs
    ) {
      if (sample.measuredAt < previous.measuredAt) return
      // Some players refresh the timestamp while repeating an unchanged Position.
      if (sample.positionMs === previous.positionMs) return
      if (now < this.seekUntil && Math.abs(measured - position) > 1500) return
    }
    this.at = now
    this.correction = 0
    if (
      previous &&
      playing &&
      this.playing &&
      Math.abs(measured - position) <= 1500
    ) {
      this.anchor = position
      this.correction = measured - position
    } else {
      this.anchor = measured
    }
    this.sample = sample
    this.playing = playing
  }

  seek(position: number, now = performance.now()) {
    this.anchor = position
    this.at = now
    this.correction = 0
    this.seekUntil = now + 3000
  }
}
