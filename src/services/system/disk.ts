import { z } from 'zod'
import type { SystemEvent } from './bridge'
import type { DiskData, DiskVolume } from './disk.generated'

const quantity = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const volume = z
  .object({
    mount: z.string().min(1).max(64),
    label: z.string().max(1024).nullable(),
    kind: z.enum([
      'fixed',
      'removable',
      'optical',
      'ramdisk',
      'remote',
      'unknown'
    ]),
    totalBytes: quantity,
    freeBytes: quantity,
    usedBytes: quantity,
    percent: quantity.max(100)
  })
  .strict()
  .refine((v) => v.totalBytes > 0)
  .refine((v) => v.freeBytes <= v.totalBytes)
  .refine((v) => v.usedBytes === v.totalBytes - v.freeBytes)
  // The native side derives `percent` from the same two byte counts, so a
  // mismatch means the payload is internally inconsistent.
  .refine(
    (v) => Math.abs(v.percent - (v.usedBytes / v.totalBytes) * 100) <= 1e-6
  ) satisfies z.ZodType<DiskVolume>
const diskSchema = z
  .object({
    sequence: z.number().int().nonnegative().max(4294967295),
    sampledAt: quantity,
    volumes: z.array(volume)
  })
  .strict()
  // The native collector projects volumes in mount order.
  .refine((d) =>
    d.volumes.every((v, i, all) => i === 0 || all[i - 1].mount < v.mount)
  ) satisfies z.ZodType<DiskData>
const eventSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    data: diskSchema,
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
export function parseDiskEvent(input: unknown): SystemEvent<DiskData> {
  const result = eventSchema.safeParse(input)
  return result.success
    ? result.data
    : {
        status: 'error',
        error: 'Dados dos discos inválidos',
        timestamp: Date.now()
      }
}
