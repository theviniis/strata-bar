use crate::agents_contract::{
    AgentAlert, AgentAlertKind, AgentAlertsSnapshot, AgentConnectionStatus, AgentSession,
    AntigravitySnapshot, OpenCodeSnapshot, SessionStatus,
};
use std::collections::{BTreeMap, HashSet};

struct Observed {
    status: SessionStatus,
    updated_at: f64,
    last_activity_at: Option<f64>,
}

#[derive(Default)]
struct Source {
    connected: bool,
    sessions: BTreeMap<String, Observed>,
}

struct Candidate {
    session: AgentSession,
    key: String,
    kind: AgentAlertKind,
    announce: bool,
}

impl Source {
    fn observe(
        &mut self,
        status: &AgentConnectionStatus,
        sessions: &[AgentSession],
        pending: &BTreeMap<String, Vec<String>>,
        completed_turns: &BTreeMap<String, f64>,
        hooks: bool,
    ) -> Vec<Candidate> {
        if *status != AgentConnectionStatus::Connected {
            self.connected = false;
            self.sessions.clear();
            return Vec::new();
        }
        let baseline = !self.connected;
        self.connected = true;
        let mut previous = std::mem::take(&mut self.sessions);
        let mut candidates = Vec::new();
        for session in sessions {
            if !session.updated_at.is_finite() {
                continue;
            }
            let id = format!("{}:{}", session.connection_id, session.id);
            let old = previous.remove(&id);
            if old
                .as_ref()
                .is_some_and(|old| old.updated_at > session.updated_at)
            {
                self.sessions.insert(id, old.unwrap());
                continue;
            }
            let last_activity_at = old.as_ref().and_then(|old| old.last_activity_at);
            let active_before = last_activity_at.is_some();
            let completed_at = if hooks {
                Some(session.updated_at)
            } else {
                completed_turns.get(&session.id).copied()
            };
            if session.status == SessionStatus::Completed
                && active_before
                && !baseline
                && !hooks
                && completed_at.is_none_or(|marker| marker <= last_activity_at.unwrap())
            {
                // A retained prior outcome cannot disarm an observed execution.
                self.sessions.insert(id, old.unwrap());
                continue;
            }
            if session.status == SessionStatus::Attention {
                let keys = if hooks {
                    if old
                        .as_ref()
                        .is_none_or(|old| old.status != SessionStatus::Attention)
                    {
                        vec![format!("{id}:attention:{:x}", session.updated_at.to_bits())]
                    } else {
                        Vec::new()
                    }
                } else {
                    pending.get(&session.id).cloned().unwrap_or_default()
                };
                for key in keys {
                    candidates.push(Candidate {
                        session: session.clone(),
                        key,
                        kind: AgentAlertKind::Attention,
                        announce: !baseline,
                    });
                }
            }
            if session.status == SessionStatus::Completed
                && (baseline || old.is_none() || active_before)
            {
                if let Some(completed_at) = completed_at {
                    candidates.push(Candidate {
                        session: session.clone(),
                        key: format!("{id}:completed:{:x}", completed_at.to_bits()),
                        kind: AgentAlertKind::Completed,
                        announce: !baseline && active_before,
                    });
                }
            }
            self.sessions.insert(
                id,
                Observed {
                    status: session.status.clone(),
                    updated_at: session.updated_at,
                    last_activity_at: match session.status {
                        SessionStatus::Processing | SessionStatus::Attention => {
                            Some(session.updated_at)
                        }
                        SessionStatus::Unknown => last_activity_at,
                        _ => None,
                    },
                },
            );
        }
        candidates
    }
}

#[derive(Default)]
pub struct Alerts {
    opencode: Source,
    antigravity: Source,
    seen: HashSet<String>,
    snapshot: AgentAlertsSnapshot,
    next_id: u32,
}

impl Alerts {
    pub fn snapshot(&self) -> AgentAlertsSnapshot {
        self.snapshot.clone()
    }

    pub fn observe(
        &mut self,
        opencode: &OpenCodeSnapshot,
        antigravity: &AntigravitySnapshot,
        at: f64,
    ) -> Vec<AgentAlert> {
        if !at.is_finite() || !(0.0..=8_640_000_000_000_000.0).contains(&at) {
            return Vec::new();
        }
        let mut emitted = Vec::new();
        let mut pending: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for question in &opencode.questions {
            pending
                .entry(question.session_id.clone())
                .or_default()
                .push(format!(
                    "opencode:{}:question:{}:{}",
                    question.session_id, question.id, question.version
                ));
        }
        for permission in &opencode.permissions {
            pending
                .entry(permission.session_id.clone())
                .or_default()
                .push(format!(
                    "opencode:{}:permission:{}:{}",
                    permission.session_id, permission.id, permission.version
                ));
        }
        let candidates = self
            .opencode
            .observe(
                &opencode.status,
                &opencode.sessions,
                &pending,
                &opencode.completed_turns,
                false,
            )
            .into_iter()
            .chain(self.antigravity.observe(
                &antigravity.status,
                &antigravity.sessions,
                &BTreeMap::new(),
                &BTreeMap::new(),
                true,
            ));
        for candidate in candidates {
            if self.seen.contains(&candidate.key) {
                continue;
            }
            if self.seen.len() >= 4096 || self.next_id == u32::MAX {
                self.snapshot.paused = true;
                continue;
            }
            self.seen.insert(candidate.key);
            if !candidate.announce {
                continue;
            }
            self.next_id += 1;
            if self.snapshot.items.len() == 32 {
                self.snapshot.items.remove(0);
                self.snapshot.overflow_count = self.snapshot.overflow_count.saturating_add(1);
            }
            let alert = AgentAlert {
                id: format!("agent-alert-{}", self.next_id),
                agent: candidate.session.agent,
                session_id: candidate.session.id,
                session_title: candidate.session.title,
                kind: candidate.kind,
                created_at: at,
            };
            self.snapshot.items.push(alert.clone());
            emitted.push(alert);
        }
        emitted
    }

    pub fn dismiss(&mut self, ids: &[String]) -> Result<(), String> {
        if ids.len() > 32
            || ids.iter().any(|id| {
                id.strip_prefix("agent-alert-")
                    .filter(|value| {
                        !value.is_empty()
                            && value.len() <= 10
                            && value.bytes().all(|c| c.is_ascii_digit())
                    })
                    .and_then(|id| id.parse::<u32>().ok())
                    .is_none_or(|id| id == 0)
            })
        {
            return Err("Identificadores de alerta inválidos".into());
        }
        self.snapshot.items.retain(|alert| !ids.contains(&alert.id));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents_contract::*;

    fn session(status: SessionStatus, at: f64) -> AgentSession {
        AgentSession {
            id: "ses_test".into(),
            agent: AgentType::Opencode,
            connection_id: "opencode-local".into(),
            title: "Projeto".into(),
            directory: "D:\\project".into(),
            status,
            updated_at: at,
        }
    }
    fn source(status: SessionStatus, at: f64) -> OpenCodeSnapshot {
        let completed_turns = if status == SessionStatus::Completed {
            BTreeMap::from([("ses_test".into(), at)])
        } else {
            BTreeMap::new()
        };
        OpenCodeSnapshot {
            status: AgentConnectionStatus::Connected,
            sessions: vec![session(status, at)],
            completed_turns,
            ..Default::default()
        }
    }

    #[test]
    fn only_new_alerts_are_forwarded_to_the_native_notification_transport() {
        let mut alerts = Alerts::default();
        let absent = AntigravitySnapshot::default();
        let baseline = alerts.observe(&source(SessionStatus::Processing, 1000.0), &absent, 1000.0);
        assert!(baseline.is_empty());
        let next = alerts.observe(&source(SessionStatus::Completed, 2000.0), &absent, 2000.0);
        assert_eq!(next.len(), 1);
        alerts.dismiss(&[next[0].id.clone()]).unwrap();
        let duplicate = alerts.observe(&source(SessionStatus::Completed, 2000.0), &absent, 3000.0);
        assert!(duplicate.is_empty());
    }

    #[test]
    fn uncertainty_does_not_disarm_an_observed_run() {
        let mut alerts = Alerts::default();
        let absent = AntigravitySnapshot::default();
        alerts.observe(&source(SessionStatus::Processing, 1000.0), &absent, 1000.0);
        alerts.observe(&source(SessionStatus::Unknown, 130000.0), &absent, 130000.0);
        assert!(alerts.snapshot().items.is_empty());
        let mut completed = source(SessionStatus::Completed, 140000.0);
        completed
            .completed_turns
            .insert("ses_test".into(), 135000.0);
        alerts.observe(&completed, &absent, 140000.0);
        assert_eq!(alerts.snapshot().items.len(), 1);
    }

    #[test]
    fn an_old_success_outcome_cannot_complete_a_new_observed_run() {
        let mut alerts = Alerts::default();
        let absent = AntigravitySnapshot::default();
        alerts.observe(&source(SessionStatus::Processing, 2000.0), &absent, 2000.0);
        let mut stale = source(SessionStatus::Completed, 2500.0);
        stale.completed_turns.insert("ses_test".into(), 1000.0);
        alerts.observe(&stale, &absent, 2500.0);
        assert!(alerts.snapshot().items.is_empty());
        alerts.observe(&source(SessionStatus::Completed, 3000.0), &absent, 3000.0);
        assert_eq!(alerts.snapshot().items.len(), 1);
    }

    #[test]
    fn hook_attention_is_deduplicated_and_reconnection_does_not_announce_offline_completion() {
        use crate::antigravity::{HookEvent, Monitor};
        let mut alerts = Alerts::default();
        let mut monitor = Monitor::default();
        monitor.configure(true);
        let raw = serde_json::json!({"conversationId":"11111111-1111-1111-1111-111111111111","workspacePaths":[],"toolCall":{"name":"ask_question"},"terminationReason":"model_stop","fullyIdle":true}).to_string();
        for (event, at) in [
            (HookEvent::SessionStart, 1000.0),
            (HookEvent::PreInvocation, 2000.0),
            (HookEvent::PreToolUse, 3000.0),
            (HookEvent::PreToolUse, 4000.0),
        ] {
            monitor.observe(event, &raw, at).unwrap();
            alerts.observe(&OpenCodeSnapshot::default(), &monitor.snapshot(), at);
        }
        assert_eq!(alerts.snapshot().items.len(), 1);
        monitor.refresh(4500.0, Some(false));
        alerts.observe(&OpenCodeSnapshot::default(), &monitor.snapshot(), 4500.0);
        monitor.observe(HookEvent::Stop, &raw, 5000.0).unwrap();
        alerts.observe(&OpenCodeSnapshot::default(), &monitor.snapshot(), 5000.0);
        assert_eq!(alerts.snapshot().items.len(), 1);
        for (event, at) in [
            (HookEvent::PreInvocation, 6000.0),
            (HookEvent::PreToolUse, 7000.0),
            (HookEvent::Stop, 8000.0),
            (HookEvent::Stop, 9000.0),
        ] {
            monitor.observe(event, &raw, at).unwrap();
            alerts.observe(&OpenCodeSnapshot::default(), &monitor.snapshot(), at);
        }
        assert_eq!(alerts.snapshot().items.len(), 3);
        assert_eq!(alerts.snapshot().items[2].kind, AgentAlertKind::Completed);
    }

    #[test]
    fn the_queue_is_bounded_and_dismissing_does_not_reset_the_deduplication_budget() {
        let mut alerts = Alerts::default();
        let absent = AntigravitySnapshot::default();
        alerts.observe(&source(SessionStatus::Idle, 0.0), &absent, 0.0);
        for index in 1..=4097 {
            let at = f64::from(index * 2);
            alerts.observe(
                &source(SessionStatus::Processing, at - 1.0),
                &absent,
                at - 1.0,
            );
            alerts.observe(&source(SessionStatus::Completed, at), &absent, at);
        }
        let snapshot = alerts.snapshot();
        assert_eq!(snapshot.items.len(), 32);
        assert_eq!(snapshot.overflow_count, 4064);
        assert!(snapshot.paused);
        alerts
            .dismiss(
                &snapshot
                    .items
                    .iter()
                    .map(|alert| alert.id.clone())
                    .collect::<Vec<_>>(),
            )
            .unwrap();
        alerts.observe(&source(SessionStatus::Processing, 9000.0), &absent, 9000.0);
        alerts.observe(&source(SessionStatus::Completed, 9001.0), &absent, 9001.0);
        assert!(alerts.snapshot().items.is_empty());
        assert!(alerts.snapshot().paused);
    }

    #[test]
    #[ignore = "Requires the release helper on Windows; synthetic hooks only, no provider task or UI is started"]
    fn live_windows_helper_generates_alerts_without_ui_consumers() {
        use crate::antigravity::{HookEvent, Monitor};
        use crate::antigravity_hooks::Receiver;
        use std::{
            io::Write,
            os::windows::process::CommandExt,
            process::{Command, Stdio},
        };
        let receiver = Receiver::bind().unwrap();
        let executable =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/release/strata-bar.exe");
        assert!(executable.is_file());
        let mut monitor = Monitor::default();
        monitor.configure(true);
        let mut alerts = Alerts::default();
        let raw = serde_json::json!({"conversationId":"11111111-1111-1111-1111-111111111111","workspacePaths":[],"toolCall":{"name":"ask_question"},"terminationReason":"model_stop","fullyIdle":true}).to_string();
        for event in [
            HookEvent::SessionStart,
            HookEvent::PreInvocation,
            HookEvent::PreToolUse,
            HookEvent::PreToolUse,
            HookEvent::Stop,
            HookEvent::Stop,
        ] {
            let mut child = Command::new(&executable)
                .args([
                    "--antigravity-hook",
                    &receiver.port().unwrap().to_string(),
                    &receiver.token,
                    event.name(),
                ])
                .creation_flags(0x08000000)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            child
                .stdin
                .take()
                .unwrap()
                .write_all(raw.as_bytes())
                .unwrap();
            let output = child.wait_with_output().unwrap();
            assert!(output.status.success());
            assert_eq!(
                String::from_utf8(output.stdout).unwrap().trim(),
                event.response()
            );
            let message = receiver
                .poll()
                .unwrap()
                .expect("No helper metadata received");
            let at = message.observed_at;
            monitor.receive(message).unwrap();
            alerts.observe(&OpenCodeSnapshot::default(), &monitor.snapshot(), at);
        }
        let snapshot = alerts.snapshot();
        assert_eq!(snapshot.items.len(), 2);
        assert_eq!(snapshot.items[0].kind, AgentAlertKind::Attention);
        assert_eq!(snapshot.items[1].kind, AgentAlertKind::Completed);
        println!("AGENT_ALERTS {{\"helperTransportVerified\":true,\"syntheticHookEvents\":true,\"attentionAndCompletionGenerated\":true,\"duplicateAlertsSuppressed\":true,\"uiConsumersPresent\":false,\"providerEventsVerified\":false,\"webviewInteractionVerified\":false,\"windowsToastUsed\":false,\"conversationContentRecorded\":false}}");
    }

    #[test]
    fn new_questions_alert_once_and_acknowledging_an_old_list_preserves_new_alerts() {
        let mut alerts = Alerts::default();
        let absent = AntigravitySnapshot::default();
        let mut snapshot = source(SessionStatus::Attention, 1000.0);
        let question = |id: &str| AgentMessage {
            id: id.into(),
            session_id: "ses_test".into(),
            connection_id: "opencode-local".into(),
            version: "a".repeat(64),
            title: "Nome?".into(),
            fields: vec![],
            unsupported_reason: Some("Teste".into()),
            reply_blocked: false,
        };
        snapshot.questions = vec![question("frm_old")];
        alerts.observe(&snapshot, &absent, 1000.0);
        alerts.observe(&snapshot, &absent, 2000.0);
        assert!(alerts.snapshot().items.is_empty());
        snapshot.questions.push(question("frm_new"));
        alerts.observe(&snapshot, &absent, 3000.0);
        let first_id = alerts.snapshot().items[0].id.clone();
        assert_eq!(alerts.snapshot().items[0].kind, AgentAlertKind::Attention);
        snapshot.questions.push(question("frm_newer"));
        alerts.observe(&snapshot, &absent, 4000.0);
        alerts.dismiss(&[first_id]).unwrap();
        alerts.observe(&snapshot, &absent, 5000.0);
        assert_eq!(alerts.snapshot().items.len(), 1);
        assert!(alerts.dismiss(&["invalid".into()]).is_err());
    }

    #[test]
    fn successful_observed_runs_alert_once_without_consumers_and_not_on_startup_or_reconnect() {
        let mut alerts = Alerts::default();
        let absent = AntigravitySnapshot::default();
        alerts.observe(&source(SessionStatus::Completed, 1000.0), &absent, 1000.0);
        assert!(alerts.snapshot().items.is_empty());
        alerts.observe(&source(SessionStatus::Processing, 2000.0), &absent, 2000.0);
        alerts.observe(&source(SessionStatus::Completed, 3000.0), &absent, 3000.0);
        let first = alerts.snapshot();
        assert_eq!(first.items.len(), 1);
        assert_eq!(first.items[0].kind, AgentAlertKind::Completed);
        alerts.observe(&source(SessionStatus::Completed, 3000.0), &absent, 3000.0);
        alerts.observe(&source(SessionStatus::Completed, 4000.0), &absent, 4000.0);
        assert_eq!(alerts.snapshot().items.len(), 1);
        alerts.dismiss(&[first.items[0].id.clone()]).unwrap();
        alerts.observe(&source(SessionStatus::Completed, 4000.0), &absent, 4000.0);
        assert!(alerts.snapshot().items.is_empty());
        alerts.observe(&OpenCodeSnapshot::default(), &absent, 5000.0);
        alerts.observe(&source(SessionStatus::Completed, 6000.0), &absent, 6000.0);
        assert!(alerts.snapshot().items.is_empty());
        alerts.observe(&source(SessionStatus::Processing, 7000.0), &absent, 7000.0);
        alerts.observe(&source(SessionStatus::Error, 8000.0), &absent, 8000.0);
        assert!(alerts.snapshot().items.is_empty());
    }
}
