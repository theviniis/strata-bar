use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeatherCity {
    pub id: u32,
    pub name: String,
    pub region: String,
    pub country: String,
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum TemperatureUnit {
    #[default]
    Celsius,
    Fahrenheit,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum WindUnit {
    #[default]
    Kmh,
    Mph,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeatherConfig {
    #[serde(default)]
    pub city: Option<WeatherCity>,
    #[serde(default)]
    pub temperature_unit: TemperatureUnit,
    #[serde(default)]
    pub wind_unit: WindUnit,
}
impl WeatherConfig {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(c) = &self.city {
            if !c.latitude.is_finite()
                || !(-90.0..=90.0).contains(&c.latitude)
                || !c.longitude.is_finite()
                || !(-180.0..=180.0).contains(&c.longitude)
                || c.name.trim().is_empty()
                || c.name.len() > 256
                || c.region.len() > 256
                || c.country.len() > 256
                || c.timezone.is_empty()
                || c.timezone.len() > 128
                || !c
                    .timezone
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"/_+-".contains(&b))
            {
                return Err("Localização de clima inválida".into());
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WeatherHour {
    pub time: f64,
    pub temperature: Option<f64>,
    pub code: Option<u32>,
    pub is_day: bool,
    pub wind: Option<f64>,
    pub rain_chance: Option<f64>,
    pub uv: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WeatherDay {
    pub time: f64,
    pub code: Option<u32>,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub sunrise: Option<f64>,
    pub sunset: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WeatherData {
    pub city: Option<WeatherCity>,
    pub temperature_unit: TemperatureUnit,
    pub wind_unit: WindUnit,
    pub updated_at: f64,
    pub temperature: Option<f64>,
    pub feels_like: Option<f64>,
    pub code: Option<u32>,
    pub is_day: bool,
    pub humidity: Option<f64>,
    pub pressure: Option<f64>,
    pub cloud: Option<f64>,
    pub hours: Vec<WeatherHour>,
    pub days: Vec<WeatherDay>,
    pub stale: bool,
    pub error: Option<String>,
}
