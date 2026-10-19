//! Optional Calendar integration. Only OAuth application configuration enters
//! from the WebView; access/refresh tokens stay in the native credential vault.
use crate::reminders_contract::{CalendarStatus, Reminder};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::Mutex,
    time::{Duration, Instant},
};
use windows::{
    core::{w, PCWSTR, PWSTR},
    Win32::Security::Credentials::*,
};

const TARGET: PCWSTR = w!("Strata/GoogleCalendar/v1");
const SCOPE: &str = "https://www.googleapis.com/auth/calendar.events.owned";

#[derive(Clone, Serialize, Deserialize)]
struct Credentials {
    client_id: String,
    client_secret: String,
    access_token: String,
    refresh_token: String,
    expires_at: f64,
}

struct Inner {
    credentials: Option<Credentials>,
    generation: u64,
    connecting: bool,
    error: Option<String>,
}

pub struct GoogleCalendar {
    inner: Mutex<Inner>,
    api_lock: Mutex<()>,
    client: Client,
}

fn read_credentials() -> Result<Option<Credentials>, String> {
    unsafe {
        let mut pointer = std::ptr::null_mut();
        match CredReadW(TARGET, CRED_TYPE_GENERIC, None, &mut pointer) {
            Err(e) if e.code() == windows::Win32::Foundation::ERROR_NOT_FOUND.to_hresult() => {
                return Ok(None)
            }
            Err(_) => return Err("Não foi possível ler as credenciais do Google".into()),
            Ok(()) => {}
        }
        let result = if (*pointer).CredentialBlob.is_null() || (*pointer).CredentialBlobSize == 0 {
            Err("Credenciais do Google inválidas".into())
        } else {
            serde_json::from_slice(std::slice::from_raw_parts(
                (*pointer).CredentialBlob,
                (*pointer).CredentialBlobSize as usize,
            ))
            .map(Some)
            .map_err(|_| "Credenciais do Google inválidas".into())
        };
        CredFree(pointer.cast());
        result
    }
}

fn save_credentials(value: &Credentials) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(value).map_err(|_| "Credenciais inválidas")?;
    if bytes.len() > 2560 {
        return Err("Credenciais excedem o limite do cofre do Windows".into());
    }
    let mut target: Vec<u16> = "Strata/GoogleCalendar/v1\0".encode_utf16().collect();
    let mut user: Vec<u16> = "Google Calendar\0".encode_utf16().collect();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        CredentialBlob: bytes.as_mut_ptr(),
        CredentialBlobSize: bytes.len() as u32,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: PWSTR(user.as_mut_ptr()),
        ..Default::default()
    };
    unsafe {
        CredWriteW(&credential, 0)
            .map_err(|_| "Não foi possível salvar as credenciais do Google".into())
    }
}

fn open_authorization(url: &str) -> Result<(), String> {
    let wide = windows::core::HSTRING::from(url);
    let result = unsafe {
        windows::Win32::UI::Shell::ShellExecuteW(
            None,
            w!("open"),
            PCWSTR(wide.as_ptr()),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if result.0 as isize <= 32 {
        Err("Não foi possível abrir o navegador".into())
    } else {
        Ok(())
    }
}

fn random_string() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
}

fn callback_code(request: &str, expected_state: &str) -> Result<String, String> {
    let parts: Vec<_> = request
        .lines()
        .next()
        .unwrap_or_default()
        .split_whitespace()
        .collect();
    if parts.len() != 3 || parts[0] != "GET" || !parts[1].starts_with('/') {
        return Err("Callback inválido".into());
    }
    let url = url::Url::parse(&format!("http://127.0.0.1{}", parts[1]))
        .map_err(|_| "Callback inválido")?;
    if url.path() != "/google/callback" {
        return Err("Callback inválido".into());
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    let get = |key: &str| {
        let values: Vec<_> = pairs.iter().filter(|(k, _)| k == key).collect();
        if values.len() == 1 {
            Some(values[0].1.to_string())
        } else {
            None
        }
    };
    if get("state").as_deref() != Some(expected_state) {
        return Err("State inválido".into());
    }
    if get("error").is_some() {
        return Err("Autorização recusada".into());
    }
    get("code")
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Código ausente".into())
}

fn decode_tokens(
    value: Value,
    client_id: String,
    client_secret: String,
    previous_refresh: Option<String>,
) -> Result<Credentials, String> {
    if let Some(scope) = value["scope"].as_str() {
        if !scope.split_whitespace().any(|s| {
            s == SCOPE
                || s == "https://www.googleapis.com/auth/calendar.events"
                || s == "https://www.googleapis.com/auth/calendar"
        }) {
            return Err("Permissão do Google Calendar não concedida".into());
        }
    }
    Ok(Credentials {
        client_id,
        client_secret,
        access_token: value["access_token"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or("Token do Google ausente")?
            .into(),
        refresh_token: value["refresh_token"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(String::from)
            .or(previous_refresh)
            .ok_or("Google não forneceu refresh token; reconecte a conta")?,
        expires_at: crate::reminders::now()
            + value["expires_in"].as_u64().unwrap_or(3600).min(86400) as f64 * 1000.0,
    })
}

pub fn event_body(reminder: &Reminder) -> Result<Value, String> {
    let format = |ms: f64| -> Result<String, String> {
        if !ms.is_finite() || ms < 0.0 || ms > 253_402_300_799_999.0 {
            return Err("Data fora do intervalo do Google Calendar".into());
        }
        chrono::DateTime::from_timestamp_millis(ms as i64)
            .map(|time| time.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
            .ok_or_else(|| "Data inválida".into())
    };
    let start = format(reminder.original_at)?;
    let end = format(reminder.original_at + f64::from(reminder.event_duration_seconds) * 1000.0)?;
    Ok(json!({
        "id": reminder.id.replace('-', ""), "summary": reminder.message,
        "start": { "dateTime": start }, "end": { "dateTime": end },
        "reminders": { "useDefault": false },
        "extendedProperties": { "private": { "strataReminderId": reminder.id } }
    }))
}

impl GoogleCalendar {
    pub fn start() -> Self {
        let stored = read_credentials();
        Self {
            inner: Mutex::new(Inner {
                error: stored.as_ref().err().cloned(),
                credentials: stored.ok().flatten(),
                generation: 0,
                connecting: false,
            }),
            api_lock: Mutex::new(()),
            client: Client::builder()
                .timeout(Duration::from_secs(15))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("Google Calendar HTTP client"),
        }
    }

    pub fn status(&self) -> CalendarStatus {
        let inner = self.inner.lock().unwrap();
        CalendarStatus {
            connected: inner.credentials.is_some(),
            connecting: inner.connecting,
            error: inner.error.clone(),
        }
    }

    pub fn disconnect(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap();
        unsafe {
            match CredDeleteW(TARGET, CRED_TYPE_GENERIC, None) {
                Ok(()) => {}
                Err(e) if e.code() == windows::Win32::Foundation::ERROR_NOT_FOUND.to_hresult() => {}
                Err(_) => return Err("Não foi possível remover as credenciais do Google".into()),
            }
        }
        inner.generation += 1;
        inner.credentials = None;
        inner.connecting = false;
        inner.error = None;
        Ok(())
    }

    pub fn connect(&self, client_id: String, client_secret: String) -> Result<(), String> {
        if client_id.len() > 256
            || !client_id.ends_with(".apps.googleusercontent.com")
            || !client_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-._".contains(&b))
            || client_secret.len() > 256
        {
            return Err("Informe um Client ID OAuth do tipo Desktop válido".into());
        }
        let generation = {
            let mut i = self.inner.lock().unwrap();
            if i.connecting {
                return Err("Autorização já em andamento".into());
            }
            i.generation += 1;
            i.connecting = true;
            i.error = None;
            i.generation
        };
        let result = self.authorize(client_id, client_secret, generation);
        let mut i = self.inner.lock().unwrap();
        if i.generation != generation {
            return Err("Autorização cancelada".into());
        }
        i.connecting = false;
        match result.and_then(|c| {
            save_credentials(&c)?;
            Ok(c)
        }) {
            Ok(c) => {
                i.credentials = Some(c);
                Ok(())
            }
            Err(e) => {
                i.error = Some(e.clone());
                Err(e)
            }
        }
    }

    fn authorize(
        &self,
        client_id: String,
        client_secret: String,
        generation: u64,
    ) -> Result<Credentials, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|_| "Não foi possível abrir o callback local")?;
        listener
            .set_nonblocking(true)
            .map_err(|_| "Callback indisponível")?;
        let redirect = format!(
            "http://127.0.0.1:{}/google/callback",
            listener
                .local_addr()
                .map_err(|_| "Callback indisponível")?
                .port()
        );
        let state = random_string();
        let verifier = random_string();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let mut url = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
        url.query_pairs_mut().extend_pairs([
            ("client_id", client_id.as_str()),
            ("redirect_uri", &redirect),
            ("response_type", "code"),
            ("scope", SCOPE),
            ("state", &state),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ]);
        open_authorization(url.as_str())?;
        let deadline = Instant::now() + Duration::from_secs(180);
        while Instant::now() < deadline {
            if self.inner.lock().unwrap().generation != generation {
                return Err("Autorização cancelada".into());
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
                    let mut request = Vec::new();
                    let mut chunk = [0; 1024];
                    while request.len() < 8192 {
                        let size = match stream.read(&mut chunk) {
                            Ok(n) => n,
                            Err(_) => break,
                        };
                        if size == 0 {
                            break;
                        }
                        request.extend_from_slice(&chunk[..size]);
                        if request.windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    let code = callback_code(&String::from_utf8_lossy(&request), &state);
                    let body = if code.is_ok() {
                        "Autorizacao recebida. Volte ao Strata."
                    } else {
                        "Callback invalido."
                    };
                    let _ = write!(stream, "HTTP/1.1 {}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", if code.is_ok() {"200 OK"} else {"400 Bad Request"}, body.len(), body);
                    let code = match code {
                        Ok(c) => c,
                        Err(e) if e == "Autorização recusada" => return Err(e),
                        Err(_) => continue,
                    };
                    let response = self
                        .client
                        .post("https://oauth2.googleapis.com/token")
                        .form(&[
                            ("grant_type", "authorization_code"),
                            ("client_id", &client_id),
                            ("client_secret", &client_secret),
                            ("redirect_uri", &redirect),
                            ("code", &code),
                            ("code_verifier", &verifier),
                        ])
                        .send()
                        .map_err(|_| "Falha de conexão com o Google")?;
                    if !response.status().is_success() {
                        return Err(
                            "Google recusou a autorização; confira as credenciais Desktop".into(),
                        );
                    }
                    return decode_tokens(
                        response.json().map_err(|_| "Resposta inválida do Google")?,
                        client_id,
                        client_secret,
                        None,
                    );
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100))
                }
                Err(_) => return Err("Callback local indisponível".into()),
            }
        }
        Err("Autorização expirou; tente conectar novamente".into())
    }

    fn access(&self, force: bool) -> Result<(u64, String), String> {
        let (generation, old) = {
            let i = self.inner.lock().unwrap();
            (
                i.generation,
                i.credentials
                    .clone()
                    .ok_or("Conecte sua conta Google Calendar")?,
            )
        };
        if !force && old.expires_at > crate::reminders::now() + 60_000.0 {
            return Ok((generation, old.access_token));
        }
        let response = self
            .client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", &old.client_id),
                ("client_secret", &old.client_secret),
                ("refresh_token", &old.refresh_token),
            ])
            .send()
            .map_err(|_| "Google indisponível; o lembrete local continua ativo")?;
        if !response.status().is_success() {
            return Err("Não foi possível renovar o acesso ao Google; reconecte a conta".into());
        }
        let credentials = decode_tokens(
            response.json().map_err(|_| "Resposta inválida do Google")?,
            old.client_id,
            old.client_secret,
            Some(old.refresh_token),
        )?;
        let mut i = self.inner.lock().unwrap();
        if i.generation != generation {
            return Err("Conta Google alterada durante a operação".into());
        }
        save_credentials(&credentials)?;
        let token = credentials.access_token.clone();
        i.credentials = Some(credentials);
        Ok((generation, token))
    }

    pub fn create_event(&self, reminder: &Reminder) -> Result<String, String> {
        let _api = self.api_lock.lock().unwrap();
        let body = event_body(reminder)?;
        let id = reminder.id.replace('-', "");
        for retry in 0..2 {
            let (generation, token) = self.access(retry != 0)?;
            let response = self
                .client
                .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
                .bearer_auth(&token)
                .json(&body)
                .send()
                .map_err(|_| "Google indisponível; tente sincronizar novamente")?;
            if self.inner.lock().unwrap().generation != generation {
                return Err("Conta Google alterada durante a operação".into());
            }
            if response.status().as_u16() == 401 && retry == 0 {
                continue;
            }
            if response.status().as_u16() == 409 {
                let existing = self
                    .client
                    .get(format!(
                        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{id}"
                    ))
                    .bearer_auth(&token)
                    .send()
                    .map_err(|_| "Não foi possível confirmar o evento existente")?;
                if existing.status().is_success() {
                    let value: Value = existing.json().map_err(|_| "Evento Google inválido")?;
                    if value["extendedProperties"]["private"]["strataReminderId"] == reminder.id {
                        return Ok(id);
                    }
                }
                return Err("Conflito ao criar evento Google".into());
            }
            if !response.status().is_success() {
                return Err(format!(
                    "Google Calendar retornou HTTP {}; o lembrete local continua ativo",
                    response.status().as_u16()
                ));
            }
            let value: Value = response
                .json()
                .map_err(|_| "Resposta inválida do Google Calendar")?;
            if value["id"].as_str() != Some(id.as_str()) {
                return Err("ID do evento Google inválido".into());
            }
            return Ok(id);
        }
        Err("Acesso ao Google expirou; reconecte a conta".into())
    }
}

#[tauri::command]
pub fn calendar_status(
    window: tauri::WebviewWindow,
    state: tauri::State<GoogleCalendar>,
) -> Result<CalendarStatus, String> {
    crate::reminders::authorize(&window)?;
    Ok(state.status())
}

#[tauri::command]
pub async fn calendar_connect(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<CalendarStatus, String> {
    use tauri::Manager;
    crate::reminders::authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let calendar = app.state::<GoogleCalendar>();
        calendar.connect(client_id.trim().into(), client_secret.trim().into())?;
        Ok(calendar.status())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn calendar_disconnect(
    window: tauri::WebviewWindow,
    state: tauri::State<GoogleCalendar>,
) -> Result<CalendarStatus, String> {
    crate::reminders::authorize(&window)?;
    state.disconnect()?;
    Ok(state.status())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reminders_contract::{ReminderMode, ReminderStatus};

    #[test]
    fn callbacks_require_unique_state_code_and_expected_path() {
        assert_eq!(
            callback_code("GET /google/callback?state=abc&code=ok HTTP/1.1\r\n", "abc").unwrap(),
            "ok"
        );
        for path in [
            "/google/callback?state=no&code=ok",
            "/google/callback?state=abc&state=abc&code=ok",
            "/other?state=abc&code=ok",
            "/google/callback?state=abc&code=a&code=b",
            "/google/callback?state=abc&error=access_denied",
        ] {
            assert!(callback_code(&format!("GET {path} HTTP/1.1\r\n"), "abc").is_err());
        }
    }

    #[test]
    fn event_uses_original_utc_time_duration_and_stable_id_even_after_snooze() {
        let mut r = Reminder {
            id: "660e8400-e29b-41d4-a716-446655440000".into(),
            message: "Tea".into(),
            mode: ReminderMode::Duration { seconds: 60 },
            original_at: 1_700_000_000_000.0,
            notify_at: 1_700_000_600_000.0,
            event_duration_seconds: 300,
            status: ReminderStatus::Scheduled,
            created_at: 0.0,
            updated_at: 0.0,
            google_event_id: None,
            calendar_requested: true,
            calendar_error: None,
        };
        let event = event_body(&r).unwrap();
        assert_eq!(event["start"]["dateTime"], "2023-11-14T22:13:20.000Z");
        assert_eq!(event["end"]["dateTime"], "2023-11-14T22:18:20.000Z");
        assert_eq!(event["id"], "660e8400e29b41d4a716446655440000");
        r.mode = ReminderMode::DateTime;
        r.event_duration_seconds = 3600;
        assert_eq!(
            event_body(&r).unwrap()["end"]["dateTime"],
            "2023-11-14T23:13:20.000Z"
        );
        r.original_at = f64::INFINITY;
        assert!(event_body(&r).is_err());
    }

    #[test]
    fn refresh_retains_refresh_token_and_checks_granted_scope() {
        let c = decode_tokens(
            json!({"access_token":"a", "expires_in":3600, "scope":SCOPE}),
            "id".into(),
            "secret".into(),
            Some("r".into()),
        )
        .unwrap();
        assert_eq!(c.refresh_token, "r");
        assert!(decode_tokens(
            json!({"access_token":"a", "refresh_token":"r", "scope":"email"}),
            "id".into(),
            "".into(),
            None
        )
        .is_err());
        assert!(decode_tokens(json!({"access_token":"a"}), "id".into(), "".into(), None).is_err());
    }
}
