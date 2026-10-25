import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudMoon,
  Moon,
  Sun
} from 'lucide-react'
import type {
  WeatherCity,
  WeatherData
} from '@/services/system/weather.generated'

/** WMO weather interpretation codes. Unknown/missing codes keep an honest label. */
export function condition(code: number | null, isDay = true) {
  if (code === 0)
    return {
      label: isDay ? 'Céu limpo' : 'Noite limpa',
      Icon: isDay ? Sun : Moon
    }
  if (code === 1 || code === 2)
    return {
      label: code === 1 ? 'Predominantemente limpo' : 'Parcialmente nublado',
      Icon: isDay ? CloudSun : CloudMoon
    }
  if (code === 3) return { label: 'Nublado', Icon: Cloud }
  if (code === 45 || code === 48) return { label: 'Nevoeiro', Icon: CloudFog }
  if ([51, 53, 55, 56, 57].includes(code ?? -1))
    return { label: 'Garoa', Icon: CloudDrizzle }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1))
    return { label: 'Chuva', Icon: CloudRain }
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1))
    return { label: 'Neve', Icon: CloudSnow }
  if ([95, 96, 99].includes(code ?? -1))
    return { label: 'Trovoadas', Icon: CloudLightning }
  return { label: 'Condição indisponível', Icon: Cloud }
}
export function metric(
  value: number | null | undefined,
  suffix = '',
  decimals = 0
) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: decimals })}${suffix}`
}
export function temperature(
  value: number | null | undefined,
  unit: WeatherData['temperatureUnit']
) {
  return metric(value, unit === 'fahrenheit' ? '°F' : '°C')
}
export function localTime(at: number | null | undefined, timezone: string) {
  return at == null
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).format(at)
}
export function dayLabel(at: number, timezone: string, index: number) {
  return index === 0
    ? 'Hoje'
    : index === 1
      ? 'Amanhã'
      : new Intl.DateTimeFormat('pt-BR', {
          timeZone: timezone,
          weekday: 'short'
        }).format(at)
}

export function countryLabel(country: string) {
  const label = country.trim()
  if (!label) return 'País não informado'
  if (/^[A-Z]{2}$/.test(label)) {
    return (
      new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(label) ?? label
    )
  }
  return label
}
export function cityRegionLabel(city: WeatherCity) {
  return [
    city.region.trim() || 'Estado não informado',
    countryLabel(city.country)
  ].join(' · ')
}
export function cityLabel(city: WeatherCity) {
  return [city.name, cityRegionLabel(city)].join(' · ')
}
