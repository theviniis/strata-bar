//! Explicit debug smoke check against real WebView2/AppBar windows, never startup behavior.
use serde_json::{json, Value};
use std::{sync::mpsc, time::Duration};
use tauri::{AppHandle, Manager};
use windows::Win32::{Foundation::HWND, UI::WindowsAndMessaging::GetForegroundWindow};

fn main_thread<T: Send + 'static>(
    app: &AppHandle,
    task: impl FnOnce(AppHandle) -> T + Send + 'static,
) -> T {
    let (tx, rx) = mpsc::sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(task(handle));
    })
    .unwrap();
    rx.recv_timeout(Duration::from_secs(10))
        .expect("Popup check main-thread timeout")
}
fn wait_for(app: &AppHandle, visible: bool) -> Value {
    for _ in 0..60 {
        let snapshot = main_thread(app, |_| crate::desktop::overlay_snapshot());
        if snapshot["window"]["visible"].as_bool() == Some(visible) {
            return snapshot;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("Overlay visibility did not become {visible}");
}
fn focused(app: &AppHandle, label: String) -> bool {
    main_thread(app, move |app| {
        let window = app.get_webview_window(&label).unwrap();
        unsafe { GetForegroundWindow() == HWND(window.hwnd().unwrap().0) }
    })
}
fn wait_focus(app: &AppHandle, label: &str) -> bool {
    for _ in 0..20 {
        if focused(app, label.to_string()) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}
fn click(app: &AppHandle, label: String) {
    main_thread(app, move |app| {
        let bar = app.get_webview_window(&label).unwrap();
        bar.set_focus().unwrap();
        bar.eval(r#"document.querySelector('button[aria-label="Saída de áudio"]')?.click()"#)
            .unwrap();
    });
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            // Let the real views install listeners and subscribe their channels.
            std::thread::sleep(Duration::from_secs(3));
            let mut bars = app
                .webview_windows()
                .keys()
                .filter(|label| label.starts_with("bar-"))
                .cloned()
                .collect::<Vec<_>>();
            bars.sort();
            assert!(!bars.is_empty());
            let mut checks = Vec::new();
            for label in bars {
                let baseline = app.state::<crate::metrics::Metrics>().diagnostics()["subscribers"]
                    .as_u64()
                    .unwrap();
                click(&app, label.clone());
                wait_for(&app, true);
                std::thread::sleep(Duration::from_millis(200));
                let shown = main_thread(&app, |_| crate::desktop::overlay_snapshot());
                let interactive = !shown["window"]["clickThrough"].as_bool().unwrap();
                let floating = shown["window"]["komorebiEligible"] == false
                    && shown["window"]["toolWindow"] == true
                    && shown["window"]["topmost"] == true;
                let overlay_focused = wait_focus(&app, crate::desktop::OVERLAY);
                assert!(
                    interactive && floating && overlay_focused,
                    "Popup should be interactive, floating and focused: interactive={interactive}, floating={floating}, focused={overlay_focused}, snapshot={shown}"
                );
                std::thread::sleep(Duration::from_millis(300));
                let subscribed = app.state::<crate::metrics::Metrics>().diagnostics()
                    ["subscribers"]
                    .as_u64()
                    .unwrap()
                    >= baseline + 2;
                assert!(subscribed, "Popup content should own audio subscriptions");
                // Resizing an existing popup must not steal focus back from its source.
                let source = label.clone();
                main_thread(&app, move |app| {
                    app.get_webview_window(&source)
                        .unwrap()
                        .set_focus()
                        .unwrap();
                });
                assert!(wait_focus(&app, &label));
                main_thread(&app, |app| {
                    crate::desktop::check_resize_active(&app).unwrap()
                });
                let resized_without_focus = wait_focus(&app, &label);
                assert!(resized_without_focus);
                main_thread(&app, |app| {
                    let overlay = app.get_webview_window(crate::desktop::OVERLAY).unwrap();
                    overlay.set_focus().unwrap();
                    overlay.eval("document.querySelector('[role=dialog]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))").unwrap();
                });
                let hidden = wait_for(&app, false);
                assert_eq!(hidden["window"]["clickThrough"], true);
                assert!(
                    wait_focus(&app, &label),
                    "Escape should restore source focus"
                );
                for _ in 0..30 {
                    if app.state::<crate::metrics::Metrics>().diagnostics()["subscribers"].as_u64()
                        == Some(baseline)
                    {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                let cleaned = app.state::<crate::metrics::Metrics>().diagnostics()["subscribers"]
                    .as_u64()
                    == Some(baseline);
                assert!(cleaned, "Popup subscriptions should be released");
                // Exercise source-window outside-pointer policy through the real widget controller.
                click(&app, label.clone());
                wait_for(&app, true);
                let source = label.clone();
                main_thread(&app, move |app| {
                    let bar = app.get_webview_window(&source).unwrap();
                    bar.set_focus().unwrap();
                    bar.eval("document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))").unwrap();
                });
                wait_for(&app, false);
                assert!(wait_focus(&app, &label));
                checks.push(json!({"source":label,"shown":shown,"hidden":hidden,"interactive":interactive,"floating":floating,"focused":overlay_focused,"resizePreservesFocus":resized_without_focus,"subscriptionsReleased":cleaned,"escape":true,"outsidePointer":true,"passed":true}));
            }
            json!({"passed":true,"checks":checks,"bars":crate::desktop::bar_snapshot(),"monitors":crate::desktop::monitor_snapshot()})
        }));
        let report = result.unwrap_or_else(|error| {
            let message = error
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| error.downcast_ref::<&str>().map(|s| s.to_string()))
                .unwrap_or_else(|| "Popup check panicked".into());
            json!({"passed":false,"error":message})
        });
        let _ = std::fs::write(
            std::env::temp_dir().join("strata-popup-framework-check.json"),
            serde_json::to_string_pretty(&report).unwrap(),
        );
        let code = if report["passed"] == true { 0 } else { 1 };
        app.exit(code);
    });
}
