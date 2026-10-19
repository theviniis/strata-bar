use crate::antigravity::{parse_hook, HookEvent, HookMessage, MAX_INPUT, MAX_PACKET};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use windows::Win32::Storage::FileSystem::{
    MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
};

const KEY: &str = "strata-ai-agents";
const EVENTS: [HookEvent; 5] = [
    HookEvent::SessionStart,
    HookEvent::PreInvocation,
    HookEvent::PreToolUse,
    HookEvent::PostToolUse,
    HookEvent::Stop,
];

pub fn definition(executable: &Path, port: u16, token: &str) -> Result<Value, String> {
    let path = executable.to_str().ok_or("Caminho do Strata inválido")?;
    if !executable.is_absolute()
        || path
            .chars()
            .any(|c| matches!(c, '%' | '!' | '"' | '\r' | '\n'))
        || !valid_token(token)
        || port == 0
    {
        return Err("Caminho do Strata incompatível com hooks Windows".into());
    }
    let mut value = json!({"enabled":true});
    for event in EVENTS {
        let handler = json!({"type":"command","command":format!("\"{path}\" --antigravity-hook {port} {token} {}", event.name()),"timeout":2});
        value[event.name()] = if matches!(event, HookEvent::PreToolUse | HookEvent::PostToolUse) {
            json!([{"matcher":"ask_question|ask_permission","hooks":[handler]}])
        } else {
            json!([handler])
        };
    }
    Ok(value)
}

fn valid_token(token: &str) -> bool {
    token.len() == 32 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn owned_definition(value: &Value) -> bool {
    let Some(command) = value["SessionStart"][0]["command"].as_str() else {
        return false;
    };
    let Some((path, arguments)) = command
        .strip_prefix('"')
        .and_then(|value| value.split_once("\" --antigravity-hook "))
    else {
        return false;
    };
    let args: Vec<_> = arguments.split_whitespace().collect();
    if args.len() != 3 || args[2] != "SessionStart" {
        return false;
    }
    let Ok(port) = args[0].parse() else {
        return false;
    };
    definition(Path::new(path), port, args[1]).is_ok_and(|expected| expected == *value)
}

fn read_config(path: &Path) -> Result<(Vec<u8>, Value), String> {
    let mut bytes = Vec::new();
    match fs::File::open(path) {
        Ok(file) => {
            file.take(1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "Não foi possível ler os hooks")?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Não foi possível ler os hooks do Antigravity".into()),
    }
    if bytes.len() > 1024 * 1024 {
        return Err("Configuração de hooks excede o limite".into());
    }
    let value = if bytes.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&bytes)
            .map_err(|_| "Configuração de hooks inválida; arquivo preservado")?
    };
    if !value.is_object() {
        return Err("Configuração de hooks deve ser um objeto".into());
    }
    Ok((bytes, value))
}

fn write_config(path: &Path, original: &[u8], value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|_| "Hooks inválidos")?;
    if bytes.len() > 1024 * 1024 {
        return Err("Configuração de hooks excede o limite; arquivo preservado".into());
    }
    let parent = path.parent().ok_or("Diretório de hooks inválido")?;
    fs::create_dir_all(parent).map_err(|_| "Não foi possível criar o diretório de hooks")?;
    let temporary = parent.join(format!(".strata-hooks-{:016x}.tmp", rand::random::<u64>()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "Não foi possível preparar os hooks")?;
        file.write_all(&bytes)
            .map_err(|_| "Não foi possível escrever os hooks")?;
        file.sync_all()
            .map_err(|_| "Não foi possível salvar os hooks")?;
        drop(file);
        if read_config(path)?.0 != original {
            return Err("Os hooks mudaram durante a configuração; tente novamente".into());
        }
        unsafe {
            MoveFileExW(
                &windows::core::HSTRING::from(temporary.as_os_str()),
                &windows::core::HSTRING::from(path.as_os_str()),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        }
        .map_err(|_| "Não foi possível substituir os hooks")?;
        Ok(())
    })();
    let _ = fs::remove_file(&temporary);
    result
}

pub struct Installation {
    path: PathBuf,
    entry: Value,
}
impl Installation {
    pub fn install(path: PathBuf, entry: Value) -> Result<Self, String> {
        let (original, mut value) = read_config(&path)?;
        if value
            .get(KEY)
            .is_some_and(|existing| !owned_definition(existing))
        {
            return Err("A entrada strata-ai-agents já existe e foi preservada".into());
        }
        value[KEY] = entry.clone();
        write_config(&path, &original, &value)?;
        Ok(Self { path, entry })
    }
    pub fn remove(&self) -> Result<(), String> {
        let (original, mut value) = read_config(&self.path)?;
        if value.get(KEY) != Some(&self.entry) {
            return Ok(());
        }
        value.as_object_mut().unwrap().remove(KEY);
        write_config(&self.path, &original, &value)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Packet {
    token: String,
    message: HookMessage,
}

pub struct Receiver {
    listener: TcpListener,
    pub token: String,
}
impl Receiver {
    pub fn bind() -> Result<Self, String> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "Não foi possível abrir o receptor de hooks")?;
        listener
            .set_nonblocking(true)
            .map_err(|_| "Receptor de hooks indisponível")?;
        let token = rand::random::<[u8; 16]>()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        Ok(Self { listener, token })
    }
    pub fn port(&self) -> Result<u16, String> {
        self.listener
            .local_addr()
            .map(|address| address.port())
            .map_err(|_| "Receptor indisponível".into())
    }
    pub fn duplicate(&self) -> Result<Self, String> {
        Ok(Self {
            listener: self
                .listener
                .try_clone()
                .map_err(|_| "Receptor indisponível")?,
            token: self.token.clone(),
        })
    }
    pub fn poll(&self) -> Result<Option<HookMessage>, String> {
        let (stream, _) = match self.listener.accept() {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => return Ok(None),
            Err(_) => return Err("Receptor de hooks desconectado".into()),
        };
        stream
            .set_read_timeout(Some(Duration::from_millis(100)))
            .map_err(|_| "Receptor indisponível")?;
        let mut bytes = Vec::new();
        if stream.take(MAX_PACKET + 1).read_to_end(&mut bytes).is_err()
            || bytes.len() as u64 > MAX_PACKET
        {
            return Ok(None);
        }
        let Ok(packet) = serde_json::from_slice::<Packet>(&bytes) else {
            return Ok(None);
        };
        if packet.token != self.token {
            return Ok(None);
        }
        let at = now();
        if !(at - 30_000.0..=at + 1000.0).contains(&packet.message.observed_at) {
            return Ok(None);
        }
        Ok(Some(packet.message))
    }
}

pub struct Bridge {
    pub receiver: Receiver,
    installation: Installation,
}
impl Bridge {
    pub fn install() -> Result<Self, String> {
        let installed = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .ok_or("Antigravity App não encontrado")?
            .join("Programs/antigravity/Antigravity.exe");
        if !installed.is_file() {
            return Err("Antigravity App não encontrado na instalação padrão".into());
        }
        let path = std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .ok_or("Perfil Windows indisponível")?
            .join(".gemini/config/hooks.json");
        let receiver = Receiver::bind()?;
        let entry = definition(
            &std::env::current_exe().map_err(|_| "Executável Strata indisponível")?,
            receiver.port()?,
            &receiver.token,
        )?;
        let installation = Installation::install(path, entry)?;
        Ok(Self {
            receiver,
            installation,
        })
    }
    pub fn remove(&self) -> Result<(), String> {
        self.installation.remove()
    }
}
impl Drop for Bridge {
    fn drop(&mut self) {
        let _ = self.remove();
    }
}

pub fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

pub fn run_helper(arguments: &[String]) {
    let Some(event) = arguments.get(2).and_then(|name| HookEvent::from_name(name)) else {
        println!("{{}}");
        return;
    };
    let response = event.response();
    let send = || -> Result<(), String> {
        let port: u16 = arguments
            .first()
            .and_then(|port| port.parse().ok())
            .filter(|port| *port != 0)
            .ok_or("Porta inválida")?;
        let token = arguments
            .get(1)
            .filter(|token| valid_token(token))
            .ok_or("Conexão inválida")?;
        let mut raw = String::new();
        std::io::stdin()
            .take(MAX_INPUT + 1)
            .read_to_string(&mut raw)
            .map_err(|_| "Hook inválido")?;
        let message = parse_hook(event, &raw, now())?;
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
        let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(150))
            .map_err(|_| "Receptor ausente")?;
        stream
            .set_write_timeout(Some(Duration::from_millis(100)))
            .map_err(|_| "Receptor ausente")?;
        let packet = serde_json::to_vec(&Packet {
            token: token.clone(),
            message,
        })
        .map_err(|_| "Hook inválido")?;
        stream
            .write_all(&packet)
            .map_err(|_| "Receptor indisponível".to_string())
    };
    let _ = send();
    println!("{response}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{agents_contract::SessionStatus, antigravity::Monitor};

    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            let directory = std::env::temp_dir().join(format!(
                "strata-hooks-test-{}-{:016x}",
                std::process::id(),
                rand::random::<u64>()
            ));
            fs::create_dir(&directory).unwrap();
            Self(directory)
        }
        fn file(&self) -> PathBuf {
            self.0.join("hooks.json")
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_file(self.file());
            let _ = fs::remove_dir(&self.0);
        }
    }

    #[test]
    fn installing_and_removing_preserves_other_hooks_and_newer_owners() {
        let dir = Directory::new();
        let other =
            json!({"other-hook":{"enabled":true,"SessionStart":[{"command":"echo existing"}]}});
        fs::write(dir.file(), other.to_string()).unwrap();
        let first_entry = definition(
            Path::new(r"C:\Strata\strata-bar.exe"),
            12345,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .unwrap();
        let first = Installation::install(dir.file(), first_entry).unwrap();
        assert_eq!(
            read_config(&dir.file()).unwrap().1["other-hook"],
            other["other-hook"]
        );
        let second_entry = definition(
            Path::new(r"C:\Strata\strata-bar.exe"),
            12346,
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        )
        .unwrap();
        let second = Installation::install(dir.file(), second_entry.clone()).unwrap();
        first.remove().unwrap();
        assert_eq!(read_config(&dir.file()).unwrap().1[KEY], second_entry);
        second.remove().unwrap();
        assert_eq!(read_config(&dir.file()).unwrap().1, other);
    }

    #[test]
    fn an_unrecognized_existing_entry_is_preserved() {
        let dir = Directory::new();
        let original = json!({KEY:{"SessionStart":[{"command":"custom command"}]}}).to_string();
        fs::write(dir.file(), &original).unwrap();
        let entry = definition(
            Path::new(r"C:\Strata\strata-bar.exe"),
            12345,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .unwrap();
        assert!(Installation::install(dir.file(), entry).is_err());
        assert_eq!(fs::read_to_string(dir.file()).unwrap(), original);
    }

    #[test]
    fn local_transport_accepts_only_the_current_connection_token() {
        let receiver = Receiver::bind().unwrap();
        let message = parse_hook(
            HookEvent::PreInvocation,
            &json!({"conversationId":"ec33ebf9-0cba-4100-8142-c61503f6c587","workspacePaths":[]})
                .to_string(),
            now(),
        )
        .unwrap();
        for (token, accepted) in [
            (format!("{}x", receiver.token), false),
            (receiver.token.clone(), true),
        ] {
            let mut stream =
                TcpStream::connect((Ipv4Addr::LOCALHOST, receiver.port().unwrap())).unwrap();
            stream
                .write_all(
                    &serde_json::to_vec(&Packet {
                        token,
                        message: message.clone(),
                    })
                    .unwrap(),
                )
                .unwrap();
            drop(stream);
            assert_eq!(receiver.poll().unwrap().is_some(), accepted);
        }
    }

    #[test]
    #[ignore = "Launches the release helper on Windows with synthetic metadata; no Antigravity task is started"]
    fn live_windows_helper_preserves_policy_and_delivers_only_metadata() {
        use std::{
            os::windows::process::CommandExt,
            process::{Command, Stdio},
        };
        let executable =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("target/release/strata-bar.exe");
        let receiver = Receiver::bind().unwrap();
        let mut monitor = Monitor::default();
        monitor.configure(true);
        for event in [HookEvent::PreToolUse, HookEvent::Stop] {
            let input = json!({"conversationId":"ec33ebf9-0cba-4100-8142-c61503f6c587","workspacePaths":["D:\\synthetic"],"toolCall":{"name":"ask_question","args":{"private":"not forwarded"}},"transcriptPath":"must-not-be-read","terminationReason":"model_stop","fullyIdle":true});
            let entry = definition(&executable, receiver.port().unwrap(), &receiver.token).unwrap();
            let command = if matches!(event, HookEvent::PreToolUse) {
                entry[event.name()][0]["hooks"][0]["command"]
                    .as_str()
                    .unwrap()
            } else {
                entry[event.name()][0]["command"].as_str().unwrap()
            };
            let mut process = Command::new("cmd.exe")
                .args(["/d", "/s", "/c"])
                .raw_arg(format!("\"{command}\""))
                .creation_flags(0x08000000)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            process
                .stdin
                .take()
                .unwrap()
                .write_all(input.to_string().as_bytes())
                .unwrap();
            let output = process.wait_with_output().unwrap();
            assert!(output.status.success());
            assert_eq!(
                String::from_utf8(output.stdout).unwrap().trim(),
                event.response()
            );
            let message = receiver
                .poll()
                .unwrap()
                .expect("Helper did not deliver metadata");
            assert!(!serde_json::to_string(&message)
                .unwrap()
                .contains("not forwarded"));
            monitor.receive(message).unwrap();
        }
        assert_eq!(
            monitor.snapshot().sessions[0].status,
            SessionStatus::Completed
        );
        println!(
            "ANTIGRAVITY_BRIDGE {}",
            json!({"helperTransport":"passed","policyPreserved":true,"conversationContentRecorded":false,"syntheticEvents":true,"actualAntigravityHookEmissionVerified":false})
        );
    }
}
