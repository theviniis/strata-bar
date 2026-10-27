import { mapDataStatus } from '@/components/popup-status'
import { Sunrise, Sunset, Wind } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription
} from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import type { SystemEvent } from '@/services/system/bridge'
import type { WeatherData } from '@/services/system/weather.generated'
import {
  cityRegionLabel,
  condition,
  dayLabel,
  localTime,
  metric,
  temperature
} from './presentation'
import { usePopupContext } from '@/popups/context'
import { weatherFixture } from './fixtures'
import { useWeather } from './useWeather'

export function WeatherPopup({
  event,
  demo = false,
  availableSize
}: {
  event: SystemEvent<WeatherData>
  demo?: boolean
  availableSize?: { width: number; height: number }
}) {
  const data = event.status === 'ready' ? event.data : undefined
  const zone = data?.city?.timezone ?? 'UTC'
  const current = condition(data?.code ?? null, data?.isDay)
  const today = data?.days[0]
  const units = data?.temperatureUnit ?? 'celsius'
  return (
    <section
      aria-label="Previsão do tempo"
      style={
        availableSize
          ? {
              width: Math.min(640, availableSize.width - 32),
              maxHeight: availableSize.height - 80,
              maxWidth: availableSize.width - 32
            }
          : undefined
      }
      className="flex w-160 max-w-full flex-col gap-4 overflow-y-auto p-4"
    >
      {demo && (
        <p className="text-body text-muted-foreground">
          Dados de demonstração · ilustrativos
        </p>
      )}
      {!data ? (
        mapDataStatus('clima', event.status)
      ) : !data.city ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Escolha sua cidade</EmptyTitle>
            <EmptyDescription>
              Abra Configurações → Clima para escolher uma cidade e adicione o
              widget ao layout.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {data.stale && (
            <Alert>
              <AlertDescription>
                {data.error ?? 'Não foi possível atualizar o clima'} · Última
                leitura desatualizada
              </AlertDescription>
            </Alert>
          )}
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <current.Icon
                className="size-10 shrink-0 text-chart-1"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="text-title wrap-break-word">{data.city.name}</h2>
                <p className="text-body text-muted-foreground">
                  {cityRegionLabel(data.city)}
                </p>
                <p className="text-body text-muted-foreground">
                  {current.label}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-page tabular-nums">
                {temperature(data.temperature, units)}
              </p>
              <p className="text-body text-muted-foreground">
                Sensação de {temperature(data.feelsLike, units)}
              </p>
            </div>
          </header>
          <div className="flex flex-wrap items-center gap-4 text-body text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Sunrise className="size-4" aria-hidden="true" />
              Nascer {localTime(today?.sunrise, zone)}
            </span>
            <span className="flex items-center gap-1.5">
              <Sunset className="size-4" aria-hidden="true" />
              Pôr {localTime(today?.sunset, zone)}
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 text-body">
            {[
              ['Umidade', metric(data.humidity, '%')],
              ['Pressão', metric(data.pressure, ' hPa', 1)],
              ['Nuvens', metric(data.cloud, '%')],
              ['Chuva nesta hora', metric(data.hours[0]?.rainChance, '%')],
              ['Índice UV', metric(data.hours[0]?.uv, '', 1)]
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <Separator />
          <div className="flex flex-col gap-3">
            <h3 className="text-subtitle">Próximos 7 dias</h3>
            <div
              role="region"
              aria-label="Previsão diária"
              tabIndex={0}
              className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="grid min-w-135 grid-cols-7 gap-2">
                {data.days.map((day, i) => {
                  const weather = condition(day.code)
                  return (
                    <div
                      key={day.time}
                      className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-3 text-body"
                    >
                      <span className="text-muted-foreground capitalize">
                        {dayLabel(day.time, zone, i)}
                      </span>
                      <weather.Icon
                        className="size-5 text-chart-1"
                        role="img"
                        aria-label={weather.label}
                      />
                      <div className="flex flex-col items-center gap-0.5 tabular-nums">
                        <span
                          className="font-semibold"
                          aria-label={`Máxima ${temperature(day.high, units)}`}
                        >
                          {temperature(day.high, units)}
                        </span>
                        <span
                          className="text-muted-foreground"
                          aria-label={`Mínima ${temperature(day.low, units)}`}
                        >
                          {temperature(day.low, units)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <Separator />
          <HourlyForecast data={data} />
          <footer className="flex flex-wrap justify-between gap-2 text-micro text-muted-foreground">
            <span>
              Atualizado às {localTime(data.updatedAt, zone)} · {zone}
            </span>
            <span>
              Previsão:{' '}
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Open-Meteo
              </a>{' '}
              ·{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
              >
                CC BY 4.0
              </a>
            </span>
          </footer>
        </>
      )}
    </section>
  )
}
function HourlyForecast({ data }: { data: WeatherData }) {
  const zone = data.city?.timezone ?? 'UTC'
  const values = data.hours.flatMap((h) =>
    h.temperature == null ? [] : [h.temperature]
  )
  const min = (values.length ? Math.min(...values) : 0) - 2
  const max = Math.max(...values, min + 1) + 2
  const y = (value: number) => 62 - ((value - min) / (max - min)) * 48
  // Each missing value breaks the line, rather than implying a measured forecast.
  const path = data.hours
    .map((h, i) =>
      h.temperature == null
        ? ''
        : `${i === 0 || data.hours[i - 1].temperature == null ? 'M' : 'L'} ${i * 50 + 25} ${y(h.temperature)}`
    )
    .join(' ')
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-subtitle">Próximas 12 horas</h3>
      <div
        role="region"
        aria-label="Previsão por hora"
        tabIndex={0}
        className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="relative min-w-150">
          <svg
            viewBox="0 0 600 76"
            className="absolute top-6 h-19 w-full text-chart-1"
            aria-hidden="true"
          >
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <ol className="relative grid grid-cols-12 text-center text-micro">
            {data.hours.map((hour, i) => {
              const weather = condition(hour.code, hour.isDay)
              return (
                <li
                  key={hour.time}
                  className="flex flex-col items-center gap-2"
                >
                  <time
                    dateTime={new Date(hour.time).toISOString()}
                    className="text-muted-foreground"
                  >
                    {i === 0 ? 'Agora' : localTime(hour.time, zone)}
                  </time>
                  <span className="pb-17.5 font-medium tabular-nums">
                    {temperature(hour.temperature, data.temperatureUnit)}
                  </span>
                  <weather.Icon
                    className="size-4 text-chart-1"
                    role="img"
                    aria-label={weather.label}
                  />
                  <span className="flex items-center gap-0.5 text-muted-foreground">
                    <Wind className="size-3" aria-hidden="true" />
                    {metric(hour.wind, '', 1)}
                  </span>
                  <span className="text-muted-foreground">
                    {data.windUnit === 'mph' ? 'mph' : 'km/h'}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

export function WeatherPopupController() {
  const { mode } = usePopupContext('weather')
  return mode === 'native' ? (
    <NativeWeatherPopup />
  ) : (
    <WeatherPopup event={{ status: 'ready', data: weatherFixture() }} demo />
  )
}
function NativeWeatherPopup() {
  return (
    <WeatherPopup
      event={useWeather()}
      availableSize={{
        width: window.screen.availWidth,
        height: window.screen.availHeight
      }}
    />
  )
}
