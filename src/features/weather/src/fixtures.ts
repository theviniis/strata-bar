import type { WeatherData } from '@/services/system/weather.generated'

export const WEATHER_TIME = Date.UTC(2026, 9, 25, 15)
export function weatherFixture(at = WEATHER_TIME): WeatherData {
  return {
    city: {
      id: 3451138,
      name: 'Rio Grande',
      region: 'Rio Grande do Sul',
      country: 'Brasil',
      latitude: -32.035,
      longitude: -52.098,
      timezone: 'America/Sao_Paulo'
    },
    temperatureUnit: 'celsius',
    windUnit: 'kmh',
    updatedAt: at,
    temperature: 15,
    feelsLike: 12,
    code: 2,
    isDay: true,
    humidity: 72,
    pressure: 1016.5,
    cloud: 72,
    stale: false,
    error: null,
    days: Array.from({ length: 7 }, (_, i) => ({
      time: Date.UTC(2026, 9, 25 + i, 3),
      code: [61, 61, 2, 61, 61, 2, 61][i],
      high: [17, 16, 18, 20, 20, 20, 20][i],
      low: [13, 11, 12, 14, 14, 16, 15][i],
      sunrise: Date.UTC(2026, 9, 25 + i, 8, 37),
      sunset: Date.UTC(2026, 9, 25 + i, 21, 48)
    })),
    hours: Array.from({ length: 12 }, (_, i) => ({
      time: at + i * 3_600_000,
      temperature: [15, 16, 16, 15, 14, 14, 13, 13, 12, 12, 11, 11][i],
      code: i < 5 ? 2 : 0,
      isDay: i < 7,
      wind: 20.2 - i * 0.7,
      rainChance: 40 - i * 3,
      uv: Math.max(0, 8.1 - i * 1.4)
    }))
  }
}
