use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    ffi::OsString,
    io::Read,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::{
            CloseHandle, GetLastError, ERROR_NO_DATA, ERROR_PIPE_CONNECTED, ERROR_PIPE_LISTENING,
            HANDLE,
        },
        Graphics::Gdi::{MonitorFromWindow, MONITOR_DEFAULTTONEAREST},
        Storage::FileSystem::{ReadFile, PIPE_ACCESS_DUPLEX},
        System::Pipes::{
            ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, PeekNamedPipe,
            SetNamedPipeHandleState, PIPE_NOWAIT, PIPE_READMODE_MESSAGE, PIPE_TYPE_MESSAGE,
            PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
        },
    },
};

use crate::metrics::envelope;

/// `CREATE_NO_WINDOW`: never flash a console for a komorebic helper.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PIPE_BUFFER: u32 = 64 * 1024;
const RECONNECT_DELAY: Duration = Duration::from_secs(3);
const RETRY_DELAY: Duration = Duration::from_secs(5);
/// How often the idle watcher checks whether a bar has subscribed.
const IDLE_DELAY: Duration = Duration::from_millis(500);

/// Minimal, tolerant mirror of the komorebi `State` fields the widget needs.
#[derive(Clone, Default, Deserialize)]
struct Ring<T> {
    #[serde(default)]
    elements: Vec<T>,
    #[serde(default)]
    focused: usize,
}
#[derive(Clone, Default, Deserialize)]
struct Container {
    #[serde(default)]
    windows: Ring<Value>,
}
#[derive(Clone, Default, Deserialize)]
struct Workspace {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    containers: Ring<Container>,
    #[serde(default)]
    monocle_container: Option<Value>,
    #[serde(default)]
    maximized_window: Option<Value>,
    #[serde(default)]
    floating_windows: Ring<Value>,
    #[serde(default)]
    layer: Option<String>,
}
#[derive(Clone, Default, Deserialize)]
struct MonitorState {
    #[serde(default)]
    id: i64,
    #[serde(default)]
    workspaces: Ring<Workspace>,
}
#[derive(Clone, Default, Deserialize)]
struct State {
    #[serde(default)]
    monitors: Ring<MonitorState>,
    #[serde(default)]
    float_override: bool,
}

fn workspace_windows(workspace: &Workspace) -> usize {
    let mut count: usize = workspace
        .containers
        .elements
        .iter()
        .map(|container| container.windows.elements.len())
        .sum();
    count += workspace.floating_windows.elements.len();
    if workspace.monocle_container.is_some() {
        count += 1;
    }
    if workspace.maximized_window.is_some() {
        count += 1;
    }
    count
}

/// Project one komorebi monitor into the payload consumed by a single bar window.
/// Returns `None` when no komorebi monitor matches `monitor_id`.
fn project(state: &State, monitor_id: i64) -> Option<Value> {
    let monitor_index = state
        .monitors
        .elements
        .iter()
        .position(|monitor| monitor.id == monitor_id)?;
    let monitor = &state.monitors.elements[monitor_index];
    let focused = monitor.workspaces.focused;
    let workspaces: Vec<Value> = monitor
        .workspaces
        .elements
        .iter()
        .enumerate()
        .map(|(index, workspace)| {
            let windows = workspace_windows(workspace);
            let status = if index == focused {
                "active"
            } else if windows > 0 {
                "populated"
            } else {
                "empty"
            };
            json!({
                "index": index,
                "name": workspace.name,
                "status": status,
                "layer": workspace.layer.clone().unwrap_or_else(|| "Tiling".into()),
                "windows": windows,
            })
        })
        .collect();
    Some(json!({
        "monitor": monitor_index,
        "floatOverride": state.float_override,
        "workspaces": workspaces,
    }))
}

/// Validate a focus request against the cached komorebi state bounds.
fn target_ok(state: &State, monitor: u32, workspace: u32) -> Result<(), String> {
    let target = state
        .monitors
        .elements
        .get(monitor as usize)
        .ok_or("Unknown workspaces monitor")?;
    if workspace as usize >= target.workspaces.elements.len() {
        return Err("Unknown workspaces workspace".into());
    }
    Ok(())
}

/// Split a byte stream into complete, concatenated JSON values, tolerating
/// partial reads and an unterminated trailing message.
fn extract_messages(buffer: &mut Vec<u8>) -> Vec<Value> {
    let mut out = Vec::new();
    let mut consumed = 0usize;
    let mut start: Option<usize> = None;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (index, byte) in buffer.iter().enumerate() {
        if start.is_none() {
            if *byte == b'{' {
                start = Some(index);
                depth = 0;
                in_string = false;
                escaped = false;
            } else {
                consumed = index + 1;
                continue;
            }
        }
        let Some(from) = start else { continue };
        if in_string {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                in_string = false;
            }
        } else {
            match *byte {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        if let Ok(value) = serde_json::from_slice::<Value>(&buffer[from..=index]) {
                            out.push(value);
                        }
                        consumed = index + 1;
                        start = None;
                    }
                }
                _ => {}
            }
        }
    }
    buffer.drain(..consumed);
    out
}

// Ignore timestamps, but publish connection errors even when data remains null.
fn snapshot_key(value: &Value) -> String {
    json!([value["status"], value["data"], value["error"]]).to_string()
}

struct Sub {
    window: String,
    monitor: i64,
}
#[derive(Default)]
struct Data {
    next: u64,
    subs: HashMap<String, Sub>,
    summary: HashMap<String, String>,
    state: Option<State>,
    connected: bool,
    error: Option<String>,
    incoming: u64,
    emitted: u64,
}
#[derive(Clone)]
pub struct Workspaces {
    data: Arc<Mutex<Data>>,
    stop: Arc<AtomicBool>,
}
impl Workspaces {
    pub fn start(app: AppHandle) -> Self {
        let this = Self {
            data: Default::default(),
            stop: Arc::new(AtomicBool::new(false)),
        };
        let owner = this.clone();
        std::thread::spawn(move || owner.run(app));
        this
    }
    pub fn subscribe(
        &self,
        window: &tauri::WebviewWindow,
        interval_ms: u64,
    ) -> Result<Value, String> {
        let _ = interval_ms; // workspaces is event-driven; the interval is ignored.
        let monitor = monitor_of(window)?;
        let label = window.label().to_string();
        let mut d = self.data.lock().map_err(|e| e.to_string())?;
        d.next += 1;
        let token = format!("kw{}", d.next);
        let initial = if d.connected {
            d.state
                .as_ref()
                .and_then(|state| project(state, monitor))
                .map(|data| envelope("ready", data))
                .unwrap_or_else(|| envelope("unavailable", Value::Null))
        } else if let Some(error) = &d.error {
            json!({"status":"error","data":null,"error":error})
        } else {
            envelope("unavailable", Value::Null)
        };
        d.summary.insert(token.clone(), snapshot_key(&initial));
        d.subs.insert(
            token.clone(),
            Sub {
                window: label,
                monitor,
            },
        );
        Ok(json!({"token": token, "initial": initial}))
    }
    pub fn unsubscribe(&self, token: &str, window: &str) {
        let mut d = self.data.lock().unwrap();
        if d.subs.get(token).is_some_and(|s| s.window == window) {
            d.subs.remove(token);
            d.summary.remove(token);
        }
    }
    pub fn remove_window(&self, window: &str) {
        let mut d = self.data.lock().unwrap();
        d.subs.retain(|_, s| s.window != window);
        let live: std::collections::HashSet<String> = d.subs.keys().cloned().collect();
        d.summary.retain(|token, _| live.contains(token));
    }
    pub fn action(
        &self,
        action: &str,
        monitor: Option<u32>,
        workspace: Option<u32>,
        direction: Option<String>,
    ) -> Result<(), String> {
        let args = action_args(action, monitor, workspace, direction.as_deref())?;
        if action == "focusWorkspace" {
            let d = self.data.lock().map_err(|e| e.to_string())?;
            target_ok(
                d.state.as_ref().ok_or("Workspaces state is unavailable")?,
                monitor.ok_or("focusWorkspace requires a monitor")?,
                workspace.ok_or("focusWorkspace requires a workspace")?,
            )?;
        }
        let exe = resolve_komorebic().ok_or("komorebic.exe was not found on PATH")?;
        Command::new(exe)
            .args(&args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    pub fn diagnostics(&self) -> Value {
        let d = self.data.lock().unwrap();
        json!({"subscribers":d.subs.len(),"connected":d.connected,"incoming":d.incoming,"emitted":d.emitted})
    }
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }
    fn wait(&self, total: Duration) {
        let step = Duration::from_millis(100);
        let mut elapsed = Duration::ZERO;
        while elapsed < total {
            if self.stop.load(Ordering::Acquire) {
                return;
            }
            std::thread::sleep(step);
            elapsed += step;
        }
    }
    fn has_subscribers(&self) -> bool {
        self.data
            .lock()
            .map(|data| !data.subs.is_empty())
            .unwrap_or(false)
    }
    fn run(&self, app: AppHandle) {
        let name = format!("strata-bar-workspaces-{}", std::process::id());
        while !self.stop.load(Ordering::Acquire) {
            // Activate only while a bar window is subscribed, like the metric collectors.
            if !self.has_subscribers() {
                self.disconnect(&app);
                self.wait(IDLE_DELAY);
                continue;
            }
            let Some(exe) = resolve_komorebic() else {
                self.disconnect(&app);
                self.wait(RETRY_DELAY);
                continue;
            };
            if let Err(e) = self.session(&app, &exe, &name) {
                eprintln!("workspaces pipe: {e}");
                if let Ok(mut d) = self.data.lock() {
                    d.error = Some(e);
                }
            }
            self.disconnect(&app);
            self.wait(RECONNECT_DELAY);
        }
    }
    fn disconnect(&self, app: &AppHandle) {
        if let Ok(mut d) = self.data.lock() {
            d.connected = false;
        }
        self.publish(app);
    }
    fn session(&self, app: &AppHandle, exe: &Path, name: &str) -> Result<(), String> {
        let handle = create_pipe(name)?;
        if command_output(exe, &["subscribe-pipe", name], Duration::from_secs(3)).is_none() {
            unsafe {
                let _ = CloseHandle(handle);
            }
            return Err("komorebic subscribe-pipe failed or timed out".into());
        }
        if let Err(error) = connect_pipe(handle, Duration::from_secs(3), || {
            self.stop.load(Ordering::Acquire) || !self.has_subscribers()
        }) {
            unsafe {
                let _ = CloseHandle(handle);
            }
            return Err(error);
        }
        let result = self.read_loop(app, handle);
        unsafe {
            let _ = DisconnectNamedPipe(handle);
            let _ = CloseHandle(handle);
        }
        result
    }
    fn read_loop(&self, app: &AppHandle, handle: HANDLE) -> Result<(), String> {
        let mut buffer: Vec<u8> = Vec::new();
        let mut temp = vec![0u8; PIPE_BUFFER as usize];
        loop {
            if self.stop.load(Ordering::Acquire) {
                return Ok(());
            }
            // Drop the pipe once no bar cares about workspaces, so the host is idle.
            if !self.has_subscribers() {
                return Ok(());
            }
            let mut available = 0u32;
            if unsafe { PeekNamedPipe(handle, None, 0, None, Some(&mut available), None) }.is_err()
            {
                return Err("workspaces pipe closed".into());
            }
            if available == 0 {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }
            let want = (available as usize).min(temp.len());
            let mut read = 0u32;
            if unsafe { ReadFile(handle, Some(&mut temp[..want]), Some(&mut read), None) }.is_err()
            {
                return Err("workspaces pipe read failed".into());
            }
            buffer.extend_from_slice(&temp[..read as usize]);
            for value in extract_messages(&mut buffer) {
                self.on_notification(app, value);
            }
        }
    }
    fn on_notification(&self, app: &AppHandle, value: Value) {
        let Some(state_value) = value.get("state") else {
            return;
        };
        if let Ok(state) = serde_json::from_value::<State>(state_value.clone()) {
            if let Ok(mut d) = self.data.lock() {
                d.state = Some(state);
                d.connected = true;
                d.error = None;
            }
            self.publish(app);
        }
    }
    fn publish(&self, app: &AppHandle) {
        let (connected, state, error, subs) = {
            let d = match self.data.lock() {
                Ok(d) => d,
                Err(_) => return,
            };
            (
                d.connected,
                d.state.clone(),
                d.error.clone(),
                d.subs
                    .iter()
                    .map(|(token, sub)| (token.clone(), sub.window.clone(), sub.monitor))
                    .collect::<Vec<_>>(),
            )
        };
        let mut changed = Vec::new();
        {
            let mut d = self.data.lock().unwrap();
            d.incoming += 1;
            for (token, window, monitor) in subs {
                let value = if connected {
                    state
                        .as_ref()
                        .and_then(|state| project(state, monitor))
                        .map(|data| envelope("ready", data))
                        .unwrap_or_else(|| envelope("unavailable", Value::Null))
                } else if let Some(error) = &error {
                    json!({"status":"error","data":null,"error":error})
                } else {
                    envelope("unavailable", Value::Null)
                };
                let key = snapshot_key(&value);
                if d.summary.get(&token) != Some(&key) {
                    d.summary.insert(token, key);
                    d.emitted += 1;
                    changed.push((window, value));
                }
            }
        }
        for (window, value) in changed {
            if let Err(e) = app.emit_to(window, "system:workspaces", &value) {
                eprintln!("Emit workspaces: {e}");
            }
        }
    }
}

/// Translate a validated action request into `komorebic` arguments. Pure so the
/// allowlist is testable without a running komorebi.
fn action_args(
    action: &str,
    monitor: Option<u32>,
    workspace: Option<u32>,
    direction: Option<&str>,
) -> Result<Vec<String>, String> {
    match action {
        "focusWorkspace" => {
            let monitor = monitor.ok_or("focusWorkspace requires a monitor")?;
            let workspace = workspace.ok_or("focusWorkspace requires a workspace")?;
            Ok(vec![
                "focus-monitor-workspace".into(),
                monitor.to_string(),
                workspace.to_string(),
            ])
        }
        "cycleWorkspace" => {
            let direction = match direction {
                Some("next") => "next",
                Some("previous") => "previous",
                _ => return Err("direction must be next or previous".into()),
            };
            Ok(vec!["cycle-workspace".into(), direction.into()])
        }
        other => Err(format!("Unsupported workspaces action: {other}")),
    }
}

fn monitor_of(window: &tauri::WebviewWindow) -> Result<i64, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let monitor = unsafe {
        MonitorFromWindow(
            windows::Win32::Foundation::HWND(hwnd.0),
            MONITOR_DEFAULTTONEAREST,
        )
    };
    Ok(monitor.0 as i64)
}

fn connect_pipe(
    handle: HANDLE,
    timeout: Duration,
    cancelled: impl Fn() -> bool,
) -> Result<(), String> {
    // Poll only the connection handshake: a restart can discard the registration
    // before a client connects. A blocking ConnectNamedPipe would strand retries.
    unsafe { SetNamedPipeHandleState(handle, Some(&PIPE_NOWAIT), None, None) }
        .map_err(|error| format!("configure named pipe: {error}"))?;
    let start = Instant::now();
    loop {
        if cancelled() {
            return Err("workspaces connection cancelled".into());
        }
        let connected = unsafe {
            match ConnectNamedPipe(handle, None) {
                Ok(()) => true,
                Err(error) => match GetLastError() {
                    ERROR_PIPE_CONNECTED => true,
                    ERROR_PIPE_LISTENING => false,
                    ERROR_NO_DATA => return Err("workspaces pipe closed before connecting".into()),
                    _ => return Err(format!("connect named pipe: {error}")),
                },
            }
        };
        if connected {
            unsafe { SetNamedPipeHandleState(handle, Some(&PIPE_WAIT), None, None) }
                .map_err(|error| format!("configure connected pipe: {error}"))?;
            return Ok(());
        }
        if start.elapsed() >= timeout {
            return Err("workspaces connection timed out".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn create_pipe(name: &str) -> Result<HANDLE, String> {
    let wide: Vec<u16> = format!("\\\\.\\pipe\\{name}")
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let handle = unsafe {
        CreateNamedPipeW(
            PCWSTR(wide.as_ptr()),
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            PIPE_UNLIMITED_INSTANCES,
            PIPE_BUFFER,
            PIPE_BUFFER,
            0,
            None,
        )
    };
    if handle.is_invalid() {
        return Err("cannot create the workspaces named pipe".into());
    }
    Ok(handle)
}

/// Locate `komorebic.exe` on `PATH`. Returns the first match, checking `PATHEXT`.
fn resolve_komorebic() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let extensions: Vec<String> = std::env::var_os("PATHEXT")
        .unwrap_or_else(|| OsString::from(".EXE"))
        .to_string_lossy()
        .split(';')
        .filter(|part| !part.trim().is_empty())
        .map(|part| part.trim().to_string())
        .collect();
    for directory in std::env::split_paths(&path) {
        let direct = directory.join("komorebic.exe");
        if direct.is_file() {
            return Some(direct);
        }
        for extension in &extensions {
            let candidate = directory.join(format!("komorebic{extension}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn command_output(exe: &Path, args: &[&str], timeout: Duration) -> Option<Vec<u8>> {
    let mut child = Command::new(exe)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .ok()?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let mut out = Vec::new();
                if let Some(mut stdout) = child.stdout.take() {
                    let _ = stdout.read_to_end(&mut out);
                }
                return Some(out);
            }
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return None,
        }
    }
}

/// Diagnostics for `--probe`: whether komorebic is resolvable and a monitor count.
pub fn probe() -> Value {
    match resolve_komorebic() {
        Some(exe) => {
            let state = command_output(&exe, &["state"], Duration::from_secs(2))
                .and_then(|out| serde_json::from_slice::<Value>(&out).ok());
            let monitors = state
                .as_ref()
                .and_then(|value| value["monitors"]["elements"].as_array().map(Vec::len));
            json!({
                "komorebic": exe.to_string_lossy(),
                "monitors": monitors,
            })
        }
        None => json!({"komorebic": null, "monitors": null}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connection_errors_are_not_deduplicated_as_unavailable() {
        let offline = envelope("unavailable", Value::Null);
        let error = json!({"status":"error","data":null,"error":"connection failed"});
        assert_ne!(snapshot_key(&offline), snapshot_key(&error));
        let mut later = error.clone();
        later["timestamp"] = json!(123);
        assert_eq!(snapshot_key(&error), snapshot_key(&later));
    }

    #[test]
    fn a_missing_komorebi_connection_times_out_instead_of_stranding_reconnect() {
        let name = format!("strata-reconnect-test-{}", std::process::id());
        let handle = create_pipe(&name).unwrap();
        // Release the old blocking implementation after its deadline so a failure cannot hang the suite.
        let client = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            let _ = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(format!(r"\\.\pipe\{name}"));
        });
        let result = connect_pipe(handle, Duration::from_millis(50), || false);
        client.join().unwrap();
        unsafe {
            let _ = DisconnectNamedPipe(handle);
            let _ = CloseHandle(handle);
        }
        assert!(
            result.is_err(),
            "Absent producer must return to the reconnect loop before a late client arrives"
        );
    }

    #[test]
    fn pipe_accepts_a_new_producer_after_disconnect() {
        use std::io::Write;
        let name = format!("strata-pipe-restart-{}", std::process::id());
        for expected in [b"before".as_slice(), b"after".as_slice()] {
            let handle = create_pipe(&name).unwrap();
            let path = format!(r"\\.\pipe\{name}");
            let payload = expected.to_vec();
            let (consumed, wait_consumed) = std::sync::mpsc::channel();
            let producer = std::thread::spawn(move || {
                let mut client = std::fs::OpenOptions::new()
                    .read(true)
                    .write(true)
                    .open(path)
                    .unwrap();
                client.write_all(&payload).unwrap();
                // Hold the producer open until the server has consumed the message.
                wait_consumed.recv_timeout(Duration::from_secs(2)).unwrap();
            });
            connect_pipe(handle, Duration::from_secs(1), || false).unwrap();
            let mut bytes = [0u8; 32];
            let mut read = 0;
            unsafe { ReadFile(handle, Some(&mut bytes), Some(&mut read), None) }.unwrap();
            assert_eq!(&bytes[..read as usize], expected);
            consumed.send(()).unwrap();
            producer.join().unwrap();
            assert!(unsafe { PeekNamedPipe(handle, None, 0, None, None, None) }.is_err());
            unsafe {
                let _ = DisconnectNamedPipe(handle);
                let _ = CloseHandle(handle);
            }
        }
    }

    #[test]
    fn pipe_connection_can_be_cancelled_without_a_producer() {
        let name = format!("strata-pipe-cancel-{}", std::process::id());
        let handle = create_pipe(&name).unwrap();
        let result = connect_pipe(handle, Duration::from_secs(10), || true);
        unsafe {
            let _ = CloseHandle(handle);
        }
        assert_eq!(result.unwrap_err(), "workspaces connection cancelled");
    }

    fn sample() -> State {
        serde_json::from_value(json!({
            "float_override": false,
            "monitors": {"focused": 0, "elements": [
                {"id": 111, "workspaces": {"focused": 1, "elements": [
                    {"name": null,
                     "containers": {"focused": 0, "elements": []},
                     "floating_windows": {"focused": 0, "elements": []},
                     "monocle_container": null, "maximized_window": null, "layer": "Tiling"},
                    {"name": "web",
                     "containers": {"focused": 0, "elements": [
                        {"windows": {"focused": 0, "elements": [{"hwnd": 1}, {"hwnd": 2}]}}
                     ]},
                     "floating_windows": {"focused": 0, "elements": []},
                     "monocle_container": null, "maximized_window": null, "layer": "Floating"}
                ]}},
                {"id": 222, "workspaces": {"focused": 0, "elements": []}}
            ]}
        }))
        .unwrap()
    }

    #[test]
    fn project_filters_to_one_monitor_and_labels_states() {
        let mut state = sample();
        state.monitors.elements[1].workspaces.elements =
            state.monitors.elements[0].workspaces.elements.clone();
        let view = project(&state, 111).unwrap();
        assert_eq!(view["monitor"], 0);
        assert_eq!(view["workspaces"][0]["status"], "empty");
        assert_eq!(view["workspaces"][1]["status"], "active");
        assert_eq!(view["workspaces"][1]["name"], "web");
        assert_eq!(view["workspaces"][1]["layer"], "Floating");
        assert_eq!(view["workspaces"][1]["windows"], 2);
        let second = project(&state, 222).unwrap();
        assert_eq!(second["monitor"], 1);
        assert_eq!(second["workspaces"][0]["status"], "active");
        assert_eq!(second["workspaces"][1]["status"], "populated");
        assert!(project(&state, 999).is_none());
    }

    #[test]
    fn focus_targets_are_bounded_by_the_cached_state() {
        let state = sample();
        assert!(target_ok(&state, 0, 1).is_ok());
        assert!(target_ok(&state, 0, 2).is_err());
        assert!(target_ok(&state, 9, 0).is_err());
    }

    #[test]
    fn extractor_handles_concatenated_and_partial_messages() {
        let mut buffer = br#"garbage {"a":1}{"b":{"c":"}"}}{"d""#.to_vec();
        let messages = extract_messages(&mut buffer);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["a"], 1);
        assert_eq!(messages[1]["b"]["c"], "}");
        // The unterminated tail survives for the next read.
        assert_eq!(buffer, br#"{"d""#);

        buffer.extend_from_slice(br#":2}"#);
        assert_eq!(extract_messages(&mut buffer)[0]["d"], 2);
        assert!(buffer.is_empty());
    }

    #[test]
    fn action_args_only_allow_the_known_commands() {
        assert_eq!(
            action_args("focusWorkspace", Some(1), Some(3), None).unwrap(),
            vec!["focus-monitor-workspace", "1", "3"]
        );
        assert_eq!(
            action_args("cycleWorkspace", None, None, Some("previous")).unwrap(),
            vec!["cycle-workspace", "previous"]
        );
        assert!(action_args("focusWorkspace", None, Some(0), None).is_err());
        assert!(action_args("cycleWorkspace", None, None, None).is_err());
        assert!(action_args("cycleWorkspace", None, None, Some("sideways")).is_err());
        assert!(action_args("exec", Some(0), Some(0), None).is_err());
    }
}
