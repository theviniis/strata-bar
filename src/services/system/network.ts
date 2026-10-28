import { z } from 'zod'
import type { SystemEvent } from './bridge'
import type { NetworkData } from './network.generated'
const quantity = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const nullable = quantity.nullable()
export const networkSchema = z
  .strictObject({
    sequence: z.number().int().nonnegative().max(4294967295),
    sampledAt: quantity,
    selectedId: z.string().nullable(),
    interfaces: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(128),
          index: z.number().int().positive(),
          name: z.string(),
          kind: z.string(),
          connected: z.boolean(),
          addresses: z.array(z.string()).max(256),
          gateways: z.array(z.string()).max(256),
          receiveLinkBps: nullable,
          transmitLinkBps: nullable,
          ssid: z.string().nullable(),
          signalPercent: z.number().int().min(0).max(100).nullable(),
          wifiError: z.string().nullable()
        })
      )
      .max(512),
    download: nullable,
    upload: nullable,
    receivedBytes: quantity,
    sentBytes: quantity,
    observationStartedAt: nullable,
    history: z
      .array(
        z.strictObject({
          timestamp: quantity,
          download: nullable,
          upload: nullable
        })
      )
      .max(61),
    quality: z
      .strictObject({
        target: z.string(),
        pingMs: nullable,
        jitterMs: nullable,
        lossPercent: z.number().finite().min(0).max(100).nullable(),
        sent: z.number().int().nonnegative().max(61),
        lost: z.number().int().nonnegative().max(61),
        error: z.string().nullable()
      })
      .refine((q) => q.lost <= q.sent),
    speedTest: z.strictObject({
      phase: z.enum([
        'idle',
        'preparing',
        'download',
        'upload',
        'complete',
        'cancelled',
        'error'
      ]),
      downloadMbps: nullable,
      uploadMbps: nullable,
      elapsedMs: quantity,
      stageProgress: z.number().finite().min(0).max(1),
      transferredBytes: quantity.max(500_000_000),
      timestamp: nullable,
      interfaceName: z.string().nullable(),
      provider: z.literal('Cloudflare'),
      limited: z.boolean(),
      error: z.string().nullable()
    }),
    error: z.string().nullable()
  })
  .refine((d) =>
    d.history.every(
      (p, i, h) =>
        p.timestamp <= d.sampledAt &&
        p.timestamp >= d.sampledAt - 120_000 &&
        (!i || p.timestamp > h[i - 1].timestamp)
    )
  ) satisfies z.ZodType<NetworkData>
export function parseNetworkEvent(event: unknown): SystemEvent<NetworkData> {
  const envelope = z
    .object({
      status: z.string(),
      data: z.unknown().optional(),
      error: z.string().optional(),
      timestamp: quantity.optional()
    })
    .safeParse(event)
  if (!envelope.success)
    return { status: 'error', error: 'Evento de rede inválido' }
  if (envelope.data.status === 'ready') {
    const data = networkSchema.safeParse(envelope.data.data)
    return data.success
      ? { status: 'ready', data: data.data, timestamp: envelope.data.timestamp }
      : { status: 'error', error: 'Leitura de rede inválida' }
  }
  if (envelope.data.status === 'loading') return { status: 'loading' }
  if (envelope.data.status === 'unavailable')
    return { status: 'unavailable', data: null }
  return { status: 'error', error: envelope.data.error ?? 'Rede indisponível' }
}
