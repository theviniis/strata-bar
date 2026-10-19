use crate::agents_contract::{
    AgentConnectionStatus, AgentSession, AgentType, AntigravitySnapshot, SessionStatus,
};
use serde::{Deserialize, Serialize};

pub const MAX_INPUT: u64 = 1024 * 1024;
pub const MAX_PACKET: u64 = 16 * 1024;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum HookEvent {
    SessionStart,
    PreInvocation,
    PreToolUse,
    PostToolUse,
    Stop,
}
impl HookEvent {
    pub fn name(self) -> &'static str {
        match self {
            Self::SessionStart => "SessionStart",
            Self::PreInvocation => "PreInvocation",
            Self::PreToolUse => "PreToolUse",
            Self::PostToolUse => "PostToolUse",
            Self::Stop => "Stop",
        }
    }
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "SessionStart" => Some(Self::SessionStart),
            "PreInvocation" => Some(Self::PreInvocation),
            "PreToolUse" => Some(Self::PreToolUse),
            "PostToolUse" => Some(Self::PostToolUse),
            "Stop" => Some(Self::Stop),
            _ => None,
        }
    }
    /// Delegate to normal tool permission policy; never auto-approve or continue.
    pub fn response(self) -> &'static str {
        match self {
            Self::PreToolUse => r#"{"decision":"allow"}"#,
            Self::Stop => r#"{"decision":"stop"}"#,
            _ => "{}",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HookInput {
    conversation_id: String,
    workspace_paths: Vec<String>,
    tool_call: Option<ToolCall>,
    termination_reason: Option<String>,
    fully_idle: Option<bool>,
    error: Option<String>,
}
#[derive(Deserialize)]
struct ToolCall {
    name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HookMessage {
    pub event: HookEvent,
    pub conversation_id: String,
    pub directory: String,
    pub observed_at: f64,
    pub needs_attention: bool,
    pub model_stop: bool,
    pub fully_idle: Option<bool>,
    pub has_error: bool,
}

fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, c)| {
            if [8, 13, 18, 23].contains(&index) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}

pub fn parse_hook(event: HookEvent, raw: &str, at: f64) -> Result<HookMessage, String> {
    if raw.len() as u64 > MAX_INPUT {
        return Err("Hook excede o limite".into());
    }
    let input: HookInput = serde_json::from_str(raw).map_err(|_| "Hook Antigravity inválido")?;
    if input.workspace_paths.len() > 16
        || input
            .workspace_paths
            .iter()
            .any(|path| path.is_empty() || path.len() > 4096)
    {
        return Err("Workspaces inválidos".into());
    }
    let message = HookMessage {
        event,
        conversation_id: input.conversation_id,
        directory: input
            .workspace_paths
            .into_iter()
            .next()
            .unwrap_or_else(|| "Sem workspace".into()),
        observed_at: at,
        needs_attention: input
            .tool_call
            .is_some_and(|tool| matches!(tool.name.as_str(), "ask_question" | "ask_permission")),
        model_stop: input.termination_reason.as_deref() == Some("model_stop"),
        fully_idle: input.fully_idle,
        has_error: input.error.is_some_and(|error| !error.trim().is_empty())
            || matches!(
                input.termination_reason.as_deref(),
                Some("error" | "max_steps_exceeded")
            ),
    };
    validate(&message)?;
    Ok(message)
}

fn validate(message: &HookMessage) -> Result<(), String> {
    if !valid_id(&message.conversation_id)
        || message.directory.is_empty()
        || message.directory.len() > 4096
        || !message.observed_at.is_finite()
        || !(0.0..=8_640_000_000_000_000.0).contains(&message.observed_at)
        || (matches!(message.event, HookEvent::Stop) && message.fully_idle.is_none())
    {
        return Err("Metadados do hook inválidos".into());
    }
    Ok(())
}

#[derive(Default)]
pub struct Monitor {
    enabled: bool,
    snapshot: AntigravitySnapshot,
}
impl Monitor {
    pub fn configure(&mut self, enabled: bool) {
        self.enabled = enabled;
        self.snapshot = AntigravitySnapshot {
            status: if enabled {
                AgentConnectionStatus::Connecting
            } else {
                AgentConnectionStatus::Disabled
            },
            ..Default::default()
        };
    }
    pub fn snapshot(&self) -> AntigravitySnapshot {
        self.snapshot.clone()
    }
    pub fn fail(&mut self, error: String) {
        self.snapshot.status = AgentConnectionStatus::Disconnected;
        self.snapshot.error = Some(error);
        for session in &mut self.snapshot.sessions {
            session.status = SessionStatus::Disconnected;
        }
    }
    pub fn cleanup_failed(&mut self, error: String) {
        self.snapshot.error = Some(format!(
            "Monitor desativado; não foi possível remover os hooks: {error}"
        ));
    }
    pub fn observe(&mut self, event: HookEvent, raw: &str, at: f64) -> Result<bool, String> {
        self.receive(parse_hook(event, raw, at)?)
    }
    pub fn receive(&mut self, message: HookMessage) -> Result<bool, String> {
        validate(&message)?;
        if !self.enabled {
            return Ok(false);
        }
        if self.snapshot.sessions.iter().any(|session| {
            session.id == message.conversation_id && session.updated_at > message.observed_at
        }) {
            return Ok(false);
        }
        let status = match message.event {
            HookEvent::SessionStart => SessionStatus::Unknown,
            HookEvent::PreInvocation | HookEvent::PostToolUse => SessionStatus::Processing,
            HookEvent::PreToolUse if message.needs_attention => SessionStatus::Attention,
            HookEvent::PreToolUse => SessionStatus::Processing,
            HookEvent::Stop if message.has_error => SessionStatus::Error,
            HookEvent::Stop if message.model_stop && message.fully_idle == Some(true) => {
                SessionStatus::Completed
            }
            HookEvent::Stop if message.fully_idle == Some(false) => SessionStatus::Processing,
            HookEvent::Stop => SessionStatus::Unknown,
        };
        self.snapshot
            .sessions
            .retain(|session| session.id != message.conversation_id);
        self.snapshot.sessions.push(AgentSession {
            title: format!("Sessão {}", &message.conversation_id[..8]),
            id: message.conversation_id,
            agent: AgentType::Antigravity,
            connection_id: "antigravity-hooks".into(),
            directory: message.directory,
            status,
            updated_at: message.observed_at,
        });
        self.snapshot
            .sessions
            .sort_by(|a, b| b.updated_at.total_cmp(&a.updated_at));
        self.snapshot.sessions.truncate(128);
        self.snapshot.status = AgentConnectionStatus::Connected;
        self.snapshot.error = None;
        Ok(true)
    }
    pub fn refresh(&mut self, at: f64, running: Option<bool>) {
        if !self.enabled {
            return;
        }
        if running == Some(false) {
            self.snapshot.status = AgentConnectionStatus::Disconnected;
            for session in &mut self.snapshot.sessions {
                session.status = SessionStatus::Disconnected;
            }
        } else {
            for session in &mut self.snapshot.sessions {
                if at - session.updated_at >= 120_000.0
                    && matches!(
                        session.status,
                        SessionStatus::Processing | SessionStatus::Attention
                    )
                {
                    session.status = SessionStatus::Unknown;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn attention_keeps_the_normal_policy_and_expires_without_new_observations() {
        let mut monitor = Monitor::default();
        monitor.configure(true);
        let input = json!({"conversationId":"ec33ebf9-0cba-4100-8142-c61503f6c587","workspacePaths":[],"toolCall":{"name":"ask_question","args":{"questions":"never forwarded"}}});
        let message = parse_hook(HookEvent::PreToolUse, &input.to_string(), 1000.0).unwrap();
        assert!(!serde_json::to_string(&message)
            .unwrap()
            .contains("never forwarded"));
        monitor.receive(message).unwrap();
        assert_eq!(
            monitor.snapshot().sessions[0].status,
            SessionStatus::Attention
        );
        assert_eq!(HookEvent::PreToolUse.response(), r#"{"decision":"allow"}"#);
        assert_ne!(HookEvent::Stop.response(), r#"{"decision":"continue"}"#);
        monitor.refresh(121_000.0, Some(true));
        assert_eq!(
            monitor.snapshot().sessions[0].status,
            SessionStatus::Unknown
        );
        monitor.configure(false);
        assert!(!monitor
            .observe(HookEvent::PreInvocation, &input.to_string(), 122_000.0)
            .unwrap());
        assert!(monitor.snapshot().sessions.is_empty());
    }

    #[test]
    fn older_observations_and_untrusted_identifiers_cannot_restore_state() {
        let mut monitor = Monitor::default();
        monitor.configure(true);
        let input = json!({"conversationId":"ec33ebf9-0cba-4100-8142-c61503f6c587","workspacePaths":["D:\\project"]});
        monitor
            .observe(HookEvent::PreInvocation, &input.to_string(), 2000.0)
            .unwrap();
        assert!(!monitor
            .observe(HookEvent::SessionStart, &input.to_string(), 1000.0)
            .unwrap());
        monitor.refresh(3000.0, Some(false));
        assert_eq!(
            monitor.snapshot().sessions[0].status,
            SessionStatus::Disconnected
        );
        let invalid = json!({"conversationId":"../../invalid","workspacePaths":[]});
        assert!(monitor
            .observe(HookEvent::PreInvocation, &invalid.to_string(), 4000.0)
            .is_err());
    }

    #[test]
    fn observed_sessions_need_an_explicit_successful_stop_to_be_completed() {
        let mut monitor = Monitor::default();
        monitor.configure(true);
        let input = json!({"conversationId":"ec33ebf9-0cba-4100-8142-c61503f6c587","workspacePaths":["D:\\project"],"transcriptPath":"must-not-be-read"});
        monitor
            .observe(HookEvent::PreInvocation, &input.to_string(), 1000.0)
            .unwrap();
        assert_eq!(
            monitor.snapshot().sessions[0].status,
            SessionStatus::Processing
        );
        let mut stopped = input;
        stopped["terminationReason"] = json!("model_stop");
        stopped["fullyIdle"] = json!(false);
        monitor
            .observe(HookEvent::Stop, &stopped.to_string(), 1100.0)
            .unwrap();
        assert_eq!(
            monitor.snapshot().sessions[0].status,
            SessionStatus::Processing
        );
        stopped["fullyIdle"] = json!(true);
        monitor
            .observe(HookEvent::Stop, &stopped.to_string(), 1200.0)
            .unwrap();
        assert_eq!(
            monitor.snapshot().sessions[0].status,
            SessionStatus::Completed
        );
    }
}
