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
        version: 4,
        revision,
        observed_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as f64,
        applications,
        error: result.err(),
        opencode: Default::default(),
        antigravity: Default::default(),
    }
}

pub fn allowed_window(label: &str) -> bool {
    label == "overlay" || label.starts_with("bar-")
}

enum Wake {
    Refresh,
    Stop,
}

struct Shared {
    snapshot: AgentsSnapshot,
    connection: crate::opencode::Connection,
    antigravity: crate::antigravity::Monitor,
    hook_bridge: Option<crate::antigravity_hooks::Bridge>,
}

impl Shared {
    fn updated(&mut self) -> AgentsSnapshot {
        self.snapshot.revision = self.snapshot.revision.saturating_add(1);
        self.snapshot.opencode = self.connection.snapshot();
        self.snapshot.antigravity = self.antigravity.snapshot();
        self.snapshot.clone()
    }
}

fn publish(app: &tauri::AppHandle, snapshot: &AgentsSnapshot) {
    for (label, window) in app.webview_windows() {
        if allowed_window(&label) {
            let _ = window.emit("agents:snapshot", snapshot);
        }
    }
}

pub struct Agents {
    shared: Arc<Mutex<Shared>>,
    workers: Mutex<Vec<(mpsc::Sender<Wake>, JoinHandle<()>)>>,
    opencode_wake: mpsc::Sender<Wake>,
    creation: Arc<Mutex<()>>,
}

impl Agents {
    pub fn start(app: tauri::AppHandle) -> std::io::Result<Self> {
        let shared = Arc::new(Mutex::new(Shared {
            snapshot: observe(0, crate::agents_windows::process_names),
            connection: Default::default(),
            antigravity: Default::default(),
            hook_bridge: None,
        }));
        let (stop, receiver) = mpsc::channel();
        let (opencode_wake, opencode_receiver) = mpsc::channel();
        let agents = Self {
            shared: shared.clone(),
            workers: Mutex::new(Vec::new()),
            opencode_wake,
            creation: Arc::new(Mutex::new(())),
        };
        let application = app.clone();
        let hook_app = app.clone();
        let hook_state = shared.clone();
        let process_state = shared.clone();
        let worker = std::thread::Builder::new()
            .name("strata-agents".into())
            .spawn(move || {
                while matches!(
                    receiver.recv_timeout(Duration::from_secs(3)),
                    Err(mpsc::RecvTimeoutError::Timeout)
                ) {
                    let mut next = observe(0, crate::agents_windows::process_names);
                    let Ok(mut current) = process_state.lock() else {
                        break;
                    };
                    next.revision = current.snapshot.revision;
                    let running = next
                        .applications
                        .iter()
                        .find(|app| app.agent == AgentType::Antigravity)
                        .and_then(|app| app.running);
                    current.antigravity.refresh(next.observed_at, running);
                    current.snapshot = next;
                    let next = current.updated();
                    drop(current);
                    publish(&application, &next);
                }
            })?;
        agents.workers.lock().unwrap().push((stop, worker));
        let worker = std::thread::Builder::new()
            .name("strata-opencode".into())
            .spawn(move || loop {
                match opencode_receiver.recv_timeout(Duration::from_secs(5)) {
                    Ok(Wake::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    _ => {}
                }
                let generation = shared
                    .lock()
                    .ok()
                    .and_then(|current| current.connection.request());
                let Some(generation) = generation else {
                    continue;
                };
                let result = crate::opencode::collect_live(|| {
                    shared.lock().map_or(true, |current| {
                        current.connection.request() != Some(generation)
                    })
                });
                let Ok(mut current) = shared.lock() else {
                    break;
                };
                if !current.connection.apply(generation, result) {
                    continue;
                }
                let next = current.updated();
                drop(current);
                publish(&app, &next);
            })?;
        agents
            .workers
            .lock()
            .unwrap()
            .push((agents.opencode_wake.clone(), worker));
        let (stop, receiver) = mpsc::channel();
        let worker = std::thread::Builder::new()
            .name("strata-antigravity".into())
            .spawn(move || loop {
                match receiver.recv_timeout(Duration::from_millis(100)) {
                    Ok(Wake::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    _ => {}
                }
                let receiver = hook_state.lock().ok().and_then(|current| {
                    current
                        .hook_bridge
                        .as_ref()
                        .and_then(|bridge| bridge.receiver.duplicate().ok())
                });
                let Some(receiver) = receiver else { continue };
                let result = receiver.poll();
                let Ok(mut current) = hook_state.lock() else {
                    break;
                };
                if !current
                    .hook_bridge
                    .as_ref()
                    .is_some_and(|bridge| bridge.receiver.token == receiver.token)
                {
                    continue;
                }
                let changed = match result {
                    Ok(Some(message)) => current.antigravity.receive(message).unwrap_or(false),
                    Ok(None) => false,
                    Err(error) => {
                        current.antigravity.fail(error);
                        true
                    }
                };
                if changed {
                    let snapshot = current.updated();
                    drop(current);
                    publish(&hook_app, &snapshot);
                }
            })?;
        agents.workers.lock().unwrap().push((stop, worker));
        Ok(agents)
    }

    pub fn snapshot(&self) -> Result<AgentsSnapshot, String> {
        self.shared
            .lock()
            .map(|value| value.snapshot.clone())
            .map_err(|_| "Agent discovery unavailable".into())
    }

    pub fn stop(&self) {
        if let Ok(mut current) = self.shared.lock() {
            current.connection.configure(false);
            current.antigravity.configure(false);
            current.hook_bridge.take();
        }
        if let Ok(mut workers) = self.workers.lock() {
            for (stop, _) in workers.iter() {
                let _ = stop.send(Wake::Stop);
            }
            for (_, handle) in workers.drain(..) {
                let _ = handle.join();
            }
        }
    }

    fn configure_opencode(&self, enabled: bool) -> Result<AgentsSnapshot, String> {
        let mut current = self
            .shared
            .lock()
            .map_err(|_| "Agent discovery unavailable")?;
        current.connection.configure(enabled);
        let snapshot = current.updated();
        drop(current);
        self.opencode_wake
            .send(Wake::Refresh)
            .map_err(|_| "OpenCode worker unavailable")?;
        Ok(snapshot)
    }
    fn configure_antigravity(&self, enabled: bool) -> Result<AgentsSnapshot, String> {
        let mut current = self
            .shared
            .lock()
            .map_err(|_| "Agent discovery unavailable")?;
        if enabled {
            if current.hook_bridge.is_none() {
                let bridge = crate::antigravity_hooks::Bridge::install()?;
                current.hook_bridge = Some(bridge);
                current.antigravity.configure(true);
            }
        } else {
            current.antigravity.configure(false);
            if let Some(bridge) = current.hook_bridge.take() {
                if let Err(error) = bridge.remove() {
                    current.antigravity.cleanup_failed(error);
                }
            }
        }
        Ok(current.updated())
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

#[tauri::command]
pub fn agents_set_opencode(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<Agents>,
    enabled: bool,
) -> Result<AgentsSnapshot, String> {
    if !allowed_window(window.label()) {
        return Err("OpenCode connection requires a bar or overlay".into());
    }
    let snapshot = state.configure_opencode(enabled)?;
    publish(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub async fn agents_create_opencode(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Agents>,
    directory: String,
    prompt: Option<String>,
) -> Result<crate::agents_contract::CreateAgentSessionResult, String> {
    if !allowed_window(window.label()) {
        return Err("OpenCode creation requires a bar or overlay".into());
    }
    let shared = state.shared.clone();
    let creation = state.creation.clone();
    let wake = state.opencode_wake.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = creation
            .try_lock()
            .map_err(|_| "Já existe uma criação em andamento")?;
        let generation = {
            let current = shared.lock().map_err(|_| "OpenCode indisponível")?;
            if current.connection.snapshot().status
                != crate::agents_contract::AgentConnectionStatus::Connected
            {
                return Err("Conecte o OpenCode antes de criar uma conversa".into());
            }
            current
                .connection
                .request()
                .ok_or("OpenCode desconectado")?
        };
        let result =
            crate::opencode::create_with_prompt_live(&directory, prompt.as_deref(), || {
                shared
                    .lock()
                    .map(|current| {
                        current.connection.request() != Some(generation)
                            || current.connection.snapshot().status
                                != crate::agents_contract::AgentConnectionStatus::Connected
                    })
                    .unwrap_or(true)
            });
        // Refresh on either result: a timeout may have happened after creation.
        let _ = wake.send(Wake::Refresh);
        result
    })
    .await
    .map_err(|_| {
        "Falha na criação. Confira a lista no OpenCode antes de tentar novamente.".to_string()
    })?
}

#[tauri::command]
pub fn agents_set_antigravity(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<Agents>,
    enabled: bool,
) -> Result<AgentsSnapshot, String> {
    if !allowed_window(window.label()) {
        return Err("Antigravity connection requires a bar or overlay".into());
    }
    let snapshot = state.configure_antigravity(enabled)?;
    publish(&app, &snapshot);
    Ok(snapshot)
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
