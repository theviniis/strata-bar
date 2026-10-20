//! Metadata-only projection of official local Codex hooks.
//! Stop does not prove a successful turn. Never infer completion from it.
use crate::agents_contract::SessionStatus;
use serde::{Deserialize, Serialize};

const MAX_INPUT: usize = 1024 * 1024;
const MAX_SESSIONS: usize = 128;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub enum Event {
    SessionStart,
    UserPromptSubmit,
    PreToolUse,
    PermissionRequest,
    PostToolUse,
    Stop,
    Interrupt,
    SessionEnd,
}

#[derive(Deserialize, Serialize)]
struct Input {
    session_id: String,
    cwd: String,
    hook_event_name: Event,
    turn_id: Option<String>,
}

pub fn metadata(raw: &str, at: f64) -> Result<String, String> {
    Monitor::default().observe(raw, at)?;
    let input: Input = serde_json::from_str(raw).map_err(|_| "Hook Codex inválido")?;
    serde_json::to_string(&input).map_err(|_| "Hook Codex inválido".into())
}

#[derive(Clone, Debug)]
pub struct Session {
    pub id: String,
    pub directory: String,
    pub status: SessionStatus,
    pub updated_at: f64,
    turn_id: Option<String>,
    terminal: bool,
}

#[derive(Default)]
pub struct Monitor {
    sessions: Vec<Session>,
}

impl Monitor {
    pub fn sessions(&self) -> &[Session] {
        &self.sessions
    }

    /// Return an empty JSON object to the hook caller, independently of parsing
    /// or transport errors. This observer never participates in approval policy.
    pub fn response() -> &'static str {
        "{}"
    }

    pub fn observe(&mut self, raw: &str, at: f64) -> Result<bool, String> {
        if raw.len() > MAX_INPUT
            || !at.is_finite()
            || !(0.0..=8_640_000_000_000_000.0).contains(&at)
        {
            return Err("Hook Codex excede os limites".into());
        }
        let input: Input = serde_json::from_str(raw).map_err(|_| "Hook Codex inválido")?;
        if !valid_id(&input.session_id)
            || input.cwd.trim().is_empty()
            || input.cwd.len() > 4096
            || input
                .turn_id
                .as_ref()
                .is_some_and(|id| id.is_empty() || id.len() > 128)
            || (!matches!(
                input.hook_event_name,
                Event::SessionStart | Event::SessionEnd
            ) && input.turn_id.is_none())
        {
            return Err("Metadados Codex inválidos".into());
        }
        let existing = self
            .sessions
            .iter()
            .find(|session| session.id == input.session_id);
        if existing.is_some_and(|session| session.updated_at > at) {
            return Ok(false);
        }
        if existing.is_some_and(|session| session.terminal)
            && !matches!(
                input.hook_event_name,
                Event::SessionStart | Event::UserPromptSubmit | Event::SessionEnd
            )
        {
            return Ok(false);
        }
        if matches!(input.hook_event_name, Event::UserPromptSubmit)
            && existing.is_some_and(|session| session.terminal && session.turn_id == input.turn_id)
        {
            return Ok(false);
        }
        // A late event from a previous turn cannot finish the currently observed
        // turn. Only UserPromptSubmit starts a new observed turn for this session.
        if !matches!(
            input.hook_event_name,
            Event::UserPromptSubmit | Event::SessionStart | Event::SessionEnd
        ) && existing
            .is_some_and(|session| session.turn_id.is_some() && input.turn_id != session.turn_id)
        {
            return Ok(false);
        }
        if matches!(input.hook_event_name, Event::SessionStart)
            && existing.is_some_and(|session| {
                session.status != SessionStatus::Disconnected && session.turn_id.is_some()
            })
        {
            return Ok(false);
        }
        let status = match input.hook_event_name {
            Event::SessionStart => SessionStatus::Unknown,
            Event::PermissionRequest => SessionStatus::Attention,
            Event::UserPromptSubmit | Event::PreToolUse | Event::PostToolUse => {
                SessionStatus::Processing
            }
            Event::Stop | Event::Interrupt => SessionStatus::Idle,
            Event::SessionEnd => SessionStatus::Disconnected,
        };
        let turn_id = if matches!(input.hook_event_name, Event::SessionEnd) {
            input
                .turn_id
                .or_else(|| existing.and_then(|session| session.turn_id.clone()))
        } else {
            input.turn_id
        };
        self.sessions
            .retain(|session| session.id != input.session_id);
        self.sessions.push(Session {
            id: input.session_id,
            directory: input.cwd,
            status,
            updated_at: at,
            turn_id,
            terminal: matches!(
                input.hook_event_name,
                Event::Stop | Event::Interrupt | Event::SessionEnd
            ),
        });
        self.sessions
            .sort_by(|a, b| b.updated_at.total_cmp(&a.updated_at));
        self.sessions.truncate(MAX_SESSIONS);
        Ok(true)
    }

    pub fn expire(&mut self, at: f64) {
        for session in &mut self.sessions {
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

fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const ID: &str = "01a1543f-85be-7fb2-9f2d-4d30b7492a78";

    fn event(name: &str, turn: &str) -> String {
        json!({"session_id":ID,"cwd":"D:\\code\\strata","hook_event_name":name,"turn_id":turn,
            "prompt":"private prompt", "transcript_path":"never open", "last_assistant_message":"private reply",
            "tool_input":{"command":"never retain"}}).to_string()
    }

    #[test]
    fn observes_attention_without_retaining_content_or_claiming_success() {
        let mut monitor = Monitor::default();
        monitor
            .observe(&event("UserPromptSubmit", "turn-1"), 1.0)
            .unwrap();
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Processing);
        monitor
            .observe(&event("PermissionRequest", "turn-1"), 2.0)
            .unwrap();
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Attention);
        monitor
            .observe(&event("PostToolUse", "turn-1"), 3.0)
            .unwrap();
        monitor.observe(&event("Stop", "turn-1"), 4.0).unwrap();
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Idle);
        assert_eq!(monitor.sessions()[0].id, ID);
        assert_eq!(monitor.sessions()[0].directory, "D:\\code\\strata");
        assert!(!format!("{:?}", monitor.sessions()).contains("private"));
        assert_eq!(Monitor::response(), "{}");
    }

    #[test]
    fn old_turns_and_stale_events_cannot_end_current_work() {
        let mut monitor = Monitor::default();
        monitor
            .observe(&event("UserPromptSubmit", "turn-1"), 1.0)
            .unwrap();
        monitor
            .observe(&event("UserPromptSubmit", "turn-2"), 2.0)
            .unwrap();
        assert!(!monitor.observe(&event("Stop", "turn-1"), 3.0).unwrap());
        assert!(!monitor.observe(&event("Stop", "turn-2"), 1.0).unwrap());
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Processing);
        monitor.expire(120_002.0);
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Unknown);
        monitor
            .observe(&event("Interrupt", "turn-2"), 120_003.0)
            .unwrap();
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Idle);
        monitor
            .observe(&event("SessionEnd", "turn-2"), 120_004.0)
            .unwrap();
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Disconnected);
    }

    #[test]
    fn terminal_events_require_a_new_turn_before_processing_can_resume() {
        let mut monitor = Monitor::default();
        monitor
            .observe(&event("UserPromptSubmit", "turn-1"), 1.0)
            .unwrap();
        monitor.observe(&event("Stop", "turn-1"), 2.0).unwrap();
        assert!(!monitor
            .observe(&event("PostToolUse", "turn-1"), 3.0)
            .unwrap());
        assert!(!monitor
            .observe(&event("UserPromptSubmit", "turn-1"), 4.0)
            .unwrap());
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Idle);
        let end = json!({"session_id":ID,"cwd":"C:\\work","hook_event_name":"SessionEnd"});
        monitor.observe(&end.to_string(), 5.0).unwrap();
        assert!(!monitor
            .observe(&event("PostToolUse", "turn-1"), 6.0)
            .unwrap());
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Disconnected);
        monitor
            .observe(&event("UserPromptSubmit", "turn-2"), 7.0)
            .unwrap();
        assert_eq!(monitor.sessions()[0].status, SessionStatus::Processing);
    }

    #[test]
    fn rejects_unbounded_or_invalid_metadata_and_bounds_retained_sessions() {
        let mut monitor = Monitor::default();
        assert!(monitor.observe(&"x".repeat(MAX_INPUT + 1), 1.0).is_err());
        assert!(monitor.observe(&event("Stop", "turn"), f64::NAN).is_err());
        assert!(monitor.observe(&event("Unknown", "turn"), 1.0).is_err());
        for index in 0..130 {
            let raw = json!({"session_id":format!("00000000-0000-0000-0000-{index:012x}"),
                "cwd":"C:\\work", "hook_event_name":"SessionStart"})
            .to_string();
            monitor.observe(&raw, index as f64).unwrap();
        }
        assert_eq!(monitor.sessions().len(), MAX_SESSIONS);
    }
}
