//! Isolated Windows/WebView2 smoke check using real Codex hook transport.
use serde_json::{json, Value};
use std::{
    io::Write,
    path::Path,
    process::{Command, Stdio},
    sync::mpsc,
    time::Duration,
};
use tauri::{AppHandle, Manager};
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

fn ui<T: Send + 'static>(app: &AppHandle, task: impl FnOnce(AppHandle) -> T + Send + 'static) -> T {
    let (tx, rx) = mpsc::sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(task(handle));
    })
    .unwrap();
    rx.recv_timeout(Duration::from_secs(10))
        .expect("Agents check UI timeout")
}

fn hook(root: &Path, id: &str, event: &str, turn: &str) {
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--codex-hook", root.join("endpoint.json").to_str().unwrap()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let metadata = json!({"session_id":id,"cwd":"C:\\synthetic-agents-check","hook_event_name":event,"turn_id":turn});
    child
        .stdin
        .take()
        .unwrap()
        .write_all(metadata.to_string().as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "Codex helper failed");
    assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), "{}");
}

fn read(app: &AppHandle, label: &str, phase: &str, expression: &str) -> Value {
    let label = label.to_string();
    let script = format!(
        "location.hash=encodeURIComponent(JSON.stringify({{phase:{},value:({expression})}}))",
        serde_json::to_string(phase).unwrap()
    );
    let expected = phase.to_string();
    ui(app, move |app| {
        let window = app.get_webview_window(&label).unwrap();
        window.eval(&script).unwrap();
        let url = window.url().unwrap();
        let decoded =
            url::form_urlencoded::parse(format!("v={}", url.fragment().unwrap_or("")).as_bytes())
                .next()
                .map(|(_, v)| v.into_owned())
                .unwrap_or_default();
        let result: Value = serde_json::from_str(&decoded).unwrap_or_default();
        if result["phase"] == expected {
            result["value"].clone()
        } else {
            Value::Null
        }
    })
}

fn wait(
    app: &AppHandle,
    label: &str,
    phase: &str,
    expression: &str,
    accept: impl Fn(&Value) -> bool,
) -> Value {
    let mut last = Value::Null;
    for _ in 0..120 {
        last = read(app, label, phase, expression);
        if accept(&last) {
            return last;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("Agents check {phase} timed out: {last}");
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run(&app)));
        let (report, code) = match result {
            Ok(report) => (report, 0),
            Err(error) => {
                let message = error
                    .downcast_ref::<String>()
                    .cloned()
                    .or_else(|| error.downcast_ref::<&str>().map(|s| s.to_string()))
                    .unwrap_or_else(|| "Native check panic".into());
                (json!({"passed":false,"error":message}), 1)
            }
        };
        std::fs::write(
            std::env::temp_dir().join("strata-agents-check.json"),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
        app.exit(code);
    });
}

fn wait_visible(app: &AppHandle, visible: bool) -> Value {
    let mut last = Value::Null;
    for _ in 0..120 {
        last = ui(app, |_| crate::desktop::overlay_snapshot());
        if last["window"]["visible"] == visible {
            return last;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("Agents HWND visibility did not become {visible}: {last}");
}

fn run(app: &AppHandle) -> Value {
    let bar = ui(app, |app| {
        app.webview_windows()
            .keys()
            .filter(|label| label.starts_with("bar-"))
            .min()
            .unwrap()
            .clone()
    });
    let widget = "(()=>{const b=document.querySelector('button[aria-label^=\"Abrir agentes de IA\"]');return {native:!!window.__TAURI_INTERNALS__,visible:!!b&&b.getBoundingClientRect().width>0,attention:!!b?.querySelector('.text-destructive'),label:b?.getAttribute('aria-label')}})()";
    let normal = wait(app, &bar, "normal", widget, |v| {
        v["visible"] == true && v["native"] == true && v["attention"] == false
    });
    let foreground = unsafe { GetForegroundWindow().0 as usize };
    let root =
        std::env::temp_dir().join(format!("strata-agents-hook-check-{}", std::process::id()));
    ui(app, {
        let root = root.clone();
        move |app| {
            app.state::<crate::agents::Agents>()
                .connect_check(&root)
                .unwrap()
        }
    });
    let first = "00000000-0000-4000-8000-000000000001";
    let second = "00000000-0000-4000-8000-000000000002";
    hook(&root, first, "UserPromptSubmit", "first");
    hook(&root, first, "PermissionRequest", "first");
    let attention = wait(app, &bar, "attention", widget, |v| {
        v["attention"] == true && v["label"].as_str().is_some_and(|s| s.contains("1 alertas"))
    });
    let dialog = "(()=>{const d=document.querySelector('[role=alertdialog][aria-label=\"Agentes aguardando atenção\"]');return {dialog:!!d,count:d?.querySelectorAll('li').length??0}})()";
    let alert = wait(app, crate::desktop::OVERLAY, "alert", dialog, |v| {
        v["dialog"] == true && v["count"] == 1
    });
    let overlay = wait_visible(app, true);
    assert_eq!(
        overlay["window"]["visible"], true,
        "Native overlay must be visible"
    );
    assert_eq!(
        unsafe { GetForegroundWindow().0 as usize },
        foreground,
        "Attention popup stole focus"
    );
    hook(&root, second, "UserPromptSubmit", "first");
    hook(&root, second, "PermissionRequest", "first");
    wait(app, crate::desktop::OVERLAY, "second", dialog, |v| {
        v["count"] == 2
    });
    // Allow the native delivery pass to acknowledge the updated live controller.
    std::thread::sleep(Duration::from_millis(3500));
    ui(app, |app| {
        app.get_webview_window(crate::desktop::OVERLAY)
            .unwrap()
            .eval("document.querySelector('button[aria-label=\"Fechar alerta\"]')?.click()")
            .unwrap()
    });
    std::thread::sleep(Duration::from_millis(4000));
    let dismissed = ui(app, |_| crate::desktop::overlay_snapshot());
    assert_eq!(
        dismissed["window"]["visible"], false,
        "Explicit close reopened for the second session"
    );
    hook(&root, first, "Stop", "first");
    hook(&root, second, "Stop", "first");
    let resolved = wait(app, &bar, "resolved", widget, |v| {
        v["visible"] == true && v["attention"] == false
    });
    // A new episode must open again and automatically close when attention resolves.
    hook(&root, first, "UserPromptSubmit", "next");
    hook(&root, first, "PermissionRequest", "next");
    wait(app, crate::desktop::OVERLAY, "reopened", dialog, |v| {
        v["count"] == 1
    });
    wait_visible(app, true);
    hook(&root, first, "Stop", "next");
    for _ in 0..100 {
        if ui(app, |_| crate::desktop::overlay_snapshot())["window"]["visible"] == false {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let closed = ui(app, |_| crate::desktop::overlay_snapshot());
    assert_eq!(
        closed["window"]["visible"], false,
        "Resolved attention left overlay visible"
    );
    let snapshot = app.state::<crate::agents::Agents>().snapshot().unwrap();
    assert_eq!(snapshot.version, 10);
    let bars = ui(app, |_| crate::desktop::bar_snapshot());
    let monitors = ui(app, |_| crate::desktop::monitor_snapshot());
    json!({"passed":true,"syntheticMetadata":true,"transport":"real Codex helper/TCP/native worker/Tauri IPC/WebView2/Win32","normal":normal,"attention":attention,"alert":alert,"resolved":resolved,"overlay":overlay,"explicitCloseStaysClosedWithSecondSession":true,"resolvedClosesOverlay":true,"newEpisodeReopens":true,"focusPreserved":true,"snapshotVersion":snapshot.version,"bars":bars,"monitors":monitors})
}
