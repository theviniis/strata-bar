//! Canonical memory wire contract. Timestamps are Unix milliseconds; sizes bytes.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, Serialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MemoryMetricStatus {
    Ready,
    Error,
    Unavailable,
    NotConfigured,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MemoryMetric {
    pub status: MemoryMetricStatus,
    pub value: Option<f64>,
    pub updated_at: Option<f64>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MemoryPoint {
    pub sequence: u32,
    pub timestamp: f64,
    pub percent: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MemoryData {
    pub sequence: u32,
    pub sampled_at: f64,
    pub total_bytes: MemoryMetric,
    pub available_bytes: MemoryMetric,
    pub used_bytes: MemoryMetric,
    pub cached_bytes: MemoryMetric,
    pub paging_file_bytes: MemoryMetric,
    pub percent: MemoryMetric,
    pub history: Vec<MemoryPoint>,
}
