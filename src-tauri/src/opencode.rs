use crate::agents_contract::{
    AgentConnectionStatus, AgentSession, AgentType, OpenCodeSnapshot, SessionStatus,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::{
    io::Read,
    os::windows::process::CommandExt,
    path::PathBuf,
    process::{Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

const MAX_RESPONSE: u64 = 2 * 1024 * 1024;

fn installed_cli() -> Result<PathBuf, String> {
    let root = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or("OpenCode Desktop v2 não encontrado")?
        .join("ai.opencode.desktop/cli");
    let mut candidates = Vec::new();
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Some((version, architecture)) = name.split_once('-') else {
                continue;
            };
            if !matches!(architecture, "x64" | "arm64") {
                continue;
            }
            let version: Vec<_> = version
                .split('.')
                .filter_map(|part| part.parse::<u32>().ok())
                .collect();
            let path = entry.path().join("opencode-cli.exe");
            if version.len() == 3 && version[0] == 2 && path.is_file() {
                candidates.push((version, path));
            }
        }
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    candidates
        .into_iter()
        .next()
        .map(|(_, path)| path)
        .ok_or_else(|| {
            "OpenCode Desktop v2 não encontrado. Abra o OpenCode e tente novamente.".into()
        })
}

fn read_cli(
    path: &std::path::Path,
    request: ReadRequest,
    cancelled: &impl Fn() -> bool,
) -> Result<Value, String> {
    let route = match request {
        ReadRequest::Sessions => "/api/session?limit=50&order=desc".into(),
        ReadRequest::Active => "/api/session/active".into(),
        ReadRequest::Session(id) if valid_id(&id) => format!("/api/session/{id}"),
        ReadRequest::Forms(id) if valid_id(&id) => format!("/api/session/{id}/form"),
        ReadRequest::Permissions(id) if valid_id(&id) => format!("/api/session/{id}/permission"),
        _ => return Err(invalid()),
    };
    if cancelled() {
        return Err("Conexão cancelada".into());
    }
    let mut child = Command::new(path)
        .args(["api", "GET", &route])
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Não foi possível iniciar o cliente OpenCode")?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Saída do cliente OpenCode indisponível")?;
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout
            .take(MAX_RESPONSE + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes);
        let _ = sender.send(result);
    });
    let deadline = Instant::now() + Duration::from_secs(8);
    let status = loop {
        if cancelled() || Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("OpenCode desconectado ou tempo de resposta excedido".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Falha ao consultar OpenCode".into());
            }
        }
    };
    if !status.success() {
        return Err(
            "OpenCode indisponível. Verifique o servidor local e a autenticação no aplicativo."
                .into(),
        );
    }
    let bytes = receiver
        .recv_timeout(Duration::from_millis(250))
        .map_err(|_| "Resposta OpenCode indisponível")?
        .map_err(|_| "Falha ao ler resposta OpenCode")?;
    if bytes.len() as u64 > MAX_RESPONSE {
        return Err("Resposta OpenCode excede o limite".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| invalid())
}

pub fn collect_live(cancelled: impl Fn() -> bool) -> Result<OpenCodeSnapshot, String> {
    let path = installed_cli()?;
    let deadline = Instant::now() + Duration::from_secs(20);
    collect(|request| {
        read_cli(&path, request, &|| {
            cancelled() || Instant::now() >= deadline
        })
    })
}

/// Owns connection generations so a cancelled poll cannot restore old sessions.
#[derive(Default)]
pub struct Connection {
    generation: u64,
    enabled: bool,
    snapshot: OpenCodeSnapshot,
}

impl Connection {
    pub fn configure(&mut self, enabled: bool) {
        self.generation += 1;
        self.enabled = enabled;
        self.snapshot = OpenCodeSnapshot {
            status: if enabled {
                AgentConnectionStatus::Connecting
            } else {
                AgentConnectionStatus::Disabled
            },
            ..Default::default()
        };
    }
    pub fn request(&self) -> Option<u64> {
        self.enabled.then_some(self.generation)
    }
    pub fn snapshot(&self) -> OpenCodeSnapshot {
        self.snapshot.clone()
    }
    pub fn apply(&mut self, generation: u64, result: Result<OpenCodeSnapshot, String>) -> bool {
        if self.request() != Some(generation) {
            return false;
        }
        match result {
            Ok(snapshot) => self.snapshot = snapshot,
            Err(error) => {
                self.snapshot.status = AgentConnectionStatus::Disconnected;
                self.snapshot.error = Some(error);
                for session in &mut self.snapshot.sessions {
                    session.status = SessionStatus::Disconnected;
                }
            }
        }
        true
    }
}

pub enum ReadRequest {
    Sessions,
    Active,
    Session(String),
    Forms(String),
    Permissions(String),
}

#[derive(Deserialize)]
struct Location {
    directory: String,
}
#[derive(Deserialize)]
struct SessionTime {
    updated: f64,
    archived: Option<f64>,
}
#[derive(Deserialize)]
struct SessionInfo {
    id: String,
    title: Option<String>,
    outcome: Option<String>,
    location: Location,
    time: SessionTime,
}
#[derive(Deserialize)]
struct Cursor {
    next: Option<String>,
}
#[derive(Deserialize)]
struct Page {
    data: Vec<SessionInfo>,
    cursor: Cursor,
}
#[derive(Deserialize)]
struct Active {
    r#type: String,
}
#[derive(Deserialize)]
struct Data<T> {
    data: T,
}
#[derive(Deserialize)]
struct PendingRequest {
    id: String,
    #[serde(rename = "sessionID")]
    session_id: String,
}

fn invalid() -> String {
    "Resposta incompatível da API OpenCode v2".into()
}
fn valid_id(id: &str) -> bool {
    id.starts_with("ses")
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

/// Read session metadata only through the provider's public API boundary.
pub fn collect(
    mut read: impl FnMut(ReadRequest) -> Result<Value, String>,
) -> Result<OpenCodeSnapshot, String> {
    let page: Page = serde_json::from_value(read(ReadRequest::Sessions)?).map_err(|_| invalid())?;
    let active: Data<BTreeMap<String, Active>> =
        serde_json::from_value(read(ReadRequest::Active)?).map_err(|_| invalid())?;
    if page.data.len() > 50
        || active.data.len() > 128
        || active
            .data
            .iter()
            .any(|(id, state)| !valid_id(id) || state.r#type != "running")
    {
        return Err(invalid());
    }
    let mut seen = HashSet::new();
    let mut infos = page.data;
    for info in &infos {
        if !valid_id(&info.id) || !seen.insert(info.id.clone()) {
            return Err(invalid());
        }
    }
    for id in active.data.keys() {
        if !seen.contains(id) {
            let info: Data<SessionInfo> =
                serde_json::from_value(read(ReadRequest::Session(id.clone()))?)
                    .map_err(|_| invalid())?;
            if info.data.id != *id {
                return Err(invalid());
            }
            infos.push(info.data);
        }
    }
    let mut attention = HashSet::new();
    for id in active.data.keys() {
        for request in [
            ReadRequest::Forms(id.clone()),
            ReadRequest::Permissions(id.clone()),
        ] {
            let pending: Data<Vec<PendingRequest>> =
                serde_json::from_value(read(request)?).map_err(|_| invalid())?;
            if pending.data.len() > 100
                || pending.data.iter().any(|request| {
                    request.id.is_empty() || request.id.len() > 128 || request.session_id != *id
                })
            {
                return Err(invalid());
            }
            if !pending.data.is_empty() {
                attention.insert(id.clone());
            }
        }
    }
    let mut sessions = Vec::new();
    for info in infos {
        if info.location.directory.is_empty()
            || info.location.directory.len() > 4096
            || info
                .title
                .as_ref()
                .is_some_and(|title| title.chars().count() > 512)
            || !info.time.updated.is_finite()
            || !(0.0..=8_640_000_000_000_000.0).contains(&info.time.updated)
        {
            return Err(invalid());
        }
        let running = active.data.contains_key(&info.id);
        if info.time.archived.is_some() && !running {
            continue;
        }
        let status = if attention.contains(&info.id) {
            SessionStatus::Attention
        } else if running {
            SessionStatus::Processing
        } else {
            match info.outcome.as_deref() {
                Some("succeeded") => SessionStatus::Completed,
                Some("failed") => SessionStatus::Error,
                Some("interrupted") | None => SessionStatus::Idle,
                _ => SessionStatus::Unknown,
            }
        };
        sessions.push(AgentSession {
            id: info.id,
            agent: AgentType::Opencode,
            connection_id: "opencode-local".into(),
            title: info
                .title
                .filter(|title| !title.trim().is_empty())
                .unwrap_or_else(|| "Sessão sem título".into()),
            directory: info.location.directory,
            status,
            updated_at: info.time.updated,
        });
    }
    sessions.sort_by(|a, b| b.updated_at.total_cmp(&a.updated_at));
    Ok(OpenCodeSnapshot {
        status: AgentConnectionStatus::Connected,
        sessions,
        has_more: page.cursor.next.is_some(),
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn empty_snapshot() -> OpenCodeSnapshot {
        OpenCodeSnapshot {
            status: AgentConnectionStatus::Connected,
            ..Default::default()
        }
    }

    #[test]
    fn an_active_session_outside_the_recent_page_is_included() {
        let snapshot = collect(|request| Ok(match request {
            ReadRequest::Sessions => json!({"data":[],"cursor":{"next":"older-page"}}),
            ReadRequest::Active => json!({"data":{"ses_old":{"type":"running"}}}),
            ReadRequest::Session(id) => { assert_eq!(id, "ses_old"); json!({"data":{"id":"ses_old","title":"Older execution","location":{"directory":"D:\\project"},"time":{"updated":1000}}}) },
            ReadRequest::Forms(_) | ReadRequest::Permissions(_) => json!({"data":[]}),
        })).unwrap();
        assert_eq!(snapshot.sessions[0].id, "ses_old");
        assert_eq!(snapshot.sessions[0].status, SessionStatus::Processing);
        assert!(snapshot.has_more);
    }

    #[test]
    fn disconnect_and_reconnect_reject_observations_from_previous_generations() {
        let mut connection = Connection::default();
        connection.configure(true);
        let first = connection.request().unwrap();
        connection.configure(false);
        assert!(!connection.apply(first, Ok(empty_snapshot())));
        assert_eq!(
            connection.snapshot().status,
            AgentConnectionStatus::Disabled
        );
        assert!(connection.snapshot().sessions.is_empty());
        connection.configure(true);
        let second = connection.request().unwrap();
        assert!(!connection.apply(first, Err("Old connection".into())));
        assert!(connection.apply(second, Err("Unavailable".into())));
        assert_eq!(
            connection.snapshot().status,
            AgentConnectionStatus::Disconnected
        );
        assert!(connection.apply(second, Ok(empty_snapshot())));
        assert_eq!(
            connection.snapshot().status,
            AgentConnectionStatus::Connected
        );
        assert!(connection.snapshot().error.is_none());
    }

    #[test]
    fn incompatible_or_unsafe_session_metadata_is_not_presented_as_a_valid_connection() {
        assert!(collect(|_| Ok(json!([]))).is_err());
        assert!(collect(|request| Ok(match request {
            ReadRequest::Sessions => json!({"data":[{"id":"ses/../../shell","location":{"directory":"D:\\project"},"time":{"updated":1}}],"cursor":{}}),
            _ => json!({"data":{}}),
        })).is_err());
    }

    #[test]
    #[ignore = "Reads the real local OpenCode v2 service; prints counts only"]
    fn live_local_opencode_metadata_is_readable() {
        let result = collect_live(|| false).expect("Local OpenCode v2 metadata query failed");
        let mut statuses = BTreeMap::<String, usize>::new();
        for session in &result.sessions {
            let name = serde_json::to_value(&session.status)
                .unwrap()
                .as_str()
                .unwrap()
                .to_string();
            *statuses.entry(name).or_default() += 1;
        }
        assert_eq!(result.status, AgentConnectionStatus::Connected);
        println!(
            "OPENCODE_LIVE {}",
            json!({"api":"OpenCode v2","status":"connected","sessionCount":result.sessions.len(),"statuses":statuses,"hasMore":result.has_more,"conversationContentRecorded":false})
        );
    }

    #[test]
    fn pending_approval_takes_precedence_over_an_active_execution() {
        let snapshot = collect(|request| Ok(match request {
            ReadRequest::Sessions => json!({"data":[{"id":"ses_busy","location":{"directory":"D:\\project"},"time":{"updated":1000}}],"cursor":{}}),
            ReadRequest::Active => json!({"data":{"ses_busy":{"type":"running"}}}),
            ReadRequest::Forms(_) => json!({"data":[]}),
            ReadRequest::Permissions(_) => json!({"data":[{"id":"per_1","sessionID":"ses_busy"}]}),
            _ => panic!("Unexpected read"),
        })).unwrap();
        assert_eq!(snapshot.sessions[0].status, SessionStatus::Attention);
    }

    #[test]
    fn observes_external_sessions_without_confusing_inactivity_with_success() {
        let snapshot = collect(|request| Ok(match request {
            ReadRequest::Sessions => json!({"data":[
                {"id":"ses_busy","title":"Working","location":{"directory":"D:\\project"},"time":{"updated":1000}},
                {"id":"ses_idle","location":{"directory":"D:\\project"},"time":{"updated":900}},
                {"id":"ses_done","title":"Done","outcome":"succeeded","location":{"directory":"D:\\project"},"time":{"updated":800}},
                {"id":"ses_error","outcome":"failed","location":{"directory":"D:\\project"},"time":{"updated":700}}
            ],"cursor":{"next":null}}),
            ReadRequest::Active => json!({"data":{"ses_busy":{"type":"running"}}}),
            ReadRequest::Forms(_) | ReadRequest::Permissions(_) => json!({"data":[]}),
            _ => panic!("No message history should be requested"),
        })).unwrap();
        assert_eq!(snapshot.status, AgentConnectionStatus::Connected);
        assert_eq!(snapshot.sessions[0].status, SessionStatus::Processing);
        assert_eq!(snapshot.sessions[1].status, SessionStatus::Idle);
        assert_eq!(snapshot.sessions[2].status, SessionStatus::Completed);
        assert_eq!(snapshot.sessions[3].status, SessionStatus::Error);
    }
}
