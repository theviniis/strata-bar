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
    let diagnostics = app.state::<crate::metrics::Metrics>().diagnostics();
    panic!("Overlay visibility did not become {visible}; views: {state:?}; overlay: {overlay}; metrics: {diagnostics}");
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

fn check_resource_content(app: &AppHandle, feature: &'static str) -> Value {
    let (label, count, graphs, unit) = match feature {
        "cpu" => ("Detalhes da CPU", 5, 2, "GHz"),
        "gpu" => ("Detalhes da GPU", 6, 2, "GiB"),
        _ => ("Detalhes da memória", 6, 1, "GiB"),
    };
    main_thread(app, |app| {
        app.get_webview_window(crate::desktop::OVERLAY)
            .unwrap()
            .eval("location.hash='resource-check-pending'")
            .unwrap();
    });
    for _ in 0..60 {
        main_thread(app, move |app| {
            app.get_webview_window(crate::desktop::OVERLAY).unwrap().eval(&format!(r#"
                {{ const content = document.querySelector('section[aria-label="{label}"]');
                if (content && content.querySelectorAll('svg').length === {graphs} && content.querySelectorAll('dd').length === {count} && content.innerText.includes('{unit}') && !content.innerText.includes('Dados de demonstração')) location.hash='resource-content-ready'; }}
            "#)).unwrap();
        });
        std::thread::sleep(Duration::from_millis(100));
        let ready = main_thread(app, |app| {
            app.get_webview_window(crate::desktop::OVERLAY)
                .unwrap()
                .url()
                .unwrap()
                .fragment()
                == Some("resource-content-ready")
        });
        if ready {
            let diagnostics = app.state::<crate::metrics::Metrics>().diagnostics();
            let data = diagnostics["channels"][feature]["data"].clone();
            // Temperature, power and fan come from MSI Afterburner and may be
            // independently unavailable, so only the vendor-neutral readings
            // are required to be ready here.
            let fields: &[&str] = match feature {
                "cpu" => &[
                    "percent",
                    "frequencyHz",
                    "maxFrequencyHz",
                    "physicalCores",
                    "logicalProcessors",
                ],
                "gpu" => &[
                    "percent",
                    "memoryUsedBytes",
                    "memoryTotalBytes",
                    "sharedUsedBytes",
                    "sharedTotalBytes",
                ],
                _ => &[
                    "totalBytes",
                    "availableBytes",
                    "usedBytes",
                    "cachedBytes",
                    "pagingFileBytes",
                    "percent",
                ],
            };
            for field in fields {
                assert!(
                    data[*field]["status"] == "ready"
                        || (*field == "pagingFileBytes"
                            && data[*field]["status"] == "notConfigured"),
                    "Resource source {field} unavailable: {data}"
                );
            }
            if feature == "gpu" {
                assert!(
                    !data["adapter"]["name"].as_str().unwrap().is_empty(),
                    "GPU popup must report the selected adapter: {data}"
                );
            }
            assert!(!data["history"].as_array().unwrap().is_empty());
            return data;
        }
    }
    panic!("Real {feature} content did not render expected indicators and graphs");
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
            // Cold Vite dependency optimization can leave rendered triggers
            // waiting on their dynamic Tauri imports. Wait for real consumers
            // and the first valid CPU observation instead of clicking too early.
            let mut ready = false;
            for _ in 0..300 {
                let diagnostics = app.state::<crate::metrics::Metrics>().diagnostics();
                if diagnostics["subscribers"].as_u64().unwrap_or(0) >= bars.len() as u64 * 4
                    && diagnostics["channels"]["cpu"]["data"]["percent"]["status"] == "ready"
                {
                    ready = true;
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            assert!(ready, "Native check views did not finish subscribing");
            let mut checks = Vec::new();
            let mut retention = Value::Null;
            let mut first_memory = Value::Null;
            let mut first_cpu = Value::Null;
            for label in &bars {
                for (feature, aria, added_subscriptions) in [
                    ("audioOutputs", "Saída de áudio", 2),
                    ("audioInputs", "Entrada de \u{e1}udio", 2),
                    ("memory", "Detalhes da memória", 1),
                    ("cpu", "Detalhes da CPU", 1),
                    ("gpu", "Detalhes da GPU", 1),
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
                    let memory = if feature == "memory" || feature == "cpu" || feature == "gpu" {
                        check_resource_content(&app, feature)
                    } else {
                        Value::Null
                    };
                    if feature == "memory" && first_memory.is_null() {
                        first_memory = memory.clone();
                    }
                    if feature == "cpu" && first_cpu.is_null() {
                        first_cpu = memory.clone();
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
                    if feature == "memory" || feature == "cpu" || feature == "gpu" {
                        let reopened = check_resource_content(&app, feature);
                        assert!(
                            reopened["sequence"].as_u64().unwrap()
                                >= memory["sequence"].as_u64().unwrap()
                        );
                        if reopened["sampledAt"].as_f64().unwrap()
                            - memory["sampledAt"].as_f64().unwrap()
                            < 120000.
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
            // Retention does not need an open popup. Keep lengthy sampling waits
            // outside focus/cleanup checks so ordinary desktop activity cannot
            // invalidate an interaction baseline captured two minutes earlier.
            let first_at = first_memory["sampledAt"]
                .as_f64()
                .unwrap()
                .max(first_cpu["sampledAt"].as_f64().unwrap());
            let mut cpu_retention = Value::Null;
            for _ in 0..66 {
                std::thread::sleep(Duration::from_secs(2));
                let current = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]
                    ["memory"]["data"]
                    .clone();
                if current["sampledAt"].as_f64().unwrap() - first_at >= 122000. {
                    let history = current["history"].as_array().unwrap();
                    assert!((55..=61).contains(&history.len()));
                    let span = current["sampledAt"].as_f64().unwrap()
                        - history[0]["timestamp"].as_f64().unwrap();
                    assert!((110000.0..=120010.0).contains(&span));
                    retention = json!({"passed":true,"samples":history.len(),"spanMs":span,"oldSampleExpired":!history.iter().any(|point| point["sequence"]==first_memory["sequence"])});
                    assert_eq!(retention["oldSampleExpired"], true);
                    let cpu = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]
                        ["cpu"]["data"]
                        .clone();
                    let history = cpu["history"].as_array().unwrap();
                    let span = cpu["sampledAt"].as_f64().unwrap()
                        - history[0]["timestamp"].as_f64().unwrap();
                    assert!((55..=61).contains(&history.len()));
                    assert!((110000.0..=120010.0).contains(&span));
                    assert!(!history
                        .iter()
                        .any(|p| p["sequence"] == first_cpu["sequence"]));
                    cpu_retention = json!({"passed":true,"samples":history.len(),"spanMs":span,"oldSampleExpired":true});
                    break;
                }
            }
            assert!(!retention.is_null(), "Memory retention check timed out");
            for label in &bars {
                let source = label.clone();
                main_thread(&app, move |app| {
                    app.get_webview_window(&source).unwrap().eval(r#"document.querySelector('button[aria-label="Pausar memória no teste"]')?.click()"#).unwrap();
                });
            }
            // Wait for React unmount and asynchronous unsubscribe IPC before
            // measuring idle behavior. Only the volume widget remains per bar.
            let mut resources_released = false;
            for _ in 0..50 {
                if app.state::<crate::metrics::Metrics>().diagnostics()["subscribers"].as_u64()
                    == Some(bars.len() as u64)
                {
                    resources_released = true;
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            assert!(
                resources_released,
                "Resource fixtures did not unsubscribe: {}",
                app.state::<crate::metrics::Metrics>().diagnostics()
            );
            let before = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]["memory"]
                ["data"]
                .clone();
            let cpu_before = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]
                ["cpu"]["data"]
                .clone();
            std::thread::sleep(Duration::from_secs(6));
            let paused = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]["memory"]
                ["data"]
                .clone();
            assert_eq!(
                before["sequence"], paused["sequence"],
                "Collection continued without memory consumers"
            );
            let cpu_paused = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]
                ["cpu"]["data"]
                .clone();
            assert_eq!(
                cpu_before["sequence"], cpu_paused["sequence"],
                "CPU collection continued without consumers"
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
            let cpu_resumed = app.state::<crate::metrics::Metrics>().diagnostics()["channels"]
                ["cpu"]["data"]
                .clone();
            assert!(cpu_resumed["sequence"].as_u64() > cpu_paused["sequence"].as_u64());
            let cpu_gap = cpu_resumed["sampledAt"].as_f64().unwrap()
                - cpu_paused["sampledAt"].as_f64().unwrap();
            assert!(cpu_gap > 6000.);
            json!({"passed":true,"checks":checks,"memoryRetention":retention,"memoryPauseResume":{"passed":true,"gapMs":gap},"cpuRetention":cpu_retention,"cpuPauseResume":{"passed":true,"gapMs":cpu_gap},"bars":crate::desktop::bar_snapshot(),"monitors":crate::desktop::monitor_snapshot()})
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
