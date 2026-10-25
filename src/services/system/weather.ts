import { z } from 'zod'
import { weatherCitySchema } from '../configuration/config'
import type { SystemEvent } from './bridge'
import type { WeatherData } from './weather.generated'

const metric = z.number().finite().nullable()
const time = z.number().finite().nonnegative()
const code = z.number().int().nonnegative().nullable()
export const weatherDataSchema = z.object({
  city: weatherCitySchema.nullable(),
  temperatureUnit: z.enum(['celsius', 'fahrenheit']),
  windUnit: z.enum(['kmh', 'mph']),
  updatedAt: time,
  temperature: metric,
  feelsLike: metric,
  code,
  isDay: z.boolean(),
  humidity: metric,
  pressure: metric,
  cloud: metric,
  hours: z
    .array(
      z.object({
        time,
        temperature: metric,
        code,
        isDay: z.boolean(),
        wind: metric,
        rainChance: metric,
        uv: metric
      })
    )
    .max(12),
  days: z
    .array(
      z.object({
        time,
        code,
        high: metric,
        low: metric,
        sunrise: time.nullable(),
        sunset: time.nullable()
      })
    )
    .max(7),
  stale: z.boolean(),
  error: z.string().nullable()
})
export function parseWeatherEvent(
  event: SystemEvent
): SystemEvent<WeatherData> {
  if (event.status !== 'ready') return event
  const result = weatherDataSchema.safeParse(event.data)
  return result.success
    ? { ...event, data: result.data }
    : { status: 'error', error: 'Resposta de clima inválida' }
}
