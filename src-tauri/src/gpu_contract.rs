//! GPU wire contract. Sizes are bytes; power watts; percentages 0-100;
//! timestamps Unix milliseconds.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GpuMetricStatus {
    Ready,
    Error,
    Unavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct GpuMetric {
    pub status: GpuMetricStatus,
    pub value: Option<f64>,
    pub updated_at: Option<f64>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct GpuAdapter {
    pub name: String,
    pub vendor_id: u32,
    pub device_id: u32,
    pub dedicated_bytes: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct GpuSensor {
    pub provider: String,
    pub hardware_id: String,
    pub sensor_id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct GpuPoint {
    pub sequence: u32,
    pub timestamp: f64,
    pub percent: Option<f64>,
    // As for the CPU, a repeated producer timestamp is a still-valid reading
    // rather than a new observation, so the value stays null and only
    // `temperature_updated_at` advances. Both fields null mean unavailable.
    pub temperature_celsius: Option<f64>,
    pub temperature_updated_at: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct GpuData {
    pub sequence: u32,
    pub sampled_at: f64,
    pub adapter: Option<GpuAdapter>,
    pub percent: GpuMetric,
    pub memory_used_bytes: GpuMetric,
    pub memory_total_bytes: GpuMetric,
    pub shared_used_bytes: GpuMetric,
    pub shared_total_bytes: GpuMetric,
    pub temperature_celsius: GpuMetric,
    pub power_watts: GpuMetric,
    pub fan_percent: GpuMetric,
    pub temperature_sensor: Option<GpuSensor>,
    pub history: Vec<GpuPoint>,
}
