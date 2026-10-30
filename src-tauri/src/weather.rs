//! One network worker and cache for every weather consumer; never runs on audio's thread.
use crate::weather_contract::*;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Read,
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

const REFRESH: Duration = Duration::from_secs(15 * 60);
fn retry(failures: usize) -> Duration {
    Duration::from_secs(match failures {
        0 | 1 => 60,
        2 => 300,
        _ => 900,
    })
}
fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Strata/0.1 weather")
        .build()
        .map_err(|e| e.to_string())
}
fn read_json(response: reqwest::blocking::Response) -> Result<Value, String> {
    let response = response
        .error_for_status()
        .map_err(|e| format!("Open-Meteo: {e}"))?;
    let mut bytes = Vec::new();
    response
        .take(1_048_577)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 1_048_576 {
        return Err("Resposta de clima excedeu o limite".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Resposta de clima inválida".into())
}
pub fn search(query: &str) -> Result<Vec<WeatherCity>, String> {
    let query = query.trim();
    if query.chars().count() < 2 || query.len() > 128 || query.chars().any(char::is_control) {
        return Err("Digite entre 2 e 128 caracteres".into());
    }
    let response = client()?
        .get("https://geocoding-api.open-meteo.com/v1/search")
        .query(&[
            ("name", query),
            ("count", "10"),
            ("language", "pt"),
            ("format", "json"),
        ])
        .send()
        .map_err(|e| e.to_string())?;
    cities(&read_json(response)?)
}
fn cities(value: &Value) -> Result<Vec<WeatherCity>, String> {
    let Some(results) = value.get("results") else {
        return Ok(vec![]);
    };
    let results = results.as_array().ok_or("Resposta de cidades inválida")?;
    Ok(results
        .iter()
        .take(10)
        .filter_map(|v| {
            let city = WeatherCity {
                id: u32::try_from(v["id"].as_u64()?).ok()?,
                name: v["name"].as_str()?.into(),
                region: v["admin1"].as_str().unwrap_or("").into(),
                country: v["country"]
                    .as_str()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .or_else(|| {
                        v["country_code"]
                            .as_str()
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                    })
                    .unwrap_or("")
                    .into(),
                latitude: v["latitude"].as_f64()?,
                longitude: v["longitude"].as_f64()?,
                timezone: v["timezone"].as_str()?.into(),
            };
            WeatherConfig {
                city: Some(city.clone()),
                ..Default::default()
            }
            .validate()
            .ok()?;
            Some(city)
        })
        .collect())
}
fn empty(config: &WeatherConfig) -> WeatherData {
    WeatherData {
        city: config.city.clone(),
        temperature_unit: config.temperature_unit.clone(),
        wind_unit: config.wind_unit.clone(),
        updated_at: 0.,
        temperature: None,
        feels_like: None,
        code: None,
        is_day: true,
        humidity: None,
        pressure: None,
        cloud: None,
        hours: vec![],
        days: vec![],
        stale: false,
        error: None,
    }
}
fn number(v: &Value) -> Option<f64> {
    v.as_f64().filter(|n| n.is_finite())
}
fn code(v: &Value) -> Option<u32> {
    v.as_u64().and_then(|n| u32::try_from(n).ok())
}
fn at(v: &Value, key: &str, i: usize) -> Value {
    v[key].get(i).cloned().unwrap_or(Value::Null)
}
fn decode(v: &Value, config: &WeatherConfig, now: f64) -> Result<WeatherData, String> {
    let current = &v["current"];
    let time = number(&current["time"]).ok_or("Resposta de clima sem horário atual")? * 1000.;
    let mut data = empty(config);
    data.updated_at = now;
    data.temperature = number(&current["temperature_2m"]);
    data.feels_like = number(&current["apparent_temperature"]);
    data.code = code(&current["weather_code"]);
    data.is_day = current["is_day"].as_u64() == Some(1);
    data.humidity = number(&current["relative_humidity_2m"]);
    data.pressure = number(&current["pressure_msl"]);
    data.cloud = number(&current["cloud_cover"]);
    let hourly = &v["hourly"];
    let times = hourly["time"]
        .as_array()
        .ok_or("Resposta sem previsão por hora")?;
    if times.len() > 200 {
        return Err("Previsão por hora excedeu o limite".into());
    }
    // Hour boundaries are local to the city (including UTC+05:30/05:45).
    let first = times
        .iter()
        .rposition(|t| number(t).is_some_and(|t| t * 1000. <= time))
        .unwrap_or(0);
    data.hours = times
        .iter()
        .enumerate()
        .skip(first)
        .filter_map(|(i, t)| {
            let t = number(t)? * 1000.;
            Some(WeatherHour {
                time: t,
                temperature: number(&at(hourly, "temperature_2m", i)),
                code: code(&at(hourly, "weather_code", i)),
                is_day: at(hourly, "is_day", i).as_u64() == Some(1),
                wind: number(&at(hourly, "wind_speed_10m", i)),
                rain_chance: number(&at(hourly, "precipitation_probability", i)),
                uv: number(&at(hourly, "uv_index", i)),
            })
        })
        .take(12)
        .collect();
    let daily = &v["daily"];
    let times = daily["time"]
        .as_array()
        .ok_or("Resposta sem previsão diária")?;
    data.days = times
        .iter()
        .take(7)
        .enumerate()
        .filter_map(|(i, t)| {
            Some(WeatherDay {
                time: number(t)? * 1000.,
                code: code(&at(daily, "weather_code", i)),
                high: number(&at(daily, "temperature_2m_max", i)),
                low: number(&at(daily, "temperature_2m_min", i)),
                sunrise: number(&at(daily, "sunrise", i)).map(|n| n * 1000.),
                sunset: number(&at(daily, "sunset", i)).map(|n| n * 1000.),
            })
        })
        .collect();
    if data.hours.is_empty() || data.days.is_empty() {
        return Err("Previsão de clima vazia".into());
    }
    Ok(data)
}
fn fetch(config: &WeatherConfig) -> Result<WeatherData, String> {
    config.validate()?;
    let city = config.city.as_ref().ok_or("Configure uma cidade")?;
    let response = client()?.get("https://api.open-meteo.com/v1/forecast").query(&[
        ("latitude", city.latitude.to_string()), ("longitude", city.longitude.to_string()),
        ("timezone", city.timezone.clone()), ("timeformat", "unixtime".into()),
        ("forecast_days", "7".into()), ("forecast_hours", "24".into()),
        ("temperature_unit", match config.temperature_unit { TemperatureUnit::Celsius => "celsius", TemperatureUnit::Fahrenheit => "fahrenheit" }.into()),
        ("wind_speed_unit", match config.wind_unit { WindUnit::Kmh => "kmh", WindUnit::Mph => "mph" }.into()),
        ("current", "temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,pressure_msl,cloud_cover".into()),
        ("hourly", "temperature_2m,weather_code,is_day,wind_speed_10m,precipitation_probability,uv_index".into()),
        ("daily", "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset".into()),
    ]).send().map_err(|e| format!("Não foi possível atualizar o clima: {e}"))?;
    decode(
        &read_json(response)?,
        config,
        crate::metrics::timestamp() as f64,
    )
}

struct State {
    config: WeatherConfig,
    generation: u64,
    next: u64,
    subs: HashMap<String, String>,
    cached: Option<WeatherData>,
    failure: Option<String>,
    failures: usize,
    due: Instant,
    stop: bool,
}
impl State {
    fn can_fetch(&self, now: Instant) -> bool {
        !self.stop && !self.subs.is_empty() && self.config.city.is_some() && self.due <= now
    }
    fn snapshot(&self) -> Value {
        if self.config.city.is_none() {
            return crate::metrics::envelope("ready", json!(empty(&self.config)));
        }
        if let Some(data) = &self.cached {
            return crate::metrics::envelope("ready", json!(data));
        }
        if let Some(error) = &self.failure {
            return json!({"status":"error", "error":error, "data":null});
        }
        crate::metrics::envelope("loading", Value::Null)
    }
    fn configure(&mut self, config: WeatherConfig) -> bool {
        if self.config == config {
            return false;
        }
        self.config = config;
        self.generation += 1;
        self.cached = None;
        self.failure = None;
        self.failures = 0;
        self.due = Instant::now();
        true
    }
    fn complete(&mut self, generation: u64, result: Result<WeatherData, String>) -> bool {
        if generation != self.generation || self.stop {
            return false;
        }
        match result {
            Ok(data) => {
                self.cached = Some(data);
                self.failure = None;
                self.failures = 0;
                self.due = Instant::now() + REFRESH;
            }
            Err(error) => {
                self.failures += 1;
                self.due = Instant::now() + retry(self.failures);
                if let Some(data) = &mut self.cached {
                    data.stale = true;
                    data.error = Some(error.clone());
                }
                self.failure = Some(error);
            }
        }
        true
    }
}
#[derive(Clone)]
pub struct Weather {
    shared: Arc<(Mutex<State>, Condvar)>,
    app: AppHandle,
}
fn allowed(label: &str) -> bool {
    crate::desktop::content_window(label)
}
impl Weather {
    pub fn start(app: AppHandle, config: WeatherConfig) -> Self {
        let this = Self {
            shared: Arc::new((
                Mutex::new(State {
                    config,
                    generation: 0,
                    next: 0,
                    subs: HashMap::new(),
                    cached: None,
                    failure: None,
                    failures: 0,
                    due: Instant::now(),
                    stop: false,
                }),
                Condvar::new(),
            )),
            app,
        };
        let worker = this.clone();
        std::thread::spawn(move || worker.run());
        this
    }
    // Emit under the generation lock so configuration invalidation cannot be overtaken by an old result.
    fn emit(&self, state: &State) {
        let windows: std::collections::HashSet<_> = state.subs.values().collect();
        for window in windows {
            let _ = self
                .app
                .emit_to(window.as_str(), "system:weather", state.snapshot());
        }
    }
    pub fn configure(&self, config: WeatherConfig) {
        let mut state = self.shared.0.lock().unwrap();
        if state.configure(config) {
            self.emit(&state);
            self.shared.1.notify_all();
        }
    }
    pub fn subscribe(&self, window: &str) -> Result<Value, String> {
        if !allowed(window) {
            return Err("Weather subscription denied".into());
        }
        let mut state = self.shared.0.lock().unwrap();
        state.next += 1;
        let token = format!("w{}", state.next);
        state.subs.insert(token.clone(), window.into());
        let result = json!({"token":token,"initial":state.snapshot()});
        self.shared.1.notify_all();
        Ok(result)
    }
    pub fn unsubscribe(&self, token: &str, window: &str) {
        let mut state = self.shared.0.lock().unwrap();
        if state.subs.get(token).is_some_and(|w| w == window) {
            state.subs.remove(token);
        }
        self.shared.1.notify_all();
    }
    pub fn remove_window(&self, window: &str) {
        self.shared
            .0
            .lock()
            .unwrap()
            .subs
            .retain(|_, w| w != window);
        self.shared.1.notify_all();
    }
    pub fn stop(&self) {
        self.shared.0.lock().unwrap().stop = true;
        self.shared.1.notify_all();
    }
    fn run(&self) {
        loop {
            let mut state = self.shared.0.lock().unwrap();
            while !state.stop && !state.can_fetch(Instant::now()) {
                let wait = if state.subs.is_empty() || state.config.city.is_none() {
                    REFRESH
                } else {
                    state.due.saturating_duration_since(Instant::now())
                };
                state = self.shared.1.wait_timeout(state, wait).unwrap().0;
            }
            if state.stop {
                return;
            }
            let config = state.config.clone();
            let generation = state.generation;
            drop(state);
            let result = fetch(&config);
            let mut state = self.shared.0.lock().unwrap();
            if state.complete(generation, result) {
                self.emit(&state);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config() -> WeatherConfig {
        WeatherConfig {
            city: Some(WeatherCity {
                id: 1,
                name: "Rio Grande".into(),
                region: "RS".into(),
                country: "Brasil".into(),
                latitude: -32.,
                longitude: -52.,
                timezone: "America/Sao_Paulo".into(),
            }),
            ..Default::default()
        }
    }
    fn state() -> State {
        State {
            config: config(),
            generation: 0,
            next: 0,
            subs: HashMap::new(),
            cached: None,
            failure: None,
            failures: 0,
            due: Instant::now(),
            stop: false,
        }
    }
    #[test]
    fn old_configs_stay_valid_and_coordinates_are_checked() {
        assert!(WeatherConfig::default().validate().is_ok());
        let mut c = config();
        c.city.as_mut().unwrap().latitude = 91.;
        assert!(c.validate().is_err());
    }
    #[test]
    fn weather_configuration_persists_without_changing_layout_and_rejects_invalid_edits() {
        let dir = std::env::temp_dir().join(format!(
            "strata-weather-config-{:032x}",
            rand::random::<u128>()
        ));
        let path = dir.join("config.json");
        let store = crate::config::ConfigStore::open(path.clone());
        let mut document = store.snapshot().unwrap().config;
        let widgets = document.widgets.clone();
        document.weather = Some(config());
        store.save(document.clone()).unwrap();
        let reopened = crate::config::ConfigStore::open(path.clone());
        assert_eq!(reopened.snapshot().unwrap().config, document);
        assert_eq!(reopened.snapshot().unwrap().config.widgets, widgets);
        let mut invalid = document.clone();
        invalid
            .weather
            .as_mut()
            .unwrap()
            .city
            .as_mut()
            .unwrap()
            .longitude = 181.;
        assert!(reopened.save(invalid).is_err());
        assert_eq!(reopened.snapshot().unwrap().config, document);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn decode_nulls_and_epoch_times() {
        let v = json!({"current":{"time":3600,"temperature_2m":15,"is_day":0},"hourly":{"time":[3600,7200],"temperature_2m":[null,17]},"daily":{"time":[0],"sunrise":[18000],"sunset":[64800]}});
        let d = decode(&v, &config(), 123.).unwrap();
        assert_eq!(d.temperature, Some(15.));
        assert!(!d.is_day);
        assert_eq!(d.humidity, None);
        assert_eq!(d.hours[0].temperature, None);
        assert_eq!(d.days[0].sunrise, Some(18_000_000.));
        assert!(decode(&json!({}), &config(), 0.).is_err());
    }
    #[test]
    fn current_hour_uses_provider_boundaries_in_fractional_offset_zones() {
        let v = json!({"current":{"time":5700},"hourly":{"time":[1800,5400,9000],"precipitation_probability":[10,20,30]},"daily":{"time":[0]}});
        let data = decode(&v, &config(), 0.).unwrap();
        assert_eq!(data.hours[0].time, 5_400_000.);
        assert_eq!(data.hours[0].rain_chance, Some(20.));
    }
    #[test]
    fn all_windows_share_a_deadline_and_no_consumers_pause_collection() {
        let mut s = state();
        assert!(!s.can_fetch(Instant::now()));
        s.subs.insert("w1".into(), "bar-0".into());
        s.subs.insert("w2".into(), "bar-1".into());
        s.subs.insert("w3".into(), "overlay".into());
        assert!(s.can_fetch(Instant::now()));
        s.complete(0, Ok(empty(&s.config)));
        assert!(!s.can_fetch(Instant::now()));
        assert!(s.can_fetch(s.due));
        s.subs.clear();
        assert!(!s.can_fetch(s.due));
        let mut c = s.config.clone();
        c.city = None;
        s.configure(c);
        s.subs.insert("w4".into(), "bar-0".into());
        assert!(!s.can_fetch(Instant::now()));
    }
    #[test]
    fn invalidation_discards_inflight_results_and_stale_data() {
        let mut s = state();
        s.cached = Some(empty(&s.config));
        let mut c = s.config.clone();
        c.city.as_mut().unwrap().id = 2;
        assert!(s.configure(c));
        assert!(s.cached.is_none());
        assert!(!s.complete(0, Ok(empty(&config()))));
        assert!(s.cached.is_none());
    }
    #[test]
    fn cache_survives_errors_and_recovers_with_one_deadline() {
        let mut s = state();
        s.complete(0, Ok(empty(&config())));
        let due = s.due;
        assert!(!s.configure(config()));
        assert_eq!(s.due, due);
        s.complete(0, Err("offline".into()));
        assert!(s.cached.as_ref().unwrap().stale);
        assert_eq!(retry(1).as_secs(), 60);
        assert_eq!(retry(2).as_secs(), 300);
        assert_eq!(retry(3).as_secs(), 900);
        s.complete(0, Ok(empty(&config())));
        assert!(!s.cached.unwrap().stale);
    }
    #[test]
    fn city_results_require_valid_location_and_timezone() {
        assert!(cities(&json!({})).unwrap().is_empty());
        assert!(cities(
            &json!({"results":[{"id":1,"name":"X","latitude":100,"longitude":0,"timezone":"UTC"}]})
        )
        .unwrap()
        .is_empty());
        assert!(allowed("overlay"));
        assert!(!allowed("settings"));
    }
    #[test]
    fn geocoding_keeps_country_identity_when_provider_omits_the_name() {
        for country in [Value::Null, json!(""), json!("   ")] {
            let result = cities(&json!({"results":[{
                "id":4567817,"name":"Rio Grande","admin1":"Rio Grande",
                "country":country,"country_code":"PR", "latitude":18.38023,
                "longitude":-65.83127,"timezone":"America/Puerto_Rico"
            }]}))
            .unwrap();
            assert_eq!(result[0].country, "PR");
            assert_eq!(result[0].id, 4567817);
            assert_eq!(result[0].timezone, "America/Puerto_Rico");
        }
    }
    #[test]
    #[ignore = "Explicit network acceptance against Open-Meteo, writes a new temporary evidence file"]
    fn live_open_meteo_contract() {
        let results = search("Rio Grande").expect("Live geocoding");
        let city = results
            .into_iter()
            .find(|c| c.timezone == "America/Sao_Paulo" && c.latitude < -30.)
            .expect("Rio Grande, RS");
        let config = WeatherConfig {
            city: Some(city),
            ..Default::default()
        };
        let metric = fetch(&config).expect("Live metric forecast");
        assert_eq!(metric.days.len(), 7);
        assert_eq!(metric.hours.len(), 12);
        assert!(metric.temperature.is_some());
        assert!(metric.days[0].sunrise.is_some());
        let imperial_config = WeatherConfig {
            temperature_unit: TemperatureUnit::Fahrenheit,
            wind_unit: WindUnit::Mph,
            ..config.clone()
        };
        let imperial = fetch(&imperial_config).expect("Live imperial forecast");
        assert!(
            (imperial.temperature.unwrap() - (metric.temperature.unwrap() * 1.8 + 32.)).abs() < 0.3
        );
        assert!(
            (imperial.hours[0].wind.unwrap() - metric.hours[0].wind.unwrap() / 1.609344).abs()
                < 0.3
        );
        let report = json!({"passed":true,"kind":"live-provider-contract","checkedAt":crate::metrics::timestamp() as f64,"metric":metric,"imperial":imperial,"limits":"No AppBar, WebView2, monitor, DPI or popup interaction validation in this run"});
        let path = std::env::temp_dir().join(format!(
            "strata-weather-provider-{}.json",
            crate::metrics::timestamp()
        ));
        std::fs::write(&path, serde_json::to_string_pretty(&report).unwrap()).unwrap();
        println!("Weather runtime evidence: {}", path.display());
    }
}
