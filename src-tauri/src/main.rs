#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod agents;
mod bar_region;
mod agent_alerts;
mod agent_notifications;
mod agent_notifications_windows;
mod agents_contract;
mod agents_windows;
mod antigravity;
mod antigravity_hooks;
mod codex;
mod codex_hooks;
mod hook_config;
mod opencode;
mod reminder_sound;
mod google_calendar;
mod media;
mod media_contract;
mod media_windows;
mod reminders;
mod reminders_contract;
mod spotify;
mod tray;

mod audio_policy;
mod config;
mod config_contract;
mod cpu_contract;
mod desktop;
mod monitors;
#[cfg(debug_assertions)]
mod monitor_check;
mod disk_contract;
mod gpu_contract;
mod komorebi;
mod memory_contract;
mod metrics;
mod sensors;
#[cfg(debug_assertions)]
mod popup_check;
mod popup_ids;
mod voicemeeter;
use serde_json::{json, Value};
use tauri::Manager;
#[tauri::command]
fn capabilities(komorebi: tauri::State<komorebi::Komorebi>) -> Value {
    json!({"cpu":true,"memory":true,"volume":true,"audioOutputs":true,"audioInputs":true,"microphone":true,"media":true,"appBar":true,"gpu":true,"disk":true,"network":false,"komorebi":komorebi.available(),"voicemeeter":crate::voicemeeter::installed(),"config":true})
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
async fn set_channel_source(
    state: tauri::State<'_, metrics::Metrics>,
    channel: String,
    target: Option<voicemeeter::TargetRequest>,
) -> Result<(), String> {
    let owner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || owner.set_channel_source(channel, target))
        .await
        .map_err(|e| e.to_string())?
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
fn bar_set_region(
    window: tauri::WebviewWindow,
    polygons: Vec<Vec<bar_region::Point>>,
) -> Result<(), String> {
    bar_region::set(&window, polygons)
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
fn overlay_exit_complete(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    session: String,
) -> Result<(), String> {
    desktop::overlay_exit_complete(&app, &window, &session)
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
fn settings_monitors() -> Result<Vec<config_contract::SettingsMonitor>, String> {
    monitors::list()
}
#[tauri::command]
fn config_load(
    window: tauri::WebviewWindow,
    store: tauri::State<config::ConfigStore>,
) -> Result<config_contract::ConfigSnapshot, String> {
    config::snapshot_for(&store, &window)
}
#[tauri::command]
fn config_save(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    store: tauri::State<config::ConfigStore>,
    config: config_contract::Config,
) -> Result<config_contract::ConfigSnapshot, String> {
    let mut config = config;
    monitors::migrate(&mut config, &monitors::list()?);
    let snapshot = store.save(config)?;
    config::publish(&app, &snapshot);
    if window.label().starts_with("bar-") {
        Ok(config::project_snapshot(
            &snapshot,
            crate::desktop::monitor_name(&window).as_deref(),
        ))
    } else {
        Ok(snapshot)
    }
}
#[tauri::command]
fn settings_open(app: tauri::AppHandle) -> Result<(), String> {
    desktop::open_settings(&app).map(|_| ())
}
#[tauri::command]
fn diagnostics(
    app: tauri::AppHandle,
    metrics: tauri::State<metrics::Metrics>,
    komorebi: tauri::State<komorebi::Komorebi>,
) -> Value {
    json!({"metrics":metrics.diagnostics(),"komorebi":komorebi.diagnostics(),"overlay":desktop::overlay_snapshot(),"settings":desktop::settings_snapshot(),"profile":desktop::profile(),"config":config::diagnostics(&app),"bars":app.webview_windows().keys().collect::<Vec<_>>()})
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
// Account configuration belongs to Settings; playback keeps its own caller policy.
fn authorize_spotify_settings(label: &str) -> Result<(), String> {
    if label != "settings" {
        return Err("Spotify configuration requires the settings window".into());
    }
    Ok(())
}
#[tauri::command]
fn spotify_status(
    window: tauri::WebviewWindow,
    state: tauri::State<media::Media>,
) -> Result<media_contract::SpotifyStatus, String> {
    authorize_spotify_settings(window.label())?;
    Ok(state.spotify.status())
}
#[tauri::command]
async fn spotify_connect(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, media::Media>,
    client_id: String,
) -> Result<(), String> {
    authorize_spotify_settings(window.label())?;
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
    authorize_spotify_settings(window.label())?;
    let spotify = state.spotify.clone();
    tauri::async_runtime::spawn_blocking(move || spotify.disconnect())
        .await
        .map_err(|_| "Spotify worker failed")?
}
#[tauri::command]
fn spotify_open_dashboard(window: tauri::WebviewWindow) -> Result<(), String> {
    authorize_spotify_settings(window.label())?;
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
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    if arguments.first().is_some_and(|argument| argument == "--codex-hook") {
        codex_hooks::run_helper(&arguments[1..]);
        return;
    }
    if arguments.first().is_some_and(|argument| argument == "--antigravity-hook") {
        antigravity_hooks::run_helper(&arguments[1..]);
        return;
    }
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
    if std::env::args().any(|arg| arg == "--probe-vm") {
        println!("{}", serde_json::to_string(&voicemeeter::probe_vm()).unwrap());
        return;
    }
    if std::env::args().any(|v| v == "--probe") {
        let probe_context = tauri::generate_context!();
        let result = json!({"metrics":metrics::probe(),"komorebi":komorebi::probe(),"overlay":desktop::overlay_snapshot(),"settings":desktop::settings_snapshot(),"monitors":desktop::monitor_snapshot(),"bars":desktop::bar_snapshot(),"config":config::probe(&probe_context)});
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
            agents::agents_dismiss_alerts,
            agents::agents_set_opencode,
            agents::agents_create_opencode,
            agents::agents_reply_opencode,
            agents::agents_decide_opencode,
            agents::agents_set_antigravity,
            agents::agents_set_codex,
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
            set_channel_source,
            set_audio_input,
            set_audio_output,
            komorebi_action,
            config_load,
            config_save,
            settings_monitors,
            settings_open,
            overlay_show,
            bar_set_region,
            overlay_hide,
            overlay_resize,
            overlay_ready,
            overlay_exit_complete,
            diagnostics,
            quit
        ])
        .setup(|app| {
            tray::setup(app.handle())?;
            #[cfg(debug_assertions)]
            let monitor_check = std::env::args().any(|arg| arg == "--check-monitor-manager" || arg == "--check-bar-geometry");
            #[cfg(not(debug_assertions))]
            let monitor_check = false;
            let store = if monitor_check {
                config::ConfigStore::open(
                    std::env::temp_dir()
                        .join(format!("strata-monitor-check-{}", std::process::id()))
                        .join("config.json"),
                )
            } else {
                config::open_store(app.handle())?
            };
            config::watch(app.handle().clone(), &store)?;
            app.manage(store);
            app.manage(google_calendar::GoogleCalendar::start());
            app.manage(reminders::Reminders::open(
                app.path().app_data_dir()?.join("reminders.json"),
            ));
            app.manage(media::Media::start(app.handle().clone()));
            app.manage(agents::Agents::start(app.handle().clone())?);
            app.manage(metrics::Metrics::start(app.handle().clone()));
            app.manage(komorebi::Komorebi::start(app.handle().clone()));
            monitors::observe(app.handle())?;
            desktop::reconcile(app.handle())?;
            #[cfg(debug_assertions)]
            if monitor_check {
                if std::env::args().any(|arg| arg == "--check-bar-geometry") {
                    monitor_check::start_geometry(app.handle().clone());
                } else {
                    monitor_check::start(app.handle().clone());
                }
            }
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

#[cfg(test)]
mod spotify_command_tests {
    #[test]
    fn spotify_configuration_is_restricted_to_settings() {
        assert!(super::authorize_spotify_settings("settings").is_ok());
        for caller in ["bar-0", "overlay", "main", "studio", "settings-other", ""] {
            assert!(
                super::authorize_spotify_settings(caller).is_err(),
                "{caller}"
            );
        }
        assert!(!crate::media::allowed_window("settings"));
    }
}
