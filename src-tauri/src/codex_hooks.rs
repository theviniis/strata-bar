//! Local metadata transport; hook definitions stay stable across restarts so
//! Codex can retain the user's review of the exact command definition.
use crate::{
    antigravity_hooks::now,
    codex,
    hook_config::{read_config, write_config},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::os::windows::fs::OpenOptionsExt;
use std::{
    fs,
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    time::Duration,
};

fn configuration_lock(endpoint: &Path) -> Result<fs::File, String> {
    let parent = endpoint.parent().ok_or("Diretório inválido")?;
    fs::create_dir_all(parent).map_err(|_| "Diretório Codex indisponível")?;
    fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .open(parent.join(".codex-hooks.lock"))
        .map_err(|_| "Outra configuração Codex está em andamento; tente novamente".into())
}

const EVENTS: [&str; 8] = [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "Stop",
    "Interrupt",
    "SessionEnd",
];
const LIMIT: u64 = 16384;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Endpoint {
    port: u16,
    token: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Packet {
    token: String,
    metadata: String,
    at: f64,
}

fn quoted(path: &Path) -> Result<String, String> {
    let text = path.to_str().ok_or("Caminho de hooks inválido")?;
    if !path.is_absolute()
        || text
            .chars()
            .any(|c| matches!(c, '%' | '!' | '"' | '\r' | '\n'))
    {
        return Err("Caminho incompatível com hooks Windows".into());
    }
    Ok(format!("\"{text}\""))
}
fn entry(executable: &Path, endpoint: &Path) -> Result<Value, String> {
    Ok(
        json!({"hooks":[{"type":"command", "command":format!("{} --codex-hook {}", quoted(executable)?, quoted(endpoint)?), "timeout":2}]}),
    )
}

/// Only add/remove the exact entry owned by this installation. All other hooks
/// and root settings remain untouched, including future Codex fields.
fn configure(value: &mut Value, own: &Value, enabled: bool) -> Result<(), String> {
    if value.get("hooks").is_none() {
        if !enabled {
            return Ok(());
        }
        value["hooks"] = json!({});
    }
    let hooks = value["hooks"]
        .as_object_mut()
        .ok_or("Hooks Codex inválidos; arquivo preservado")?;
    for event in EVENTS {
        if !hooks.contains_key(event) && enabled {
            hooks.insert(event.into(), json!([]));
        }
        if let Some(entries) = hooks.get_mut(event) {
            let entries = entries
                .as_array_mut()
                .ok_or("Evento Codex inválido; arquivo preservado")?;
            entries.retain(|existing| existing != own);
            if enabled {
                entries.push(own.clone());
            }
        }
    }
    Ok(())
}

pub struct Bridge {
    listener: TcpListener,
    endpoint: Endpoint,
    endpoint_path: PathBuf,
    config_path: PathBuf,
    entry: Value,
}
impl Bridge {
    pub fn install() -> Result<Self, String> {
        let home = std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join(".codex")))
            .ok_or("Perfil Codex indisponível")?;
        let runtime = std::env::var_os("LOCALAPPDATA")
            .map(|p| PathBuf::from(p).join("Strata"))
            .ok_or("Perfil Windows indisponível")?;
        Self::open(
            home.join("hooks.json"),
            runtime.join("codex-hook-endpoint.json"),
            &std::env::current_exe().map_err(|_| "Executável indisponível")?,
        )
    }
    fn open(
        config_path: PathBuf,
        endpoint_path: PathBuf,
        executable: &Path,
    ) -> Result<Self, String> {
        let _lock = configuration_lock(&endpoint_path)?;
        let entry = entry(executable, &endpoint_path)?;
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "Receptor Codex indisponível")?;
        listener
            .set_nonblocking(true)
            .map_err(|_| "Receptor Codex indisponível")?;
        let endpoint = Endpoint {
            port: listener
                .local_addr()
                .map_err(|_| "Receptor Codex indisponível")?
                .port(),
            token: rand::random::<[u8; 16]>()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect(),
        };
        let (original, mut config) = read_config(&config_path)?;
        configure(&mut config, &entry, true)?;
        fs::create_dir_all(endpoint_path.parent().ok_or("Diretório inválido")?)
            .map_err(|_| "Diretório Codex indisponível")?;
        fs::write(
            &endpoint_path,
            serde_json::to_vec(&endpoint).map_err(|_| "Endpoint inválido")?,
        )
        .map_err(|_| "Endpoint Codex indisponível")?;
        if let Err(error) = write_config(&config_path, &original, &config) {
            let _ = fs::remove_file(&endpoint_path);
            return Err(error);
        }
        Ok(Self {
            listener,
            endpoint,
            endpoint_path,
            config_path,
            entry,
        })
    }
    pub fn poll(&self) -> Result<Option<(String, f64)>, String> {
        let (stream, _) = match self.listener.accept() {
            Ok(value) => value,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => return Ok(None),
            Err(_) => return Err("Receptor Codex desconectado".into()),
        };
        stream
            .set_read_timeout(Some(Duration::from_millis(100)))
            .map_err(|_| "Receptor Codex indisponível")?;
        let mut bytes = Vec::new();
        if stream.take(LIMIT + 1).read_to_end(&mut bytes).is_err() || bytes.len() as u64 > LIMIT {
            return Ok(None);
        }
        let Ok(packet) = serde_json::from_slice::<Packet>(&bytes) else {
            return Ok(None);
        };
        if packet.token != self.endpoint.token
            || !packet.at.is_finite()
            || !(now() - 30_000.0..=now() + 1000.0).contains(&packet.at)
        {
            return Ok(None);
        }
        // Validate and strip unknown fields again at the host boundary.
        Ok(codex::metadata(&packet.metadata, packet.at)
            .ok()
            .map(|raw| (raw, packet.at)))
    }
    pub fn remove(&self) -> Result<(), String> {
        let _lock = configuration_lock(&self.endpoint_path)?;
        let owned = fs::read(&self.endpoint_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Endpoint>(&bytes).ok())
            .is_some_and(|endpoint| endpoint.token == self.endpoint.token);
        if !owned {
            return Ok(());
        }
        let configuration_result = (|| {
            let (original, mut config) = read_config(&self.config_path)?;
            let previous = config.clone();
            configure(&mut config, &self.entry, false)?;
            if config != previous {
                write_config(&self.config_path, &original, &config)?;
            }
            Ok(())
        })();
        let endpoint_result = fs::remove_file(&self.endpoint_path)
            .map_err(|_| "Não foi possível remover o endpoint Codex".to_string());
        configuration_result.and(endpoint_result)
    }
}

/// Stop collection even if persistent hook cleanup fails.
pub fn disable(bridge: &mut Option<Bridge>) -> Option<String> {
    bridge.take().and_then(|bridge| bridge.remove().err())
}
impl Drop for Bridge {
    fn drop(&mut self) {
        let _ = self.remove();
    }
}

pub fn run_helper(arguments: &[String]) {
    let send = || -> Result<(), String> {
        if arguments.len() != 1 {
            return Err("Argumentos inválidos".into());
        }
        let endpoint_path = Path::new(&arguments[0]);
        quoted(endpoint_path)?;
        let mut bytes = Vec::new();
        fs::File::open(endpoint_path)
            .map_err(|_| "Endpoint ausente")?
            .take(1025)
            .read_to_end(&mut bytes)
            .map_err(|_| "Endpoint inválido")?;
        if bytes.len() > 1024 {
            return Err("Endpoint inválido".into());
        }
        let endpoint: Endpoint = serde_json::from_slice(&bytes).map_err(|_| "Endpoint inválido")?;
        if endpoint.port == 0
            || endpoint.token.len() != 32
            || !endpoint.token.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Endpoint inválido".into());
        }
        let mut raw = String::new();
        std::io::stdin()
            .take(1024 * 1024 + 1)
            .read_to_string(&mut raw)
            .map_err(|_| "Hook inválido")?;
        let at = now();
        let metadata = codex::metadata(&raw, at)?;
        let packet = serde_json::to_vec(&Packet {
            token: endpoint.token,
            metadata,
            at,
        })
        .map_err(|_| "Hook inválido")?;
        if packet.len() as u64 > LIMIT {
            return Err("Hook excede limite".into());
        }
        let mut stream = TcpStream::connect_timeout(
            &SocketAddr::from((Ipv4Addr::LOCALHOST, endpoint.port)),
            Duration::from_millis(150),
        )
        .map_err(|_| "Receptor ausente")?;
        stream
            .set_write_timeout(Some(Duration::from_millis(100)))
            .map_err(|_| "Receptor ausente")?;
        stream
            .write_all(&packet)
            .map_err(|_| "Receptor indisponível".into())
    };
    let _ = send();
    println!("{}", codex::Monitor::response());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_owner_cannot_remove_a_replacement_and_cleanup_failure_stops_collection() {
        let root =
            std::env::temp_dir().join(format!("strata-codex-owner-{:016x}", rand::random::<u64>()));
        fs::create_dir(&root).unwrap();
        let config = root.join("hooks.json");
        let endpoint = root.join("endpoint.json");
        let executable = Path::new("C:\\Strata\\strata.exe");
        let old = Bridge::open(config.clone(), endpoint.clone(), executable).unwrap();
        let replacement = Bridge::open(config.clone(), endpoint.clone(), executable).unwrap();
        let expected_config = fs::read(&config).unwrap();
        let expected_endpoint = fs::read(&endpoint).unwrap();
        old.remove().unwrap();
        drop(old);
        assert_eq!(fs::read(&config).unwrap(), expected_config);
        assert_eq!(fs::read(&endpoint).unwrap(), expected_endpoint);
        let port = replacement.endpoint.port;
        fs::write(&config, b"invalid config preserved").unwrap();
        let mut active = Some(replacement);
        assert!(disable(&mut active).is_some());
        assert!(active.is_none());
        assert!(TcpStream::connect((Ipv4Addr::LOCALHOST, port)).is_err());
        assert!(!endpoint.exists());
        assert_eq!(fs::read(&config).unwrap(), b"invalid config preserved");
        fs::remove_file(config).unwrap();
        fs::remove_file(root.join(".codex-hooks.lock")).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]
    #[ignore = "Requires STRATA_TEST_CODEX_HELPER pointing to the built Windows executable; synthetic metadata only"]
    fn live_windows_codex_helper_metadata_roundtrip() {
        use std::process::{Command, Stdio};
        let executable =
            PathBuf::from(std::env::var_os("STRATA_TEST_CODEX_HELPER").expect("helper path"));
        assert!(executable.is_absolute() && executable.is_file());
        let root =
            std::env::temp_dir().join(format!("strata-codex-live-{:016x}", rand::random::<u64>()));
        fs::create_dir(&root).unwrap();
        let bridge = Bridge::open(
            root.join("hooks.json"),
            root.join("endpoint.json"),
            &executable,
        )
        .unwrap();
        let mut monitor = codex::Monitor::default();
        for event in ["UserPromptSubmit", "PermissionRequest", "Stop"] {
            let mut helper = Command::new(&executable)
                .arg("--codex-hook")
                .arg(root.join("endpoint.json"))
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            let input = json!({"session_id":"00000000-0000-0000-0000-000000000001", "cwd":"C:\\synthetic", "hook_event_name":event, "turn_id":"synthetic", "prompt":"never forwarded"});
            helper
                .stdin
                .take()
                .unwrap()
                .write_all(input.to_string().as_bytes())
                .unwrap();
            let output = helper.wait_with_output().unwrap();
            assert!(output.status.success());
            assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), "{}");
            let (raw, at) = bridge.poll().unwrap().expect("packet from real helper");
            assert!(!raw.contains("never forwarded"));
            monitor.observe(&raw, at).unwrap();
        }
        assert_eq!(
            monitor.sessions()[0].status,
            crate::agents_contract::SessionStatus::Idle
        );
        drop(bridge);
        assert!(!root.join("endpoint.json").exists());
        fs::remove_file(root.join("hooks.json")).unwrap();
        fs::remove_file(root.join(".codex-hooks.lock")).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn configuration_preserves_other_hooks_and_stable_commands() {
        let own = entry(
            Path::new("C:\\Strata\\strata.exe"),
            Path::new("C:\\Strata\\runtime.json"),
        )
        .unwrap();
        let other = json!({"hooks":[{"type":"command","command":"existing-hook"}]});
        let mut value = json!({"description":"keep", "hooks":{"Stop":[other.clone()]}});
        configure(&mut value, &own, true).unwrap();
        configure(&mut value, &own, true).unwrap();
        assert_eq!(value["hooks"]["Stop"].as_array().unwrap().len(), 2);
        configure(&mut value, &own, false).unwrap();
        assert_eq!(value["hooks"]["Stop"], json!([other]));
        assert_eq!(value["description"], "keep");
        assert!(!own.to_string().contains("token"));
    }
    #[test]
    fn authenticated_transport_only_forwards_metadata_and_cleans_own_hooks() {
        let root =
            std::env::temp_dir().join(format!("strata-codex-test-{:016x}", rand::random::<u64>()));
        fs::create_dir(&root).unwrap();
        let bridge = Bridge::open(
            root.join("hooks.json"),
            root.join("endpoint.json"),
            Path::new("C:\\Strata\\strata.exe"),
        )
        .unwrap();
        let at = now();
        let raw = json!({"session_id":"01a1543f-85be-7fb2-9f2d-4d30b7492a78","cwd":"C:\\work", "hook_event_name":"PermissionRequest", "turn_id":"one", "prompt":"secret"}).to_string();
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, bridge.endpoint.port)).unwrap();
        stream
            .write_all(
                &serde_json::to_vec(&Packet {
                    token: "wrong".into(),
                    metadata: raw.clone(),
                    at,
                })
                .unwrap(),
            )
            .unwrap();
        drop(stream);
        assert!(bridge.poll().unwrap().is_none());
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, bridge.endpoint.port)).unwrap();
        stream
            .write_all(
                &serde_json::to_vec(&Packet {
                    token: bridge.endpoint.token.clone(),
                    metadata: raw,
                    at,
                })
                .unwrap(),
            )
            .unwrap();
        drop(stream);
        let (metadata, _) = bridge.poll().unwrap().unwrap();
        assert!(!metadata.contains("secret"));
        drop(bridge);
        assert!(!root.join("endpoint.json").exists());
        fs::remove_file(root.join("hooks.json")).unwrap();
        fs::remove_file(root.join(".codex-hooks.lock")).unwrap();
        fs::remove_dir(root).unwrap();
    }
}
