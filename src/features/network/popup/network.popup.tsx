import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { definePopup } from '@/popups/definition'
import type { SystemEvent } from '@/services/system/bridge'
import type {
  NetworkData,
  NetworkUnit
} from '@/services/system/network.generated'
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { NetworkGraph } from '../src/network-graph'
import { NetworkQuantity } from '../src/network-quantity'
import { NetworkRate } from '../src/network-rate'
import { NetworkSpeedTest } from '../src/network-speed-test'
import { formatBytes, metric, testActive } from '../src/presentation'
import { NetworkPopupController } from './network.popup.controller'

export function NetworkPopup({
  event,
  now,
  unit = 'bytes',
  demo = false,
  busy = false,
  actionError,
  onStart,
  onCancel,
  availableSize
}: {
  availableSize?: { width: number; height: number }
  event: SystemEvent<NetworkData>
  now: number
  unit?: NetworkUnit
  demo?: boolean
  busy?: boolean
  actionError?: string
  onStart(): void
  onCancel(): void
}) {
  const data = event.status === 'ready' ? event.data : undefined
  const adapter = data?.interfaces.find((i) => i.id === data.selectedId)
  const fresh = data && now - data.sampledAt <= 6000
  const test = data?.speedTest
  const active = test && testActive(test.phase)

  return (
    <section
      className="flex w-80 flex-col gap-4 overflow-y-auto p-4"
      style={
        availableSize
          ? {
              width: Math.min(480, availableSize.width - 32),
              maxHeight: Math.max(160, availableSize.height - 96)
            }
          : undefined
      }
      aria-label="Diagnóstico de rede"
    >
      {demo && (
        <p className="text-body text-muted-foreground">
          Dados de demonstração · teste simulado
        </p>
      )}
      {(actionError ||
        data?.error ||
        event.status === 'error' ||
        (data && !fresh)) && (
        <Alert variant="destructive">
          <AlertDescription>
            {actionError ||
              data?.error ||
              (event.status === 'error'
                ? event.error
                : 'Leitura de rede desatualizada')}
          </AlertDescription>
        </Alert>
      )}
      {!data ? (
        <p>
          {event.status === 'loading'
            ? 'Aguardando leituras da rede'
            : 'Rede indisponível'}
        </p>
      ) : (
        <Tabs defaultValue="summary" className="gap-4">
          <TabsList aria-label="Informações de rede" className="w-full">
            <TabsTrigger value="summary" className="flex-1">
              Resumo
            </TabsTrigger>
            <TabsTrigger value="speed-test" className="flex-1">
              Teste de velocidade
            </TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="mt-0 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col items-center rounded py-2 bg-muted/20 p-4">
                <div className="flex items-center gap-1.5 text-chart-1">
                  <NetworkRate
                    icon={ArrowDownCircle}
                    label="Download"
                    bytes={fresh ? data.download : null}
                    unit="bits"
                    format="label"
                    appearance="speed-test"
                  />
                </div>
              </div>

              <div className="flex min-w-0 flex-col items-center rounded py-2 bg-muted/20 p-4">
                <div className="flex items-center gap-1.5 text-chart-2">
                  <NetworkRate
                    icon={ArrowUpCircle}
                    label="Upload"
                    bytes={fresh ? data.upload : null}
                    unit="bits"
                    format="label"
                    appearance="speed-test"
                  />
                </div>
              </div>
            </div>
            <NetworkGraph points={data.history} unit={unit} now={now} />
            {active && (
              <p className="text-body text-muted-foreground">
                Teste em andamento · o gráfico inclui seu tráfego.
              </p>
            )}
            <Separator />
            <dl
              aria-label="Qualidade da conexão"
              className="grid grid-cols-3 gap-3 text-body"
            >
              <div>
                <dt className="text-muted-foreground">Ping</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  <NetworkQuantity
                    formatted={metric(
                      fresh && !data.quality.error ? data.quality.pingMs : null,
                      'ms'
                    )}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Jitter</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  <NetworkQuantity
                    formatted={metric(
                      fresh && !data.quality.error
                        ? data.quality.jitterMs
                        : null,
                      'ms'
                    )}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Perda ICMP</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  <NetworkQuantity
                    formatted={metric(
                      fresh && !data.quality.error
                        ? data.quality.lossPercent
                        : null,
                      '%'
                    )}
                  />
                </dd>
              </div>
            </dl>
            {data.quality.error && (
              <p role="status" className="text-body text-muted-foreground">
                {data.quality.error}
              </p>
            )}
            <Separator />
            <dl className="grid grid-cols-2 gap-3 text-body">
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  {!fresh
                    ? 'Desatualizado'
                    : data.error
                      ? 'Indisponível'
                      : adapter?.connected
                        ? 'Conectada'
                        : 'Desconectada'}
                </dd>
              </div>

              <div>
                <dt className="text-muted-foreground">Wi-Fi / sinal</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  {adapter?.ssid ?? '—'} ·{' '}
                  <NetworkQuantity
                    formatted={metric(adapter?.signalPercent, '%')}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Recebido / enviado observado
                </dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  {data.observationStartedAt == null ? (
                    '—'
                  ) : (
                    <>
                      <NetworkQuantity
                        formatted={formatBytes(data.receivedBytes)}
                      />{' '}
                      /{' '}
                      <NetworkQuantity
                        formatted={formatBytes(data.sentBytes)}
                      />
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Observação iniciada</dt>
                <dd className="mt-1 font-medium tabular-nums text-foreground">
                  {data.observationStartedAt == null
                    ? '—'
                    : new Date(data.observationStartedAt).toLocaleTimeString(
                        'pt-BR'
                      )}
                </dd>
              </div>
            </dl>
            {adapter?.wifiError && (
              <p className="text-micro text-muted-foreground">
                {adapter.wifiError}
              </p>
            )}
          </TabsContent>
          <TabsContent value="speed-test" className="mt-0">
            <NetworkSpeedTest
              test={test}
              quality={fresh ? data.quality : undefined}
              busy={busy}
              onStart={onStart}
              onCancel={onCancel}
            />
          </TabsContent>
        </Tabs>
      )}
    </section>
  )
}
export default definePopup({ label: 'Rede', Content: NetworkPopupController })
