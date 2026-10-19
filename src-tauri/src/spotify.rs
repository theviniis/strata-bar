//! Spotify account integration. Credentials and HTTP never enter a WebView.
use crate::media_contract::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use reqwest::{
    blocking::{Client, Response},
    Method,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use windows::{
    core::{w, PWSTR},
    Win32::Security::Credentials::*,
};

pub const REDIRECT: &str = "http://127.0.0.1:43821/spotify/callback";

/// Fixed destination only; no URL or executable is supplied by the WebView.
pub fn open_dashboard() -> Result<(), String> {
    let opened = unsafe {
        windows::Win32::UI::Shell::ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::w!("https://developer.spotify.com/dashboard/create"),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if opened.0 as isize <= 32 {
        Err("Não foi possível abrir o painel do Spotify no navegador".into())
    } else {
        Ok(())
    }
}
const TARGET: windows::core::PCWSTR = w!("Strata/Spotify/v1");
#[derive(Clone, Serialize, Deserialize)]
struct Credentials {
    client_id: String,
    access_token: String,
    refresh_token: String,
    expires_at: u64,
}
struct Inner {
    stopped: bool,
    active: Option<(String, String)>,
    generation: u64,
    credentials: Option<Credentials>,
    status: SpotifyStatus,
    cache: Option<(String, String, String, bool)>,
    availability: MediaAvailability,
    retry_at: Instant,
    failures: u32,
}
#[derive(Clone)]
pub struct Spotify {
    inner: Arc<Mutex<Inner>>,
    tx: mpsc::SyncSender<MediaData>,
    client: Client,
    api_lock: Arc<Mutex<()>>,
    store: Arc<dyn CredentialStore>,
}
trait CredentialStore: Send + Sync {
    fn read(&self) -> Option<Credentials>;
    fn write(&self, value: &Credentials) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}
struct WindowsCredentials;
impl CredentialStore for WindowsCredentials {
    fn read(&self) -> Option<Credentials> {
        credential_read()
    }
    fn write(&self, value: &Credentials) -> Result<(), String> {
        credential_write(value)
    }
    fn delete(&self) -> Result<(), String> {
        credential_delete()
    }
}
fn now() -> u64 {
    (crate::metrics::timestamp() / 1000) as u64
}
fn http_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("Spotify HTTP client")
}
fn api_request(
    client: &Client,
    method: Method,
    path: &str,
    query: &[(&str, &str)],
    token: &str,
) -> reqwest::blocking::RequestBuilder {
    let empty_mutation = method == Method::PUT || method == Method::DELETE;
    let request = client
        .request(method, format!("https://api.spotify.com/v1/{path}"))
        .bearer_auth(token)
        .query(query);
    // These endpoints carry their arguments in the query, but HTTP gateways can
    // reject a bodyless mutation with 411 unless its length is explicit.
    if empty_mutation {
        request.header(reqwest::header::CONTENT_LENGTH, "0")
    } else {
        request
    }
}
fn secure_random() -> String {
    let mut bytes = [0; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
fn credential_read() -> Option<Credentials> {
    unsafe {
        let mut ptr = std::ptr::null_mut();
        CredReadW(TARGET, CRED_TYPE_GENERIC, None, &mut ptr).ok()?;
        let result = if (*ptr).CredentialBlob.is_null() || (*ptr).CredentialBlobSize == 0 {
            None
        } else {
            serde_json::from_slice(std::slice::from_raw_parts(
                (*ptr).CredentialBlob,
                (*ptr).CredentialBlobSize as usize,
            ))
            .ok()
        };
        CredFree(ptr.cast());
        result
    }
}
fn credential_write(value: &Credentials) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(value).map_err(|_| "Cannot encode credentials")?;
    if bytes.len() > 2560 {
        return Err("Spotify credentials exceed Windows credential storage limit".into());
    }
    let mut target = "Strata/Spotify/v1\0".encode_utf16().collect::<Vec<_>>();
    let mut user = "Spotify\0".encode_utf16().collect::<Vec<_>>();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        CredentialBlobSize: bytes.len() as u32,
        CredentialBlob: bytes.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: PWSTR(user.as_mut_ptr()),
        ..Default::default()
    };
    unsafe { CredWriteW(&credential, 0).map_err(|_| "Cannot save Spotify credentials".into()) }
}
fn credential_delete() -> Result<(), String> {
    unsafe {
        match CredDeleteW(TARGET, CRED_TYPE_GENERIC, None) {
            Ok(()) => Ok(()),
            Err(e) if e.code() == windows::Win32::Foundation::ERROR_NOT_FOUND.to_hresult() => {
                Ok(())
            }
            Err(_) => Err("Cannot remove Spotify credentials".into()),
        }
    }
}
fn callback_code(request: &str, expected_state: &str) -> Result<String, String> {
    let first = request.lines().next().ok_or("Invalid OAuth callback")?;
    let parts = first.split_whitespace().collect::<Vec<_>>();
    if parts.len() != 3 || parts[0] != "GET" || !parts[1].starts_with('/') {
        return Err("Invalid OAuth callback".into());
    }
    let url = url::Url::parse(&format!("http://127.0.0.1:43821{}", parts[1]))
        .map_err(|_| "Invalid OAuth callback")?;
    if url.path() != "/spotify/callback" {
        return Err("Invalid OAuth path".into());
    }
    let pairs = url.query_pairs().collect::<Vec<_>>();
    let get = |key: &str| {
        let values = pairs.iter().filter(|(k, _)| k == key).collect::<Vec<_>>();
        if values.len() == 1 {
            Some(values[0].1.to_string())
        } else {
            None
        }
    };
    if get("state").as_deref() != Some(expected_state) {
        return Err("OAuth state mismatch".into());
    }
    if get("error").is_some() {
        return Err("Spotify authorization denied".into());
    }
    get("code")
        .filter(|v| !v.is_empty())
        .ok_or("Missing OAuth code".into())
}
fn tokens(
    response: Value,
    client_id: String,
    old_refresh: Option<String>,
) -> Result<Credentials, String> {
    Ok(Credentials {
        client_id,
        access_token: response["access_token"]
            .as_str()
            .ok_or("Missing access token")?
            .into(),
        refresh_token: response["refresh_token"]
            .as_str()
            .map(str::to_string)
            .or(old_refresh)
            .ok_or("Missing refresh token")?,
        expires_at: now() + response["expires_in"].as_u64().unwrap_or(3600),
    })
}
impl Spotify {
    pub fn start() -> Self {
        Self::with_store(Arc::new(WindowsCredentials))
    }
    fn with_store(store: Arc<dyn CredentialStore>) -> Self {
        let credentials = store.read();
        let availability = if credentials.is_some() {
            MediaAvailability::Unavailable
        } else {
            MediaAvailability::Unauthenticated
        };
        let (tx, rx) = mpsc::sync_channel(1);
        let this = Self {
            inner: Arc::new(Mutex::new(Inner {
                stopped: false,
                active: None,
                generation: 0,
                status: SpotifyStatus {
                    state: if credentials.is_some() {
                        "connected"
                    } else {
                        "disconnected"
                    }
                    .into(),
                    client_id: credentials
                        .as_ref()
                        .map(|v| v.client_id.clone())
                        .unwrap_or_default(),
                    error: None,
                },
                credentials,
                cache: None,
                availability,
                retry_at: Instant::now(),
                failures: 0,
            })),
            tx,
            api_lock: Arc::new(Mutex::new(())),
            client: http_client(),
            store,
        };
        let worker = this.clone();
        std::thread::spawn(move || loop {
            if worker.inner.lock().unwrap().stopped {
                break;
            }
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(data) => worker.refresh(&data),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(_) => break,
            }
        });
        this
    }
    pub fn status(&self) -> SpotifyStatus {
        self.inner.lock().unwrap().status.clone()
    }
    pub fn disconnect(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap();
        self.store.delete()?;
        inner.generation += 1;
        inner.credentials = None;
        inner.cache = None;
        inner.availability = MediaAvailability::Unauthenticated;
        inner.status = SpotifyStatus {
            state: "disconnected".into(),
            client_id: inner.status.client_id.clone(),
            error: None,
        };
        Ok(())
    }
    pub fn stop(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.generation += 1;
        inner.cache = None;
        inner.stopped = true;
    }
    pub fn connect(&self, client_id: String) -> Result<(), String> {
        if client_id.len() != 32 || !client_id.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("Client ID must contain 32 hexadecimal characters".into());
        }
        let listener = TcpListener::bind("127.0.0.1:43821")
            .map_err(|_| "Spotify callback port 43821 is in use")?;
        listener
            .set_nonblocking(true)
            .map_err(|_| "Cannot initialize OAuth listener")?;
        let generation = {
            let mut inner = self.inner.lock().unwrap();
            self.store.delete()?;
            inner.generation += 1;
            inner.credentials = None;
            inner.cache = None;
            inner.availability = MediaAvailability::Unauthenticated;
            inner.status = SpotifyStatus {
                state: "connecting".into(),
                client_id: client_id.clone(),
                error: None,
            };
            inner.generation
        };
        let this = self.clone();
        std::thread::spawn(move || {
            let result = this.authorize(listener, client_id, generation);
            let mut inner = this.inner.lock().unwrap();
            if inner.generation != generation {
                return;
            }
            match result {
                Ok(credentials) => match this.store.write(&credentials) {
                    Ok(()) => {
                        inner.credentials = Some(credentials);
                        inner.status.state = "connected".into();
                        inner.status.error = None;
                        inner.availability = MediaAvailability::Unavailable;
                        inner.retry_at = Instant::now();
                    }
                    Err(e) => {
                        inner.status.state = "error".into();
                        inner.status.error = Some(e);
                    }
                },
                Err(e) => {
                    inner.status.state = "error".into();
                    inner.status.error = Some(e);
                }
            }
        });
        Ok(())
    }
    fn authorize(
        &self,
        listener: TcpListener,
        client_id: String,
        generation: u64,
    ) -> Result<Credentials, String> {
        let state = secure_random();
        let verifier = secure_random();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let mut url = url::Url::parse("https://accounts.spotify.com/authorize").unwrap();
        url.query_pairs_mut().extend_pairs([("client_id",client_id.as_str()),("response_type","code"),("redirect_uri",REDIRECT),("state",&state),("code_challenge_method","S256"),("code_challenge",&challenge),("scope","user-read-playback-state user-read-currently-playing user-library-read user-library-modify")]);
        let wide = windows::core::HSTRING::from(url.as_str());
        let opened = unsafe {
            windows::Win32::UI::Shell::ShellExecuteW(
                None,
                w!("open"),
                windows::core::PCWSTR(wide.as_ptr()),
                None,
                None,
                windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
            )
        };
        if opened.0 as isize <= 32 {
            return Err("Cannot open Spotify authorization in the browser".into());
        }
        let until = Instant::now() + Duration::from_secs(180);
        while Instant::now() < until {
            if self.inner.lock().unwrap().generation != generation {
                return Err("Authorization cancelled".into());
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
                    stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
                    let mut request = Vec::new();
                    let mut chunk = [0u8; 1024];
                    while request.len() < 8192 {
                        let n = stream
                            .read(&mut chunk)
                            .map_err(|_| "Cannot read OAuth callback")?;
                        if n == 0 {
                            break;
                        }
                        request.extend_from_slice(&chunk[..n]);
                        if request.windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    let code = callback_code(&String::from_utf8_lossy(&request), &state);
                    let body = if code.is_ok() {
                        "Spotify authorization received. You can close this tab."
                    } else {
                        "Invalid authorization callback."
                    };
                    let _=write!(stream,"HTTP/1.1 {}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",if code.is_ok(){"200 OK"}else{"400 Bad Request"},body.len(),body);
                    let code = match code {
                        Ok(code) => code,
                        Err(e) if e == "Spotify authorization denied" => return Err(e),
                        Err(_) => continue,
                    };
                    let response = self
                        .client
                        .post("https://accounts.spotify.com/api/token")
                        .form(&[
                            ("grant_type", "authorization_code"),
                            ("client_id", &client_id),
                            ("code", &code),
                            ("redirect_uri", REDIRECT),
                            ("code_verifier", &verifier),
                        ])
                        .send()
                        .map_err(|_| "Spotify token request failed")?;
                    if !response.status().is_success() {
                        return Err("Spotify rejected authorization".into());
                    }
                    return tokens(
                        response
                            .json()
                            .map_err(|_| "Invalid Spotify token response")?,
                        client_id,
                        None,
                    );
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100))
                }
                Err(_) => return Err("Spotify callback listener failed".into()),
            }
        }
        Err("Spotify authorization timed out".into())
    }
    fn access(&self) -> Result<(u64, String), String> {
        let (generation, credentials) = {
            let i = self.inner.lock().unwrap();
            (
                i.generation,
                i.credentials.clone().ok_or("Spotify is not connected")?,
            )
        };
        if credentials.expires_at > now() + 60 {
            return Ok((generation, credentials.access_token));
        }
        let response = self
            .client
            .post("https://accounts.spotify.com/api/token")
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", &credentials.client_id),
                ("refresh_token", &credentials.refresh_token),
            ])
            .send()
            .map_err(|_| "Spotify refresh request failed")?;
        let response = self.check(response, generation)?;
        let credentials = tokens(
            response
                .json()
                .map_err(|_| "Invalid Spotify refresh response")?,
            credentials.client_id,
            Some(credentials.refresh_token),
        )?;
        let mut inner = self.inner.lock().unwrap();
        if inner.generation != generation {
            return Err("Spotify connection changed".into());
        }
        self.store.write(&credentials)?;
        inner.credentials = Some(credentials.clone());
        Ok((generation, credentials.access_token))
    }
    fn check(&self, response: Response, generation: u64) -> Result<Response, String> {
        if response.status().is_success() {
            return Ok(response);
        }
        let code = response.status().as_u16();
        let retry = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(30)
            .clamp(1, 86400);
        let mut inner = self.inner.lock().unwrap();
        if inner.generation != generation {
            return Err("Spotify connection changed".into());
        }
        inner.cache = None;
        inner.availability = if code == 401 {
            MediaAvailability::Unauthenticated
        } else {
            MediaAvailability::Error
        };
        if code == 401 {
            if let Some(c) = inner.credentials.as_mut() {
                c.expires_at = 0;
            }
        }
        if code == 400 {
            inner.credentials = None;
            inner.availability = MediaAvailability::Unauthenticated;
            inner.status.state = "error".into();
        }
        inner.retry_at = Instant::now() + Duration::from_secs(if code == 429 { retry } else { 30 });
        let message = match code {
            400 | 401 => "Spotify authentication needs renewal",
            403 => "Spotify denied access; check app permissions and account eligibility",
            429 => "Spotify rate limit reached",
            _ => "Spotify service request failed",
        };
        let message = format!("{message} (HTTP {code})");
        inner.status.error = Some(message.clone());
        Err(message)
    }
    fn request(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        generation: u64,
        token: &str,
    ) -> Result<Value, String> {
        if self.inner.lock().unwrap().generation != generation {
            return Err("Spotify connection changed".into());
        }
        let expects_body = method == Method::GET;
        let response = api_request(&self.client, method, path, query, token)
            .send()
            .map_err(|_| "Spotify network unavailable")?;
        let response = self.check(response, generation)?;
        if response.status().as_u16() == 204 || !expects_body {
            return Ok(Value::Null);
        }
        response
            .json()
            .map_err(|_| "Invalid Spotify response".into())
    }
    pub fn invalidate(&self) {
        let mut i = self.inner.lock().unwrap();
        i.active = None;
        i.cache = None;
    }
    pub fn enqueue(&self, data: &MediaData) {
        if !is_spotify(&data.player_id) {
            self.invalidate();
            return;
        }
        {
            let mut i = self.inner.lock().unwrap();
            let identity = (data.session_id.clone(), data.track_id.clone());
            if i.active.as_ref() != Some(&identity) {
                i.active = Some(identity);
                i.cache = None;
            }
            if i.stopped || i.credentials.is_none() || Instant::now() < i.retry_at {
                return;
            }
        }
        let _ = self.tx.try_send(data.clone());
    }
    fn refresh(&self, data: &MediaData) {
        let _api = self.api_lock.lock().unwrap();
        let generation = self.inner.lock().unwrap().generation;
        {
            let mut i = self.inner.lock().unwrap();
            if i.stopped
                || i.active.as_ref() != Some(&(data.session_id.clone(), data.track_id.clone()))
                || i.credentials.is_none()
                || Instant::now() < i.retry_at
            {
                return;
            }
            i.retry_at = Instant::now() + Duration::from_secs(5);
        }
        let result = (|| {
            let (generation, token) = self.access()?;
            let playback = self.request(Method::GET, "me/player", &[], generation, &token)?;
            let uri = correlate(data, &playback)
                .ok_or("Spotify playback does not match the local session")?;
            let cached = {
                let i = self.inner.lock().unwrap();
                i.cache.clone()
            };
            let saved = if let Some((_, _, _, saved)) = cached
                .filter(|(s, t, u, _)| s == &data.session_id && t == &data.track_id && u == &uri)
            {
                saved
            } else {
                self.request(
                    Method::GET,
                    "me/library/contains",
                    &[("uris", &uri)],
                    generation,
                    &token,
                )?
                .get(0)
                .and_then(Value::as_bool)
                .ok_or("Invalid Spotify library response")?
            };
            let mut i = self.inner.lock().unwrap();
            if i.generation == generation
                && i.active.as_ref() == Some(&(data.session_id.clone(), data.track_id.clone()))
            {
                i.cache = Some((data.session_id.clone(), data.track_id.clone(), uri, saved));
                i.availability = MediaAvailability::Ready;
                i.retry_at = Instant::now() + Duration::from_secs(5);
                i.failures = 0;
                i.status.error = None;
            }
            Ok::<_, String>(())
        })();
        if let Err(error) = result {
            let mut i = self.inner.lock().unwrap();
            if i.generation != generation
                || i.active.as_ref() != Some(&(data.session_id.clone(), data.track_id.clone()))
            {
                return;
            }
            i.cache = None;
            i.failures = (i.failures + 1).min(6);
            if error == "Spotify playback does not match the local session" {
                i.availability = MediaAvailability::Unavailable;
                i.failures = 0;
                i.retry_at = Instant::now() + Duration::from_secs(5);
                i.status.error = None;
                return;
            } else if i.availability != MediaAvailability::Unauthenticated {
                i.availability = MediaAvailability::Error;
            }
            let delay = Duration::from_secs(5 * 2u64.pow(i.failures));
            i.retry_at = i.retry_at.max(Instant::now() + delay);
            i.status.error = Some(error);
        }
    }
    pub fn enrich(&self, data: &mut MediaData) {
        if !is_spotify(&data.player_id) {
            return;
        }
        let i = self.inner.lock().unwrap();
        if let Some((_, _, uri, saved)) = i
            .cache
            .as_ref()
            .filter(|(s, t, _, _)| s == &data.session_id && t == &data.track_id)
        {
            data.spotify_uri = Some(uri.clone());
            data.favorite = MediaValue::ready(*saved);
            data.capabilities.favorite = true;
        } else {
            data.favorite = MediaValue::absent(
                if i.credentials.is_none() {
                    MediaAvailability::Unauthenticated
                } else {
                    i.availability.clone()
                },
                i.status
                    .error
                    .as_deref()
                    .unwrap_or("Spotify track has not been securely correlated"),
            );
        }
    }
    pub fn favorite(&self, data: &MediaData, saved: bool) -> Result<(), String> {
        let _api = self
            .api_lock
            .try_lock()
            .map_err(|_| "Spotify request in progress; try again")?;
        {
            let i = self.inner.lock().unwrap();
            if i.stopped
                || i.active.as_ref() != Some(&(data.session_id.clone(), data.track_id.clone()))
            {
                return Err("Media session or track changed".into());
            }
            if Instant::now() < i.retry_at && i.status.error.is_some() {
                return Err("Spotify requests are backing off".into());
            }
        }
        let (generation, token) = self.access()?;
        let playback = self.request(Method::GET, "me/player", &[], generation, &token)?;
        let uri = correlate(data, &playback).ok_or("Spotify track changed or does not match")?;
        if data.spotify_uri.as_deref() != Some(&uri) {
            return Err("Spotify track identity changed".into());
        }
        self.request(
            if saved { Method::PUT } else { Method::DELETE },
            "me/library",
            &[("uris", &uri)],
            generation,
            &token,
        )?;
        let confirmed = self
            .request(
                Method::GET,
                "me/library/contains",
                &[("uris", &uri)],
                generation,
                &token,
            )?
            .get(0)
            .and_then(Value::as_bool)
            .ok_or("Cannot confirm Spotify favorite")?;
        let mut i = self.inner.lock().unwrap();
        if i.generation != generation {
            return Err("Spotify connection changed".into());
        }
        i.cache = Some((
            data.session_id.clone(),
            data.track_id.clone(),
            uri,
            confirmed,
        ));
        Ok(())
    }
}
pub fn is_spotify(id: &str) -> bool {
    let id = id.to_ascii_lowercase();
    id == "spotify.exe"
        || id == "spotify"
        || id.starts_with("spotifyab.spotifymusic_")
        || id == "spotatui.exe"
}
// GSMTC provides no track URI. Require an identified Spotify app plus agreement on
// all metadata, duration, playback state and timeline before using the Web API URI.
fn correlate(data: &MediaData, playback: &Value) -> Option<String> {
    if !is_spotify(&data.player_id)
        || data.title.is_empty()
        || data.artist.is_empty()
        || data.album.is_empty()
    {
        return None;
    }
    let item = &playback["item"];
    let progress = data.progress.value.as_ref()?;
    let artist = item["artists"]
        .as_array()?
        .iter()
        .filter_map(|a| a["name"].as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let elapsed =
        (crate::metrics::timestamp() as f64 - progress.measured_at).max(0.) * progress.rate;
    if item["name"].as_str() != Some(&data.title)
        || item["album"]["name"].as_str() != Some(&data.album)
        || artist != data.artist
        || (item["duration_ms"].as_f64()? - progress.duration_ms).abs() > 2000.
        || (playback["progress_ms"].as_f64()?
            - (progress.position_ms + elapsed).clamp(0., progress.duration_ms))
        .abs()
            > 5000.
        || playback["is_playing"].as_bool()? != (data.playback == "playing")
    {
        return None;
    }
    let uri = item["uri"].as_str()?;
    if !uri.starts_with("spotify:track:")
        || uri.len() != 36
        || !uri[14..].bytes().all(|c| c.is_ascii_alphanumeric())
    {
        return None;
    }
    Some(uri.into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn library_mutations_send_explicit_zero_content_length() {
        for method in [Method::PUT, Method::DELETE] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut bytes = Vec::new();
                while !bytes.ends_with(b"\r\n\r\n") {
                    let mut byte = [0];
                    assert_eq!(stream.read(&mut byte).unwrap(), 1);
                    bytes.push(byte[0]);
                }
                let headers = String::from_utf8(bytes).unwrap().to_ascii_lowercase();
                let status = if headers.contains("\r\ncontent-length: 0\r\n") {
                    "200 OK"
                } else {
                    "411 Length Required"
                };
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
                .unwrap();
            });
            let client = http_client();
            let mut request = api_request(
                &client,
                method.clone(),
                "me/library",
                &[("uris", "spotify:track:0123456789012345678901")],
                "test-token",
            )
            .build()
            .unwrap();
            *request.url_mut() =
                url::Url::parse(&format!("http://{address}/v1/me/library")).unwrap();
            let response = client.execute(request).unwrap();
            server.join().unwrap();
            let spotify = Spotify::with_store(Arc::new(MemoryStore::default()));
            let result = spotify.check(response, 0);
            spotify.stop();
            assert!(result.is_ok(), "{method}: {}", result.unwrap_err());
        }
    }
    #[derive(Default)]
    struct MemoryStore(Mutex<Option<Credentials>>);
    impl CredentialStore for MemoryStore {
        fn read(&self) -> Option<Credentials> {
            self.0.lock().unwrap().clone()
        }
        fn write(&self, value: &Credentials) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(value.clone());
            Ok(())
        }
        fn delete(&self) -> Result<(), String> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }
    #[test]
    fn disconnect_removes_credentials_and_invalidates_old_jobs_without_exposing_tokens() {
        let store = Arc::new(MemoryStore::default());
        store
            .write(&Credentials {
                client_id: "test-client".into(),
                access_token: "private-access".into(),
                refresh_token: "private-refresh".into(),
                expires_at: now() + 3600,
            })
            .unwrap();
        let spotify = Spotify::with_store(store.clone());
        assert_eq!(spotify.status().state, "connected");
        let public = serde_json::to_string(&spotify.status()).unwrap();
        assert!(!public.contains("private-"));
        spotify.disconnect().unwrap();
        spotify.disconnect().unwrap();
        assert!(store.read().is_none());
        assert_eq!(spotify.status().state, "disconnected");
        assert_eq!(spotify.inner.lock().unwrap().generation, 2);
        spotify.stop();
    }
    #[test]
    fn http_failures_obey_rate_limits_and_keep_authentication_distinct() {
        for code in [401, 403, 429] {
            let spotify = Spotify::with_store(Arc::new(MemoryStore::default()));
            let response = Response::from(
                http::Response::builder()
                    .status(code)
                    .header("retry-after", "120")
                    .body("do-not-expose-this-body")
                    .unwrap(),
            );
            let before = Instant::now();
            let error = spotify.check(response, 0).unwrap_err();
            assert!(!error.contains("do-not-expose"));
            let inner = spotify.inner.lock().unwrap();
            assert_eq!(
                inner.availability,
                if code == 401 {
                    MediaAvailability::Unauthenticated
                } else {
                    MediaAvailability::Error
                }
            );
            assert!(
                inner.retry_at >= before + Duration::from_secs(if code == 429 { 120 } else { 30 })
            );
            drop(inner);
            spotify.stop();
        }
    }
    #[test]
    fn late_response_cannot_restore_disconnected_account() {
        let spotify = Spotify::with_store(Arc::new(MemoryStore::default()));
        spotify.disconnect().unwrap();
        let response = Response::from(http::Response::builder().status(403).body("").unwrap());
        assert!(spotify.check(response, 0).unwrap_err().contains("changed"));
        assert_eq!(spotify.status().state, "disconnected");
        spotify.stop();
    }
    #[test]
    fn callback_checks_state_and_path() {
        assert_eq!(
            callback_code(
                "GET /spotify/callback?state=abc&code=xyz HTTP/1.1\r\n",
                "abc"
            )
            .unwrap(),
            "xyz"
        );
        for request in [
            "GET /spotify/callback?state=bad&code=x HTTP/1.1",
            "GET /wrong?state=abc&code=x HTTP/1.1",
            "GET /spotify/callback?state=abc&state=abc&code=x HTTP/1.1",
            "POST /spotify/callback?state=abc&code=x HTTP/1.1",
        ] {
            assert!(callback_code(request, "abc").is_err());
        }
    }
    #[test]
    fn pkce_rfc_vector() {
        assert_eq!(
            URL_SAFE_NO_PAD.encode(Sha256::digest(
                b"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
            )),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
    #[test]
    fn spotify_detection_is_not_substring() {
        assert!(is_spotify("Spotify.exe"));
        assert!(is_spotify("spotatui.exe"));
        assert!(!is_spotify("fake-spotify.exe"));
        assert!(!is_spotify("chrome.exe"));
    }
    fn playback() -> Value {
        serde_json::json!({"is_playing":true,"progress_ms":32000,"item":{"name":"Dragonaut","artists":[{"name":"Sleep"}],"album":{"name":"Holy Mountain"},"duration_ms":343000,"uri":"spotify:track:0123456789012345678901"}})
    }
    #[test]
    fn correlation_requires_more_than_title_artist() {
        let data = fixture();
        let good = playback();
        assert!(correlate(&data, &good).is_some());
        for bad in ["album", "duration", "position", "state", "uri"] {
            let mut value = playback();
            match bad {
                "album" => value["item"]["album"]["name"] = "Other edition".into(),
                "duration" => value["item"]["duration_ms"] = 10000.into(),
                "position" => value["progress_ms"] = 90000.into(),
                "state" => value["is_playing"] = false.into(),
                _ => value["item"]["uri"] = "https://example.com".into(),
            };
            assert!(correlate(&data, &value).is_none());
        }
        let mut browser = fixture();
        browser.player_id = "chrome.exe".into();
        assert!(correlate(&browser, &good).is_none());
    }
    #[test]
    fn refresh_retains_rotated_or_previous_refresh_token() {
        let credentials = tokens(
            serde_json::json!({"access_token":"test-access","expires_in":3600}),
            "id".into(),
            Some("old-refresh".into()),
        )
        .unwrap();
        assert_eq!(credentials.refresh_token, "old-refresh");
        let credentials = tokens(
            serde_json::json!({"access_token":"test-access","refresh_token":"rotated"}),
            "id".into(),
            Some("old".into()),
        )
        .unwrap();
        assert_eq!(credentials.refresh_token, "rotated");
        assert!(tokens(Value::Null, "id".into(), None).is_err());
    }
}
