//! Canonical configuration wire contract (schema version 1).
//!
//! The shape mirrors the frontend Zod schema one-for-one: every optional field
//! carries the same default the schema applies, so a document normalized by
//! either side round-trips through the other unchanged.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const SCHEMA_VERSION: u32 = 1;

fn default_true() -> bool {
    true
}
fn default_interval() -> u32 {
    2000
}
fn default_spacing() -> f64 {
    8.0
}
fn default_height() -> u32 {
    36
}
fn default_source() -> AudioSource {
    AudioSource::Windows
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum WidgetKind {
    Clock,
    Reminders,
    Agents,
    Cpu,
    Memory,
    Gpu,
    Disk,
    Network,
    Music,
    Volume,
    Microphone,
    ActiveWindow,
    Komorebi,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AudioTargetKind {
    Strip,
    Bus,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AudioTarget {
    pub kind: AudioTargetKind,
    pub index: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AudioSource {
    Windows,
    Voicemeeter,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WidgetAudio {
    #[serde(default = "default_source")]
    pub source: AudioSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<AudioTarget>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum WidgetFormat {
    Compact,
    Label,
}

impl Default for WidgetFormat {
    fn default() -> Self {
        Self::Label
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WidgetConfig {
    pub id: String,
    pub r#type: WidgetKind,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_interval")]
    pub interval_ms: u32,
    #[serde(default)]
    pub format: WidgetFormat,
    #[serde(default = "default_true")]
    pub tooltip: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio: Option<WidgetAudio>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum BarPosition {
    Top,
    Bottom,
}

impl Default for BarPosition {
    fn default() -> Self {
        Self::Top
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum BarTheme {
    Dark,
    Light,
}

impl Default for BarTheme {
    fn default() -> Self {
        Self::Dark
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BarConfig {
    #[serde(default)]
    pub position: BarPosition,
    #[serde(default = "default_height")]
    pub height: u32,
    #[serde(default = "default_spacing")]
    pub spacing: f64,
    #[serde(default)]
    pub theme: BarTheme,
    #[serde(default = "default_true")]
    pub always_on_top: bool,
}

/// One monitor's partial override of the bar configuration.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BarOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<BarPosition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacing: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<BarTheme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub always_on_top: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSections {
    pub left: Vec<WidgetConfig>,
    pub center: Vec<WidgetConfig>,
    pub right: Vec<WidgetConfig>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentVisibility {
    #[serde(default = "default_true")]
    pub chatgpt: bool,
    #[serde(default = "default_true")]
    pub opencode: bool,
    #[serde(default = "default_true")]
    pub antigravity: bool,
    #[serde(default = "default_true")]
    pub codex: bool,
}

impl Default for AgentVisibility {
    fn default() -> Self {
        Self {
            chatgpt: true,
            opencode: true,
            antigravity: true,
            codex: true,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentsConfig {
    #[serde(default)]
    pub visible: AgentVisibility,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// Pointer to the published JSON Schema, so a hand-edited document gets
    /// editor completion and inline range errors. Optional and optional to
    /// serialize: documents written before it existed stay valid, and a save
    /// preserves whatever the author put there.
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    pub version: u32,
    #[serde(default)]
    pub agents: AgentsConfig,
    pub bar: BarConfig,
    pub widgets: WidgetSections,
    #[serde(default)]
    pub monitors: std::collections::BTreeMap<String, BarOverride>,
}

/// A stored configuration plus its revision, as returned by `config_load` and
/// published on the `config` event. A rejected external edit leaves `config` at
/// the last known-good document and reports the reason in `error`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshot {
    #[ts(type = "number")]
    pub revision: u64,
    pub config: Config,
    #[serde(default)]
    pub error: Option<String>,
}
