import { useRef, useState, useEffect, useMemo } from 'react'
import { cityLabel, cityRegionLabel } from './presentation'
import { MapPin } from 'lucide-react'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  useComboboxAnchor
} from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup
} from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Choice } from '@/settings/WidgetInspector'
import { bridge } from '@/services/system/bridge'
import type {
  WeatherCity,
  WeatherConfig
} from '@/services/system/weather.generated'
import { weatherCitySchema } from '@/services/configuration/config'

const defaults: WeatherConfig = {
  city: null,
  temperatureUnit: 'celsius',
  windUnit: 'kmh'
}
export function WeatherSettings({
  value = defaults,
  onChange
}: {
  value?: WeatherConfig
  onChange(value: WeatherConfig): void
}) {
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WeatherCity[]>([])
  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      { key: string; label: string; items: WeatherCity[] }
    >()
    const cities = query === '' && value.city ? [value.city] : results
    for (const city of cities) {
      const key = JSON.stringify([city.country, city.region])
      let group = grouped.get(key)
      if (!group) {
        group = {
          key,
          label: cityRegionLabel(city),
          items: []
        }
        grouped.set(key, group)
      }
      group.items.push(city)
    }
    return Array.from(grouped.values())
  }, [results, query, value.city])
  const [status, setStatus] = useState<
    'idle' | 'debouncing' | 'loading' | 'done' | 'error'
  >('idle')
  const [error, setError] = useState('')
  const generation = useRef(0)
  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) return
    const request = generation.current
    let active = true
    const timer = setTimeout(async () => {
      setStatus('loading')
      try {
        if (!bridge.weatherSearch)
          throw new Error('Busca de cidades disponível no aplicativo Windows')
        const cities = await bridge.weatherSearch(text)
        if (!active || request !== generation.current) return
        setResults(cities.map((city) => weatherCitySchema.parse(city)))
        setStatus('done')
      } catch (error) {
        if (!active || request !== generation.current) return
        setError(String(error))
        setStatus('error')
      }
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query])
  function resetSearch() {
    generation.current++
    setQuery('')
    setResults([])
    setStatus('idle')
  }
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="weather-city">Buscar cidade</FieldLabel>
        <Combobox
          items={groups}
          value={value.city}
          filter={null}
          itemToStringLabel={cityLabel}
          itemToStringValue={(city) => String(city.id)}
          isItemEqualToValue={(city, selected) => city.id === selected.id}
          onValueChange={(city, details) => {
            if (
              !city &&
              details.reason !== 'clear-press' &&
              details.reason !== 'input-clear'
            )
              return
            resetSearch()
            onChange({ ...value, city })
          }}
        >
          <ComboboxInput
            anchorRef={anchor}
            showClear
            id="weather-city"
            maxLength={128}
            placeholder="Nome da cidade"
            aria-busy={status === 'loading'}
            onChange={(event) => {
              generation.current++
              const text = event.target.value
              setQuery(text)
              setResults([])
              setStatus(text.trim().length >= 2 ? 'debouncing' : 'idle')
            }}
          >
            <InputGroupAddon align="inline-start">
              <MapPin aria-hidden="true" />
            </InputGroupAddon>
            {status === 'loading' && (
              <InputGroupAddon align="inline-end">
                <Spinner aria-label="Buscando cidades" />
              </InputGroupAddon>
            )}
          </ComboboxInput>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>
              {status === 'debouncing' || status === 'loading'
                ? 'Buscando cidades…'
                : status === 'error'
                  ? 'Não foi possível buscar cidades.'
                  : status === 'done'
                    ? 'Nenhuma cidade encontrada.'
                    : 'Digite pelo menos 2 caracteres.'}
            </ComboboxEmpty>
            <ComboboxList aria-label="Cidades encontradas">
              {(group: (typeof groups)[number]) => (
                <ComboboxGroup key={group.key} items={group.items}>
                  <ComboboxLabel>{group.label}</ComboboxLabel>
                  <ComboboxCollection>
                    {(city: WeatherCity) => (
                      <ComboboxItem key={city.id} value={city}>
                        {cityLabel(city)}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxGroup>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          A localização é compartilhada entre todos os monitores. Selecione um
          resultado e clique em Aplicar.
        </FieldDescription>
      </Field>
      {status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Choice
        label="Temperatura"
        value={value.temperatureUnit}
        options={[
          { value: 'celsius', label: 'Celsius (°C)' },
          { value: 'fahrenheit', label: 'Fahrenheit (°F)' }
        ]}
        onChange={(unit) =>
          onChange({
            ...value,
            temperatureUnit: unit === 'fahrenheit' ? 'fahrenheit' : 'celsius'
          })
        }
      />
      <Choice
        label="Velocidade do vento"
        value={value.windUnit}
        options={[
          { value: 'kmh', label: 'Quilômetros por hora (km/h)' },
          { value: 'mph', label: 'Milhas por hora (mph)' }
        ]}
        onChange={(unit) =>
          onChange({ ...value, windUnit: unit === 'mph' ? 'mph' : 'kmh' })
        }
      />
    </FieldGroup>
  )
}
