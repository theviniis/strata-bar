//! Opt-in check using the real settings WebView, native saves and Win32 rectangles.
//! `--check-monitor-manager` uses an isolated temporary config, never the user's file.
use serde_json::{json, Value};
use std::{sync::mpsc, time::Duration};
use tauri::{AppHandle, Manager};

static PHASE: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
fn phase(name: &str) {
    *PHASE.lock().unwrap() = name.to_string();
}
fn main_thread<T: Send + 'static>(
    app: &AppHandle,
    task: impl FnOnce(AppHandle) -> T + Send + 'static,
) -> T {
    let (tx, rx) = mpsc::sync_channel(1);
    let job = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(task(job));
    })
    .unwrap();
    rx.recv_timeout(Duration::from_secs(10))
        .expect("Monitor check main-thread timeout")
}
fn wait(app: &AppHandle, condition: impl Fn(&AppHandle) -> bool) {
    for _ in 0..100 {
        if condition(app) {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!(
        "Monitor manager check timed out; labels={:?}; physical={}",
        app.webview_windows().keys().collect::<Vec<_>>(),
        crate::desktop::bar_snapshot()
    );
}
fn script(app: &AppHandle, script: &str) {
    let script = script.to_string();
    main_thread(app, move |app| {
        app.get_webview_window(crate::desktop::SETTINGS)
            .unwrap()
            .eval(&script)
            .unwrap()
    });
}
fn ready(app: &AppHandle, expression: &str) {
    let expression = expression.to_string();
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let token = format!(
        "monitor-check-ready-{}",
        SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    wait(app, |app| {
        script(app, &format!("if ({expression}) location.hash='{token}'; else location.hash='monitor-check-wait';"));
        std::thread::sleep(Duration::from_millis(50));
        let token = token.clone();
        main_thread(app, move |app| {
            app.get_webview_window(crate::desktop::SETTINGS)
                .unwrap()
                .url()
                .unwrap()
                .fragment()
                == Some(token.as_str())
        })
    });
}

/// Settings acceptance at the existing real-WebView seam, using this check's
/// isolated document. No account connection or hook action is performed.
fn check_settings_draft(app: &AppHandle) -> Value {
    use std::os::windows::fs::OpenOptionsExt;
    let snapshot = || {
        app.state::<crate::config::ConfigStore>()
            .snapshot()
            .unwrap()
    };
    let original = snapshot().config;
    let click = |label: &str| {
        script(app, &format!("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==={}).click()", json!(label)));
    };
    let edit = |value: &str| {
        script(app, &format!("{{ const input=document.querySelector('#config-json'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,{}); input.dispatchEvent(new Event('input',{{bubbles:true}})); }}", json!(value)));
    };
    let bars_have_spacing = |spacing: u32| {
        static CHECK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let token = format!(
            "settings-spacing-{}",
            CHECK.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        wait(app, |app| {
            let token = token.clone();
            main_thread(app, move |app| {
                let mut passed = true;
                for (label, window) in app.webview_windows() {
                    if !label.starts_with("bar-") {
                        continue;
                    }
                    window.eval(&format!("if(document.querySelector('nav')?.style.gap==='{spacing}px') location.hash='{token}';")).unwrap();
                    passed &= window.url().unwrap().fragment() == Some(token.as_str());
                }
                passed
            })
        });
    };

    phase("shared Draft and Apply");
    click("JSON");
    ready(app, "document.querySelector('#config-json') && !document.querySelector('#config-json').disabled");
    let mut candidate = original.clone();
    candidate.bar.spacing = 13.0;
    edit(&serde_json::to_string(&candidate).unwrap());
    click("Aparência");
    ready(app, "document.querySelector('[role=slider][aria-label=\"Espaçamento entre widgets\"]')?.getAttribute('aria-valuenow')==='13'");
    assert_eq!(snapshot().config, original);
    bars_have_spacing(8);
    click("Aplicar");
    wait(app, |_| snapshot().config == candidate);
    bars_have_spacing(13);
    let path = app
        .state::<crate::config::ConfigStore>()
        .path()
        .to_path_buf();
    let saved_bytes = std::fs::read(&path).unwrap();

    phase("defaults remain a Draft and Revert reloads saved preferences");
    click("Restaurar padrões");
    click("JSON");
    ready(
        app,
        "JSON.parse(document.querySelector('#config-json').value).bar.spacing===8",
    );
    assert_eq!(snapshot().config, candidate);
    assert_eq!(std::fs::read(&path).unwrap(), saved_bytes);
    bars_have_spacing(13);
    click("Reverter");
    ready(app, "JSON.parse(document.querySelector('#config-json').value).bar.spacing===13 && ![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Aplicar').disabled");

    phase("reopen saved configuration");
    main_thread(app, |app| {
        app.get_webview_window(crate::desktop::SETTINGS)
            .unwrap()
            .close()
            .unwrap()
    });
    wait(app, |app| {
        app.get_webview_window(crate::desktop::SETTINGS).is_none()
    });
    main_thread(app, |app| crate::desktop::open_settings(&app).unwrap());
    ready(app, "document.querySelector('#config-json') && JSON.parse(document.querySelector('#config-json').value).bar.spacing===13");

    phase("invalid Draft preserves saved configuration");
    edit("{");
    ready(app, "document.querySelector('#config-error') && [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Aplicar').disabled");
    assert_eq!(std::fs::read(&path).unwrap(), saved_bytes);
    click("Reverter");
    ready(app, "!document.querySelector('#config-error') && ![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Aplicar').disabled");

    phase("native atomic write failure preserves saved configuration");
    candidate.bar.spacing = 17.0;
    edit(&serde_json::to_string(&candidate).unwrap());
    // Windows denies replacing a destination opened without FILE_SHARE_DELETE.
    let lock = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(3)
        .open(&path)
        .unwrap();
    click("Aplicar");
    ready(
        app,
        "document.querySelector('#config-error')?.textContent.includes('Cannot save config')",
    );
    assert_eq!(snapshot().config.bar.spacing, 13.0);
    assert_eq!(std::fs::read(&path).unwrap(), saved_bytes);
    bars_have_spacing(13);
    drop(lock);
    click("Reverter");
    ready(app, "!document.querySelector('#config-error') && ![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Aplicar').disabled");

    click("Restaurar padrões");
    click("Aplicar");
    let mut defaults = original.clone();
    defaults.schema = None;
    wait(app, |_| snapshot().config == defaults);
    bars_have_spacing(8);
    click("Layout");
    ready(
        app,
        "[...document.querySelectorAll('[role=tab]')].some(b=>b.textContent.includes('Monitor 1'))",
    );
    json!({"sharedDraft":true,"applyPersistsAndPropagates":true,"defaultsRequireApply":true,"revert":true,"reopen":true,"validationFailurePreservesFile":true,"writeFailurePreservesFile":true,"realBarSpacing":[8,13,8]})
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Value {
            phase("initial load");
            let monitors = crate::monitors::list().unwrap();
            assert!(!monitors.is_empty());
            main_thread(&app, |app| crate::desktop::open_settings(&app).unwrap());
            ready(&app, "[...document.querySelectorAll('[role=tab]')].some(b=>b.textContent.includes('Monitor 1')) && [...document.querySelectorAll('button')].some(b=>b.textContent==='Aplicar' && !b.disabled)");
            let settings_draft = check_settings_draft(&app);
            std::fs::write(
                std::env::temp_dir().join("strata-settings-draft-check.json"),
                serde_json::to_string_pretty(&settings_draft).unwrap(),
            )
            .unwrap();
            let before = main_thread(&app, |_| crate::desktop::monitor_snapshot());
            assert_eq!(
                main_thread(&app, |app| app
                    .webview_windows()
                    .keys()
                    .filter(|s| s.starts_with("bar-"))
                    .count()),
                monitors.len()
            );
            phase("disable one monitor");
            // Select a real monitor; disable it through the rendered Switch and Apply button.
            script(&app, "[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.includes('Monitor 1')).click()");
            ready(
                &app,
                "[...document.querySelectorAll('[role=tab]')].some(b=>b.textContent.includes('Monitor 1') && b.getAttribute('aria-selected')==='true') && document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='true'",
            );
            phase("widget inspector Apply and focus");
            script(
                &app,
                "document.querySelector('button[aria-label=\"Configurar CPU\"]').click()",
            );
            ready(
                &app,
                "document.querySelector('[role=dialog] input[type=number]')",
            );
            script(&app, "{ const input=document.querySelector('[role=dialog] input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'4000'); input.dispatchEvent(new Event('input',{bubbles:true})); }");
            script(&app, "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Compacto').click()");
            script(
                &app,
                "document.querySelector('[role=dialog] button[role=checkbox]').click()",
            );
            script(&app, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Concluir').click()");
            ready(&app, "!document.querySelector('[role=dialog]') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Aplicar' && !b.disabled)");
            script(&app, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Aplicar').click()");
            let target = monitors[0].id.clone();
            wait(&app, |app| {
                let config = app
                    .state::<crate::config::ConfigStore>()
                    .snapshot()
                    .unwrap()
                    .config;
                crate::config::project(&config, Some(&target)).widgets.right[0].interval_ms == 4000
            });
            let edited = app
                .state::<crate::config::ConfigStore>()
                .snapshot()
                .unwrap()
                .config;
            assert_eq!(edited.widgets, crate::config::defaults().widgets);
            for monitor in &monitors {
                let projection = crate::config::project(&edited, Some(&monitor.id));
                assert_eq!(
                    projection.widgets.right[0].interval_ms,
                    if monitor.id == target { 4000 } else { 2000 }
                );
            }
            wait(&app, |app| {
                let target = target.clone();
                main_thread(app, move |app| {
                    let mut ready = true;
                    for (label, window) in app.webview_windows() {
                        if !label.starts_with("bar-") {
                            continue;
                        }
                        let compact = crate::desktop::monitor_name(&window).as_deref()
                            == Some(target.as_str());
                        window.eval(&format!("{{ const cpu=document.querySelector('button[aria-label=\"Detalhes da CPU\"]'); if(cpu && ([...cpu.querySelectorAll('span')].some(span=>span.textContent==='CPU') === {})) location.hash='widget-config-ready'; }}", !compact)).unwrap();
                        ready &= window.url().unwrap().fragment() == Some("widget-config-ready");
                    }
                    ready
                })
            });
            phase("global interval resubscription");
            script(&app, "[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Todos').click()");
            ready(&app, "[...document.querySelectorAll('[role=tab]')].some(b=>b.textContent==='Todos' && b.getAttribute('aria-selected')==='true')");
            script(
                &app,
                "document.querySelector('button[aria-label=\"Configurar CPU\"]').click()",
            );
            ready(
                &app,
                "document.querySelector('[role=dialog] input[type=number]')",
            );
            script(&app, "{ const input=document.querySelector('[role=dialog] input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'6000'); input.dispatchEvent(new Event('input',{bubbles:true})); }");
            script(&app, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Concluir').click()");
            ready(&app, "!document.querySelector('[role=dialog]') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Aplicar' && !b.disabled)");
            script(&app, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Aplicar').click()");
            wait(&app, |app| {
                app.state::<crate::metrics::Metrics>().diagnostics()["intervals"]["cpu"] == 6000
            });
            let subscription =
                app.state::<crate::metrics::Metrics>().diagnostics()["intervals"].clone();
            let baseline = app
                .state::<crate::config::ConfigStore>()
                .snapshot()
                .unwrap()
                .config;
            for monitor in &monitors {
                let cpu = crate::config::project(&baseline, Some(&monitor.id))
                    .widgets
                    .right[0]
                    .clone();
                assert_eq!(cpu.interval_ms, 6000);
                assert_eq!(cpu.tooltip, monitor.id != target);
            }
            script(&app, "[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.includes('Monitor 1')).click()");
            ready(&app, "[...document.querySelectorAll('[role=tab]')].some(b=>b.textContent.includes('Monitor 1') && b.getAttribute('aria-selected')==='true')");
            let focus_before = main_thread(&app, |_| unsafe {
                windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow().0 as isize
            });
            phase("disable one monitor");
            ready(&app, "[...document.querySelectorAll('button')].some(b=>b.textContent==='Aplicar' && !b.disabled)");
            script(&app, "document.querySelector('[role=switch]').click()");
            std::thread::sleep(Duration::from_millis(100));
            script(&app, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Aplicar').click()");
            let id = monitors[0].id.clone();
            wait(&app, |app| {
                let config = app
                    .state::<crate::config::ConfigStore>()
                    .snapshot()
                    .unwrap()
                    .config;
                !crate::config::project(&config, Some(&id)).bar.enabled
                    && main_thread(app, |app| {
                        app.webview_windows()
                            .keys()
                            .filter(|s| s.starts_with("bar-"))
                            .count()
                    }) == monitors.len() - 1
            });
            let disabled = main_thread(&app, |_| crate::desktop::monitor_snapshot());
            // All scope: enable every bar, then disable every bar, keeping settings alive.
            script(&app, "[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Todos').click()");
            ready(&app, "[...document.querySelectorAll('[role=tab]')].some(b=>b.textContent==='Todos' && b.getAttribute('aria-selected')==='true')");
            for (step, enabled) in [true, false, true].into_iter().enumerate() {
                phase(&format!("set all enabled={enabled}, step={step}"));
                ready(&app, "[...document.querySelectorAll('button')].some(b=>b.textContent==='Aplicar' && !b.disabled)");
                script(&app, "document.querySelector('[role=switch]').click()");
                std::thread::sleep(Duration::from_millis(100));
                script(&app, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Aplicar').click()");
                wait(&app, |app| {
                    let config = app
                        .state::<crate::config::ConfigStore>()
                        .snapshot()
                        .unwrap()
                        .config;
                    config.bar.enabled == enabled
                        && monitors.iter().all(|m| {
                            crate::config::project(&config, Some(&m.id)).bar.enabled == enabled
                        })
                        && main_thread(app, |app| {
                            app.webview_windows()
                                .keys()
                                .filter(|s| s.starts_with("bar-"))
                                .count()
                        }) == if enabled { monitors.len() } else { 0 }
                });
                assert!(main_thread(&app, |app| app
                    .get_webview_window(crate::desktop::SETTINGS)
                    .is_some()));
            }
            let config = app
                .state::<crate::config::ConfigStore>()
                .snapshot()
                .unwrap()
                .config;
            assert_eq!(config.widgets, baseline.widgets);
            let focused = main_thread(&app, move |_| unsafe {
                windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow().0 as isize
                    == focus_before
            });
            assert!(focused, "Re-enabled bars must preserve settings focus");
            let restored = crate::config::ConfigStore::open(
                app.state::<crate::config::ConfigStore>()
                    .path()
                    .to_path_buf(),
            )
            .snapshot()
            .unwrap();
            assert_eq!(restored.config, config);
            // Window registration precedes owner-thread activation; wait for the actual reservation.
            wait(&app, |app| {
                main_thread(app, |_| crate::desktop::monitor_snapshot()) == before
            });
            let after = main_thread(&app, |_| crate::desktop::monitor_snapshot());
            assert_ne!(
                before, disabled,
                "Disabling must release a measured work area"
            );
            let bars = main_thread(&app, |_| crate::desktop::bar_snapshot());
            assert_eq!(
                before, after,
                "Re-enabling must restore measured work areas"
            );
            for bar in bars.as_array().unwrap() {
                assert_eq!(bar["visible"], true);
                assert_eq!(bar["komorebiEligible"], false);
                assert_eq!(bar["toolWindow"], true);
                assert_eq!(bar["topmost"], true);
                assert_eq!(bar["noActivate"], false);
            }
            json!({"passed":true,"settingsDraft":settings_draft,"monitors":monitors,"before":before,"oneDisabled":disabled,"after":after,"bars":bars,"settings":crate::desktop::settings_snapshot(),"persisted":true,"widgetApply":true,"focusPreserved":focused,"liveIntervals":subscription})
        }));
        let report = result.unwrap_or_else(|error| json!({"passed":false,"phase": PHASE.lock().unwrap().clone(), "metrics":app.state::<crate::metrics::Metrics>().diagnostics(), "config":app.state::<crate::config::ConfigStore>().snapshot().ok(), "error":error.downcast_ref::<String>().cloned().or_else(|| error.downcast_ref::<&str>().map(|s|s.to_string())).unwrap_or_default()}));
        let _ = std::fs::write(
            std::env::temp_dir().join("strata-monitor-manager-check.json"),
            serde_json::to_string_pretty(&report).unwrap(),
        );
        app.exit(if report["passed"] == true { 0 } else { 1 });
    });
}

/// Exercises the settings Apply path and live AppBar negotiation using an isolated config.
pub fn start_geometry(app: AppHandle) {
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Value {
            let monitors = crate::monitors::list().unwrap();
            assert!(
                monitors.len() >= 2,
                "Geometry acceptance requires two monitors"
            );
            main_thread(&app, |app| crate::desktop::open_settings(&app).unwrap());
            ready(&app, "[...document.querySelectorAll('button')].some(b=>b.textContent==='Aplicar' && !b.disabled)");
            let labels = main_thread(&app, |app| {
                let mut labels: Vec<_> = app
                    .webview_windows()
                    .keys()
                    .filter(|l| l.starts_with("bar-"))
                    .cloned()
                    .collect();
                labels.sort();
                labels
            });
            script(&app, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Aparência').click()");
            ready(
                &app,
                "document.querySelector('[role=slider][aria-label=\"Altura da barra\"]')",
            );
            let mut phases = Vec::new();
            for (height, position, spacing, topmost, key) in [
                (80, "bottom", 32, true, "End"),
                (28, "top", 0, true, "Home"),
            ] {
                phase(position);
                script(&app, &format!("document.querySelector('[role=slider][aria-label=\"Altura da barra\"]').dispatchEvent(new KeyboardEvent('keydown',{{key:'{key}',bubbles:true}}));"));
                script(&app, &format!("document.querySelector('[role=slider][aria-label=\"Espaçamento entre widgets\"]').dispatchEvent(new KeyboardEvent('keydown',{{key:'{key}',bubbles:true}}));"));
                let label = if position == "top" {
                    "Superior"
                } else {
                    "Inferior"
                };
                script(&app, &format!("[...document.querySelectorAll('button')].find(b=>b.textContent==='{label}').click();"));
                // An unapplied draft must not alter native config.
                assert_ne!(
                    app.state::<crate::config::ConfigStore>()
                        .snapshot()
                        .unwrap()
                        .config
                        .bar
                        .height,
                    height
                );
                script(&app, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Aplicar').click()");
                wait(&app, |app| {
                    let bar = app
                        .state::<crate::config::ConfigStore>()
                        .snapshot()
                        .unwrap()
                        .config
                        .bar;
                    bar.height == height && bar.spacing == spacing as f64
                });
                // Measure rendered content as well as the direct Win32 rectangle.
                wait(&app, |app| {
                    main_thread(app, move |app| {
                        let mut complete = true;
                        for (name, window) in app.webview_windows() {
                            if !name.starts_with("bar-") {
                                continue;
                            }
                            window.eval(&format!("if(document.querySelector('nav') && getComputedStyle(document.querySelector('nav')).gap==='{spacing}px') location.hash='geometry-{height}';")).unwrap();
                            complete &= window.url().unwrap().fragment()
                                == Some(format!("geometry-{height}").as_str());
                        }
                        complete
                    })
                });
                // The same HWND owners survive every edit (no content/subscription remount).
                let unchanged = main_thread(&app, |app| {
                    let mut labels: Vec<_> = app
                        .webview_windows()
                        .keys()
                        .filter(|l| l.starts_with("bar-"))
                        .cloned()
                        .collect();
                    labels.sort();
                    labels
                });
                assert_eq!(labels, unchanged);
                use std::os::windows::process::CommandExt;
                let output = std::process::Command::new("powershell")
                    .args([
                        "-NoProfile",
                        "-File",
                        "scripts/test-live-geometry.ps1",
                        "-Executable",
                    ])
                    .arg(std::env::current_exe().unwrap())
                    .args([
                        "-Height",
                        &height.to_string(),
                        "-Position",
                        position,
                        "-Topmost",
                        if topmost { "true" } else { "false" },
                    ])
                    .creation_flags(0x08000000)
                    .output()
                    .unwrap();
                assert!(
                    output.status.success(),
                    "Live geometry script: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
                phases.push(json!({"height":height,"position":position,"spacing":spacing,"alwaysOnTop":topmost,"bars":main_thread(&app, |_| crate::desktop::bar_snapshot()),"monitors":main_thread(&app, |_| crate::desktop::monitor_snapshot()),"scriptPassed":true,"renderedSpacing":true,"sameWindows":true}));
            }
            json!({"passed":true,"phases":phases,"settingsApply":true,"monitors":monitors})
        }));
        let report = result.unwrap_or_else(|error| json!({"passed":false,"phase":PHASE.lock().unwrap().clone(),"error":error.downcast_ref::<String>().cloned().or_else(|| error.downcast_ref::<&str>().map(|s|s.to_string())).unwrap_or_default()}));
        std::fs::write(
            std::env::temp_dir().join("strata-bar-geometry-check.json"),
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .unwrap();
        app.exit(if report["passed"] == true { 0 } else { 1 });
    });
}
