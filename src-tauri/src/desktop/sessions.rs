//! Widget popup sessions keep their HWND and document for their entire lifetime.
use super::*;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{
        mpsc::{self, Receiver, Sender},
        LazyLock,
    },
};

const SUBCLASS_ID: usize = 0x53545049;
static NEXT: AtomicU64 = AtomicU64::new(0);
static OWNER: AtomicIsize = AtomicIsize::new(0);
const MAX_IDLE_HOSTS: usize = 2;
static IDLE: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
static DOCUMENT_READY: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(Default::default);
static REPLENISHING: AtomicBool = AtomicBool::new(false);
static STOPPING: AtomicBool = AtomicBool::new(false);
static WINDOWS: LazyLock<Mutex<HashMap<String, Entry>>> = LazyLock::new(Default::default);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    Preparing,
    Transient,
    Pinned,
    Closing,
}

struct PopupWindowState {
    app: AppHandle,
    label: String,
}

struct Entry {
    popup: PopupSession,
    render: serde_json::Value,
    window: String,
    mode: Mode,
    opening: bool,
    revision: u64,
    generation: u64,
    returning: bool,
    hidden: bool,
    completion: Option<Sender<Result<(), String>>>,
}

fn owns(entry: &Entry, label: &str, session: &str) -> bool {
    entry.window == label && entry.popup.id == session
}

/// Never tied to a bar or the tooltip host, including while still transient.
fn owner() -> Result<HWND, String> {
    let existing = OWNER.load(Ordering::Relaxed);
    if existing != 0 {
        return Ok(HWND(existing as *mut _));
    }
    unsafe {
        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW,
            w!("STATIC"),
            w!(""),
            WS_POPUP,
            0,
            0,
            0,
            0,
            None,
            None,
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
        enforce_floating_frame(hwnd);
        OWNER.store(hwnd.0 as isize, Ordering::Relaxed);
        Ok(hwnd)
    }
}

pub fn prepare(app: &AppHandle) -> Result<(), String> {
    if STOPPING.load(Ordering::Relaxed) || !IDLE.lock().unwrap().is_empty() {
        return Ok(());
    }
    let label = format!("popup-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    // Install the identity before build: overlay_ready may arrive as soon as it loads.
    IDLE.lock().unwrap().push_back(label.clone());
    let result = (|| -> Result<(), String> {
        let owner = owner()?;
        let window = surface_builder(app, &label)
            .title("")
            .background_color(BAR_BACKGROUND)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .focused(false)
            .visible(false)
            .inner_size(1., 1.)
            .build()
            .map_err(|e| e.to_string())?;
        unsafe {
            let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
            SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, owner.0 as isize);
            enforce_floating_frame(hwnd);
            restore_bar_transparency(hwnd);
            let pointer = Box::into_raw(Box::new(PopupWindowState {
                app: app.clone(),
                label: label.clone(),
            }));
            if !SetWindowSubclass(hwnd, Some(procedure), SUBCLASS_ID, pointer as usize).as_bool() {
                drop(Box::from_raw(pointer));
                let _ = window.destroy();
                return Err("Cannot install popup window handler".into());
            }
        }
        Ok(())
    })();
    if result.is_err() {
        IDLE.lock().unwrap().retain(|host| host != &label);
    }
    result
}

fn queue(app: &AppHandle, task: impl FnOnce(AppHandle) + Send + 'static) {
    let handle = app.clone();
    std::thread::spawn(move || {
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || task(app));
    });
}

fn replenish(app: &AppHandle) {
    if STOPPING.load(Ordering::Relaxed) || REPLENISHING.swap(true, Ordering::Relaxed) {
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            let busy = WINDOWS
                .lock()
                .unwrap()
                .values()
                .any(|e| e.opening || e.mode == Mode::Closing);
            if busy {
                REPLENISHING.store(false, Ordering::Relaxed);
                return;
            }
            if let Err(error) = prepare(&app) {
                eprintln!("Prepare popup: {error}");
            }
            REPLENISHING.store(false, Ordering::Relaxed);
        });
    });
}

pub fn has_window(label: &str) -> bool {
    IDLE.lock().unwrap().iter().any(|host| host == label)
        || WINDOWS.lock().unwrap().values().any(|e| e.window == label)
}

pub fn active_window(label: &str) -> bool {
    WINDOWS
        .lock()
        .unwrap()
        .values()
        .any(|e| e.window == label && e.mode != Mode::Closing)
}

pub fn ready(caller: &WebviewWindow) -> Result<serde_json::Value, String> {
    if !has_window(caller.label()) {
        return Err("Unknown popup window".into());
    }
    DOCUMENT_READY.lock().unwrap().insert(caller.label().into());
    let entries = WINDOWS.lock().unwrap();
    if let Some(entry) = entries.values().find(|e| e.window == caller.label()) {
        let mut render = entry.render.clone();
        render["pinned"] = (entry.mode == Mode::Pinned
            || (entry.mode == Mode::Closing && entry.render["pinned"].as_bool().unwrap_or(false)))
        .into();
        render["closing"] = (entry.mode == Mode::Closing).into();
        render["revision"] = entry.revision.into();
        return Ok(serde_json::json!({"session":render["session"], "render":render}));
    }
    if IDLE
        .lock()
        .unwrap()
        .iter()
        .any(|host| host == caller.label())
    {
        return Ok(serde_json::json!({"session":0,"render":null}));
    }
    Err("Unknown popup window".into())
}

pub fn open(
    app: &AppHandle,
    caller: &WebviewWindow,
    request: &OverlayRequest,
) -> Result<(), String> {
    if focus_existing(app, caller, request)? {
        return Ok(());
    }
    let id = request.session.as_deref().ok_or("Missing popup session")?;
    if WINDOWS.lock().unwrap().contains_key(id) {
        return Err("Duplicate popup session".into());
    }
    let config = crate::config::snapshot_for(&app.state::<crate::config::ConfigStore>(), caller)?;
    let source = HWND(caller.hwnd().map_err(|e| e.to_string())?.0);
    let bar = unsafe { bar_content_rect(source).map_err(|e| e.to_string())? };
    let monitor = monitor_rect(source).ok_or("Missing source monitor")?;
    let side = overlay_side_for_bar(bar, monitor);
    close_transient(app, None);
    prepare(app)?;
    let label = {
        let mut idle = IDLE.lock().unwrap();
        let ready = DOCUMENT_READY.lock().unwrap();
        let index = idle
            .iter()
            .position(|host| ready.contains(host))
            .unwrap_or(0);
        idle.remove(index).ok_or("Missing prepared popup")?
    };
    let window = app
        .get_webview_window(&label)
        .ok_or("Missing popup window")?;
    let sequence = OVERLAY_SESSION.fetch_add(1, Ordering::Relaxed) + 1;
    let render = serde_json::to_value(RenderPayload {
        appearance: OverlayAppearance {
            theme: config.config.bar.theme,
            color_theme: config.config.bar.color_theme,
        },
        arrow_x: 0.,
        kind: "popover",
        text: &request.text,
        side: side.as_str(),
        session: sequence,
        component: request.component.as_deref(),
        params: request.params.as_ref(),
        popup_session: Some(id),
    })
    .map_err(|e| e.to_string())?;
    WINDOWS.lock().unwrap().insert(
        id.into(),
        Entry {
            popup: PopupSession {
                id: id.into(),
                component: request.component.clone().unwrap(),
                source: caller.label().into(),
                side,
                anchor: request.anchor,
                revealed: false,
                closing: false,
                restore_focus: false,
                widget: request.widget.clone(),
            },
            render: render.clone(),
            window: label.clone(),
            mode: Mode::Preparing,
            opening: true,
            revision: 0,
            generation: 0,
            returning: false,
            hidden: false,
            completion: None,
        },
    );
    let result = (|| -> Result<(), String> {
        let scale = caller.scale_factor().map_err(|e| e.to_string())?;
        let center = bar.left + to_physical(request.anchor.x + request.anchor.width / 2., scale);
        let (x, y) = overlay_position(bar, monitor, (1, 1), center, side);
        unsafe {
            SetWindowPos(
                HWND(window.hwnd().map_err(|e| e.to_string())?.0),
                None,
                x,
                y,
                1,
                1,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
            .map_err(|e| e.to_string())?;
        }
        app.emit_to(&label, "overlay:render", render)
            .map_err(|e| e.to_string())
    })();
    if result.is_err() {
        close(app, id);
    }
    // A WebView's creation and module warmup must not compete with opening.
    // The renderer acknowledges the actual end of motion before replenishment.
    result
}

pub fn opened(app: &AppHandle, caller: &WebviewWindow, session: &str) -> Result<(), String> {
    let mut entries = WINDOWS.lock().unwrap();
    let entry = entries
        .get_mut(session)
        .filter(|e| {
            owns(e, caller.label(), session) && matches!(e.mode, Mode::Transient | Mode::Pinned)
        })
        .ok_or("Only the visible popup may finish opening")?;
    if !entry.opening {
        return Ok(());
    }
    entry.opening = false;
    drop(entries);
    replenish(app);
    Ok(())
}

pub fn transient_id() -> Option<String> {
    WINDOWS
        .lock()
        .unwrap()
        .iter()
        .find(|(_, e)| matches!(e.mode, Mode::Preparing | Mode::Transient))
        .map(|(id, _)| id.clone())
}

pub(super) fn close_transient(app: &AppHandle, except: Option<&str>) {
    let ids: Vec<_> = WINDOWS
        .lock()
        .unwrap()
        .iter()
        .filter(|(id, e)| {
            Some(id.as_str()) != except && matches!(e.mode, Mode::Preparing | Mode::Transient)
        })
        .map(|(id, _)| id.clone())
        .collect();
    for id in ids {
        close(app, &id);
    }
}

fn close(app: &AppHandle, session: &str) {
    finish_close(app, session, false, false);
}

fn finish_close(app: &AppHandle, session: &str, docked: bool, restore_focus: bool) {
    let entry = WINDOWS.lock().unwrap().remove(session);
    if let Some(mut entry) = entry {
        entry.mode = Mode::Closing;
        if let Some(tx) = entry.completion.take() {
            let _ = tx.send(Err("Popup closed".into()));
        }
        crate::release_window_subscriptions(app, &entry.window);
        let window = app.get_webview_window(&entry.window);
        let restore_focus = restore_focus
            && window.as_ref().is_some_and(|window| {
                window
                    .hwnd()
                    .is_ok_and(|h| unsafe { GetForegroundWindow() == HWND(h.0) })
            });
        if let Some(window) = window {
            // End the lease, not the document. Old commands still carry their
            // session identity and cannot mutate a subsequent lease.
            let hidden = window.hide().is_ok();
            if let Ok(handle) = window.hwnd() {
                unsafe {
                    let _ = RemovePropW(HWND(handle.0), w!("StrataPinnedPopup"));
                }
            }
            let sequence = OVERLAY_SESSION.fetch_add(1, Ordering::Relaxed) + 1;
            let cleared = hidden
                && app
                    .emit_to(&entry.window, "overlay:clear", sequence)
                    .is_ok();
            let evicted = if cleared && !STOPPING.load(Ordering::Relaxed) {
                let mut idle = IDLE.lock().unwrap();
                let evicted = if idle.len() >= MAX_IDLE_HOSTS {
                    idle.pop_back()
                } else {
                    None
                };
                idle.push_front(entry.window.clone());
                evicted
            } else {
                Some(entry.window.clone())
            };
            // Retain the most recently used document/cache, evict an older idle
            // host if the bounded idle budget is full. Never evict a live lease.
            if let Some(label) = evicted {
                if let Some(old) = app.get_webview_window(&label) {
                    let _ = old.destroy();
                }
            }
        }
        if restore_focus {
            if let Some(source) = app.get_webview_window(&entry.popup.source) {
                let _ = source.set_focus();
            }
        }
        let _ = app.emit_to(
            &entry.popup.source,
            "overlay:closed",
            serde_json::json!({"session":session,"docked":docked,"restoreFocus":restore_focus}),
        );
        replenish(app);
    }
}

/// Visible sessions survive until their renderer acknowledges the exit motion.
fn request_close(app: &AppHandle, session: &str, restore_focus: bool) {
    let mut entries = WINDOWS.lock().unwrap();
    let Some(entry) = entries.get_mut(session) else {
        return;
    };
    if entry.mode == Mode::Closing {
        return;
    }
    if entry.mode == Mode::Preparing {
        drop(entries);
        close(app, session);
        return;
    }
    entry.render["pinned"] = (entry.mode == Mode::Pinned).into();
    entry.mode = Mode::Closing;
    entry.popup.closing = true;
    entry.popup.restore_focus = restore_focus;
    entry.generation += 1;
    let generation = entry.generation;
    let label = entry.window.clone();
    drop(entries);
    if app.emit_to(&label, "overlay:closing", session).is_err() {
        finish_close(app, session, false, restore_focus);
        return;
    }
    let handle = app.clone();
    let id = session.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            let pending = WINDOWS
                .lock()
                .unwrap()
                .get(&id)
                .is_some_and(|e| e.mode == Mode::Closing && e.generation == generation);
            if pending {
                finish_close(&app, &id, false, restore_focus);
            }
        });
    });
}

pub fn complete_exit(app: &AppHandle, caller: &WebviewWindow, session: &str) -> Result<(), String> {
    let (docked, restore_focus) = {
        let entries = WINDOWS.lock().unwrap();
        let entry = entries
            .get(session)
            .filter(|e| owns(e, caller.label(), session) && e.mode == Mode::Closing)
            .ok_or("Only the closing popup may complete its exit")?;
        (
            !entry.render["pinned"].as_bool().unwrap_or(false),
            entry.popup.restore_focus,
        )
    };
    finish_close(app, session, docked, restore_focus);
    Ok(())
}

pub fn hide_request(app: &AppHandle, source: &str, session: Option<&str>) {
    let Some(session) = session else {
        return;
    };
    let allowed = WINDOWS.lock().unwrap().get(session).is_some_and(|e| {
        e.popup.source == source
            && matches!(e.mode, Mode::Transient | Mode::Preparing)
            && !e.returning
    });
    if allowed {
        request_close(app, session, false);
    }
}

fn emit_mode(app: &AppHandle, entry: &Entry, pinned: bool, revision: u64) -> Result<(), String> {
    app.emit_to(
        &entry.window,
        "popup:mode",
        serde_json::json!({
            "session":entry.popup.id,"pinned":pinned,"revision":revision,
            "side":entry.popup.side.as_str(),"arrowX":entry.render["arrowX"]
        }),
    )
    .map_err(|e| e.to_string())
}

pub fn pin(
    app: &AppHandle,
    caller: &WebviewWindow,
    session: &str,
    pinned: bool,
) -> Result<Receiver<Result<(), String>>, String> {
    #[cfg(debug_assertions)]
    check::received(session);
    let (tx, rx) = mpsc::channel();
    let mut entries = WINDOWS.lock().unwrap();
    let entry = entries
        .get_mut(session)
        .filter(|e| {
            owns(e, caller.label(), session)
                && matches!(e.mode, Mode::Transient | Mode::Pinned)
                && !e.returning
        })
        .ok_or("Popup does not belong to caller or is not ready")?;
    if (entry.mode == Mode::Pinned) == pinned {
        let _ = tx.send(Ok(()));
        return Ok(rx);
    }
    if pinned {
        let hwnd = HWND(caller.hwnd().map_err(|e| e.to_string())?.0);
        unsafe {
            SetPropW(
                hwnd,
                w!("StrataPinnedPopup"),
                Some(HANDLE(1usize as *mut _)),
            )
            .map_err(|e| e.to_string())?;
        }
        let revision = entry.revision + 1;
        if let Err(error) = emit_mode(app, entry, true, revision) {
            unsafe {
                let _ = RemovePropW(hwnd, w!("StrataPinnedPopup"));
            }
            return Err(error);
        }
        entry.mode = Mode::Pinned;
        entry.revision = revision;
        #[cfg(debug_assertions)]
        check::committed(session);
        let _ = app.emit_to(
            &entry.popup.source,
            "overlay:closed",
            serde_json::json!({"session":session}),
        );
        let _ = tx.send(Ok(()));
        return Ok(rx);
    }
    entry.returning = true;
    entry.generation += 1;
    entry.completion = Some(tx);
    let generation = entry.generation;
    let popup = entry.popup.clone();
    drop(entries);
    let Some(source) = app.get_webview_window(&popup.source) else {
        close_returning(app, session);
        return Ok(rx);
    };
    if let Some(widget) = popup.widget.as_deref() {
        let config =
            crate::config::snapshot_for(&app.state::<crate::config::ConfigStore>(), &source);
        let config = match config {
            Ok(config) => config,
            Err(error) => {
                abort(session, &error);
                return Err(error);
            }
        };
        let widgets = &config.config.widgets;
        if !widgets
            .left
            .iter()
            .chain(&widgets.center)
            .chain(&widgets.right)
            .any(|w| w.id == widget && w.enabled)
        {
            close_returning(app, session);
            return Ok(rx);
        }
        if let Err(error) = app.emit_to(&popup.source,"overlay:closed",serde_json::json!({"reattach":true,"session":session,"revision":generation,"widget":widget,"component":popup.component})) {
            abort(session,&error.to_string()); return Err(error.to_string());
        }
    } else {
        return_to_anchor(app, &source, session, Some(popup.anchor), generation)?;
        return Ok(rx);
    }
    let handle = app.clone();
    let id = session.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));
        let _ = handle.run_on_main_thread(move || {
            let pending = WINDOWS
                .lock()
                .unwrap()
                .get(&id)
                .is_some_and(|e| e.returning && e.generation == generation);
            if pending {
                abort(&id, "Tempo esgotado ao obter a posição do widget");
            }
        });
    });
    Ok(rx)
}

fn abort(session: &str, error: &str) {
    if let Some(entry) = WINDOWS.lock().unwrap().get_mut(session) {
        entry.returning = false;
        if let Some(tx) = entry.completion.take() {
            let _ = tx.send(Err(error.into()));
        }
    }
}

fn close_returning(app: &AppHandle, session: &str) {
    let completion = WINDOWS
        .lock()
        .unwrap()
        .get_mut(session)
        .and_then(|e| e.completion.take());
    close(app, session);
    if let Some(tx) = completion {
        let _ = tx.send(Ok(()));
    }
}

pub fn return_to_anchor(
    app: &AppHandle,
    caller: &WebviewWindow,
    session: &str,
    anchor: Option<OverlayAnchor>,
    revision: u64,
) -> Result<(), String> {
    let mut entries = WINDOWS.lock().unwrap();
    let entry = entries
        .get_mut(session)
        .filter(|e| e.returning && e.popup.source == caller.label() && e.generation == revision)
        .ok_or("Invalid popup return owner")?;
    let Some(anchor) = anchor else {
        drop(entries);
        close_returning(app, session);
        return Ok(());
    };
    let result = (|| -> Result<(), String> {
        let source = HWND(caller.hwnd().map_err(|e| e.to_string())?.0);
        let scale = caller.scale_factor().map_err(|e| e.to_string())?;
        let bar = unsafe { bar_content_rect(source).map_err(|e| e.to_string())? };
        if !valid_reminder_anchor(
            &anchor,
            (bar.right - bar.left) as f64 / scale,
            (bar.bottom - bar.top) as f64 / scale,
        ) {
            return Err("Invalid popup anchor".into());
        }
        let window = app
            .get_webview_window(&entry.window)
            .ok_or("Missing popup")?;
        let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
        let monitor = monitor_rect(source).ok_or("Missing source monitor")?;
        let side = overlay_side_for_bar(bar, monitor);
        let mut rect = RECT::default();
        unsafe {
            GetWindowRect(hwnd, &mut rect).map_err(|e| e.to_string())?;
        }
        let center = bar.left + to_physical(anchor.x + anchor.width / 2., scale);
        let (x, y) = overlay_position(
            bar,
            popup_monitor_bounds(monitor, scale),
            (rect.right - rect.left, rect.bottom - rect.top),
            center,
            side,
        );
        let old_side = entry.popup.side;
        let old_arrow = entry.render["arrowX"].clone();
        entry.popup.side = side;
        entry.render["arrowX"] = overlay_arrow_x(center, x, scale).into();
        let revision = entry.revision + 1;
        if let Err(error) = unsafe {
            SetWindowPos(
                hwnd,
                None,
                x,
                y,
                0,
                0,
                SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER,
            )
        } {
            entry.popup.side = old_side;
            entry.render["arrowX"] = old_arrow;
            return Err(error.to_string());
        }
        if let Err(error) = emit_mode(app, entry, false, revision) {
            entry.popup.side = old_side;
            entry.render["arrowX"] = old_arrow;
            unsafe {
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    rect.left,
                    rect.top,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER,
                );
            }
            return Err(error);
        }
        unsafe {
            let _ = RemovePropW(hwnd, w!("StrataPinnedPopup"));
        }
        entry.popup.anchor = anchor;
        entry.mode = Mode::Transient;
        entry.revision = revision;
        entry.returning = false;
        #[cfg(debug_assertions)]
        check::committed(session);
        Ok(())
    })();
    if let Err(error) = result {
        drop(entries);
        abort(session, &error);
        return Err(error);
    }
    let popup = entry.popup.clone();
    let completion = entry.completion.take();
    drop(entries);
    close_transient(app, Some(session));
    let _ = app.emit_to(&popup.source,"overlay:closed",serde_json::json!({"attached":true,"session":session,"widget":popup.widget,"component":popup.component}));
    if let Some(tx) = completion {
        let _ = tx.send(Ok(()));
    }
    Ok(())
}

pub fn resize(
    app: &AppHandle,
    caller: &WebviewWindow,
    session: &str,
    size: &OverlaySize,
) -> Result<serde_json::Value, String> {
    if !valid_popup_size(size) {
        return Err("Invalid popup size".into());
    }
    let mut entries = WINDOWS.lock().unwrap();
    let entry = entries
        .get_mut(session)
        .filter(|e| owns(e, caller.label(), session) && e.mode != Mode::Closing)
        .ok_or("Popup does not belong to caller")?;
    let hwnd = HWND(caller.hwnd().map_err(|e| e.to_string())?.0);
    let scale = caller.scale_factor().map_err(|e| e.to_string())?;
    let width = to_physical(size.width, scale).max(1);
    let height = to_physical(size.height, scale).max(1);
    let mut rect = RECT::default();
    unsafe {
        GetWindowRect(hwnd, &mut rect).map_err(|e| e.to_string())?;
    }
    let (x, y, arrow) = if entry.mode == Mode::Pinned {
        let (x, y) = accessible_position(
            rect.left,
            rect.top,
            width,
            work_area(hwnd).ok_or("Missing monitor")?,
        );
        (x, y, entry.render["arrowX"].as_f64().unwrap_or(0.))
    } else {
        let source = app
            .get_webview_window(&entry.popup.source)
            .ok_or("Missing source")?;
        let source_hwnd = HWND(source.hwnd().map_err(|e| e.to_string())?.0);
        let bar = unsafe { bar_content_rect(source_hwnd).map_err(|e| e.to_string())? };
        let source_scale = source.scale_factor().map_err(|e| e.to_string())?;
        let center = bar.left
            + to_physical(
                entry.popup.anchor.x + entry.popup.anchor.width / 2.,
                source_scale,
            );
        let bounds = popup_monitor_bounds(
            monitor_rect(source_hwnd).ok_or("Missing monitor")?,
            source_scale,
        );
        let (x, y) = overlay_position(bar, bounds, (width, height), center, entry.popup.side);
        (x, y, overlay_arrow_x(center, x, scale))
    };
    if rect.left != x
        || rect.top != y
        || rect.right - rect.left != width
        || rect.bottom - rect.top != height
    {
        unsafe {
            SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                x,
                y,
                width,
                height,
                SWP_NOACTIVATE,
            )
            .map_err(|e| e.to_string())?;
        }
    }
    entry.render["arrowX"] = arrow.into();
    let preparing = entry.mode == Mode::Preparing;
    if preparing {
        entry.mode = Mode::Transient;
        entry.popup.revealed = true;
    }
    let anchor = entry.popup.anchor;
    drop(entries);
    if preparing {
        caller.show().map_err(|e| e.to_string())?;
        #[cfg(debug_assertions)]
        check::focus(hwnd);
        caller.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(
        serde_json::json!({"arrowX":arrow,"anchorSize":{"width":anchor.width,"height":anchor.height}}),
    )
}

pub fn dismiss(
    app: &AppHandle,
    caller: &WebviewWindow,
    session: Option<&str>,
) -> Result<(), String> {
    let session = session.ok_or("Missing popup session")?;
    if !WINDOWS
        .lock()
        .unwrap()
        .get(session)
        .is_some_and(|e| owns(e, caller.label(), session) && !e.returning)
    {
        return Err("Popup does not belong to caller".into());
    }
    request_close(app, session, true);
    Ok(())
}

pub fn destroyed(app: &AppHandle, label: &str) {
    DOCUMENT_READY.lock().unwrap().remove(label);
    let ids: Vec<_> = WINDOWS
        .lock()
        .unwrap()
        .iter()
        .filter(|(_, e)| e.window == label)
        .map(|(id, _)| id.clone())
        .collect();
    for id in ids {
        finish_close(app, &id, false, false);
    }
    IDLE.lock().unwrap().retain(|host| host != label);
    replenish(app);
}

pub fn drag(caller: &WebviewWindow, session: &str) -> Result<(), String> {
    if !WINDOWS
        .lock()
        .unwrap()
        .get(session)
        .is_some_and(|e| owns(e, caller.label(), session) && e.mode == Mode::Pinned && !e.returning)
    {
        return Err("Only an owned pinned popup may be dragged".into());
    }
    caller.start_dragging().map_err(|e| e.to_string())
}

pub fn focus_existing(
    app: &AppHandle,
    caller: &WebviewWindow,
    request: &OverlayRequest,
) -> Result<bool, String> {
    let found = WINDOWS
        .lock()
        .unwrap()
        .values()
        .find(|e| {
            e.mode == Mode::Pinned
                && e.popup.source == caller.label()
                && e.popup.widget == request.widget
                && Some(&e.popup.component) == request.component.as_ref()
        })
        .map(|e| e.window.clone());
    let Some(label) = found else {
        return Ok(false);
    };
    app.get_webview_window(&label)
        .ok_or("Missing pinned popup")?
        .set_focus()
        .map_err(|e| e.to_string())?;
    let _ = app.emit_to(
        caller.label(),
        "overlay:closed",
        serde_json::json!({"session":request.session}),
    );
    Ok(true)
}

fn work_area(hwnd: HWND) -> Option<RECT> {
    unsafe {
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mut info)
            .as_bool()
            .then_some(info.rcWork)
    }
}

fn accessible_position(x: i32, y: i32, width: i32, bounds: RECT) -> (i32, i32) {
    (
        x.clamp(bounds.left, (bounds.right - width).max(bounds.left)),
        y.clamp(bounds.top, (bounds.bottom - 48).max(bounds.top)),
    )
}

pub fn refresh(app: &AppHandle) {
    refresh_for_monitor(app, foreground_fullscreen_monitor());
}

fn refresh_for_monitor(app: &AppHandle, fullscreen: Option<RECT>) {
    let windows: Vec<_> = WINDOWS
        .lock()
        .unwrap()
        .values()
        .filter(|e| matches!(e.mode, Mode::Transient | Mode::Pinned))
        .map(|e| e.window.clone())
        .collect();
    for label in windows {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        let Ok(handle) = window.hwnd() else {
            continue;
        };
        let hwnd = HWND(handle.0);
        let Some(bounds) = work_area(hwnd) else {
            continue;
        };
        let Some(monitor) = monitor_rect(hwnd) else {
            continue;
        };
        let hide = fullscreen.is_some_and(|f| f.left == monitor.left && f.top == monitor.top);
        let was_hidden = {
            let mut entries = WINDOWS.lock().unwrap();
            let Some(entry) = entries.values_mut().find(|e| e.window == label) else {
                continue;
            };
            let old = entry.hidden;
            entry.hidden = hide;
            old
        };
        unsafe {
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                let (x, y) =
                    accessible_position(rect.left, rect.top, rect.right - rect.left, bounds);
                if x != rect.left || y != rect.top {
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        x,
                        y,
                        0,
                        0,
                        SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER,
                    );
                }
            }
            if hide != was_hidden {
                let _ = ShowWindow(hwnd, if hide { SW_HIDE } else { SW_SHOWNOACTIVATE });
                if !hide {
                    enforce_floating_frame(hwnd);
                }
            }
        }
    }
}

pub fn snapshot() -> serde_json::Value {
    unsafe extern "system" fn collect(hwnd: HWND, param: LPARAM) -> windows::core::BOOL {
        let mut process = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process));
        if !GetPropW(hwnd, w!("StrataPinnedPopup")).0.is_null() {
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
                let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
                let values = &mut *(param.0 as *mut Vec<serde_json::Value>);
                values.push(serde_json::json!({"owned":GetWindow(hwnd,GW_OWNER).is_ok_and(|h|!h.0.is_null()),"appWindow":ex & WS_EX_APPWINDOW.0 != 0,"titleLength":GetWindowTextLengthW(hwnd),"processId":process,"rect":[rect.left,rect.top,rect.right,rect.bottom],"dpi":GetDpiForWindow(hwnd),"visible":IsWindowVisible(hwnd).as_bool(),"topmost":ex & WS_EX_TOPMOST.0 != 0,"toolWindow":ex & WS_EX_TOOLWINDOW.0 != 0,"noActivate":ex & WS_EX_NOACTIVATE.0 != 0,"komorebiEligible":komorebi_eligible(style,ex)}));
            }
        }
        true.into()
    }
    let mut values: Vec<serde_json::Value> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut values as *mut _ as isize));
    }
    serde_json::json!(values)
}

pub fn release_all(app: &AppHandle) {
    STOPPING.store(true, Ordering::Relaxed);
    DOCUMENT_READY.lock().unwrap().clear();
    let idle = std::mem::take(&mut *IDLE.lock().unwrap());
    for label in idle {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.destroy();
        }
    }
    let entries = std::mem::take(&mut *WINDOWS.lock().unwrap());
    for (_, entry) in entries {
        if let Some(tx) = entry.completion {
            let _ = tx.send(Err("Strata is exiting".into()));
        }
        if let Some(window) = app.get_webview_window(&entry.window) {
            let _ = window.destroy();
        }
    }
    let hwnd = OWNER.swap(0, Ordering::Relaxed);
    if hwnd != 0 {
        unsafe {
            let _ = DestroyWindow(HWND(hwnd as *mut _));
        }
    }
}

pub(super) unsafe extern "system" fn procedure(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    reference: usize,
) -> LRESULT {
    #[cfg(debug_assertions)]
    check::observe_visibility(hwnd, msg, wp, lp);
    if let Some(result) = floating_nonclient_message(hwnd, msg, wp) {
        return result;
    }
    // Filter tao's proposed frame before Windows applies it. Repairing only in
    // WM_STYLECHANGED leaves a transient caption/edge visible to tiler hooks.
    if msg == WM_STYLECHANGING {
        let styles = &mut *(lp.0 as *mut STYLESTRUCT);
        if wp.0 == GWL_STYLE.0 as usize {
            styles.styleNew = floating_frame_style(styles.styleNew, 0).0;
        } else if wp.0 == GWL_EXSTYLE.0 as usize {
            styles.styleNew = floating_frame_style(0, styles.styleNew).1;
        }
    }
    if msg == WM_ACTIVATE && wp.0 & 0xffff == WA_INACTIVE as usize && reference != 0 {
        let state = &*(reference as *const PopupWindowState);
        let label = state.label.clone();
        // Capture the lease when Windows delivers the blur. Looking it up only
        // after queueing can dismiss a NEW session that has recycled this HWND.
        let lease = WINDOWS
            .lock()
            .unwrap()
            .iter()
            .find(|(_, e)| e.window == label && e.mode == Mode::Transient && !e.returning)
            .map(|(id, e)| (id.clone(), e.generation));
        if let Some((id, generation)) = lease {
            queue(&state.app, move |app| {
                let current = WINDOWS.lock().unwrap().get(&id).is_some_and(|e| {
                    e.window == label
                        && e.generation == generation
                        && e.mode == Mode::Transient
                        && !e.returning
                });
                if !current {
                    return;
                }
                if app
                    .get_webview_window(&label)
                    .and_then(|w| w.hwnd().ok())
                    .is_some_and(|h| unsafe { GetForegroundWindow() == HWND(h.0) })
                {
                    return;
                }
                request_close(&app, &id, false);
            });
        }
    }

    match msg {
        WM_DWMCOMPOSITIONCHANGED | WM_SHOWWINDOW => {
            restore_bar_transparency(hwnd);
        }
        WM_STYLECHANGED => {
            enforce_floating_frame(hwnd);
            restore_bar_transparency(hwnd);
            return LRESULT(0);
        }
        WM_DISPLAYCHANGE | WM_DPICHANGED | WM_EXITSIZEMOVE if reference != 0 => {
            queue(&(*(reference as *const PopupWindowState)).app, |app| {
                refresh(&app)
            });
        }
        WM_NCDESTROY => {
            let _ = RemoveWindowSubclass(hwnd, Some(procedure), SUBCLASS_ID);
            if reference != 0 {
                drop(Box::from_raw(reference as *mut PopupWindowState));
            }
        }
        _ => {}
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pinned_focus_never_paints_a_native_caption() {
        struct Probe {
            activation: Cell<isize>,
            paints: Cell<u32>,
        }
        unsafe extern "system" fn observe(
            hwnd: HWND,
            msg: u32,
            wp: WPARAM,
            lp: LPARAM,
            _: usize,
            reference: usize,
        ) -> LRESULT {
            let probe = &*(reference as *const Probe);
            if msg == WM_NCACTIVATE {
                probe.activation.set(lp.0);
            }
            if msg == WM_NCPAINT {
                probe.paints.set(probe.paints.get() + 1);
            }
            DefSubclassProc(hwnd, msg, wp, lp)
        }
        unsafe {
            let hwnd = CreateWindowExW(
                WS_EX_TOOLWINDOW,
                w!("STATIC"),
                w!(""),
                WS_POPUP,
                0,
                0,
                300,
                500,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            let probe = Probe {
                activation: Cell::new(0),
                paints: Cell::new(0),
            };
            assert!(
                SetWindowSubclass(hwnd, Some(observe), 1, &probe as *const _ as usize).as_bool()
            );
            assert!(SetWindowSubclass(hwnd, Some(procedure), SUBCLASS_ID, 0).as_bool());
            for active in [0, 1, 0, 1] {
                SendMessageW(hwnd, WM_NCACTIVATE, Some(WPARAM(active)), Some(LPARAM(0)));
                SendMessageW(hwnd, WM_NCPAINT, Some(WPARAM(1)), Some(LPARAM(0)));
            }
            let activation = probe.activation.get();
            let paints = probe.paints.get();
            let _ = RemoveWindowSubclass(hwnd, Some(observe), 1);
            DestroyWindow(hwnd).unwrap();
            assert_eq!(
                activation, -1,
                "Native activation must suppress the system caption repaint"
            );
            assert_eq!(
                paints, 0,
                "The pinned popup must never paint a non-client border"
            );
        }
    }
    #[test]
    fn pinned_frame_rejects_tiler_styles_before_windows_applies_them() {
        unsafe extern "system" fn observe(
            hwnd: HWND,
            msg: u32,
            wp: WPARAM,
            lp: LPARAM,
            _: usize,
            reference: usize,
        ) -> LRESULT {
            let result = DefSubclassProc(hwnd, msg, wp, lp);
            if msg == WM_STYLECHANGING {
                let styles = &*(lp.0 as *const STYLESTRUCT);
                let safe = &mut *(reference as *mut bool);
                if wp.0 == GWL_STYLE.0 as usize {
                    *safe &= styles.styleNew & WS_CAPTION.0 == 0;
                } else if wp.0 == GWL_EXSTYLE.0 as usize {
                    *safe &= styles.styleNew & WS_EX_WINDOWEDGE.0 == 0;
                    *safe &= styles.styleNew & WS_EX_TOOLWINDOW.0 != 0;
                }
            }
            result
        }
        unsafe {
            let hwnd = CreateWindowExW(
                WS_EX_TOOLWINDOW,
                w!("STATIC"),
                w!("Strata pinned style regression"),
                WS_POPUP,
                0,
                0,
                200,
                100,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            let mut safe = true;
            assert!(SetWindowSubclass(hwnd, Some(procedure), SUBCLASS_ID, 0).as_bool());
            assert!(SetWindowSubclass(
                hwnd,
                Some(observe),
                SUBCLASS_ID + 1,
                &mut safe as *mut bool as usize
            )
            .as_bool());
            for _ in 0..3 {
                SetWindowLongPtrW(
                    hwnd,
                    GWL_STYLE,
                    (WS_POPUP.0 | WS_CAPTION.0 | WS_THICKFRAME.0) as isize,
                );
                SetWindowLongPtrW(
                    hwnd,
                    GWL_EXSTYLE,
                    (WS_EX_APPWINDOW.0 | WS_EX_WINDOWEDGE.0) as isize,
                );
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                let _ = ShowWindow(hwnd, SW_HIDE);
            }
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            let _ = RemoveWindowSubclass(hwnd, Some(observe), SUBCLASS_ID + 1);
            DestroyWindow(hwnd).unwrap();
            assert!(
                safe,
                "Pinned window temporarily accepted the frame styles used by komorebi eligibility"
            );
            assert!(!komorebi_eligible(style, ex));
            assert_eq!(ex & WS_EX_NOACTIVATE.0, 0);
        }
    }
    #[test]
    fn drag_position_keeps_header_accessible_on_negative_monitor() {
        let bounds = RECT {
            left: -1920,
            top: 0,
            right: 0,
            bottom: 1040,
        };
        assert_eq!(accessible_position(-2500, 1200, 400, bounds), (-1920, 992));
        assert_eq!(accessible_position(-500, 200, 400, bounds), (-500, 200));
        assert_eq!(accessible_position(2000, -100, 2400, bounds), (-1920, 0));
    }

    #[test]
    fn ownership_requires_both_window_and_session() {
        let entry = Entry {
            popup: PopupSession {
                id: "one".into(),
                component: "cpu".into(),
                source: "bar-one".into(),
                widget: Some("cpu-main".into()),
                side: OverlaySide::Bottom,
                anchor: OverlayAnchor {
                    x: 0.,
                    y: 0.,
                    width: 40.,
                    height: 30.,
                },
                revealed: true,
                closing: false,
                restore_focus: false,
            },
            render: serde_json::Value::Null,
            window: "popup-one".into(),
            generation: 0,
            mode: Mode::Pinned,
            opening: false,
            revision: 0,
            returning: false,
            hidden: false,
            completion: None,
        };
        assert!(owns(&entry, "popup-one", "one"));
        assert!(!owns(&entry, "popup-two", "one"));
        assert!(!owns(&entry, "popup-one", "two"));
        assert!(!owns(&entry, "bar-one", "one"));
    }
}

#[cfg(debug_assertions)]
mod check;
#[cfg(debug_assertions)]
pub use check::{source as check_source, start as check};
