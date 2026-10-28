import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type {
  NetworkQuality,
  NetworkSpeedTest as SpeedTestData
} from '@/services/system/network.generated'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Copy,
  Check,
  RefreshCw,
  X
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { formatBytes, metric, testActive } from './presentation'
import { NetworkQuantity } from './network-quantity'
import { NetworkRate } from './network-rate'
import { NetworkSpeedGauge } from './network-speed-gauge'
import { cn } from '@/lib/utils'

export function NetworkSpeedTest({
  test,
  busy,
  onStart,
  onCancel,
  quality
}: {
  test: SpeedTestData | undefined
  quality?: NetworkQuality
  busy: boolean
  onStart(): void
  onCancel(): void
}) {
  const [copiedError, setCopiedError] = useState('')
  const [copyFailed, setCopyFailed] = useState(false)
  async function copyError(message: string) {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(message)
      setCopiedError(message)
    } catch {
      setCopyFailed(true)
    }
  }
  const reducedMotion = useReducedMotion()
  const active = test && testActive(test.phase)
  const idle = !test || test.phase === 'idle'
  const complete = test?.phase === 'complete'
  const direction =
    test?.phase === 'upload' || (!active && test?.uploadMbps != null)
      ? 'upload'
      : 'download'
  const value =
    idle || test?.phase === 'preparing'
      ? null
      : direction === 'upload'
        ? (test?.uploadMbps ?? null)
        : (test?.downloadMbps ?? null)
  const maximum = Math.max(
    1000,
    Math.ceil(Math.max(test?.downloadMbps ?? 0, test?.uploadMbps ?? 0) / 1000) *
      1000
  )
  const animated = !reducedMotion
  const phase = {
    idle: 'Pronto para testar',
    preparing: 'Preparando',
    download: 'Medindo download',
    upload: 'Medindo upload',
    complete: 'Concluído',
    cancelled: 'Cancelado',
    error: 'Falha no teste'
  }
  return (
    <div
      className="flex flex-col gap-4 text-body"
      aria-label="Teste de velocidade"
    >
      <div className="grid grid-cols-2 gap-3">
        {(['download', 'upload'] as const).map((channel) => {
          const selected = active && test?.phase === channel
          const Icon = channel === 'download' ? ArrowDownCircle : ArrowUpCircle
          const rate =
            channel === 'download' ? test?.downloadMbps : test?.uploadMbps
          return (
            <motion.div
              key={channel}
              layout={animated}
              initial={false}
              animate={{
                opacity: active && !selected && rate == null ? 0.45 : 1
              }}
              transition={{ duration: animated ? 0.2 : 0 }}
              className={cn(
                'flex min-w-0 flex-col items-center rounded py-2',
                selected && 'bg-muted/20'
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-1.5',
                  channel === 'download' ? 'text-chart-1' : 'text-chart-2'
                )}
              >
                <NetworkRate
                  icon={Icon}
                  label={channel === 'download' ? 'Download' : 'Upload'}
                  bytes={rate == null ? null : (rate * 1_000_000) / 8}
                  unit="bits"
                  format="label"
                  appearance="speed-test"
                />
              </div>
            </motion.div>
          )
        })}
      </div>
      <dl
        aria-label="Qualidade ICMP atual"
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-body"
      >
        {(
          [
            ['Ping', quality?.pingMs, 'ms'],
            ['Jitter', quality?.jitterMs, 'ms'],
            ['Perda', quality?.lossPercent, '%']
          ] as const
        ).map(([label, reading, unit]) => (
          <div key={label} className="flex items-center gap-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              <NetworkQuantity
                formatted={metric(quality?.error ? null : reading, unit)}
              />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-micro text-muted-foreground">
        ICMP · {quality?.target ?? 'conexão atual'}
      </p>
      <AnimatePresence initial={false}>
        {!complete && (
          <motion.div
            key="speed-gauge"
            initial={animated ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: animated ? 0.3 : 0, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="text-center text-micro text-muted-foreground">
              Até 15 s ou 250 MB por etapa
            </p>
            <NetworkSpeedGauge
              value={value}
              maximum={maximum}
              direction={direction}
              animated={animated}
              idle={idle}
              busy={busy}
              onStart={onStart}
            />
            {(test?.phase === 'download' || test?.phase === 'upload') && (
              <div className="mt-3 flex flex-col gap-1.5">
                <span className="text-micro text-muted-foreground">
                  {test.phase === 'upload' ? 'Upload' : 'Download'}
                </span>
                <Progress
                  disableAnimation
                  aria-label={`Progresso de ${test.phase}`}
                  value={test.stageProgress * 100}
                  className={
                    test.phase === 'upload'
                      ? '[&>div]:bg-chart-2'
                      : '[&>div]:bg-chart-1'
                  }
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-col items-center gap-1 text-center">
        <motion.p
          key={test?.phase ?? 'idle'}
          role="status"
          initial={animated ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: animated ? 0.2 : 0 }}
          className="font-medium text-foreground"
        >
          {test ? phase[test.phase] : phase.idle}
        </motion.p>
        <p className="text-micro text-muted-foreground">
          {test?.interfaceName ? `${test.interfaceName} · ` : ''}Estimativa
          Strata via Cloudflare
        </p>
      </div>
      {test && !idle && (
        <>
          <p className="flex flex-wrap justify-center gap-x-1 font-medium tabular-nums text-foreground">
            <NetworkQuantity formatted={formatBytes(test.transferredBytes)} /> ·{' '}
            <NetworkQuantity
              formatted={`${(test.elapsedMs / 1000).toFixed(1)} s`}
            />
            {test.timestamp != null && (
              <span className="text-muted-foreground">
                {' '}
                · {new Date(test.timestamp).toLocaleTimeString('pt-BR')}
              </span>
            )}
          </p>
          {test.limited && (
            <p className="text-micro text-muted-foreground">
              Amostra curta ou incompleta; pode subestimar conexões rápidas.
            </p>
          )}
          {test.error && (
            <div className="relative rounded-md border border-destructive bg-destructive/10 p-3 pr-12">
              <p
                role="alert"
                className="select-text wrap-break-word text-body text-destructive"
              >
                {test.error}
              </p>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-1 right-1 text-destructive"
                aria-label={
                  copiedError === test.error
                    ? 'Mensagem copiada'
                    : 'Copiar mensagem de erro'
                }
                title={
                  copiedError === test.error
                    ? 'Mensagem copiada'
                    : 'Copiar mensagem de erro'
                }
                onClick={() => void copyError(test.error ?? '')}
              >
                {copiedError === test.error ? <Check /> : <Copy />}
              </Button>
              {copyFailed && (
                <p role="status" className="text-micro text-muted-foreground">
                  Não foi possível copiar. Selecione a mensagem acima e copie
                  manualmente.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {!idle &&
        (active ? (
          <Button variant="outline" className="w-full" onClick={onCancel}>
            <X data-icon="inline-start" />
            Cancelar teste
          </Button>
        ) : (
          <Button
            className="w-full"
            aria-label="Testar velocidade"
            onClick={onStart}
            disabled={busy}
          >
            <RefreshCw data-icon="inline-start" />
            Testar novamente
          </Button>
        ))}
      <p className="text-micro text-muted-foreground">
        Manual · até 30 s ou 500 MB. Usa a rota padrão do sistema. Dados são
        transferidos para a Cloudflare.
      </p>
    </div>
  )
}
