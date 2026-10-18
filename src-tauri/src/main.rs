#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;
mod popup_ids;
#[cfg(debug_assertions)]
mod popup_check;
mod audio_policy;
mod komorebi;
mod metrics;
mod memory_contract;
mod memory;
use serde_json::{json, Value};
use tauri::Manager;
#[tauri::command]
fn capabilities(komorebi: tauri::State<komorebi::Komorebi>) -> Value {
    json!({"cpu":true,"memory":true,"volume":true,"audioOutputs":true,"appBar":true,"gpu":false,"network":false,"komorebi":komorebi.available()})
}
#[tauri::command]
fn subscribe(
    window: tauri::WebviewWindow,
    metrics: tauri::State<metrics::Metrics>,
    komorebi: tauri::State<komorebi::Komorebi>,
    channel: String,
    interval_ms: u64,
) -> Result<Value, String> {
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
    if token.starts_with('k') {
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
async fn set_audio_output(state: tauri::State<'_, metrics::Metrics>, device_id: String) -> Result<Value, String> {
    let owner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || owner.audio_output(device_id)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn overlay_show(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request: desktop::OverlayRequest,
) -> Result<(), String> {
    let result = desktop::overlay_show(&app, &window, &request);
    if result.is_err() { desktop::overlay_hide_request(&app, request.session.as_deref()); }
    result
}
#[tauri::command]
fn overlay_hide(app: tauri::AppHandle, window: tauri::WebviewWindow, session: Option<String>) {
    if window.label() == desktop::OVERLAY { desktop::overlay_dismiss(&app, session.as_deref()); }
    else { desktop::overlay_hide_request(&app, session.as_deref()); }
}
#[tauri::command]
fn overlay_ready(window: tauri::WebviewWindow) -> Result<Value, String> {
    desktop::overlay_ready(&window)
}
#[tauri::command]
fn overlay_resize(app: tauri::AppHandle, window: tauri::WebviewWindow, session: String, size: desktop::OverlaySize) -> Result<Value, String> {
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
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}
fn main() {
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
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            capabilities,
            subscribe,
            unsubscribe,
            set_volume,
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
            app.manage(metrics::Metrics::start(app.handle().clone()));
            app.manage(komorebi::Komorebi::start(app.handle().clone()));
            desktop::reconcile(app.handle())?;
            // One warm surface for every tooltip and, later, widget popup.
            desktop::ensure_overlay(app.handle())?;
            #[cfg(debug_assertions)]
            if std::env::args().any(|arg| arg == "--check-popups") {
                popup_check::start(app.handle().clone());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
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
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            desktop::release_all(app);
            if let Some(m) = app.try_state::<metrics::Metrics>() {
                m.stop();
            }
            if let Some(k) = app.try_state::<komorebi::Komorebi>() {
                k.stop();
            }
        }
    });
    unsafe {
        let _ = windows::Win32::Foundation::CloseHandle(instance);
    }
}
