use crate::agents_contract::{
    AgentConnectionStatus, AgentSession, AgentType, OpenCodeSnapshot, SessionStatus,
};
use crate::agents_contract::{AgentMessage, AgentTextField};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
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

#[path = "opencode_permissions.rs"]
pub mod permissions;

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
    execute_cli(path, &["api", "GET", &route], cancelled)
}

fn execute_cli(
    path: &std::path::Path,
    args: &[&str],
    cancelled: &impl Fn() -> bool,
) -> Result<Value, String> {
    if cancelled() {
        return Err("Conexão cancelada".into());
    }
    let mut child = Command::new(path)
        .args(args)
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
    // The public DELETE used by the live test returns HTTP 204 with no body.
    // Callers that need JSON still validate their own response contract.
    if bytes.iter().all(u8::is_ascii_whitespace) {
        return Ok(Value::Null);
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

/// Creates a conversation only; never starts a prompt or changes permission policy.
pub fn create_empty(
    directory: &str,
    send: impl FnOnce(Value) -> Result<Value, String>,
) -> Result<String, String> {
    let bytes = directory.as_bytes();
    if directory.len() > 4096
        || bytes.len() < 3
        || !bytes[0].is_ascii_alphabetic()
        || bytes[1] != b':'
        || !matches!(bytes[2], b'\\' | b'/')
        || directory[2..].contains(':')
        || directory.chars().any(char::is_control)
        || !std::path::Path::new(directory).is_dir()
    {
        return Err("Escolha uma pasta local existente com caminho absoluto".into());
    }
    let uncertain = || {
        "Não foi possível confirmar a criação. Confira a lista no OpenCode antes de tentar novamente.".to_string()
    };
    let response =
        send(serde_json::json!({"location":{"directory":directory}})).map_err(|_| uncertain())?;
    response
        .get("data")
        .and_then(|v| v.get("id"))
        .and_then(Value::as_str)
        .filter(|id| valid_id(id))
        .map(str::to_string)
        .ok_or_else(uncertain)
}

#[cfg(test)]
pub fn create_empty_live(directory: &str, cancelled: impl Fn() -> bool) -> Result<String, String> {
    let path = installed_cli()?;
    create_empty(directory, |body| {
        execute_cli(
            &path,
            &["api", "POST", "/api/session", "--data", &body.to_string()],
            &cancelled,
        )
    })
}

pub fn create_with_prompt(
    directory: &str,
    prompt: Option<&str>,
    mut send: impl FnMut(&str, Value) -> Result<Value, String>,
    cancelled: impl Fn() -> bool,
) -> Result<crate::agents_contract::CreateAgentSessionResult, String> {
    use crate::agents_contract::{CreateAgentSessionResult, InitialPromptStatus};
    if prompt.is_some_and(|text| {
        text.trim().is_empty()
            || text.len() > 4096
            || text
                .chars()
                .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
    }) {
        return Err("O prompt deve conter texto e ter até 4096 bytes UTF-8".into());
    }
    if cancelled() {
        return Err("OpenCode desconectado".into());
    }
    let session_id = create_empty(directory, |body| send("/api/session", body))?;
    let mut result = CreateAgentSessionResult {
        session_id,
        prompt_status: InitialPromptStatus::NotRequested,
        error: None,
    };
    let Some(text) = prompt else {
        return Ok(result);
    };
    if cancelled() {
        result.prompt_status = InitialPromptStatus::NotSent;
        result.error = Some("Conversa criada, mas o prompt não foi enviado porque a conexão mudou. Confira a conversa no OpenCode.".into());
        return Ok(result);
    }
    let response = send(
        &format!("/api/session/{}/prompt", result.session_id),
        serde_json::json!({"text":text,"resume":true}),
    );
    let accepted = response.ok().is_some_and(|response| {
        let data = &response["data"];
        data["sessionID"].as_str() == Some(result.session_id.as_str())
            && data["type"].as_str() == Some("user")
            && data["id"].as_str().is_some_and(|id| {
                id.starts_with("msg")
                    && id.len() <= 128
                    && id
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
            })
    });
    result.prompt_status = if accepted {
        InitialPromptStatus::Accepted
    } else {
        InitialPromptStatus::Unknown
    };
    if !accepted {
        result.error = Some("Conversa criada; envio do prompt sem confirmação. Não reenvie automaticamente: confira a conversa no OpenCode.".into());
    }
    Ok(result)
}

pub fn create_with_prompt_live(
    directory: &str,
    prompt: Option<&str>,
    cancelled: impl Fn() -> bool,
) -> Result<crate::agents_contract::CreateAgentSessionResult, String> {
    let path = installed_cli()?;
    create_with_prompt(
        directory,
        prompt,
        |route, body| {
            execute_cli(
                &path,
                &["api", "POST", route, "--data", &body.to_string()],
                &cancelled,
            )
        },
        &cancelled,
    )
}

/// Owns connection generations so a cancelled poll cannot restore old sessions.
#[derive(Default)]
pub struct Connection {
    generation: u64,
    enabled: bool,
    snapshot: OpenCodeSnapshot,
    attempted_actions: HashSet<String>,
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
    pub fn pending_reply(
        &self,
        request: &crate::agents_contract::AgentReplyRequest,
    ) -> Result<AgentMessage, String> {
        if self.snapshot.status != AgentConnectionStatus::Connected {
            return Err("OpenCode desconectado".into());
        }
        self.snapshot
            .questions
            .iter()
            .find(|q| {
                q.session_id == request.session_id
                    && q.id == request.question_id
                    && q.version == request.version
                    && !q.reply_blocked
                    && q.unsupported_reason.is_none()
            })
            .cloned()
            .ok_or_else(|| "Pergunta indisponível ou alterada; confira o OpenCode".into())
    }
    pub fn begin_reply(
        &mut self,
        request: &crate::agents_contract::AgentReplyRequest,
    ) -> Result<(), String> {
        self.pending_reply(request)?;
        let key = format!("{}:{}", request.session_id, request.question_id);
        if self.attempted_actions.len() >= 1024 || !self.attempted_actions.insert(key) {
            return Err(
                "Resposta já tentada ou limite de envios atingido; confira o OpenCode".into(),
            );
        }
        for question in &mut self.snapshot.questions {
            if question.id == request.question_id && question.session_id == request.session_id {
                question.reply_blocked = true;
            }
        }
        Ok(())
    }
    pub fn finish_reply(
        &mut self,
        generation: u64,
        request: &crate::agents_contract::AgentReplyRequest,
    ) {
        if self.request() == Some(generation) {
            self.snapshot
                .questions
                .retain(|q| q.id != request.question_id || q.session_id != request.session_id);
        }
    }
    pub fn pending_permission(
        &self,
        request: &crate::agents_contract::AgentPermissionRequest,
    ) -> Result<crate::agents_contract::AgentPermission, String> {
        if self.snapshot.status != AgentConnectionStatus::Connected {
            return Err("OpenCode desconectado".into());
        }
        self.snapshot
            .permissions
            .iter()
            .find(|p| {
                p.id == request.permission_id
                    && p.session_id == request.session_id
                    && p.version == request.version
                    && !p.reply_blocked
                    && p.unsupported_reason.is_none()
            })
            .cloned()
            .ok_or_else(|| "Permissão indisponível ou alterada; confira o OpenCode".into())
    }
    pub fn begin_permission(
        &mut self,
        request: &crate::agents_contract::AgentPermissionRequest,
    ) -> Result<(), String> {
        self.pending_permission(request)?;
        let key = format!(
            "permission:{}:{}",
            request.session_id, request.permission_id
        );
        if self.attempted_actions.len() >= 1024 || !self.attempted_actions.insert(key) {
            return Err("Decisão já tentada ou limite atingido; confira o OpenCode".into());
        }
        for permission in &mut self.snapshot.permissions {
            if permission.id == request.permission_id && permission.session_id == request.session_id
            {
                permission.reply_blocked = true;
            }
        }
        Ok(())
    }
    pub fn finish_permission(
        &mut self,
        generation: u64,
        request: &crate::agents_contract::AgentPermissionRequest,
    ) {
        if self.request() == Some(generation) {
            self.snapshot
                .permissions
                .retain(|p| p.id != request.permission_id || p.session_id != request.session_id);
        }
    }
    pub fn apply(&mut self, generation: u64, result: Result<OpenCodeSnapshot, String>) -> bool {
        if self.request() != Some(generation) {
            return false;
        }
        match result {
            Ok(mut snapshot) => {
                for question in &mut snapshot.questions {
                    question.reply_blocked = self
                        .attempted_actions
                        .contains(&format!("{}:{}", question.session_id, question.id));
                }
                for permission in &mut snapshot.permissions {
                    permission.reply_blocked = self.attempted_actions.contains(&format!(
                        "permission:{}:{}",
                        permission.session_id, permission.id
                    ));
                }
                self.snapshot = snapshot;
            }
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
    idle: Option<f64>,
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

fn valid_form_id(id: &str) -> bool {
    id.starts_with("frm_")
        && id.len() > 4
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
}

fn project_form(value: &Value, session_id: &str) -> Result<AgentMessage, String> {
    let text = |key: &str, limit: usize| {
        value[key]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= limit)
            .map(str::to_string)
            .ok_or_else(invalid)
    };
    let id = text("id", 128)?;
    if !valid_form_id(&id) || value["sessionID"].as_str() != Some(session_id) {
        return Err(invalid());
    }
    let title = text("title", 1024)?;
    let raw = value["fields"].as_array().ok_or_else(invalid)?;
    let mut fields = Vec::new();
    let mut unsupported = raw.is_empty() || raw.len() > 8;
    let mut keys = HashSet::new();
    if !unsupported {
        for field in raw {
            let key = field["key"]
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 128)
                .ok_or_else(invalid)?;
            if !keys.insert(key) {
                return Err(invalid());
            }
            if field["type"].as_str() != Some("string")
                || field["hidden"].as_bool() == Some(true)
                || ["when", "format", "pattern", "options", "custom"]
                    .iter()
                    .any(|key| field.get(key).is_some())
            {
                unsupported = true;
                break;
            }
            let bound = |name: &str| -> Result<Option<u32>, String> {
                field
                    .get(name)
                    .map(|v| {
                        v.as_u64()
                            .filter(|v| *v <= u32::MAX as u64)
                            .map(|v| v as u32)
                            .ok_or_else(invalid)
                    })
                    .transpose()
            };
            let min_length = bound("minLength")?;
            let max_length = bound("maxLength")?;
            if min_length.unwrap_or(0) > max_length.unwrap_or(u32::MAX) {
                return Err(invalid());
            }
            if min_length.is_some_and(|min| min > 4096) {
                unsupported = true;
                break;
            }
            let max_length = max_length.map(|max| max.min(4096));
            let field_title = field
                .get("title")
                .map(|v| {
                    v.as_str()
                        .filter(|s| s.len() <= 1024)
                        .map(str::to_string)
                        .ok_or_else(invalid)
                })
                .transpose()?
                .unwrap_or_else(|| key.into());
            let description = field
                .get("description")
                .map(|v| {
                    v.as_str()
                        .filter(|s| s.len() <= 2048)
                        .map(str::to_string)
                        .ok_or_else(invalid)
                })
                .transpose()?;
            let required = field
                .get("required")
                .map(|v| v.as_bool().ok_or_else(invalid))
                .transpose()?
                .unwrap_or(false);
            fields.push(AgentTextField {
                key: key.into(),
                title: field_title,
                description,
                required,
                min_length,
                max_length,
            });
        }
    }
    if unsupported {
        fields.clear();
    }
    let fingerprint =
        serde_json::json!({"id":id,"sessionID":session_id,"title":title,"fields":raw});
    let version = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&fingerprint).map_err(|_| invalid())?)
    );
    Ok(AgentMessage {
        id,
        session_id: session_id.into(),
        connection_id: "opencode-local".into(),
        version,
        title,
        fields,
        unsupported_reason: unsupported.then(|| {
            "Este formulário exige controles não suportados. Responda no OpenCode.".into()
        }),
        reply_blocked: false,
    })
}

fn project_forms(value: Value, session_id: &str) -> Result<Vec<AgentMessage>, String> {
    let data = value["data"]
        .as_array()
        .filter(|v| v.len() <= 100)
        .ok_or_else(invalid)?;
    let questions: Vec<_> = data
        .iter()
        .map(|v| project_form(v, session_id))
        .collect::<Result<_, _>>()?;
    let mut ids = HashSet::new();
    if questions.iter().any(|q| !ids.insert(&q.id)) {
        return Err(invalid());
    }
    Ok(questions)
}

pub enum ReplyOperation {
    List,
    Send(Value),
}

pub fn reply_question(
    expected: &AgentMessage,
    request: &crate::agents_contract::AgentReplyRequest,
    mut api: impl FnMut(ReplyOperation) -> Result<Value, String>,
    before_send: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    if !valid_id(&request.session_id)
        || !valid_form_id(&request.question_id)
        || request.session_id != expected.session_id
        || request.question_id != expected.id
        || request.version != expected.version
        || expected.unsupported_reason.is_some()
        || expected.reply_blocked
        || request.answers.len() > 8
        || request.answers.values().map(String::len).sum::<usize>() > 8192
    {
        return Err("Resposta ou destinatário inválido".into());
    }
    if request
        .answers
        .keys()
        .any(|key| !expected.fields.iter().any(|field| field.key == *key))
    {
        return Err("Resposta contém campos desconhecidos".into());
    }
    for field in &expected.fields {
        let value = request.answers.get(&field.key);
        if field.required && value.is_none_or(|v| v.trim().is_empty()) {
            return Err("Preencha os campos obrigatórios".into());
        }
        if let Some(value) = value {
            let length = value.chars().count();
            if value.len() > 4096
                || length < field.min_length.unwrap_or(0) as usize
                || length > field.max_length.unwrap_or(4096) as usize
                || value
                    .chars()
                    .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
            {
                return Err("Resposta fora dos limites do campo".into());
            }
        }
    }
    let latest = project_forms(api(ReplyOperation::List)?, &request.session_id)?;
    if !latest.iter().any(|q| {
        q.id == expected.id && q.version == expected.version && q.unsupported_reason.is_none()
    }) {
        return Err("A pergunta já foi resolvida ou mudou. Atualize antes de responder.".into());
    }
    before_send()?;
    match api(ReplyOperation::Send(
        serde_json::json!({"answer":request.answers}),
    )) {
        Ok(Value::Null) => Ok(()),
        _ => Err("Envio sem confirmação. Não reenvie: confira a resposta no OpenCode.".into()),
    }
}

pub fn reply_live(
    expected: &AgentMessage,
    request: &crate::agents_contract::AgentReplyRequest,
    cancelled: impl Fn() -> bool,
    before_send: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let path = installed_cli()?;
    reply_question(
        expected,
        request,
        |operation| match operation {
            ReplyOperation::List => read_cli(
                &path,
                ReadRequest::Forms(request.session_id.clone()),
                &cancelled,
            ),
            ReplyOperation::Send(body) => execute_cli(
                &path,
                &[
                    "api",
                    "POST",
                    &format!(
                        "/api/session/{}/form/{}/reply",
                        request.session_id, request.question_id
                    ),
                    "--data",
                    &body.to_string(),
                ],
                &cancelled,
            ),
        },
        before_send,
    )
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
    let mut questions = Vec::new();
    let mut permissions = Vec::new();
    for id in active.data.keys() {
        let forms = project_forms(read(ReadRequest::Forms(id.clone()))?, id)?;
        if !forms.is_empty() {
            attention.insert(id.clone());
        }
        questions.extend(forms);
        if questions.len() > 128 {
            return Err("Limite de perguntas pendentes excedido".into());
        }
        let pending = permissions::collect(read(ReadRequest::Permissions(id.clone()))?, id)?;
        if !pending.is_empty() {
            attention.insert(id.clone());
        }
        permissions.extend(pending);
        if permissions.len() > 128 {
            return Err("Limite de permissões pendentes excedido".into());
        }
    }
    let mut sessions = Vec::new();
    let mut completed_turns = BTreeMap::new();
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
        if let Some(idle) = info.time.idle {
            if !idle.is_finite() || !(0.0..=8_640_000_000_000_000.0).contains(&idle) {
                return Err(invalid());
            }
            if info.outcome.as_deref() == Some("succeeded") {
                completed_turns.insert(info.id.clone(), idle);
            }
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
        questions,
        permissions,
        completed_turns,
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
    fn attempted_replies_stay_blocked_after_reconciliation_and_reconnect_without_retaining_answers()
    {
        let question = project_form(&json!({"id":"frm_text","sessionID":"ses_busy","title":"Nome?","fields":[{"key":"name","type":"string"}]}), "ses_busy").unwrap();
        let request = crate::agents_contract::AgentReplyRequest {
            session_id: "ses_busy".into(),
            question_id: "frm_text".into(),
            version: question.version.clone(),
            answers: BTreeMap::from([("name".into(), "Ana".into())]),
        };
        let mut source = empty_snapshot();
        source.questions.push(question);
        let mut connection = Connection::default();
        connection.configure(true);
        connection.apply(connection.request().unwrap(), Ok(source.clone()));
        connection.begin_reply(&request).unwrap();
        assert!(connection.snapshot().questions[0].reply_blocked);
        assert!(connection.begin_reply(&request).is_err());
        connection.configure(false);
        connection.configure(true);
        connection.apply(connection.request().unwrap(), Ok(source));
        assert!(connection.pending_reply(&request).is_err());
        assert!(connection.snapshot().questions[0].reply_blocked);
    }

    #[test]
    #[ignore = "Requires OpenCode v2; creates, answers and removes its own form in a temporary conversation without model execution"]
    fn live_windows_answers_its_own_pending_text_form_without_reading_history() {
        let path = installed_cli().unwrap();
        let folder = std::env::temp_dir().join(format!("strata-form-reply-{}", std::process::id()));
        std::fs::create_dir(&folder).unwrap();
        let id = create_empty_live(folder.to_str().unwrap(), || false).unwrap();
        let result = (|| -> Result<(), String> {
            let response = execute_cli(&path, &["api", "POST", &format!("/api/session/{id}/form"), "--data", &json!({"title":"Pergunta de validação do Strata","fields":[{"key":"name","type":"string","title":"Nome","required":true}]}).to_string()], &|| false)?;
            let question = project_form(&response["data"], &id)?;
            let request = crate::agents_contract::AgentReplyRequest {
                session_id: id.clone(),
                question_id: question.id.clone(),
                version: question.version.clone(),
                answers: BTreeMap::from([("name".into(), "Strata".into())]),
            };
            reply_live(&question, &request, || false, || Ok(()))?;
            let pending = project_forms(
                read_cli(&path, ReadRequest::Forms(id.clone()), &|| false)?,
                &id,
            )?;
            if pending.iter().any(|q| q.id == question.id) {
                return Err("Own form still pending".into());
            }
            if reply_live(&question, &request, || false, || Ok(())).is_ok() {
                return Err("Settled form allowed another reply".into());
            }
            Ok(())
        })();
        let cleanup = execute_cli(
            &path,
            &["api", "DELETE", &format!("/api/session/{id}")],
            &|| false,
        )
        .is_ok();
        let _ = std::fs::remove_dir(&folder);
        assert!(result.is_ok(), "Own form validation failed: {result:?}");
        assert!(cleanup, "Could not remove own temporary conversation");
        println!("OPENCODE_REPLY {{\"textFormReplyVerified\":true,\"settledFormBlocked\":true,\"modelExecutionStarted\":false,\"historyRead\":false,\"testConversationRemoved\":true,\"conversationContentRecorded\":false}}");
    }

    #[test]
    fn answering_revalidates_the_pending_question_and_never_sends_to_a_resolved_or_changed_form() {
        let raw = json!({"id":"frm_text","sessionID":"ses_busy","title":"Qual nome?","fields":[{"key":"name","type":"string","required":true}]});
        let question = project_form(&raw, "ses_busy").unwrap();
        let request = crate::agents_contract::AgentReplyRequest {
            session_id: "ses_busy".into(),
            question_id: "frm_text".into(),
            version: question.version.clone(),
            answers: BTreeMap::from([("name".into(), "Ana".into())]),
        };
        let mut sent = false;
        reply_question(
            &question,
            &request,
            |operation| match operation {
                ReplyOperation::List => Ok(json!({"data":[raw.clone()]})),
                ReplyOperation::Send(body) => {
                    assert_eq!(body, json!({"answer":{"name":"Ana"}}));
                    sent = true;
                    Ok(Value::Null)
                }
            },
            || Ok(()),
        )
        .unwrap();
        assert!(sent);
        for answers in [
            BTreeMap::new(),
            BTreeMap::from([("unknown".into(), "Ana".into())]),
            BTreeMap::from([("name".into(), "x".repeat(4097))]),
        ] {
            let invalid_request = crate::agents_contract::AgentReplyRequest {
                answers,
                ..request.clone()
            };
            assert!(reply_question(
                &question,
                &invalid_request,
                |_| panic!("Invalid answers must not reach the API"),
                || Ok(())
            )
            .is_err());
        }
        for pending in [
            json!({"data":[]}),
            json!({"data":[{"id":"frm_text","sessionID":"ses_busy","title":"Outra pergunta","fields":[{"key":"name","type":"string"}]}]}),
        ] {
            assert!(reply_question(
                &question,
                &request,
                |operation| match operation {
                    ReplyOperation::List => Ok(pending.clone()),
                    ReplyOperation::Send(_) => panic!("Must not send stale replies"),
                },
                || Ok(())
            )
            .is_err());
        }
    }

    #[test]
    fn pending_text_questions_are_projected_without_history_or_unsupported_controls() {
        let snapshot = collect(|request| Ok(match request {
            ReadRequest::Sessions => json!({"data":[{"id":"ses_busy","location":{"directory":"D:\\project"},"time":{"updated":1000}}],"cursor":{}}),
            ReadRequest::Active => json!({"data":{"ses_busy":{"type":"running"}}}),
            ReadRequest::Forms(_) => json!({"data":[
                {"id":"frm_text","sessionID":"ses_busy","title":"Qual nome?","fields":[{"key":"name","type":"string","title":"Nome","required":true,"maxLength":100}]},
                {"id":"frm_choice","sessionID":"ses_busy","title":"Escolha","fields":[{"key":"choice","type":"boolean"}]}
            ]}),
            ReadRequest::Permissions(_) => json!({"data":[]}),
            _ => panic!("No history reads")
        })).unwrap();
        assert_eq!(snapshot.questions.len(), 2);
        let text = &snapshot.questions[0];
        assert_eq!(text.title, "Qual nome?");
        assert_eq!(text.fields[0].key, "name");
        assert_eq!(text.version.len(), 64);
        assert!(text.unsupported_reason.is_none());
        assert!(snapshot.questions[1].unsupported_reason.is_some());
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
            ReadRequest::Permissions(_) => json!({"data":[{"id":"per_1","sessionID":"ses_busy","action":"shell","resources":["echo Strata"]}]}),
            _ => panic!("Unexpected read"),
        })).unwrap();
        assert_eq!(snapshot.sessions[0].status, SessionStatus::Attention);
    }

    #[test]
    #[ignore = "Requires the installed OpenCode v2 service; creates and removes its own empty test session"]
    fn live_windows_creates_and_removes_its_own_empty_conversation() {
        let folder =
            std::env::temp_dir().join(format!("strata-empty-session-{}", std::process::id()));
        std::fs::create_dir(&folder).unwrap();
        let result = create_empty_live(folder.to_str().unwrap(), || false);
        let cleanup = result
            .as_ref()
            .map(|id| {
                execute_cli(
                    &installed_cli().unwrap(),
                    &["api", "DELETE", &format!("/api/session/{id}")],
                    &|| false,
                )
                .is_ok()
            })
            .unwrap_or(false);
        let _ = std::fs::remove_dir(&folder);
        assert!(result.is_ok(), "Creation failed: {result:?}");
        assert!(cleanup, "Could not remove the empty test conversation");
        println!("OPENCODE_CREATE {{\"emptyConversationCreated\":true,\"testConversationRemoved\":true,\"promptSent\":false}}");
    }

    #[test]
    fn initial_prompt_is_admitted_once_only_to_the_new_conversation_and_partial_failure_keeps_its_id(
    ) {
        let directory = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let mut writes = Vec::new();
        let result = create_with_prompt(
            &directory,
            Some("Leia o README"),
            |route, body| {
                writes.push((route.to_string(), body));
                Ok(if route == "/api/session" {
                    json!({"data":{"id":"ses_new"}})
                } else {
                    json!({"data":{"id":"msg_initial","sessionID":"ses_new","type":"user"}})
                })
            },
            || false,
        )
        .unwrap();
        assert_eq!(result.session_id, "ses_new");
        assert_eq!(
            result.prompt_status,
            crate::agents_contract::InitialPromptStatus::Accepted
        );
        assert_eq!(
            writes,
            vec![
                (
                    "/api/session".into(),
                    json!({"location":{"directory":directory}})
                ),
                (
                    "/api/session/ses_new/prompt".into(),
                    json!({"text":"Leia o README","resume":true})
                )
            ]
        );
        let partial = create_with_prompt(
            &directory,
            Some("Leia"),
            |route, _| {
                if route == "/api/session" {
                    Ok(json!({"data":{"id":"ses_partial"}}))
                } else {
                    Err("timeout".into())
                }
            },
            || false,
        )
        .unwrap();
        assert_eq!(partial.session_id, "ses_partial");
        assert_eq!(
            partial.prompt_status,
            crate::agents_contract::InitialPromptStatus::Unknown
        );
        assert!(partial.error.unwrap().contains("Não reenvie"));
        assert!(create_with_prompt(
            &directory,
            Some(&"x".repeat(4097)),
            |_, _| panic!("Must validate before creating"),
            || false
        )
        .is_err());
    }

    #[test]
    #[ignore = "Requires OpenCode v2; verifies prompt admission with resume:false, then removes its own test conversation"]
    fn live_windows_admits_initial_prompt_without_starting_agent_execution() {
        let path = installed_cli().unwrap();
        let folder =
            std::env::temp_dir().join(format!("strata-prompt-admission-{}", std::process::id()));
        std::fs::create_dir(&folder).unwrap();
        let result = create_with_prompt(
            folder.to_str().unwrap(),
            Some("Teste de admissão do Strata; não executar."),
            |route, mut body| {
                if route.ends_with("/prompt") {
                    body["resume"] = Value::Bool(false);
                }
                execute_cli(
                    &path,
                    &["api", "POST", route, "--data", &body.to_string()],
                    &|| false,
                )
            },
            || false,
        );
        let cleanup = result
            .as_ref()
            .map(|created| {
                execute_cli(
                    &path,
                    &[
                        "api",
                        "DELETE",
                        &format!("/api/session/{}", created.session_id),
                    ],
                    &|| false,
                )
                .is_ok()
            })
            .unwrap_or(false);
        let _ = std::fs::remove_dir(&folder);
        let created = result.unwrap();
        assert_eq!(
            created.prompt_status,
            crate::agents_contract::InitialPromptStatus::Accepted
        );
        assert!(cleanup, "Could not remove own test conversation");
        println!("OPENCODE_PROMPT {{\"promptAdmissionVerified\":true,\"resumeRequested\":false,\"agentExecutionVerified\":false,\"testConversationRemoved\":true,\"conversationContentRecorded\":false}}");
    }

    #[test]
    fn changing_connection_after_creation_keeps_the_conversation_without_sending_the_prompt() {
        use std::cell::Cell;
        let disconnected = Cell::new(false);
        let directory = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let result = create_with_prompt(
            &directory,
            Some("Leia"),
            |route, _| {
                assert_eq!(route, "/api/session");
                disconnected.set(true);
                Ok(json!({"data":{"id":"ses_created"}}))
            },
            || disconnected.get(),
        )
        .unwrap();
        assert_eq!(result.session_id, "ses_created");
        assert_eq!(
            result.prompt_status,
            crate::agents_contract::InitialPromptStatus::NotSent
        );
    }

    #[test]
    fn creates_only_an_empty_conversation_at_a_valid_existing_local_directory() {
        let directory = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let id = create_empty(&directory, |body| {
            assert_eq!(body, json!({"location":{"directory": directory}}));
            Ok(json!({"data":{"id":"ses_created"}}))
        })
        .unwrap();
        assert_eq!(id, "ses_created");
        for invalid in [
            "",
            "relative",
            "\\\\server\\share",
            "C:\\missing-strata-directory-45912",
        ] {
            assert!(create_empty(invalid, |_| panic!(
                "Invalid folders must never reach the provider"
            ))
            .is_err());
        }
        assert!(create_empty(&directory, |_| Ok(json!({"data":{"id":"wrong"}}))).is_err());
        let error = create_empty(&directory, |_| Err("timeout".into())).unwrap_err();
        assert!(error.contains("Confira a lista"));
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
