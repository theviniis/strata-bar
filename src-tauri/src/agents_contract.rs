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

/// Application discovery only. This contract makes no claim about sessions.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentsSnapshot {
    pub version: u32,
    pub revision: u32,
    pub observed_at: f64,
    pub applications: Vec<AgentApplication>,
    pub error: Option<String>,
}
