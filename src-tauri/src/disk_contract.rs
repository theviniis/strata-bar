//! Disk (volume) wire contract. Sizes are bytes; percentages 0-100;
//! timestamps Unix milliseconds.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// How Windows classifies a volume. The UI chooses which kinds belong to
/// "Dispositivos e unidades"; mapped network drives are reported as `Remote`
/// so they can be filtered (or listed separately) without native policy.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiskVolumeKind {
    Fixed,
    Removable,
    Optical,
    Ramdisk,
    Remote,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct DiskVolume {
    /// Drive root as Windows reports it, without the trailing separator
    /// (for example `C:`).
    pub mount: String,
    /// Volume label; `None` when the volume is unnamed.
    pub label: Option<String>,
    pub kind: DiskVolumeKind,
    pub total_bytes: f64,
    pub free_bytes: f64,
    pub used_bytes: f64,
    pub percent: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct DiskData {
    pub sequence: u32,
    pub sampled_at: f64,
    pub volumes: Vec<DiskVolume>,
}
