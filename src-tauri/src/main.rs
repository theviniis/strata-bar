#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod agents;
mod agents_contract;
mod agents_windows;
mod reminder_sound;
mod google_calendar;
mod media;
mod media_contract;
mod media_windows;
mod reminders;
mod reminders_contract;
mod spotify;
mod tray;

mod afterburner;
mod audio_policy;
mod cpu;
mod cpu_contract;
mod cpu_windows;
mod desktop;
mod disk;
mod disk_contract;
mod disk_windows;
mod gpu;
mod gpu_contract;
mod gpu_windows;
mod komorebi;
mod mahm_windows;
mod memory;
mod memory_contract;
mod metrics;
#[cfg(debug_assertions)]
mod popup_check;
mod popup_ids;
use serde_json::{json, Value};
use tauri::Manager;
#[tauri::command]
fn capabilities(komorebi: tauri::State<komorebi::Komorebi>) -> Value {
    json!({"cpu":true,"memory":true,"volume":true,"audioOutputs":true,"audioInputs":true,"microphone":true,"media":true,"appBar":true,"gpu":true,"disk":true,"network":false,"komorebi":komorebi.available()})
}
#[tauri::command]
fn subscribe(
    window: tauri::WebviewWindow,
    metrics: tauri::State<metrics::Metrics>,
    komorebi: tauri::State<komorebi::Komorebi>,
    channel: String,
    interval_ms: u64,
) -> Result<Value, String> {
    if channel == "media" {
        return window.state::<media::Media>().subscribe(window.label());
    }
    if channel == "komorebi" {
        return komorebi.subscribe(&window, interval_ms);
    }
    metrics.subscribe(channel, window.label().into(), interval_ms)
}
#[tauri::command]
fn unsubscribe(
    window: tauri::WebviewWindow,
    metrics: tauri::State<metrics::Metrics>,
    komorebi: tauri::State<komorebi::Komorebi>,
    token: String,
) {
    if token.starts_with('m') {
        window
            .state::<media::Media>()
            .unsubscribe(&token, window.label());
    } else if token.starts_with('k') {
        komorebi.unsubscribe(&token, window.label());
    } else {
        metrics.unsubscribe(&token, window.label());
    }
}
#[tauri::command]
fn komorebi_action(
    state: tauri::State<komorebi::Komorebi>,
    action: String,
    monitor: Option<u32>,
    workspace: Option<u32>,
    direction: Option<String>,
) -> Result<(), String> {
    state.action(&action, monitor, workspace, direction)
}
#[tauri::command]
async fn set_volume(
    state: tauri::State<'_, metrics::Metrics>,
    level: Option<f32>,
    muted: Option<bool>,
) -> Result<Value, String> {
    let owner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || owner.volume(level, muted))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn set_microphone(state: tauri::State<'_, metrics::Metrics>, level: Option<f32>, muted: Option<bool>) -> Result<Value, String> {
    let owner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || owner.audio_volume(true, level, muted)).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn set_audio_input(state: tauri::State<'_, metrics::Metrics>, device_id: String) -> Result<Value, String> {
    let owner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || owner.audio_device(true, device_id)).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn set_audio_output(
    state: tauri::State<'_, metrics::Metrics>,
    device_id: String,
) -> Result<Value, String> {
    let owner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || owner.audio_output(device_id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn overlay_show(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request: desktop::OverlayRequest,
) -> Result<(), String> {
    let result = desktop::overlay_show(&app, &window, &request);
    if result.is_err() {
        desktop::overlay_hide_request(&app, request.session.as_deref());
    }
    result
}
#[tauri::command]
fn overlay_hide(app: tauri::AppHandle, window: tauri::WebviewWindow, session: Option<String>) {
    if window.label() == desktop::OVERLAY {
        desktop::overlay_dismiss(&app, session.as_deref());
    } else {
        desktop::overlay_hide_request(&app, session.as_deref());
    }
}
#[tauri::command]
fn overlay_ready(window: tauri::WebviewWindow) -> Result<Value, String> {
    desktop::overlay_ready(&window)
}
#[tauri::command]
fn overlay_resize(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    session: String,
    size: desktop::OverlaySize,
) -> Result<Value, String> {
    desktop::overlay_resize(&app, &window, &session, &size)
}
#[tauri::command]
fn diagnostics(
    app: tauri::AppHandle,
    metrics: tauri::State<metrics::Metrics>,
    komorebi: tauri::State<komorebi::Komorebi>,
) -> Value {
    json!({"metrics":metrics.diagnostics(),"komorebi":komorebi.diagnostics(),"overlay":desktop::overlay_snapshot(),"profile":desktop::profile(),"bars":app.webview_windows().keys().collect::<Vec<_>>()})
}
#[tauri::command]
async fn media_action(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, media::Media>,
    request: media_contract::MediaRequest,
) -> Result<(), String> {
    let owner = state.inner().clone();
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || owner.action(label, request))
        .await
        .map_err(|_| "Media worker failed")?
}
#[tauri::command]
fn spotify_status(
    window: tauri::WebviewWindow,
    state: tauri::State<media::Media>,
) -> Result<media_contract::SpotifyStatus, String> {
    if !media::allowed_window(window.label()) {
        return Err("Spotify settings require a bar or overlay".into());
    }
    Ok(state.spotify.status())
}
#[tauri::command]
async fn spotify_connect(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, media::Media>,
    client_id: String,
) -> Result<(), String> {
    if !media::allowed_window(window.label()) {
        return Err("Spotify settings require a bar or overlay".into());
    }
    let spotify = state.spotify.clone();
    tauri::async_runtime::spawn_blocking(move || spotify.connect(client_id))
        .await
        .map_err(|_| "Spotify worker failed")?
}
#[tauri::command]
async fn spotify_disconnect(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, media::Media>,
) -> Result<(), String> {
    if !media::allowed_window(window.label()) {
        return Err("Spotify settings require a bar or overlay".into());
    }
    let spotify = state.spotify.clone();
    tauri::async_runtime::spawn_blocking(move || spotify.disconnect())
        .await
        .map_err(|_| "Spotify worker failed")?
}
#[tauri::command]
fn spotify_open_dashboard(window: tauri::WebviewWindow) -> Result<(), String> {
    if !media::allowed_window(window.label()) {
        return Err("Spotify settings require a bar or overlay".into());
    }
    spotify::open_dashboard()
}
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}
fn cleanup(app: &tauri::AppHandle) {
    if let Some(agents) = app.try_state::<agents::Agents>() {
        agents.stop();
    }
    if let Some(scheduler) = app.try_state::<reminders::ReminderScheduler>() {
        scheduler.stop();
    }
    desktop::release_all(app);
    if let Some(media) = app.try_state::<media::Media>() {
        media.stop();
    }
    if let Some(metrics) = app.try_state::<metrics::Metrics>() {
        metrics.stop();
    }
    if let Some(komorebi) = app.try_state::<komorebi::Komorebi>() {
        komorebi.stop();
    }
}

// Dropped on startup failure; explicitly released after shutdown on exit/restart.
struct InstanceGuard(Option<windows::Win32::Foundation::HANDLE>);
impl InstanceGuard {
    fn close(&mut self) {
        if let Some(handle) = self.0.take() {
            unsafe {
                let _ = windows::Win32::Foundation::CloseHandle(handle);
            }
        }
    }
}
impl Drop for InstanceGuard {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod instance_tests {
    use super::InstanceGuard;
    use windows::Win32::{
        Foundation::{GetLastError, ERROR_ALREADY_EXISTS},
        System::Threading::CreateMutexW,
    };

    #[test]
    fn closing_instance_guard_releases_name_for_restart_and_is_idempotent() {
        let name = windows::core::HSTRING::from(format!(
            "Local\\StrataInstanceTest-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        let mut guard = InstanceGuard(Some(unsafe { CreateMutexW(None, false, &name).unwrap() }));
        let duplicate = InstanceGuard(Some(unsafe { CreateMutexW(None, false, &name).unwrap() }));
        assert_eq!(unsafe { GetLastError() }, ERROR_ALREADY_EXISTS);
        drop(duplicate);
        guard.close();
        guard.close();
        let _replacement =
            InstanceGuard(Some(unsafe { CreateMutexW(None, false, &name).unwrap() }));
        assert_ne!(unsafe { GetLastError() }, ERROR_ALREADY_EXISTS);
    }
}

fn main() {
    if std::env::args().any(|arg| arg == "--probe-agents") {
        let result = agents::observe(0, agents_windows::process_names);
        let text = serde_json::to_string_pretty(&result).unwrap();
        std::fs::write(std::env::temp_dir().join("strata-agents-probe.json"), &text).unwrap();
        println!("{text}");
        return;
    }
    if std::env::args().any(|arg| arg == "--probe-media") {
        println!("{}", media::probe());
        return;
    }
    if std::env::args().any(|v| v == "--probe") {
        let result = json!({"metrics":metrics::probe(),"komorebi":komorebi::probe(),"overlay":desktop::overlay_snapshot(),"monitors":desktop::monitor_snapshot(),"bars":desktop::bar_snapshot()});
        let file = std::env::temp_dir().join("strata-native-probe.json");
        std::fs::write(&file, serde_json::to_string_pretty(&result).unwrap()).unwrap();
        println!("{}", serde_json::to_string(&result).unwrap());
        return;
    }
    // A second launch must not reserve a second strip of desktop workspace.
    let instance = unsafe {
        windows::Win32::System::Threading::CreateMutexW(
            None,
            false,
            windows::core::w!("Local\\StrataStatusBar"),
        )
    }
    .expect("Cannot create application instance guard");
    if unsafe { windows::Win32::Foundation::GetLastError() }
        == windows::Win32::Foundation::ERROR_ALREADY_EXISTS
    {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(instance);
        }
        return;
    }
    let mut instance = InstanceGuard(Some(instance));
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            agents::agents_snapshot,
            reminders::reminders_snapshot,
            desktop::reminders_set_anchor,
            reminders::reminders_create,
            reminders::reminders_transition,
            reminders::reminders_calendar_sync,
            google_calendar::calendar_status,
            google_calendar::calendar_connect,
            google_calendar::calendar_disconnect,
            media_action,
            spotify_status,
            spotify_connect,
            spotify_disconnect,
            spotify_open_dashboard,
            capabilities,
            subscribe,
            unsubscribe,
            set_volume,
            set_microphone,
            set_audio_input,
            set_audio_output,
            komorebi_action,
            overlay_show,
            overlay_hide,
            overlay_resize,
            overlay_ready,
            diagnostics,
            quit
        ])
        .setup(|app| {
            tray::setup(app.handle())?;
            app.manage(google_calendar::GoogleCalendar::start());
            app.manage(reminders::Reminders::open(
                app.path().app_data_dir()?.join("reminders.json"),
            ));
            app.manage(media::Media::start(app.handle().clone()));
            app.manage(agents::Agents::start(app.handle().clone())?);
            app.manage(metrics::Metrics::start(app.handle().clone()));
            app.manage(komorebi::Komorebi::start(app.handle().clone()));
            desktop::reconcile(app.handle())?;
            // One warm surface for every tooltip and, later, widget popup.
            desktop::ensure_overlay(app.handle())?;
            app.manage(reminders::ReminderScheduler::start(app.handle().clone()));
            #[cfg(debug_assertions)]
            if std::env::args().any(|arg| arg == "--check-popups") {
                popup_check::start(app.handle().clone());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(media) = window.app_handle().try_state::<media::Media>() {
                    media.remove_window(window.label());
                }
                if let Some(metrics) = window.app_handle().try_state::<metrics::Metrics>() {
                    metrics.remove_window(window.label());
                }
                if let Some(komorebi) = window.app_handle().try_state::<komorebi::Komorebi>() {
                    komorebi.remove_window(window.label());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Strata failed to initialize");
    app.run(move |app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            cleanup(app);
            // Tauri spawns the replacement immediately after this callback.
            instance.close();
        }
    });
}
