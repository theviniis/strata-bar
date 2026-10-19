use crate::agents_contract::{AgentApplication, AgentType, AgentsSnapshot};
use std::{
    sync::{mpsc, Arc, Mutex},
    thread::JoinHandle,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

/// Observe only executable names, never command lines or conversation contents.
pub fn observe(
    revision: u32,
    source: impl FnOnce() -> Result<Vec<String>, String>,
) -> AgentsSnapshot {
    let result = source();
    let applications = [
        AgentType::Chatgpt,
        AgentType::Opencode,
        AgentType::Antigravity,
    ]
    .into_iter()
    .map(|agent| {
        let names: &[&str] = match agent {
            AgentType::Chatgpt => &["chatgpt.exe"],
            AgentType::Opencode => &["opencode.exe", "opencode-desktop.exe", "opencode-cli.exe"],
            AgentType::Antigravity => &["antigravity.exe"],
        };
        AgentApplication {
            agent,
            running: result.as_ref().ok().map(|processes| {
                processes
                    .iter()
                    .any(|process| names.iter().any(|name| process.eq_ignore_ascii_case(name)))
            }),
        }
    })
    .collect();
    AgentsSnapshot {
        version: 1,
        revision,
        observed_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as f64,
        applications,
        error: result.err(),
    }
}

pub fn allowed_window(label: &str) -> bool {
    label == "overlay" || label.starts_with("bar-")
}

pub struct Agents {
    snapshot: Arc<Mutex<AgentsSnapshot>>,
    worker: Mutex<Option<(mpsc::Sender<()>, JoinHandle<()>)>>,
}

impl Agents {
    pub fn start(app: tauri::AppHandle) -> std::io::Result<Self> {
        let snapshot = Arc::new(Mutex::new(observe(0, crate::agents_windows::process_names)));
        let shared = snapshot.clone();
        let (stop, receiver) = mpsc::channel();
        let worker = std::thread::Builder::new()
            .name("strata-agents".into())
            .spawn(move || {
                let mut revision = 0u32;
                while matches!(
                    receiver.recv_timeout(Duration::from_secs(3)),
                    Err(mpsc::RecvTimeoutError::Timeout)
                ) {
                    revision = revision.saturating_add(1);
                    let next = observe(revision, crate::agents_windows::process_names);
                    let Ok(mut current) = shared.lock() else {
                        break;
                    };
                    *current = next.clone();
                    drop(current);
                    for (label, window) in app.webview_windows() {
                        if allowed_window(&label) {
                            let _ = window.emit("agents:snapshot", &next);
                        }
                    }
                }
            })?;
        Ok(Self {
            snapshot,
            worker: Mutex::new(Some((stop, worker))),
        })
    }

    pub fn snapshot(&self) -> Result<AgentsSnapshot, String> {
        self.snapshot
            .lock()
            .map(|value| value.clone())
            .map_err(|_| "Agent discovery unavailable".into())
    }

    pub fn stop(&self) {
        if let Ok(mut worker) = self.worker.lock() {
            if let Some((stop, handle)) = worker.take() {
                let _ = stop.send(());
                let _ = handle.join();
            }
        }
    }
}

impl Drop for Agents {
    fn drop(&mut self) {
        self.stop();
    }
}

#[tauri::command]
pub fn agents_snapshot(
    window: tauri::WebviewWindow,
    state: tauri::State<Agents>,
) -> Result<AgentsSnapshot, String> {
    if !allowed_window(window.label()) {
        return Err("Agent discovery requires a bar or overlay".into());
    }
    state.snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_groups_processes_without_creating_sessions() {
        let snapshot = observe(1, || {
            Ok(vec![
                "ChatGPT.exe".into(),
                "CHATGPT.EXE".into(),
                "Antigravity.exe".into(),
                "codex.exe".into(),
                "not-opencode.exe".into(),
            ])
        });
        assert_eq!(snapshot.applications.len(), 3);
        assert_eq!(snapshot.applications[0].running, Some(true));
        assert_eq!(snapshot.applications[1].running, Some(false));
        assert_eq!(snapshot.applications[2].running, Some(true));
        assert!(snapshot.error.is_none());
    }

    #[test]
    fn enumeration_failure_is_unknown_and_a_later_observation_recovers() {
        let failed = observe(1, || Err("Access denied".into()));
        assert!(failed.applications.iter().all(|app| app.running.is_none()));
        assert_eq!(failed.error.as_deref(), Some("Access denied"));
        let recovered = observe(2, || Ok(vec!["opencode-cli.exe".into()]));
        assert_eq!(recovered.applications[1].running, Some(true));
        assert!(recovered.error.is_none());
    }

    #[test]
    fn discovery_is_available_only_to_bar_and_overlay_windows() {
        assert!(allowed_window("bar-0"));
        assert!(allowed_window("overlay"));
        assert!(!allowed_window("studio"));
        assert!(!allowed_window("main"));
    }
}
