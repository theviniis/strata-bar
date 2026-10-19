use serde::Serialize;
use ts_rs::TS;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AgentType {
    Chatgpt,
    Opencode,
    Antigravity,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentApplication {
    pub agent: AgentType,
    /// None means enumeration failed; false means no matching process was found.
    pub running: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Processing,
    Attention,
    Completed,
    Error,
    Idle,
    Unknown,
    Disconnected,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub id: String,
    pub agent: AgentType,
    pub connection_id: String,
    pub title: String,
    pub directory: String,
    pub status: SessionStatus,
    pub updated_at: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AgentConnectionStatus {
    Disabled,
    Connecting,
    Connected,
    Disconnected,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSnapshot {
    pub status: AgentConnectionStatus,
    pub sessions: Vec<AgentSession>,
    pub has_more: bool,
    pub error: Option<String>,
}

impl Default for OpenCodeSnapshot {
    fn default() -> Self {
        Self {
            status: AgentConnectionStatus::Disabled,
            sessions: Vec::new(),
            has_more: false,
            error: None,
        }
    }
}

/// Application discovery and independently configured session connections.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentsSnapshot {
    pub version: u32,
    pub revision: u32,
    pub observed_at: f64,
    pub applications: Vec<AgentApplication>,
    pub error: Option<String>,
    pub opencode: OpenCodeSnapshot,
}
