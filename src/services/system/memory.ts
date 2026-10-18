import { z } from 'zod'
import type { SystemEvent } from './bridge'
import type { MemoryData, MemoryMetric } from './memory.generated'
import { RESOURCE_HISTORY_MAX_POINTS } from './resource-history'

const quantity = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const metric = z
  .object({
    status: z.enum(['ready', 'error', 'unavailable', 'notConfigured']),
    value: quantity.nullable(),
    updatedAt: quantity.nullable(),
    error: z.string().nullable()
  })
  .strict()
  .refine(
    (value) =>
      value.status !== 'ready' ||
      (value.value !== null &&
        value.updatedAt !== null &&
        value.error === null),
    'Ready metrics require a value and observation time'
  ) satisfies z.ZodType<MemoryMetric>

const point = z
  .object({
    sequence: z.number().int().nonnegative(),
    timestamp: quantity,
    percent: z.number().finite().min(0).max(100).nullable()
  })
  .strict()

export const memorySchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    sampledAt: quantity,
    totalBytes: metric,
    availableBytes: metric,
    usedBytes: metric,
    cachedBytes: metric,
    pagingFileBytes: metric,
    percent: metric.refine(
      (value) => value.value === null || value.value <= 100
    ),
    history: z.array(point).max(RESOURCE_HISTORY_MAX_POINTS)
  })
  .strict()
  .refine(
    (data) =>
      data.history.every(
        (sample, index, history) =>
          sample.sequence <= data.sequence &&
          sample.timestamp <= data.sampledAt &&
          (!index ||
            (sample.sequence > history[index - 1].sequence &&
              sample.timestamp > history[index - 1].timestamp))
      ),
    'History must contain ordered, unique observations'
  ) satisfies z.ZodType<MemoryData>

const eventSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    data: memorySchema,
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

export function parseMemoryEvent(input: unknown): SystemEvent<MemoryData> {
  const result = eventSchema.safeParse(input)
  return result.success
    ? result.data
    : {
        status: 'error',
        error: 'Dados de memória inválidos',
        timestamp: Date.now()
      }
}
