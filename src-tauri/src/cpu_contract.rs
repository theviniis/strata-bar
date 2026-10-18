//! CPU wire contract. Frequencies are Hz; timestamps are Unix milliseconds.
use serde::Serialize;
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CpuMetricStatus {
    Ready,
    Error,
    Unavailable,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CpuMetric {
    pub status: CpuMetricStatus,
    pub value: Option<f64>,
    pub updated_at: Option<f64>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CpuTemperatureSensor {
    pub provider: String,
    pub source_id: u32,
    pub instance: u32,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CpuPoint {
    pub sequence: u32,
    pub timestamp: f64,
    pub percent: Option<f64>,
    pub temperature_celsius: Option<f64>,
    // Some time with no new temperature denotes an unchanged, valid reading.
    // Both fields None denote an unavailable observation.
    pub temperature_updated_at: Option<f64>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
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
