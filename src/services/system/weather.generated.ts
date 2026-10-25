// Generated from Rust weather_contract.rs by cargo build. Do not edit.
export type WeatherCity = { id: number, name: string, region: string, country: string, latitude: number, longitude: number, timezone: string, };
export type TemperatureUnit = "celsius" | "fahrenheit";
export type WindUnit = "kmh" | "mph";
export type WeatherConfig = { city: WeatherCity | null, temperatureUnit: TemperatureUnit, windUnit: WindUnit, };
export type WeatherHour = { time: number, temperature: number | null, code: number | null, isDay: boolean, wind: number | null, rainChance: number | null, uv: number | null, };
export type WeatherDay = { time: number, code: number | null, high: number | null, low: number | null, sunrise: number | null, sunset: number | null, };
export type WeatherData = { city: WeatherCity | null, temperatureUnit: TemperatureUnit, windUnit: WindUnit, updatedAt: number, temperature: number | null, feelsLike: number | null, code: number | null, isDay: boolean, humidity: number | null, pressure: number | null, cloud: number | null, hours: Array<WeatherHour>, days: Array<WeatherDay>, stale: boolean, error: string | null, };
