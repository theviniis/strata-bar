# Weather

Weather is an explicit extension to the MVP network boundary. It uses the
Open-Meteo forecast and geocoding APIs through a dedicated native worker; the
audio worker, sensor service and WebView CSP are unchanged.

## Configuration and UI

Add **Clima** from the widget catalog. In **Configurações → Clima**, search for a
city using the shadcn Combobox with Input Group (350 ms debounce, minimum two
characters), choose a result identified by region/country, select temperature and wind
units, then Apply. This is a global setting shared by every monitor. Existing
configuration files need no migration; no city or widget is inserted into saved
layouts automatically.

The optional version-2 configuration field is:

```json
{
  "weather": {
    "city": null,
    "temperatureUnit": "celsius",
    "windUnit": "kmh"
  }
}
```

Selecting a city stores its geocoding ID, name, region, country, coordinates and
IANA timezone. Temperature supports `celsius` / `fahrenheit`; wind independently
supports `kmh` / `mph`. Pressure is hPa. All dates and times use the city's
timezone. The indicator respects compact/label and tooltip settings. The popup
uses the existing shared surface, compact typography, semantic colors and chart
tokens. Daily and hourly sections scroll horizontally on narrow surfaces.

The native `weather` subscription returns a generated `WeatherData` contract.
An unconfigured city is an explicit ready payload with `city: null`. Missing
measurements are null, displayed as “—”. The popup shows seven daily forecasts
and twelve hours beginning with the current forecast hour; “Chuva nesta hora”
and UV use that same hour, rather than pretending to be current observations.

## Collection and failure policy

- HTTPS destinations are fixed to `api.open-meteo.com` and
  `geocoding-api.open-meteo.com`; redirects are disabled. Requests have a
  15-second timeout and responses are bounded to 1 MiB.
- One native worker owns cache, subscriptions and the 15-minute refresh deadline
  across every bar and the overlay. Widget `intervalMs` does not change it.
  Collection pauses without subscribers; an overdue cache refreshes on resume.
- A configuration change clears the cache and increments a generation. Results
  from an earlier generation are discarded, including failed responses.
- Errors preserve a successful cache with `stale: true`, its original update
  timestamp and the error message. Without a cache, the subscription reports an
  error. Retry delays are 1, 5 and then 15 minutes, resetting after success.
- `weather_search(query)` runs off the UI thread, accepts bounded search text
  and is restricted to the Settings window. City coordinates and settings are
  validated again natively. No location detection or API key is used.
- Browser studio and Storybook use explicitly labeled fixtures and never act as
  a fallback for failed native collection.

## Provider and attribution

Forecasts: [Open-Meteo](https://open-meteo.com/),
[forecast API](https://open-meteo.com/en/docs),
[geocoding API](https://open-meteo.com/en/docs/geocoding-api).
The free hosted endpoint is for non-commercial use, subject to its
[terms and attribution requirements](https://open-meteo.com/en/terms).
Forecast data is attributed under CC BY 4.0. Review the provider's commercial
offering before commercial distribution. This implementation has no paid API
key configuration.

## Validation

`src/tests/weather.test.tsx` covers presentation, timezone formatting, configuration
compatibility, transport validation/cleanup, explicit city selection and stale
search suppression. Inline Rust tests cover decoding, fractional timezone hour
boundaries, shared deadlines, inactivity, invalidation, errors and recovery.

An explicit network acceptance test exercises real geocoding plus metric and
imperial forecasts, verifies seven days/twelve hours and unit conversions, and
writes a new temporary evidence file:

```sh
cargo test --manifest-path src-tauri/Cargo.toml weather::tests::live_open_meteo_contract -- --ignored --nocapture
```

Recorded provider evidence:
[weather-provider-2026-10-25.json](../evidence/weather-provider-2026-10-25.json).
This is live provider evidence, not AppBar geometry or WebView2 acceptance.
Storybook includes day/night, missing fields, long city names, loading, no city,
error and stale states.

Native release acceptance must also check opening/toggle/Escape/outside-click,
multiple monitors and DPI, top/bottom placement, themes and subscription cleanup
using the rebuilt host. Existing instances must release their AppBar reservations
before another host is launched. Do not treat browser screenshots or provider
requests as evidence for those native gates.

### Implementation checks, 2026-10-25

- Production frontend build and TypeScript check passed.
- Focused frontend run: 37 tests passed across weather, configuration, native
  bridge and popup definitions. Eight weather Rust unit tests passed; the
  separately invoked live provider test also passed.
- Feature ESLint and Prettier checks passed. The aggregate `pnpm check` stopped
  on formatting in the concurrently edited `popup-helpers.tsx`, outside this
  change.
- The full frontend run reported 444 passes and 45 failures in existing agent,
  layout/settings and resource-popup tests. The full Rust run reported three
  geometry assertion failures outside the weather modules. These runs do not
  constitute a green repository gate.
- The dark Storybook view was visually inspected and narrow-width overflow was
  corrected. Browser automation timed out during light-theme inspection.
  Opening/closing and DPI/multi-monitor checks in the rebuilt native host remain
  unverified; an existing native Strata instance was left running.
