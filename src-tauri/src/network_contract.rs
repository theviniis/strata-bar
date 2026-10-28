//! Network wire contract. Rates are decimal bytes/s; link speeds are bits/s.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
// Unknown/legacy preferences are ignored, matching the frontend normalization.
#[serde(default, rename_all = "camelCase")]
pub struct NetworkConfig {
    pub unit: NetworkUnit,
    pub probes_enabled: bool,
    pub probe_target: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum NetworkUnit {
    Bytes,
    Bits,
}
impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            unit: NetworkUnit::Bytes,
            probes_enabled: true,
            probe_target: "1.1.1.1".into(),
        }
    }
}
impl NetworkConfig {
    pub fn validate(&self) -> Result<(), String> {
        self.probe_target
            .parse::<std::net::IpAddr>()
            .map_err(|_| "Destino ICMP deve ser um endereÃ§o IPv4 ou IPv6 literal")?;
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterface {
    pub id: String,
    pub index: u32,
    pub name: String,
    pub kind: String,
    pub connected: bool,
    pub addresses: Vec<String>,
    pub gateways: Vec<String>,
    pub receive_link_bps: Option<f64>,
    pub transmit_link_bps: Option<f64>,
    pub ssid: Option<String>,
    pub signal_percent: Option<u32>,
    pub wifi_error: Option<String>,
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NetworkPoint {
    pub timestamp: f64,
    pub download: Option<f64>,
    pub upload: Option<f64>,
}
#[derive(Clone, Debug, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NetworkQuality {
    pub target: String,
    pub ping_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub loss_percent: Option<f64>,
    pub sent: u32,
    pub lost: u32,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum NetworkTestPhase {
    Idle,
    Preparing,
    Download,
    Upload,
    Complete,
    Cancelled,
    Error,
}
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSpeedTest {
    pub phase: NetworkTestPhase,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
    pub elapsed_ms: f64,
    pub transferred_bytes: f64,
    pub stage_progress: f64,
    pub timestamp: Option<f64>,
    pub interface_name: Option<String>,
    pub provider: String,
    pub limited: bool,
    pub error: Option<String>,
}
impl Default for NetworkSpeedTest {
    fn default() -> Self {
        Self {
            phase: NetworkTestPhase::Idle,
            download_mbps: None,
            upload_mbps: None,
            elapsed_ms: 0.,
            transferred_bytes: 0.,
            stage_progress: 0.,
            timestamp: None,
            interface_name: None,
            provider: "Cloudflare".into(),
            limited: false,
            error: None,
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NetworkData {
    pub sequence: u32,
    pub sampled_at: f64,
    pub interfaces: Vec<NetworkInterface>,
    pub selected_id: Option<String>,
    pub download: Option<f64>,
    pub upload: Option<f64>,
    pub received_bytes: f64,
    pub sent_bytes: f64,
    pub observation_started_at: Option<f64>,
    pub history: Vec<NetworkPoint>,
    pub quality: NetworkQuality,
    pub speed_test: NetworkSpeedTest,
    pub error: Option<String>,
}
