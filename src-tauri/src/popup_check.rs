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
    main_thread(app, |app| {
        for window in app.webview_windows().values() {
            let _ = window.eval("location.hash=encodeURIComponent(JSON.stringify({text:document.body.innerText,buttons:document.querySelectorAll('button').length,native:!!window.__TAURI_INTERNALS__,errors:window.__popupCheckErrors}))");
        }
    });
    std::thread::sleep(Duration::from_millis(200));
    let state = main_thread(app, |app| {
        app.webview_windows()
            .into_iter()
            .map(|(label, window)| {
                (
                    label,
                    window.url().map(|url| url.to_string()).unwrap_or_default(),
                )
            })
            .collect::<std::collections::BTreeMap<_, _>>()
    });
    let overlay = main_thread(app, |_| crate::desktop::overlay_snapshot());
    panic!("Overlay visibility did not become {visible}; views: {state:?}; overlay: {overlay}");
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
fn click(app: &AppHandle, label: String, aria: &'static str) {
    main_thread(app, move |app| {
        let bar = app.get_webview_window(&label).unwrap();
        bar.set_focus().unwrap();
        bar.eval(&format!(r#"window.__popupCheckErrors=[]; addEventListener('error',event=>window.__popupCheckErrors.push(event.message)); addEventListener('unhandledrejection',event=>window.__popupCheckErrors.push(String(event.reason))); document.querySelector('button[aria-label="{aria}"]')?.click()"#))
            .unwrap();
    });
}

fn check_memory_content(app: &AppHandle) -> Value {
    main_thread(app, |app| {
        app.get_webview_window(crate::desktop::OVERLAY)
            .unwrap()
            .eval("location.hash='memory-check-pending'")
            .unwrap();
    });
    for _ in 0..60 {
        main_thread(app, |app| {
            app.get_webview_window(crate::desktop::OVERLAY).unwrap().eval(r#"
                { const content = document.querySelector('section[aria-label="Detalhes da memória"]');
                if (content && content.querySelector('svg') && content.querySelectorAll('dd').length === 6 && content.innerText.includes('GiB') && !content.innerText.includes('Dados de demonstração')) location.hash='memory-content-ready'; }
            "#).unwrap();
        });
        std::thread::sleep(Duration::from_millis(100));
        let ready = main_thread(app, |app| {
            app.get_webview_window(crate::desktop::OVERLAY)
                .unwrap()
                .url()
                .unwrap()
                .fragment()
                == Some("memory-content-ready")
        });
        if ready {
            let diagnostics = app.state::<crate::metrics::Metrics>().diagnostics();
            let data = diagnostics["channels"]["memory"]["data"].clone();
            for field in [
                "totalBytes",
                "availableBytes",
                "usedBytes",
                "cachedBytes",
                "pagingFileBytes",
                "percent",
            ] {
                assert!(
                    data[field]["status"] == "ready"
                        || (field == "pagingFileBytes" && data[field]["status"] == "notConfigured"),
                    "Memory source {field} unavailable: {data}"
                );
            }
            assert!(!data["history"].as_array().unwrap().is_empty());
            return data;
        }
    }
    panic!("Real memory content did not render six indicators and graph");
}

// Real DOM -> ResizeObserver -> IPC -> Win32 rectangle round trip in both axes.
fn check_content_size(app: &AppHandle, width: f64, height: f64) {
    let scale = main_thread(app, |app| {
        app.get_webview_window(crate::desktop::OVERLAY)
            .unwrap()
            .scale_factor()
            .unwrap()
    });
    main_thread(app, move |app| {
        app.get_webview_window(crate::desktop::OVERLAY).unwrap().eval(&format!(
            "Object.assign(document.querySelector('[role=dialog]').style, {{width:'{width}px',height:'{height}px'}})"
        )).unwrap();
    });
    for _ in 0..50 {
        let snapshot = main_thread(app, |_| crate::desktop::overlay_snapshot());
        let rect = &snapshot["window"]["rect"];
        let actual_width = rect[2].as_f64().unwrap() - rect[0].as_f64().unwrap();
        let actual_height = rect[3].as_f64().unwrap() - rect[1].as_f64().unwrap();
        if (actual_width - width * scale).abs() <= 1.0
            && (actual_height - (height + 12.0) * scale).abs() <= 1.0
        {
            assert_eq!(snapshot["window"]["komorebiEligible"], false);
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("Popup did not follow content size {width}x{height}");
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
            let mut retention = Value::Null;
            for label in &bars {
                for (feature, aria, added_subscriptions) in [
                    ("audioOutputs", "Saída de áudio", 2),
                    ("memory", "Detalhes da memória", 1),
                ] {
                    let baseline = app.state::<crate::metrics::Metrics>().diagnostics()
                        ["subscribers"]
                        .as_u64()
                        .unwrap();
                    click(&app, label.clone(), aria);
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
                        >= baseline + added_subscriptions;
                    assert!(subscribed, "Popup content should own its subscriptions");
                    let memory = if feature == "memory" {
                        check_memory_content(&app)
                    } else {
                        Value::Null
                    };
                    if feature == "memory" && retention.is_null() {
                        let first_at = memory["sampledAt"].as_f64().unwrap();
                        for _ in 0..36 {
                            std::thread::sleep(Duration::from_secs(2));
                            let current = app.state::<crate::metrics::Metrics>().diagnostics()
                                ["channels"]["memory"]["data"]
                                .clone();
                            if current["sampledAt"].as_f64().unwrap() - first_at >= 62000. {
                                let history = current["history"].as_array().unwrap();
                                assert!((25..=31).contains(&history.len()));
                                let span = current["sampledAt"].as_f64().unwrap()
                                    - history[0]["timestamp"].as_f64().unwrap();
                                assert!((50000.0..=60010.0).contains(&span));
                                retention = json!({"passed":true,"samples":history.len(),"spanMs":span,"oldSampleExpired":!history.iter().any(|point| point["sequence"]==memory["sequence"])});
                                assert_eq!(retention["oldSampleExpired"], true);
                                break;
                            }
                        }
                        assert!(!retention.is_null(), "Memory retention check timed out");
                    }
                    check_content_size(&app, 560.0, 480.0);
                    check_content_size(&app, 280.0, 140.0);
                    main_thread(&app, |app| {
                        app.get_webview_window(crate::desktop::OVERLAY).unwrap().eval("{ const dialog=document.querySelector('[role=dialog]'); dialog.style.removeProperty('width'); dialog.style.removeProperty('height'); }").unwrap();
                    });
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
                        if app.state::<crate::metrics::Metrics>().diagnostics()["subscribers"]
                            .as_u64()
                            == Some(baseline)
                        {
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    let cleaned = app.state::<crate::metrics::Metrics>().diagnostics()
                        ["subscribers"]
                        .as_u64()
                        == Some(baseline);
                    assert!(
                        cleaned,
                        "Popup subscriptions should be released: baseline={baseline}, actual={}",
                        app.state::<crate::metrics::Metrics>().diagnostics()
                    );
                    // Exercise source-window outside-pointer policy through the real widget controller.
                    click(&app, label.clone(), aria);
                    wait_for(&app, true);
                    if feature == "memory" {
                        let reopened = check_memory_content(&app);
                        assert!(
                            reopened["sequence"].as_u64().unwrap()
                                >= memory["sequence"].as_u64().unwrap()
                        );
                        if reopened["sampledAt"].as_f64().unwrap()
                            - memory["sampledAt"].as_f64().unwrap()
                            < 60000.
                        {
                            assert!(
                                reopened["history"]
                                    .as_array()
                                    .unwrap()
                                    .iter()
                                    .any(|point| point["sequence"] == memory["sequence"]),
                                "Reopening discarded recent shared history"
                            );
                        }
                    }
                    let source = label.clone();
                    main_thread(&app, move |app| {
                        let bar = app.get_webview_window(&source).unwrap();
                        bar.set_focus().unwrap();
                        bar.eval("document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))").unwrap();
                    });
                    wait_for(&app, false);
                    assert!(wait_focus(&app, &label));
                    checks.push(json!({"source":label,"feature":feature,"memory":memory,"shown":shown,"hidden":hidden,"interactive":interactive,"floating":floating,"focused":overlay_focused,"contentSizeRoundTrip":true,"resizePreservesFocus":resized_without_focus,"subscriptionsReleased":cleaned,"escape":true,"outsidePointer":true,"passed":true}));
                }
            }
            for label in &bars {
                let source = label.clone();
                main_thread(&app, move |app| {
                    app.get_webview_window(&source).unwrap().eval(r#"document.querySelector('button[aria-label="Pausar memória no teste"]')?.click()"#).unwrap();
                });
            }
            std::thread::sleep(Duration::from_millis(300));
            let before = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]["memory"]
                ["data"]
                .clone();
            std::thread::sleep(Duration::from_secs(6));
            let paused = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]["memory"]
                ["data"]
                .clone();
            assert_eq!(
                before["sequence"], paused["sequence"],
                "Collection continued without memory consumers"
            );
            for label in &bars {
                let source = label.clone();
                main_thread(&app, move |app| {
                    app.get_webview_window(&source).unwrap().eval(r#"document.querySelector('button[aria-label="Retomar memória no teste"]')?.click()"#).unwrap();
                });
            }
            let mut resumed = Value::Null;
            for _ in 0..40 {
                std::thread::sleep(Duration::from_millis(100));
                let current = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]
                    ["memory"]["data"]
                    .clone();
                if current["sequence"].as_u64() > paused["sequence"].as_u64() {
                    resumed = current;
                    break;
                }
            }
            assert!(
                !resumed.is_null(),
                "Memory did not recover after resubscription"
            );
            let gap =
                resumed["sampledAt"].as_f64().unwrap() - paused["sampledAt"].as_f64().unwrap();
            assert!(gap > 6000., "Pause must remain an observed history gap");
            json!({"passed":true,"checks":checks,"memoryRetention":retention,"memoryPauseResume":{"passed":true,"gapMs":gap},"bars":crate::desktop::bar_snapshot(),"monitors":crate::desktop::monitor_snapshot()})
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
