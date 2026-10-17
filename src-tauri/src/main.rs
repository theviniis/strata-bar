#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;
mod metrics;
use serde_json::{json, Value};
use tauri::Manager;
#[tauri::command]
fn capabilities() -> Value {
    json!({"cpu":true,"memory":true,"volume":true,"appBar":true,"gpu":false,"network":false})
}
#[tauri::command]
fn subscribe(
    window: tauri::WebviewWindow,
    state: tauri::State<metrics::Metrics>,
    channel: String,
    interval_ms: u64,
) -> Result<Value, String> {
    state.subscribe(channel, window.label().into(), interval_ms)
}
#[tauri::command]
fn unsubscribe(window: tauri::WebviewWindow, state: tauri::State<metrics::Metrics>, token: String) {
    state.unsubscribe(&token, window.label());
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
fn diagnostics(app: tauri::AppHandle, state: tauri::State<metrics::Metrics>) -> Value {
    json!({"metrics":state.diagnostics(),"bars":app.webview_windows().keys().collect::<Vec<_>>()})
}
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}
fn main() {
    if std::env::args().any(|v| v == "--probe") {
        let result = json!({"metrics":metrics::probe(),"monitors":desktop::monitor_snapshot(),"bars":desktop::bar_snapshot()});
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
            diagnostics,
            quit
        ])
        .setup(|app| {
            app.manage(metrics::Metrics::start(app.handle().clone()));
            desktop::reconcile(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(metrics) = window.app_handle().try_state::<metrics::Metrics>() {
                    metrics.remove_window(window.label());
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
        }
    });
    unsafe {
        let _ = windows::Win32::Foundation::CloseHandle(instance);
    }
}
