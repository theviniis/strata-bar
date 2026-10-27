use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum InitialPromptStatus {
    NotRequested,
    Accepted,
    NotSent,
    Unknown,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentSessionResult {
    pub session_id: String,
    pub prompt_status: InitialPromptStatus,
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AgentType {
    Chatgpt,
    Opencode,
    Antigravity,
    Codex,
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
pub struct AgentTextField {
    pub key: String,
    pub title: String,
    pub description: Option<String>,
    pub required: bool,
    pub min_length: Option<u32>,
    pub max_length: Option<u32>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessage {
    pub id: String,
    pub session_id: String,
    pub connection_id: String,
    pub version: String,
    pub title: String,
    pub fields: Vec<AgentTextField>,
    pub unsupported_reason: Option<String>,
    pub reply_blocked: bool,
}

#[derive(Clone, Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentReplyRequest {
    pub session_id: String,
    pub question_id: String,
    pub version: String,
    pub answers: std::collections::BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentPermission {
    pub id: String,
    pub session_id: String,
    pub version: String,
    pub action: String,
    pub resources: Vec<String>,
    pub details: String,
    pub unsupported_reason: Option<String>,
    pub reply_blocked: bool,
}

#[derive(Clone, Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AgentPermissionDecision {
    ApproveOnce,
    Reject,
}

#[derive(Clone, Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPermissionRequest {
    pub session_id: String,
    pub permission_id: String,
    pub version: String,
    pub decision: AgentPermissionDecision,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSnapshot {
    pub status: AgentConnectionStatus,
    pub sessions: Vec<AgentSession>,
    pub has_more: bool,
    pub questions: Vec<AgentMessage>,
    pub permissions: Vec<AgentPermission>,
    pub completed_turns: std::collections::BTreeMap<String, f64>,
    pub error: Option<String>,
}

impl Default for OpenCodeSnapshot {
    fn default() -> Self {
        Self {
            status: AgentConnectionStatus::Disabled,
            sessions: Vec::new(),
            has_more: false,
            questions: Vec::new(),
            permissions: Vec::new(),
            completed_turns: Default::default(),
            error: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AntigravitySnapshot {
    pub status: AgentConnectionStatus,
    pub sessions: Vec<AgentSession>,
    pub error: Option<String>,
}

impl Default for AntigravitySnapshot {
    fn default() -> Self {
        Self {
            status: AgentConnectionStatus::Disabled,
            sessions: Vec::new(),
            error: None,
        }
    }
}

/// Metadata-only visual and native attention/completion events.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AgentAlertKind {
    Attention,
    Completed,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentAlert {
    pub id: String,
    pub agent: AgentType,
    pub session_id: String,
    pub session_title: String,
    pub kind: AgentAlertKind,
    pub created_at: f64,
}

#[derive(Clone, Debug, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentAlertsSnapshot {
    pub items: Vec<AgentAlert>,
    pub overflow_count: u32,
    pub paused: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum AgentNotificationStatus {
    #[default]
    Checking,
    Ready,
    Blocked,
    Unavailable,
    Error,
    // Part of the shared TypeScript contract; only the browser demo emits it.
    #[allow(dead_code)]
    Demo,
}

#[derive(Clone, Debug, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentNotificationsSnapshot {
    pub status: AgentNotificationStatus,
    pub skipped: u32,
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
    pub antigravity: AntigravitySnapshot,
    pub codex: CodexSnapshot,
    pub alerts: AgentAlertsSnapshot,
    pub notifications: AgentNotificationsSnapshot,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CodexSnapshot {
    pub status: AgentConnectionStatus,
    pub sessions: Vec<AgentSession>,
    pub error: Option<String>,
}
impl Default for CodexSnapshot {
    fn default() -> Self {
        Self {
            status: AgentConnectionStatus::Disabled,
            sessions: Vec::new(),
            error: None,
        }
    }
}
