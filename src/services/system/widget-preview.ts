import {
  demoChannelData,
  type Channel,
  type ChannelData,
  type SystemEvent
} from './bridge'

export const PREVIEW_TIME = new Date(2026, 0, 15, 9, 41).getTime()
let samples: Partial<ChannelData> | undefined

/** Samples follow the native contract, so the real feature components render them. */
export function widgetPreviewEvent<C extends Channel>(
  channel: C
): SystemEvent<ChannelData[C]> {
  if (!samples) {
    const demo = demoChannelData()
    const metric = (value: number) => ({
      status: 'ready' as const,
      value,
      updatedAt: PREVIEW_TIME,
      error: null
    })
    samples = {
      cpu: {
        sequence: 1,
        sampledAt: PREVIEW_TIME,
        percent: metric(demo.cpu),
        frequencyHz: metric(3_600_000_000),
        maxFrequencyHz: metric(4_000_000_000),
        physicalCores: metric(8),
        logicalProcessors: metric(16),
        temperatureCelsius: metric(52),
        temperatureSensor: null,
        history: []
      },
      gpu: {
        sequence: 1,
        sampledAt: PREVIEW_TIME,
        adapter: null,
        percent: metric(demo.gpu),
        memoryUsedBytes: metric(2_000_000_000),
        memoryTotalBytes: metric(8_000_000_000),
        sharedUsedBytes: metric(0),
        sharedTotalBytes: metric(8_000_000_000),
        temperatureCelsius: metric(48),
        powerWatts: metric(65),
        fanPercent: metric(30),
        temperatureSensor: null,
        history: []
      },
      memory: {
        sequence: 1,
        sampledAt: PREVIEW_TIME,
        percent: metric(demo.memory),
        totalBytes: metric(16_000_000_000),
        usedBytes: metric(7_360_000_000),
        availableBytes: metric(8_640_000_000),
        cachedBytes: metric(2_000_000_000),
        pagingFileBytes: metric(0),
        history: []
      },
      weather: demo.weather,
      disk: demo.disk,
      volume: { level: demo.volume, muted: false },
      microphone: { level: demo.microphone, muted: false },
      komorebi: demo.komorebi,
      media: demo.media,
      mediaSpectrum: demo.mediaSpectrum
    }
  }
  const data = samples[channel]
  return data === undefined
    ? { status: 'unavailable', data: null }
    : { status: 'ready', data, timestamp: PREVIEW_TIME }
}
