//! CPU wire contract. Frequencies are Hz; timestamps are Unix milliseconds.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CpuMetricStatus {
    Ready,
    Error,
    Unavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct CpuMetric {
    pub status: CpuMetricStatus,
    pub value: Option<f64>,
    pub updated_at: Option<f64>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct CpuTemperatureSensor {
    pub provider: String,
    pub hardware_id: String,
    pub sensor_id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct CpuPoint {
    pub sequence: u32,
    pub timestamp: f64,
    pub percent: Option<f64>,
    pub temperature_celsius: Option<f64>,
    // Some time with no new temperature denotes an unchanged, valid reading.
    // Both fields None denote an unavailable observation.
    pub temperature_updated_at: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct CpuData {
    pub sequence: u32,
    pub sampled_at: f64,
    pub percent: CpuMetric,
    pub frequency_hz: CpuMetric,
    pub max_frequency_hz: CpuMetric,
    pub physical_cores: CpuMetric,
    pub logical_processors: CpuMetric,
    pub temperature_celsius: CpuMetric,
    pub temperature_sensor: Option<CpuTemperatureSensor>,
    pub history: Vec<CpuPoint>,
}
