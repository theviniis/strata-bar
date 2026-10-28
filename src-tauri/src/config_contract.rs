//! Canonical configuration wire contract (schema version 2).
//!
//! The shape mirrors the frontend Zod schema one-for-one: every optional field
//! carries the same default the schema applies, so a document normalized by
//! either side round-trips through the other unchanged.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const SCHEMA_VERSION: u32 = 2;

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
    Separator,
    Clock,
    Weather,
    Reminders,
    Agents,
    Cpu,
    Memory,
    Gpu,
    Disk,
    Network,
    Music,
    MediaSpectrum,
    Volume,
    Microphone,
    ActiveWindow,
    Workspaces,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AudioSource {
    Windows,
    Voicemeeter,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioChannelConfig {
    #[serde(default = "default_source")]
    pub source: AudioSource,
    #[serde(default)]
    pub target_index: u8,
}

impl Default for AudioChannelConfig {
    fn default() -> Self {
        Self {
            source: AudioSource::Windows,
            target_index: 0,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioConfig {
    #[serde(default)]
    pub output: AudioChannelConfig,
    #[serde(default)]
    pub input: AudioChannelConfig,
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
pub enum WorkspaceSource {
    Komorebi,
    Windows,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum NetworkDirection {
    Both,
    Download,
    Upload,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WidgetConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_source: Option<WorkspaceSource>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network_direction: Option<NetworkDirection>,
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
    pub margin_x: Option<f64>,
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
    System,
    Dark,
    Light,
}

impl Default for BarTheme {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ColorTheme {
    #[default]
    Current,
    Amoled,
    Nord,
    Dracula,
    Catppuccin,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BarConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub position: BarPosition,
    #[serde(default = "default_height")]
    pub height: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f64>,
    #[serde(default = "default_spacing")]
    pub spacing: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub separator_margin_x: Option<f64>,
    #[serde(default)]
    pub theme: BarTheme,
    #[serde(default)]
    pub color_theme: ColorTheme,
    #[serde(default)]
    pub reduce_motion: bool,
}
/// Partial widget behavior; identity is shared, membership and order are separate.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WidgetOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_source: Option<WorkspaceSource>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network_direction: Option<NetworkDirection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval_ms: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<WidgetFormat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tooltip: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub margin_x: Option<f64>,
}

/// One monitor's partial override of bar appearance and widget behavior.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BarOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<WidgetLayout>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub widgets: Option<std::collections::BTreeMap<String, WidgetOverride>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<BarPosition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacing: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<BarTheme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color_theme: Option<ColorTheme>,
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
    pub audio: AudioConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weather: Option<crate::weather_contract::WeatherConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<crate::network_contract::NetworkConfig>,
    #[serde(default)]
    pub agents: AgentsConfig,
    pub bar: BarConfig,
    pub widgets: WidgetSections,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<WidgetLayout>,
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

/// Ordered membership, separate from widget definitions and visibility.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WidgetLayout {
    pub left: Vec<String>,
    pub center: Vec<String>,
    pub right: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SettingsMonitor {
    pub id: String,
    pub device_name: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}
