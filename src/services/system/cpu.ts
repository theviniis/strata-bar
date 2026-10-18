import { z } from 'zod'
import type { SystemEvent } from './bridge'
import type { CpuData, CpuMetric } from './cpu.generated'

const quantity = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const metric = z
  .object({
    status: z.enum(['ready', 'error', 'unavailable']),
    value: quantity.nullable(),
    updatedAt: quantity.nullable(),
    error: z.string().nullable()
  })
  .strict()
  .refine((m) =>
    m.status === 'ready'
      ? m.value !== null && m.updatedAt !== null && m.error === null
      : m.status === 'unavailable'
        ? m.value === null && m.updatedAt === null
        : m.value !== null && m.updatedAt !== null && m.error !== null
  ) satisfies z.ZodType<CpuMetric>
const percent = metric.refine((m) => m.value === null || m.value <= 100)
const temperature = metric.refine((m) => m.value === null || m.value <= 200)
const positive = metric.refine((m) => m.value === null || m.value > 0)
const count = positive.refine(
  (m) => m.value === null || Number.isInteger(m.value)
)
const cpuSchema = z
  .object({
    sequence: z.number().int().nonnegative().max(4294967295),
    sampledAt: quantity,
    percent,
    frequencyHz: positive,
    maxFrequencyHz: positive,
    physicalCores: count,
    logicalProcessors: count,
    temperatureCelsius: temperature,
    temperatureSensor: z
      .object({
        provider: z.literal('msiAfterburner'),
        sourceId: z.literal(128),
        instance: z.literal(4294967295),
        name: z.string()
      })
      .strict()
      .nullable(),
    history: z
      .array(
        z
          .object({
            sequence: z.number().int().nonnegative(),
            timestamp: quantity,
            percent: z.number().finite().min(0).max(100).nullable(),
            temperatureCelsius: z.number().finite().min(0).max(200).nullable(),
            temperatureUpdatedAt: quantity.nullable()
          })
          .strict()
      )
      .max(31)
  })
  .strict()
  .refine((data) =>
    data.history.every(
      (p, i, h) =>
        p.sequence <= data.sequence &&
        p.timestamp <= data.sampledAt &&
        p.timestamp >= data.sampledAt - 60000 &&
        (!i ||
          (p.sequence > h[i - 1].sequence &&
            p.timestamp > h[i - 1].timestamp)) &&
        ((p.temperatureCelsius === null && p.temperatureUpdatedAt === null) ||
          (p.temperatureUpdatedAt !== null &&
            p.temperatureUpdatedAt <= p.timestamp &&
            p.temperatureUpdatedAt >= p.timestamp - 6000))
    )
  ) satisfies z.ZodType<CpuData>
const eventSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    data: cpuSchema,
    timestamp: quantity.optional()
  }),
  z.object({
    status: z.literal('loading'),
    data: z.null().optional(),
    timestamp: quantity.optional()
  }),
  z.object({
    status: z.literal('unavailable'),
    data: z.null().optional(),
    timestamp: quantity.optional()
  }),
  z.object({
    status: z.literal('error'),
    data: z.null().optional(),
    error: z.string(),
    timestamp: quantity.optional()
  })
])
export function parseCpuEvent(input: unknown): SystemEvent<CpuData> {
  const result = eventSchema.safeParse(input)
  return result.success
    ? result.data
    : {
        status: 'error',
        error: 'Dados de CPU inválidos',
        timestamp: Date.now()
      }
}
