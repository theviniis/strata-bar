import { useState } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WeatherPopup } from '@/features/weather/WeatherPopup'
import { WeatherSettings } from '@/features/weather/WeatherSettings'
import { weatherFixture } from '@/features/weather/fixtures'
import {
  condition,
  localTime,
  temperature
} from '@/features/weather/presentation'
import {
  configSchema,
  defaultConfig,
  weatherConfigSchema
} from '@/services/configuration/config'
import { parseWeatherEvent } from '@/services/system/weather'
import type { WeatherCity } from '@/services/system/weather.generated'
import { bridge, createNativeBridge } from '@/services/system/bridge'

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  listener: undefined as undefined | ((event: { payload: unknown }) => void),
  stop: vi.fn()
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => native.invoke(...args)
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_: string, listener: typeof native.listener) => {
    native.listener = listener
    return native.stop
  })
}))
afterEach(() => {
  vi.useRealTimers()
  delete bridge.weatherSearch
  vi.restoreAllMocks()
  native.invoke.mockReset()
  native.stop.mockReset()
  native.listener = undefined
})

it('keeps old configuration valid and validates city and independent units', () => {
  expect(configSchema.parse(defaultConfig).weather).toBeUndefined()
  expect(weatherConfigSchema.parse({})).toEqual({
    city: null,
    temperatureUnit: 'celsius',
    windUnit: 'kmh'
  })
  expect(
    weatherConfigSchema.parse({
      city: weatherFixture().city,
      temperatureUnit: 'fahrenheit',
      windUnit: 'kmh'
    }).windUnit
  ).toBe('kmh')
  expect(
    weatherConfigSchema.safeParse({
      city: { ...weatherFixture().city, latitude: 91 }
    }).success
  ).toBe(false)
  expect(
    weatherConfigSchema.safeParse({
      city: { ...weatherFixture().city, timezone: 'Unknown/Invalid' }
    }).success
  ).toBe(false)
})
it('maps day/night WMO conditions and formats units and city time', () => {
  expect(condition(0).label).toBe('Céu limpo')
  expect(condition(0, false).label).toBe('Noite limpa')
  expect(condition(2, false).Icon).not.toBe(condition(2, true).Icon)
  for (const code of [45, 51, 61, 71, 95])
    expect(condition(code).label).not.toBe('Condição indisponível')
  expect(condition(999).label).toBe('Condição indisponível')
  expect(temperature(32, 'fahrenheit')).toBe('32°F')
  expect(temperature(null, 'celsius')).toBe('—')
  expect(localTime(Date.UTC(2026, 9, 25, 2), 'America/Sao_Paulo')).toBe('23:00')
  expect(localTime(Date.UTC(2026, 9, 25, 2), 'Asia/Tokyo')).toBe('11:00')
})
it('renders seven days, twelve hours, metrics, attribution and a stale warning', () => {
  const data = { ...weatherFixture(), stale: true, error: 'Sem conexão' }
  render(<WeatherPopup event={{ status: 'ready', data }} />)
  expect(
    screen.getByRole('heading', { name: 'Rio Grande' })
  ).toBeInTheDocument()
  expect(screen.getAllByLabelText(/^Máxima/)).toHaveLength(7)
  expect(
    screen
      .getByRole('region', { name: 'Previsão por hora' })
      .querySelectorAll('li')
  ).toHaveLength(12)
  expect(screen.getByText(/Sem conexão/)).toBeInTheDocument()
  expect(screen.getByText(/Open-Meteo/)).toBeInTheDocument()
  expect(screen.queryByText(/Dados de demonstração/)).not.toBeInTheDocument()
})
it('renders missing fields, loading, errors and unconfigured city honestly', () => {
  const { rerender } = render(<WeatherPopup event={{ status: 'loading' }} />)
  expect(screen.getByText('Carregando clima')).toBeInTheDocument()
  rerender(<WeatherPopup event={{ status: 'error', error: 'Offline' }} />)
  expect(screen.getByText('Erro ao obter dados de clima')).toBeInTheDocument()
  rerender(<WeatherPopup event={{ status: 'unavailable' }} />)
  expect(screen.getByText('Clima indisponível')).toBeInTheDocument()
  rerender(
    <WeatherPopup
      event={{ status: 'ready', data: { ...weatherFixture(), city: null } }}
    />
  )
  expect(screen.getByText('Escolha sua cidade')).toBeInTheDocument()
  rerender(
    <WeatherPopup
      event={{ status: 'ready', data: { ...weatherFixture(), humidity: null } }}
      demo
    />
  )
  expect(screen.getByText('—')).toBeInTheDocument()
  expect(screen.getByText(/Dados de demonstração/)).toBeInTheDocument()
})
it('validates weather transport and never substitutes demo data on native failure', async () => {
  expect(parseWeatherEvent({ status: 'ready', data: {} }).status).toBe('error')
  expect(
    parseWeatherEvent({ status: 'ready', data: weatherFixture() }).status
  ).toBe('ready')
  native.invoke.mockRejectedValueOnce(new Error('Offline'))
  const listener = vi.fn()
  await expect(
    createNativeBridge().subscribe('weather', listener)
  ).rejects.toThrow('Offline')
  expect(native.stop).toHaveBeenCalledOnce()
  expect(listener).not.toHaveBeenCalled()
})
it('a live weather event wins over the initial snapshot and disposal is idempotent', async () => {
  native.invoke.mockImplementation(async (command: string) => {
    if (command === 'subscribe') {
      native.listener?.({
        payload: { status: 'ready', data: weatherFixture() }
      })
      return { token: 'w1', initial: { status: 'loading' } }
    }
  })
  const listener = vi.fn()
  const dispose = await createNativeBridge().subscribe('weather', listener, {
    intervalMs: 2000
  })
  expect(listener).toHaveBeenCalledOnce()
  expect(listener.mock.calls[0][0].status).toBe('ready')
  await dispose()
  await dispose()
  expect(
    native.invoke.mock.calls.filter(([command]) => command === 'unsubscribe')
  ).toHaveLength(1)
})
it('debounces city lookup for 350 ms and requires two characters', async () => {
  vi.useFakeTimers()
  bridge.weatherSearch = vi.fn(async () => [])
  render(<WeatherSettings onChange={vi.fn()} />)
  const input = screen.getByRole('combobox', { name: 'Buscar cidade' })
  fireEvent.change(input, { target: { value: 'R' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400)
  })
  expect(bridge.weatherSearch).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: 'Ri' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
  fireEvent.change(input, { target: { value: 'Rio' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(349)
  })
  expect(bridge.weatherSearch).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(bridge.weatherSearch).toHaveBeenCalledExactlyOnceWith('Rio')
})
it('ignores superseded search responses and cancels pending debounce on unmount', async () => {
  vi.useFakeTimers()
  const onChange = vi.fn()
  let resolve!: (cities: WeatherCity[]) => void
  bridge.weatherSearch = vi.fn(
    () =>
      new Promise<WeatherCity[]>((done) => {
        resolve = done
      })
  )
  const { unmount } = render(<WeatherSettings onChange={onChange} />)
  const input = screen.getByRole('combobox', { name: 'Buscar cidade' })
  fireEvent.change(input, { target: { value: 'Rio' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
  fireEvent.change(input, { target: { value: 'Porto' } })
  await act(async () => resolve([weatherFixture().city!]))
  expect(
    screen.queryByRole('option', { name: /Rio Grande/ })
  ).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
  unmount()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(bridge.weatherSearch).toHaveBeenCalledTimes(1)
})
it('shows city suggestions and changes the draft only after explicit selection', async () => {
  const onChange = vi.fn()
  bridge.weatherSearch = vi.fn(async () => [weatherFixture().city!])
  render(<WeatherSettings onChange={onChange} />)
  const input = screen.getByRole('combobox', { name: 'Buscar cidade' })
  act(() => input.focus())
  fireEvent.input(input, { target: { value: 'Rio' }, inputType: 'insertText' })
  const option = await screen.findByRole('option', {
    name: /Rio Grande · Rio Grande do Sul/
  })
  expect(onChange).not.toHaveBeenCalled()
  expect(option).toBeInTheDocument()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledWith({
    city: weatherFixture().city,
    temperatureUnit: 'celsius',
    windUnit: 'kmh'
  })
  expect(bridge.weatherSearch).toHaveBeenCalledTimes(1)
})

it('groups cities by state and country, including results without a state', async () => {
  const city = weatherFixture().city!
  bridge.weatherSearch = vi.fn(async () => [
    city,
    { ...city, id: 2, name: 'Porto Alegre' },
    { ...city, id: 3, name: 'São Paulo', region: 'São Paulo' },
    { ...city, id: 4, name: 'Outra cidade', country: 'Outro país' },
    { ...city, id: 5, name: 'Sem estado', region: '' }
  ])
  render(<WeatherSettings onChange={vi.fn()} />)
  const input = screen.getByRole('combobox', { name: 'Buscar cidade' })
  act(() => input.focus())
  fireEvent.input(input, {
    target: { value: 'cidade' },
    inputType: 'insertText'
  })
  const state = await screen.findByRole('group', {
    name: 'Rio Grande do Sul · Brasil'
  })
  expect(within(state).getAllByRole('option')).toHaveLength(2)
  expect(
    within(
      screen.getByRole('group', { name: 'Rio Grande do Sul · Outro país' })
    ).getAllByRole('option')
  ).toHaveLength(1)
  expect(
    screen.getByRole('group', { name: 'São Paulo · Brasil' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('group', { name: 'Estado não informado · Brasil' })
  ).toBeInTheDocument()
})

it('clears the selected city through the input and invalidates an in-flight search', async () => {
  vi.useFakeTimers()
  const onChange = vi.fn()
  const value = {
    city: weatherFixture().city,
    temperatureUnit: 'celsius' as const,
    windUnit: 'kmh' as const
  }
  let resolve!: (cities: WeatherCity[]) => void
  bridge.weatherSearch = vi.fn(
    () =>
      new Promise<WeatherCity[]>((done) => {
        resolve = done
      })
  )
  const { rerender } = render(
    <WeatherSettings value={value} onChange={onChange} />
  )
  expect(screen.queryByText('Cidade selecionada')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Remover cidade' })
  ).not.toBeInTheDocument()
  const input = screen.getByRole('combobox', { name: 'Buscar cidade' })
  expect(input).toHaveValue('Rio Grande · Rio Grande do Sul · Brasil')
  expect(
    screen.getByRole('button', { name: 'Limpar seleção' })
  ).toBeInTheDocument()
  act(() => input.focus())
  fireEvent.input(input, {
    target: { value: 'Porto' },
    inputType: 'insertText'
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
  fireEvent.click(screen.getByLabelText('Limpar seleção'))
  expect(onChange).toHaveBeenCalledWith({ ...value, city: null })
  rerender(
    <WeatherSettings value={{ ...value, city: null }} onChange={onChange} />
  )
  expect(input).toHaveValue('')
  await act(async () => {
    resolve([weatherFixture().city!])
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(
    screen.queryByRole('option', { name: /Rio Grande/ })
  ).not.toBeInTheDocument()
  expect(bridge.weatherSearch).toHaveBeenCalledTimes(1)
})

it.each(['mouse', 'keyboard'] as const)(
  'persists the exact city chosen via %s among namesakes in different countries',
  async (method) => {
    const brazil = weatherFixture().city!
    const puertoRico = {
      ...brazil,
      id: 4567817,
      region: 'Rio Grande',
      country: 'PR',
      latitude: 18.38023,
      longitude: -65.83127,
      timezone: 'America/Puerto_Rico'
    }
    bridge.weatherSearch = vi.fn(async () => [brazil, puertoRico])
    native.invoke.mockImplementation(
      async (command: string, args: { config: typeof defaultConfig }) => {
        if (command === 'config_save')
          return { revision: 1, config: args.config, error: null }
      }
    )
    const adapter = createNativeBridge()
    function Editor() {
      const [weather, setWeather] = useState<
        import('@/services/system/weather.generated').WeatherConfig
      >({ city: null, temperatureUnit: 'celsius', windUnit: 'kmh' })
      return (
        <WeatherSettings
          value={weather}
          onChange={(next) => {
            setWeather(next)
            void adapter.configSave!({ ...defaultConfig, weather: next })
          }}
        />
      )
    }
    render(<Editor />)
    for (const [index, city] of [brazil, puertoRico].entries()) {
      const input = screen.getByRole('combobox', { name: 'Buscar cidade' })
      act(() => input.focus())
      fireEvent.input(input, {
        target: { value: 'Rio Grande' },
        inputType: 'insertText'
      })
      const label =
        index === 0
          ? 'Rio Grande · Rio Grande do Sul · Brasil'
          : 'Rio Grande · Rio Grande · Porto Rico'
      const option = await screen.findByRole('option', {
        name: label
      })
      if (method === 'mouse') fireEvent.click(option)
      else {
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        if (index === 1) fireEvent.keyDown(input, { key: 'ArrowDown' })
        fireEvent.keyDown(input, { key: 'Enter' })
      }
      await waitFor(() =>
        expect(native.invoke).toHaveBeenLastCalledWith(
          'config_save',
          expect.objectContaining({
            config: expect.objectContaining({
              weather: expect.objectContaining({ city })
            })
          })
        )
      )
      expect(input).toHaveValue(label)
    }
  }
)

it('identifies the state and country in the popup for namesake cities', () => {
  const data = weatherFixture()
  const { rerender } = render(
    <WeatherPopup event={{ status: 'ready', data }} />
  )
  expect(screen.getByText('Rio Grande do Sul · Brasil')).toBeInTheDocument()
  rerender(
    <WeatherPopup
      event={{
        status: 'ready',
        data: {
          ...data,
          city: {
            ...data.city!,
            id: 4567817,
            region: 'Rio Grande',
            country: 'PR',
            latitude: 18.38023,
            longitude: -65.83127,
            timezone: 'America/Puerto_Rico'
          }
        }
      }}
    />
  )
  expect(screen.getByText('Rio Grande · Porto Rico')).toBeInTheDocument()
})

it('shows the saved city as an option when reopening the input without another lookup', async () => {
  const city = weatherFixture().city!
  bridge.weatherSearch = vi.fn(async () => [])
  render(
    <WeatherSettings
      value={{ city, temperatureUnit: 'celsius', windUnit: 'kmh' }}
      onChange={vi.fn()}
    />
  )
  const input = screen.getByRole('combobox', { name: 'Buscar cidade' })
  act(() => input.focus())
  fireEvent.mouseDown(input, { button: 0 })
  fireEvent.click(input)
  expect(
    await screen.findByRole('option', {
      name: 'Rio Grande · Rio Grande do Sul · Brasil'
    })
  ).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(input, { key: 'Escape' })
  act(() => input.focus())
  fireEvent.mouseDown(input, { button: 0 })
  fireEvent.click(input)
  expect(
    await screen.findByRole('option', {
      name: 'Rio Grande · Rio Grande do Sul · Brasil'
    })
  ).toBeInTheDocument()
  expect(bridge.weatherSearch).not.toHaveBeenCalled()
})
