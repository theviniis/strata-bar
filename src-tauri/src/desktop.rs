use std::{
    cell::Cell,
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    sync::{Mutex, atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering}},
};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows::{
    core::w,
    Win32::{
        Foundation::*,
        Graphics::Gdi::*,
        UI::{Shell::*, WindowsAndMessaging::*},
    },
};
const CALLBACK: u32 = WM_APP + 42;
const REFRESH_GEOMETRY: u32 = WM_APP + 43;
const SUBCLASS: usize = 0x53545241;
const OVERLAY_SUBCLASS: usize = 0x5354524F;
/// Window label and title of the shared floating surface. The title deliberately
/// does not start with `"Strata ·"`, which `bar_snapshot` uses to find AppBars.
pub const OVERLAY: &str = "overlay";
const OVERLAY_TITLE: &str = "Strata overlay";
static RECONCILE_PENDING: AtomicBool = AtomicBool::new(false);
static COUNTS: [AtomicU64;4]=[const {AtomicU64::new(0)};4];
/// Overlay shows, positions and hides, surface failures in `diagnostics`.
static OVERLAY_COUNTS: [AtomicU64; 3] = [const { AtomicU64::new(0) }; 3];
pub fn profile()->serde_json::Value{serde_json::json!({"windowMessages":COUNTS[0].load(Ordering::Relaxed),"appbarNotifications":COUNTS[1].load(Ordering::Relaxed),"positionWrites":COUNTS[2].load(Ordering::Relaxed),"windowPositionMessages":COUNTS[3].load(Ordering::Relaxed),"overlayShows":OVERLAY_COUNTS[0].load(Ordering::Relaxed),"overlayPositions":OVERLAY_COUNTS[1].load(Ordering::Relaxed),"overlayHides":OVERLAY_COUNTS[2].load(Ordering::Relaxed)})}
#[derive(Clone)]
struct PopupSession { id: String, source: String, side: OverlaySide, anchor: OverlayAnchor, revealed: bool, closing: bool }
static POPUP: Mutex<Option<PopupSession>> = Mutex::new(None);
static LAST_OVERLAY_RENDER: Mutex<Option<serde_json::Value>> = Mutex::new(None);
static OVERLAY_OWNER: Mutex<Option<String>> = Mutex::new(None);
static OVERLAY_PLACING: AtomicBool = AtomicBool::new(false);
static OVERLAY_SESSION: AtomicU64 = AtomicU64::new(0);

struct Reservation {
    app: AppHandle,
    rect: RECT,
    height: i32,
    busy: Cell<bool>,
    applied: Cell<Option<[i32; 4]>>,
    taskbar_message: u32,
}
unsafe fn data(hwnd: HWND) -> APPBARDATA {
    APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: hwnd,
        uCallbackMessage: CALLBACK,
        uEdge: ABE_TOP,
        ..Default::default()
    }
}
/// Strip every non-client frame style and mark a floating window as a tool window.
///
/// `tao` (Tauri's window layer) always creates top-level windows with
/// `WS_CAPTION | WS_EX_WINDOWEDGE`, even when `decorations(false)`, and
/// `skip_taskbar` only calls `ITaskbarList::DeleteTab`. komorebi's
/// `window_is_eligible` manages exactly the windows that still carry
/// `WS_CAPTION && WS_EX_WINDOWEDGE`, so without this the tiler claims the window
/// and moves it into a tile. Shared by the AppBar strip and the overlay surface:
/// any new floating window must go through it. `WS_EX_TOOLWINDOW` keeps it out of
/// Alt+Tab; no `WS_EX_NOACTIVATE` is used because a WebView2 host with that style
/// can keep a stale mouse capture (and lose focus state) after Win+D / Alt+Tab.
fn floating_frame_style(style: u32, ex: u32) -> (u32, u32) {
    const FRAME: u32 = WS_CAPTION.0
        | WS_THICKFRAME.0
        | WS_SYSMENU.0
        | WS_MINIMIZEBOX.0
        | WS_MAXIMIZEBOX.0;
    const FRAME_EX: u32 = WS_EX_WINDOWEDGE.0
        | WS_EX_CLIENTEDGE.0
        | WS_EX_DLGMODALFRAME.0
        | WS_EX_APPWINDOW.0;
    (
        style & !FRAME,
        (ex & !FRAME_EX) | WS_EX_TOOLWINDOW.0 | WS_EX_TOPMOST.0,
    )
}

/// Mirror of komorebi's `window_is_eligible` caption requirement, used as a
/// regression guard and reported by `bar_snapshot`.
fn komorebi_eligible(style: u32, ex: u32) -> bool {
    style & WS_CAPTION.0 != 0 && ex & WS_EX_WINDOWEDGE.0 != 0
}

unsafe fn enforce_floating_frame(hwnd: HWND) {
    let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
    let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    let (want_style, want_ex) = floating_frame_style(style, ex);
    if want_style == style && want_ex == ex {
        return;
    }
    if want_style != style {
        SetWindowLongPtrW(hwnd, GWL_STYLE, want_style as isize);
    }
    if want_ex != ex {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want_ex as isize);
    }
    // SWP_FRAMECHANGED recomputes the non-client area so the client fills the window.
    if let Err(e) = SetWindowPos(
        hwnd,
        Some(HWND_TOPMOST),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
    ) {
        eprintln!("Floating frame style: {e}");
    }
}

unsafe fn position(hwnd: HWND, state: &Reservation) {
    // tao re-applies its own styles on visible/always-on-top changes; re-assert.
    enforce_floating_frame(hwnd);
    if state.busy.replace(true) {
        return;
    }
    let mut d = data(hwnd);
    d.rc = top_strip(state.rect, state.height);
    SHAppBarMessage(ABM_QUERYPOS, &mut d);
    d.rc.bottom = d.rc.top + state.height;
    let proposed = [d.rc.left, d.rc.top, d.rc.right, d.rc.bottom];
    // ABM_SETPOS itself broadcasts ABN_POSCHANGED. Do not answer an echoed
    // notification by setting the same rectangle again (an asynchronous loop).
    if state.applied.get() != Some(proposed) {
        // Cache the accepted reservation, not an assumption about the HWND.
        state.applied.set(Some(proposed));
        COUNTS[2].fetch_add(1,Ordering::Relaxed);
        SHAppBarMessage(ABM_SETPOS, &mut d);
        state.applied.set(Some([d.rc.left,d.rc.top,d.rc.right,d.rc.bottom]));
    }
    let mut actual=RECT::default();
    let matches=GetWindowRect(hwnd,&mut actual).is_ok() && [actual.left,actual.top,actual.right,actual.bottom]==[d.rc.left,d.rc.top,d.rc.right,d.rc.bottom];
    if !matches {if let Err(e) = SetWindowPos(
        hwnd,
        Some(HWND_TOPMOST),
        d.rc.left,
        d.rc.top,
        d.rc.right - d.rc.left,
        d.rc.bottom - d.rc.top,
        SWP_NOACTIVATE,
    ) {
        eprintln!("Bar positioning: {e}");
    }}
    state.busy.set(false);
}
unsafe extern "system" fn procedure(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    reference: usize,
) -> LRESULT {
    COUNTS[0].fetch_add(1,Ordering::Relaxed);
    if msg==WM_WINDOWPOSCHANGED{COUNTS[3].fetch_add(1,Ordering::Relaxed);}
    let state = &*(reference as *const Reservation);
    // Windows can move a newly shown window inside rcWork, which starts BELOW
    // our reservation. Keep the bar HWND on its negotiated physical rectangle.
    if msg==WM_WINDOWPOSCHANGING && !state.busy.get(){
        if let Some([left,top,right,bottom])=state.applied.get(){
            if let Some(p)=(lp.0 as *mut WINDOWPOS).as_mut(){
                if !p.flags.contains(SWP_NOMOVE){p.x=left;p.y=top;}
                if !p.flags.contains(SWP_NOSIZE){p.cx=right-left;p.cy=bottom-top;}
            }
        }
    }
    if msg==REFRESH_GEOMETRY{position(hwnd,state);return LRESULT(0);}
    if msg==WM_STYLECHANGED{enforce_floating_frame(hwnd);return LRESULT(0);}
    if msg == WM_NCDESTROY {
        let mut d = data(hwnd);
        SHAppBarMessage(ABM_REMOVE, &mut d);
        let _ = RemoveWindowSubclass(hwnd, Some(procedure), SUBCLASS);
        drop(Box::from_raw(reference as *mut Reservation));
        return DefSubclassProc(hwnd, msg, wp, lp);
    }
    if msg == CALLBACK {
        COUNTS[1].fetch_add(1,Ordering::Relaxed);
        if wp.0 as u32 == ABN_POSCHANGED {
            position(hwnd, state);
        }
        if wp.0 as u32 == ABN_FULLSCREENAPP {
            // A fullscreen app owns the screen: never float a stale tooltip over it.
            overlay_hide(&state.app);
            let top = if lp.0 != 0 {
                HWND_NOTOPMOST
            } else {
                HWND_TOPMOST
            };
            let _ = SetWindowPos(
                hwnd,
                Some(top),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
        return LRESULT(0);
    }
    if msg == state.taskbar_message {
        state.applied.set(None);
        let mut d = data(hwnd);
        SHAppBarMessage(ABM_NEW, &mut d);
        position(hwnd, state);
    }
    if msg == WM_DISPLAYCHANGE || msg == WM_DPICHANGED {
        if !RECONCILE_PENDING.swap(true, Ordering::AcqRel) {
            let app = state.app.clone();
            let job = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Err(e) = reconcile(&job) {
                    eprintln!("Monitor change: {e}");
                }
                RECONCILE_PENDING.store(false, Ordering::Release);
            });
        }
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}
fn fingerprint(m: &tauri::Monitor) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}",
        m.name().map(String::as_str).unwrap_or("display"),
        m.position().x,
        m.position().y,
        m.size().width,
        m.size().height,
        m.scale_factor()
    )
}
fn top_strip(monitor:RECT,height:i32)->RECT{RECT{left:monitor.left,top:monitor.top,right:monitor.right,bottom:monitor.top+height.clamp(1,(monitor.bottom-monitor.top).max(1))}}
pub fn reconcile(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // A stale anchor must never survive a monitor/DPI change.
    overlay_hide(app);
    let monitors = app.available_monitors()?;
    let mut desired = Vec::new();
    for m in monitors {
        let signature = fingerprint(&m);
        let mut hash = DefaultHasher::new();
        signature.hash(&mut hash);
        let label = format!("bar-{:x}", hash.finish());
        desired.push(label.clone());
        if app.get_webview_window(&label).is_some() {
            continue;
        }
        let height = (36. * m.scale_factor()).round() as i32;
        let window =
            WebviewWindowBuilder::new(app, &label, WebviewUrl::App(if cfg!(debug_assertions) && std::env::args().any(|arg| arg == "--check-popups") { "index.html?view=bar&popup-check=1" } else { "index.html?view=bar" }.into()))
                .title(format!(
                    "Strata · {}",
                    m.name().map(String::as_str).unwrap_or("Monitor")
                ))
                .decorations(false)
                .resizable(false)
                .skip_taskbar(true)
                .always_on_top(true)
                .shadow(false)
                .visible(false)
                .inner_size(m.size().width as f64 / m.scale_factor(), 36.)
                .position(
                    m.position().x as f64 / m.scale_factor(),
                    m.position().y as f64 / m.scale_factor(),
                )
                .build()?;
        unsafe {
            let hwnd = HWND(window.hwnd()?.0);
            let owner = Box::new(Reservation {
                app: app.clone(),
                rect: RECT {
                    left: m.position().x,
                    top: m.position().y,
                    right: m.position().x + m.size().width as i32,
                    bottom: m.position().y + m.size().height as i32,
                },
                height,
                busy: Cell::new(false),
                applied: Cell::new(None),
                taskbar_message: RegisterWindowMessageW(w!("TaskbarCreated")),
            });
            let pointer = Box::into_raw(owner);
            if !SetWindowSubclass(hwnd, Some(procedure), SUBCLASS, pointer as usize).as_bool() {
                drop(Box::from_raw(pointer));
                window.destroy()?;
                return Err("Cannot install AppBar window handler".into());
            }
            let mut d = data(hwnd);
            if SHAppBarMessage(ABM_NEW, &mut d) == 0 {
                window.destroy()?;
                return Err("Windows rejected AppBar registration".into());
            }
            position(hwnd, &*pointer);
        }
        window.show()?;
        unsafe{enforce_floating_frame(HWND(window.hwnd()?.0));}
        // ShowWindow/DPI initialization must finish before the final placement.
        unsafe{SendMessageW(HWND(window.hwnd()?.0),REFRESH_GEOMETRY,Some(WPARAM(0)),Some(LPARAM(0)));}
    }
    for (label, w) in app.webview_windows() {
        if label.starts_with("bar-") && !desired.contains(&label) {
            w.destroy()?;
        }
    }
    let bars=bar_snapshot();
    let layout = serde_json::json!({"bars":bars,"monitors":monitor_snapshot()});
    if let Err(e) = std::fs::write(
        std::env::temp_dir().join("strata-layout.json"),
        serde_json::to_string_pretty(&layout)?,
    ) {
        eprintln!("Layout diagnostic: {e}");
    }
    Ok(())
}
pub fn release_all(app: &AppHandle) {
    overlay_hide(app);
    for (label, w) in app.webview_windows() {
        // Only AppBar windows own a reservation; the overlay must never remove one.
        if !label.starts_with("bar-") {
            continue;
        }
        if let Ok(h) = w.hwnd() {
            unsafe {
                let mut d = data(HWND(h.0));
                SHAppBarMessage(ABM_REMOVE, &mut d);
            }
        }
    }
}
/// The single floating surface shared by tooltips and, later, widget popups.
///
/// It is created once at startup, never destroyed, never registered as an
/// AppBar and always repositioned by Rust from the reporting bar's window
/// rectangle, so mixed DPI and negative monitor origins stay correct.
struct OverlayState {
    app: AppHandle,
}

/// Last monitor the overlay was anchored to, so a cross-monitor hover hides
/// instead of sliding the surface across both screens.
static OVERLAY_MONITOR: AtomicIsize = AtomicIsize::new(0);

const MAX_TEXT_CHARS: usize = 512;
const MAX_LOGICAL_SIZE: f64 = 1024.0;

fn to_physical(value: f64, scale: f64) -> i32 {
    (value * scale)
        .round()
        .clamp(i32::MIN as f64, i32::MAX as f64) as i32
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OverlaySide {
    Top,
    Bottom,
}

impl OverlaySide {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "top" => Ok(Self::Top),
            "bottom" => Ok(Self::Bottom),
            other => Err(format!("Unsupported overlay side '{other}'")),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Top => "top",
            Self::Bottom => "bottom",
        }
    }
}

#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct OverlayAnchor {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct OverlaySize {
    pub width: f64,
    pub height: f64,
}

/// `overlay_show` payload. `source` is optional because the command already
/// receives the calling window; when present it must match.
#[derive(Clone, Debug, serde::Deserialize)]
pub struct OverlayRequest {
    pub v: u32,
    #[serde(default)]
    pub session: Option<String>,
    #[serde(default)]
    pub component: Option<String>,
    #[serde(default, deserialize_with = "deserialize_popup_params")]
    pub params: Option<serde_json::Value>,
    #[serde(default)]
    pub source: Option<String>,
    pub kind: String,
    pub text: String,
    pub anchor: OverlayAnchor,
    pub size: OverlaySize,
    pub side: String,
}

fn deserialize_popup_params<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<serde_json::Value>, D::Error> {
    <serde_json::Value as serde::Deserialize>::deserialize(deserializer).map(Some)
}

impl OverlayRequest {
    fn validate(&self) -> Result<OverlaySide, String> {
        if self.v != 1 {
            return Err(format!(
                "Overlay contract version {} is unsupported",
                self.v
            ));
        }
        if !matches!(self.kind.as_str(), "tooltip" | "popover") {
            return Err(format!("Unsupported overlay kind '{}'", self.kind));
        }
        if self.kind == "popover" {
            if !self.component.as_deref().is_some_and(crate::popup_ids::contains)
                || self.session.as_ref().is_none_or(|s| s.is_empty() || s.len() > 128) {
                return Err("Invalid popup component or session".into());
            }
            if self.params.as_ref().is_some_and(|params| params.to_string().len() > 16 * 1024) {
                return Err("Popup parameters exceed 16 KiB".into());
            }
        }
        if self.text.trim().is_empty() {
            return Err("Overlay text is empty".into());
        }
        if self.text.chars().count() > MAX_TEXT_CHARS {
            return Err(format!("Overlay text exceeds {MAX_TEXT_CHARS} characters"));
        }
        for value in [
            self.anchor.x,
            self.anchor.y,
            self.anchor.width,
            self.anchor.height,
            self.size.width,
            self.size.height,
        ] {
            if !value.is_finite() {
                return Err("Overlay geometry must be finite".into());
            }
        }
        if self.size.width <= 0.0 || self.size.height <= 0.0 {
            return Err("Overlay size must be positive".into());
        }
        if self.size.width > MAX_LOGICAL_SIZE || self.size.height > MAX_LOGICAL_SIZE {
            return Err(format!("Overlay size exceeds {MAX_LOGICAL_SIZE} CSS px"));
        }
        OverlaySide::parse(&self.side)
    }
}

#[derive(Clone, serde::Serialize)]
struct RenderPayload<'a> {
    #[serde(rename = "arrowX")]
    arrow_x: f64,
    kind: &'a str,
    text: &'a str,
    side: &'a str,
    session: u64,
    component: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<&'a serde_json::Value>,
    popup_session: Option<&'a str>,
}

/// Physical placement for a surface anchored to a bar edge.
///
/// `size` already includes the arrow allowance on the anchored side, so the
/// surface edge sits flush with the bar edge and the pill keeps its gap.
fn overlay_position(
    bar: RECT,
    monitor: RECT,
    size: (i32, i32),
    anchor_center_x: i32,
    side: OverlaySide,
) -> (i32, i32) {
    let (width, height) = size;
    let max_x = (monitor.right - width).max(monitor.left);
    let x = (anchor_center_x - width / 2).clamp(monitor.left, max_x);
    let y = match side {
        OverlaySide::Bottom => bar.bottom,
        OverlaySide::Top => bar.top - height,
    };
    let max_y = (monitor.bottom - height).max(monitor.top);
    (x, y.clamp(monitor.top, max_y))
}

/// Widget CSS coordinates cannot tell whether its AppBar is on the top or bottom.
fn overlay_side_for_bar(bar: RECT, monitor: RECT) -> OverlaySide {
    if i64::from(bar.top) + i64::from(bar.bottom) < i64::from(monitor.top) + i64::from(monitor.bottom) {
        OverlaySide::Bottom
    } else {
        OverlaySide::Top
    }
}

/// The panel may be clamped at a monitor edge; the arrow still points at its anchor.
fn overlay_arrow_x(anchor_center: i32, window_left: i32, scale: f64) -> f64 {
    (anchor_center - window_left) as f64 / scale
}

fn monitor_rect(hwnd: HWND) -> Option<RECT> {
    unsafe {
        let handle = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(handle, &mut info).as_bool() {
            Some(info.rcMonitor)
        } else {
            None
        }
    }
}

pub fn ensure_overlay(app: &AppHandle) -> Result<WebviewWindow, Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window(OVERLAY) {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(
        app,
        OVERLAY,
        WebviewUrl::App("index.html?view=overlay".into()),
    )
    .title(OVERLAY_TITLE)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .focused(false)
    .visible(false)
    .inner_size(1., 1.)
    .build()?;
    unsafe {
        let hwnd = HWND(window.hwnd()?.0);
        let owner = Box::new(OverlayState { app: app.clone() });
        let pointer = Box::into_raw(owner);
        if !SetWindowSubclass(
            hwnd,
            Some(overlay_procedure),
            OVERLAY_SUBCLASS,
            pointer as usize,
        )
        .as_bool()
        {
            drop(Box::from_raw(pointer));
            window.destroy()?;
            return Err("Cannot install the overlay window handler".into());
        }
        enforce_floating_frame(hwnd);
    }
    // The surface is a tooltip host: clicks belong to whatever is underneath.
    window.set_ignore_cursor_events(true)?;
    Ok(window)
}

fn hide_overlay_hwnd_with_focus(app: &AppHandle, hwnd: HWND, restore_focus: bool) {
    let closed = POPUP.lock().unwrap().take();
    *LAST_OVERLAY_RENDER.lock().unwrap() = None;
    *OVERLAY_OWNER.lock().unwrap() = None;
    if unsafe { IsWindowVisible(hwnd).as_bool() } {
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        OVERLAY_COUNTS[2].fetch_add(1, Ordering::Relaxed);
    }
    if let Some(window) = app.get_webview_window(OVERLAY) { let _ = window.set_ignore_cursor_events(true); let _ = window.hide(); }
    // Drop the stale pill so the next show cannot flash the previous tooltip.
    let cleared = OVERLAY_SESSION.fetch_add(1, Ordering::Relaxed) + 1;
    let _ = app.emit_to(OVERLAY, "overlay:clear", cleared);
    if let Some(closed) = closed { let _ = app.emit("overlay:closed", serde_json::json!({"session": closed.id, "restoreFocus": restore_focus})); }
}

fn hide_overlay_hwnd(app: &AppHandle, hwnd: HWND) {
    hide_overlay_hwnd_with_focus(app, hwnd, false);
}

fn hide_overlay_window(app: &AppHandle, window: &WebviewWindow) {
    if let Ok(h) = window.hwnd() {
        hide_overlay_hwnd(app, HWND(h.0));
    }
}

/// Hides the overlay. Safe to call when it does not exist (startup, shutdown)
/// and when it is already hidden; a lost `pointerleave` cannot strand a ghost.
pub fn overlay_hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(OVERLAY) {
        hide_overlay_window(app, &window);
    }
}

/// Tooltip cleanup can never dismiss an interactive popup.
pub fn overlay_hide_request(app: &AppHandle, session: Option<&str>) {
    let popup = POPUP.lock().unwrap().clone();
    if let Some(popup) = popup { if session != Some(popup.id.as_str()) { return; } }
    let owner = OVERLAY_OWNER.lock().unwrap().clone();
    if owner.as_deref() != session { return; }
    if animate_popup_close(app, false) { return; }
    overlay_hide(app);
}

/// Hold the visible surface for its exit animation. The delayed completion
/// checks ownership so it cannot hide a newer popup or tooltip.
fn animate_popup_close(app: &AppHandle, restore_focus: bool) -> bool {
    let popup = {
        let mut active = POPUP.lock().unwrap();
        let Some(popup) = active.as_mut() else { return false; };
        if popup.closing { return true; }
        popup.closing = true;
        popup.clone()
    };
    let _ = app.emit_to(OVERLAY, "overlay:closing", &popup.id);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(250));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let current = POPUP.lock().unwrap().clone();
            if !current.is_some_and(|p| p.id == popup.id && p.closing) { return; }
            if let Some(window) = handle.get_webview_window(OVERLAY) {
                if let Ok(hwnd) = window.hwnd() {
                    hide_overlay_hwnd_with_focus(&handle, HWND(hwnd.0), restore_focus);
                }
            }
            if restore_focus {
                if let Some(source) = handle.get_webview_window(&popup.source) { let _ = source.set_focus(); }
            }
        });
    });
    true
}

pub fn overlay_dismiss(app: &AppHandle, session: Option<&str>) {
    let current = POPUP.lock().unwrap().clone();
    if let Some(popup) = current {
        if session != Some(popup.id.as_str()) { return; }
        animate_popup_close(app, true);
    }
}

/// Replay after listeners install, so a cold/refreshing overlay cannot lose preparation.
pub fn overlay_ready(caller: &WebviewWindow) -> Result<serde_json::Value, String> {
    if caller.label() != OVERLAY { return Err("Only overlay may read prepared content".into()); }
    Ok(serde_json::json!({"session": OVERLAY_SESSION.load(Ordering::Relaxed), "render": LAST_OVERLAY_RENDER.lock().unwrap().clone()}))
}

// Safety bound for Win32 conversion; popup layout is never clamped to this value.
fn valid_popup_size(size: &OverlaySize) -> bool {
    [size.width, size.height].into_iter().all(|value| value.is_finite() && value > 0.0 && value <= 1_000_000.0)
}

/// Resize only the current interactive session; placement remains native-owned.
pub fn overlay_resize(
    app: &AppHandle,
    caller: &WebviewWindow,
    session: &str,
    size: &OverlaySize,
) -> Result<serde_json::Value, String> {
    if caller.label() != OVERLAY || !valid_popup_size(size) {
        return Err("Invalid popup resize request".into());
    }
    let popup = POPUP.lock().unwrap().clone().filter(|p| p.id == session && !p.closing)
        .ok_or("Popup session is no longer active")?;
    let source = app.get_webview_window(&popup.source).ok_or("Popup source is unavailable")?;
    let source_hwnd = HWND(source.hwnd().map_err(|e| e.to_string())?.0);
    let hwnd = HWND(caller.hwnd().map_err(|e| e.to_string())?.0);
    let mut bar = RECT::default();
    let mut current = RECT::default();
    unsafe {
        GetWindowRect(source_hwnd, &mut bar).map_err(|e| e.to_string())?;
        GetWindowRect(hwnd, &mut current).map_err(|e| e.to_string())?;
    }
    let monitor = monitor_rect(source_hwnd).ok_or("Popup monitor is unavailable")?;
    let scale = source.scale_factor().map_err(|e| e.to_string())?;
    let width = to_physical(size.width, scale).max(1);
    let height = to_physical(size.height, scale).max(1);
    let center = bar.left + to_physical(popup.anchor.x + popup.anchor.width / 2.0, scale);
    let (x, y) = overlay_position(bar, monitor, (width, height), center, popup.side);
    let arrow_x = overlay_arrow_x(center, x, scale);
    if !popup.revealed || current.right - current.left != width || current.bottom - current.top != height || current.left != x || current.top != y {
        unsafe {
            enforce_floating_frame(hwnd);
            SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y,
                width, height, SWP_NOACTIVATE)
                .map_err(|e| e.to_string())?;
        }
        OVERLAY_COUNTS[1].fetch_add(1, Ordering::Relaxed);
    }
    if !popup.revealed {
        if let Some(active) = POPUP.lock().unwrap().as_mut().filter(|p| p.id == session) { active.revealed = true; }
        // Keep tao visibility state in sync: set_focus ignores windows it thinks are hidden.
        caller.show().map_err(|e| e.to_string())?;
        caller.set_focus().map_err(|e| e.to_string())?;
        OVERLAY_COUNTS[0].fetch_add(1, Ordering::Relaxed);
    }
    if let Some(render) = LAST_OVERLAY_RENDER.lock().unwrap().as_mut() {
        render["arrowX"] = serde_json::json!(arrow_x);
    }
    Ok(serde_json::json!({"arrowX": arrow_x}))
}

#[cfg(debug_assertions)]
pub fn check_resize_active(app: &AppHandle) -> Result<(), String> {
    let popup = POPUP.lock().unwrap().clone().ok_or("No active popup")?;
    let window = app.get_webview_window(OVERLAY).ok_or("No overlay")?;
    let mut rect = RECT::default();
    unsafe { GetWindowRect(HWND(window.hwnd().map_err(|e| e.to_string())?.0), &mut rect).map_err(|e| e.to_string())?; }
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    overlay_resize(app, &window, &popup.id, &OverlaySize { width: (rect.right - rect.left) as f64 / scale, height: (rect.bottom - rect.top) as f64 / scale })?;
    Ok(())
}

pub fn overlay_show(
    app: &AppHandle,
    caller: &WebviewWindow,
    request: &OverlayRequest,
) -> Result<(), String> {
    request.validate()?;
    if let Some(source) = request.source.as_deref() {
        if source != caller.label() {
            return Err("Overlay request source does not match the calling window".into());
        }
    }
    if !caller.label().starts_with("bar-") {
        return Err(format!(
            "Only bar-* windows may show the overlay (caller: {})",
            caller.label()
        ));
    }
    let current = POPUP.lock().unwrap().clone();
    if let Some(current) = current {
        if request.kind == "tooltip" { return Ok(()); }
        if request.session.as_deref() == Some(current.id.as_str()) && current.source == caller.label() {
            overlay_hide(app);
            return Ok(());
        }
    }
    if request.kind == "popover" { overlay_hide(app); }
    let window = ensure_overlay(app).map_err(|e| e.to_string())?;
    let bar_hwnd = HWND(caller.hwnd().map_err(|e| e.to_string())?.0);
    let mut bar = RECT::default();
    unsafe {
        if GetWindowRect(bar_hwnd, &mut bar).is_err() {
            return Err("The reporting bar window has no rectangle".into());
        }
    }
    let monitor = monitor_rect(bar_hwnd).unwrap_or(bar);
    let side = overlay_side_for_bar(bar, monitor);
    unsafe {
        let handle = MonitorFromWindow(bar_hwnd, MONITOR_DEFAULTTONEAREST);
        if OVERLAY_MONITOR.swap(handle.0 as isize, Ordering::Relaxed) != handle.0 as isize {
            // Re-anchoring on another monitor must hide instead of sliding.
            hide_overlay_window(app, &window);
        }
    }
    let scale = caller.scale_factor().unwrap_or(1.0);
    let logical_width = if request.kind == "popover" { 1.0 } else { request.size.width };
    let width = to_physical(logical_width, scale).clamp(1, (monitor.right - monitor.left).clamp(1, 4096));
    let height = to_physical(if request.kind == "popover" { 1.0 } else { request.size.height }, scale).clamp(1, (monitor.bottom - monitor.top).clamp(1, 4096));
    let center = bar.left + to_physical(request.anchor.x + request.anchor.width / 2.0, scale);
    let (x, y) = overlay_position(bar, monitor, (width, height), center, side);
    let session = OVERLAY_SESSION.fetch_add(1, Ordering::Relaxed) + 1;
    let interactive = request.kind == "popover";
    if interactive {
        *POPUP.lock().unwrap() = Some(PopupSession { id: request.session.clone().unwrap(), source: caller.label().into(), side, anchor: OverlayAnchor { x: request.anchor.x, y: request.anchor.y, width: request.anchor.width, height: request.anchor.height }, revealed: false, closing: false });
    }
    *OVERLAY_OWNER.lock().unwrap() = request.session.clone();
    window.set_ignore_cursor_events(!interactive).map_err(|e| e.to_string())?;
    let payload = serde_json::to_value(RenderPayload {
            arrow_x: overlay_arrow_x(center, x, scale),
            kind: &request.kind,
            text: &request.text,
            side: side.as_str(),
            session,
            component: request.component.as_deref(),
            params: request.params.as_ref(),
            popup_session: request.session.as_deref(),
        }).map_err(|e| e.to_string())?;
    *LAST_OVERLAY_RENDER.lock().unwrap() = Some(payload.clone());
    app.emit_to(OVERLAY, "overlay:render", payload).map_err(|e| e.to_string())?;
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
    struct Placement;
    impl Drop for Placement { fn drop(&mut self) { OVERLAY_PLACING.store(false, Ordering::Relaxed); } }
    OVERLAY_PLACING.store(true, Ordering::Relaxed);
    let _placement = Placement;
    unsafe {
        // tao re-applies its own styles on visibility changes; re-assert.
        enforce_floating_frame(hwnd);
        if let Err(e) = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            x,
            y,
            width,
            height,
            if interactive { SWP_NOACTIVATE } else { SWP_NOACTIVATE | SWP_SHOWWINDOW },
        ) {
            return Err(format!("Cannot place the overlay: {e}"));
        }
        if !interactive { let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE); }
    }
    if !interactive { OVERLAY_COUNTS[0].fetch_add(1, Ordering::Relaxed); }
    OVERLAY_COUNTS[1].fetch_add(1, Ordering::Relaxed);
    Ok(())
}

unsafe extern "system" fn overlay_procedure(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    reference: usize,
) -> LRESULT {
    let state = &*(reference as *const OverlayState);
    match msg {
        WM_ACTIVATE if wp.0 & 0xffff == WA_INACTIVE as usize => {
            let current = POPUP.lock().unwrap().clone();
            if let Some(popup) = current {
                let foreground = HWND(lp.0 as *mut core::ffi::c_void);
                let source = state.app.get_webview_window(&popup.source).and_then(|w| w.hwnd().ok()).map(|h| HWND(h.0));
                if source != Some(foreground) { animate_popup_close(&state.app, false); }
            }
        }
        WM_STYLECHANGED => {
            enforce_floating_frame(hwnd);
            return LRESULT(0);
        }
        WM_DPICHANGED if OVERLAY_PLACING.load(Ordering::Relaxed) => {}
        WM_DPICHANGED | WM_DISPLAYCHANGE => {
            // The stored anchor belongs to the old geometry.
            hide_overlay_hwnd(&state.app, hwnd);
        }
        WM_NCDESTROY => {
            let _ = RemoveWindowSubclass(hwnd, Some(overlay_procedure), OVERLAY_SUBCLASS);
            drop(Box::from_raw(reference as *mut OverlayState));
            return DefSubclassProc(hwnd, msg, wp, lp);
        }
        _ => {}
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}

/// Probe-only view of the overlay HWND, used by `--probe`, `diagnostics` and
/// `scripts/test-live-geometry.ps1`.
pub fn overlay_snapshot() -> serde_json::Value {
    unsafe extern "system" fn collect(hwnd: HWND, param: LPARAM) -> windows::core::BOOL {
        let mut title = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut title);
        let title = String::from_utf16_lossy(&title[..len.max(0) as usize]);
        if title == OVERLAY_TITLE {
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
                let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
                let values = &mut *(param.0 as *mut Vec<serde_json::Value>);
                values.push(serde_json::json!({
                    "rect": [rect.left, rect.top, rect.right, rect.bottom],
                    "visible": IsWindowVisible(hwnd).as_bool(),
                    "toolWindow": ex & WS_EX_TOOLWINDOW.0 != 0,
                    "topmost": ex & WS_EX_TOPMOST.0 != 0,
                    "clickThrough": ex & WS_EX_TRANSPARENT.0 != 0,
                    "komorebiEligible": komorebi_eligible(style, ex),
                }));
            }
        }
        true.into()
    }
    let mut values: Vec<serde_json::Value> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut values as *mut _ as isize));
    }
    let present = !values.is_empty();
    serde_json::json!({
        "present": present,
        "window": values.into_iter().next(),
        "counters": {
            "shows": OVERLAY_COUNTS[0].load(Ordering::Relaxed),
            "positions": OVERLAY_COUNTS[1].load(Ordering::Relaxed),
            "hides": OVERLAY_COUNTS[2].load(Ordering::Relaxed),
        },
    })
}

pub fn monitor_snapshot() -> serde_json::Value {
    unsafe extern "system" fn collect(
        m: HMONITOR,
        _: HDC,
        _: *mut RECT,
        param: LPARAM,
    ) -> windows::core::BOOL {
        let values = &mut *(param.0 as *mut Vec<serde_json::Value>);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(m, &mut info).as_bool() {
            let r = info.rcMonitor;
            let w = info.rcWork;
            values.push(serde_json::json!({"monitor":[r.left,r.top,r.right,r.bottom],"workArea":[w.left,w.top,w.right,w.bottom]}));
        }
        true.into()
    }
    let mut values: Vec<serde_json::Value> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(collect),
            LPARAM(&mut values as *mut _ as isize),
        );
    }
    serde_json::json!(values)
}
pub fn bar_snapshot()->serde_json::Value{
    unsafe extern "system" fn collect(hwnd:HWND,param:LPARAM)->windows::core::BOOL{
        let mut title=[0u16;256];let len=GetWindowTextW(hwnd,&mut title);
        let title=String::from_utf16_lossy(&title[..len.max(0) as usize]);
        if title.starts_with("Strata ·") {let mut rect=RECT::default();let mut client=RECT::default();if GetWindowRect(hwnd,&mut rect).is_ok(){let _=GetClientRect(hwnd,&mut client);let style=GetWindowLongPtrW(hwnd,GWL_STYLE) as u32;let ex=GetWindowLongPtrW(hwnd,GWL_EXSTYLE) as u32;let values=&mut *(param.0 as *mut Vec<serde_json::Value>);values.push(serde_json::json!({"title":title,"rect":[rect.left,rect.top,rect.right,rect.bottom],"client":[client.right,client.bottom],"visible":IsWindowVisible(hwnd).as_bool(),"toolWindow":ex & WS_EX_TOOLWINDOW.0 != 0,"topmost":ex & WS_EX_TOPMOST.0 != 0,"komorebiEligible":komorebi_eligible(style,ex)}));}}true.into()
    }
    let mut values:Vec<serde_json::Value>=Vec::new();unsafe{let _=EnumWindows(Some(collect),LPARAM(&mut values as *mut _ as isize));}serde_json::json!(values)
}
#[cfg(test)]mod geometry_tests{
    use super::*;
    #[test]
    fn popup_sizes_allow_large_content_but_reject_invalid_numbers() {
        for (width, height) in [(0.0, 20.0), (20.0, -1.0), (f64::NAN, 20.0), (20.0, f64::INFINITY), (1_000_001.0, 20.0)] {
            assert!(!valid_popup_size(&OverlaySize { width, height }));
        }
        assert!(valid_popup_size(&OverlaySize { width: 5000.0, height: 3000.0 }));
    }

    #[test]
    fn oversized_popups_keep_their_size_and_align_to_monitor_origin() {
        let monitor = RECT { left: -1920, top: -200, right: 0, bottom: 880 };
        let bar = RECT { left: -1920, top: -200, right: 0, bottom: -164 };
        assert_eq!(overlay_position(bar, monitor, (2400, 1400), -900, OverlaySide::Bottom), (-1920, -200));
        assert_eq!(overlay_position(bar, monitor, (400, 1060), -1900, OverlaySide::Bottom), (-1920, -180));
    }

    #[test]fn secondary_above_primary_uses_monitor_top_not_work_area(){let r=top_strip(RECT{left:724,top:-1080,right:2644,bottom:0},36);assert_eq!([r.left,r.top,r.right,r.bottom],[724,-1080,2644,-1044]);}
    #[test]fn negative_x_and_scaled_height_keep_physical_origin(){let r=top_strip(RECT{left:-2560,top:120,right:0,bottom:1560},54);assert_eq!([r.left,r.top,r.right,r.bottom],[-2560,120,0,174]);}
    #[test]fn floating_frame_styles_make_the_window_ineligible_for_komorebi(){
        // Exactly what tao produces for an undecorated, always-on-top top-level window.
        let style=WS_CAPTION.0|WS_CLIPSIBLINGS.0|WS_SYSMENU.0|WS_VISIBLE.0;
        let ex=WS_EX_WINDOWEDGE.0|WS_EX_ACCEPTFILES.0|WS_EX_APPWINDOW.0|WS_EX_TOPMOST.0;
        assert!(komorebi_eligible(style,ex));
        let (style,ex)=floating_frame_style(style,ex);
        assert!(!komorebi_eligible(style,ex));
        assert_eq!(style & (WS_CAPTION.0|WS_THICKFRAME.0|WS_SYSMENU.0),0);
        assert_ne!(ex & WS_EX_TOOLWINDOW.0,0);
        assert_ne!(ex & WS_EX_TOPMOST.0,0);
        assert_eq!(ex & WS_EX_WINDOWEDGE.0,0);
        assert_eq!(ex & WS_EX_APPWINDOW.0,0);
        // Idempotent so the WM_STYLECHANGED re-assert cannot loop.
        assert_eq!(floating_frame_style(style,ex),(style,ex));
    }
    #[test]fn floating_frame_style_keeps_click_through_bits(){
        // WS_EX_TRANSPARENT is what set_ignore_cursor_events sets; the style
        // guard runs on every show and must never drop it.
        let (_,ex)=floating_frame_style(WS_VISIBLE.0,WS_EX_TRANSPARENT.0|WS_EX_LAYERED.0);
        assert_ne!(ex & WS_EX_TRANSPARENT.0,0);
        assert_ne!(ex & WS_EX_LAYERED.0,0);
    }
    #[test]fn floating_frame_style_keeps_unrelated_bits(){
        let (style,ex)=floating_frame_style(WS_VISIBLE.0|WS_CLIPSIBLINGS.0,WS_EX_ACCEPTFILES.0);
        assert_eq!(style,WS_VISIBLE.0|WS_CLIPSIBLINGS.0);
        assert_eq!(ex,WS_EX_ACCEPTFILES.0|WS_EX_TOOLWINDOW.0|WS_EX_TOPMOST.0);
    }
    fn request(kind:&str,side:&str)->OverlayRequest{
        OverlayRequest{
            v:1,
            session: Some("test".into()),
            component: Some("audioOutputs".into()),
            params: Some(serde_json::json!({})),
            source:None,
            kind:kind.into(),
            text:"Uso total de CPU".into(),
            anchor:OverlayAnchor{x:120.5,y:8.,width:74.,height:20.},
            size:OverlaySize{width:268.,height:26.},
            side:side.into(),
        }
    }
    #[test]fn overlay_requests_reject_unknown_contracts(){
        assert!(request("tooltip","bottom").validate().is_ok());
        assert!(request("popover","top").validate().is_ok());
        assert!(request("dialog","bottom").validate().is_err());
        assert!(request("tooltip","left").validate().is_err());
        let mut stale=request("tooltip","bottom");stale.v=2;
        assert!(stale.validate().is_err());
        let mut empty=request("tooltip","bottom");empty.text="   ".into();
        assert!(empty.validate().is_err());
        let mut huge=request("tooltip","bottom");huge.text="x".repeat(MAX_TEXT_CHARS+1);
        assert!(huge.validate().is_err());
        let mut nan=request("tooltip","bottom");nan.anchor.x=f64::NAN;
        assert!(nan.validate().is_err());
        let mut zero=request("tooltip","bottom");zero.size.width=0.;
        assert!(zero.validate().is_err());
        let mut oversized=request("tooltip","bottom");oversized.size.height=MAX_LOGICAL_SIZE+1.;
        assert!(oversized.validate().is_err());
    }
    #[test]
    fn side_is_owned_by_actual_monitor_geometry_not_widget_center() {
        let monitor = RECT { left: -1920, top: -1080, right: 0, bottom: 0 };
        assert_eq!(overlay_side_for_bar(RECT { left: -1920, top: -1080, right: 0, bottom: -1044 }, monitor), OverlaySide::Bottom);
        assert_eq!(overlay_side_for_bar(RECT { left: -1920, top: -36, right: 0, bottom: 0 }, monitor), OverlaySide::Top);
    }
    #[test]
    fn popup_params_preserve_explicit_null_and_missing_input_separately() {
        #[derive(serde::Deserialize)]
        struct Input {
            #[serde(default, deserialize_with = "deserialize_popup_params")]
            params: Option<serde_json::Value>,
        }
        assert!(serde_json::from_str::<Input>("{}").unwrap().params.is_none());
        assert_eq!(serde_json::from_str::<Input>(r#"{"params":null}"#).unwrap().params, Some(serde_json::Value::Null));
    }
    #[test]
    fn popup_requests_bound_payload_bytes_and_discovered_ids() {
        let mut request = request("popover", "bottom");
        request.component = Some("not-registered".into());
        assert!(request.validate().is_err());
        request.component = Some("audioOutputs".into());
        request.params = Some(serde_json::json!({"payload":"x".repeat(16 * 1024)}));
        assert!(request.validate().is_err());
        request.params = None;
        assert!(request.validate().is_ok());
    }
    #[test]
    fn arrows_remain_on_the_anchor_when_panels_are_clamped() {
        for (monitor, center, scale) in [
            (RECT { left: 0, top: 0, right: 1920, bottom: 1080 }, 1900, 1.0),
            (RECT { left: 0, top: 0, right: 1920, bottom: 1080 }, 20, 1.0),
            (RECT { left: -2560, top: -1440, right: -640, bottom: 0 }, -660, 1.25),
        ] {
            for side in [OverlaySide::Top, OverlaySide::Bottom] {
                let (x, _) = overlay_position(monitor, monitor, (400, 200), center, side);
                let arrow = overlay_arrow_x(center, x, scale);
                assert_eq!(x as f64 + arrow * scale, center as f64);
                assert!((0.0..=400.0 / scale).contains(&arrow));
            }
        }
    }
    #[test]fn overlay_below_a_top_bar_starts_at_the_bar_edge(){
        let bar=RECT{left:0,top:0,right:1920,bottom:36};
        let monitor=RECT{left:0,top:0,right:1920,bottom:1080};
        let (x,y)=overlay_position(bar,monitor,(200,40),960,OverlaySide::Bottom);
        assert_eq!((x,y),(860,36));
    }
    #[test]fn overlay_above_a_bottom_bar_ends_at_the_bar_edge(){
        let bar=RECT{left:-1920,top:1044,right:0,bottom:1080};
        let monitor=RECT{left:-1920,top:0,right:0,bottom:1080};
        let (x,y)=overlay_position(bar,monitor,(200,40),-960,OverlaySide::Top);
        assert_eq!((x,y),(-1060,1004));
    }
    #[test]fn overlay_clamps_inside_negative_and_scaled_monitors(){
        let bar=RECT{left:-2560,top:120,right:0,bottom:174};
        let monitor=RECT{left:-2560,top:120,right:0,bottom:1560};
        // Anchor at the left edge: the surface cannot start before the monitor.
        let (x,_)=overlay_position(bar,monitor,(300,50),-2560,OverlaySide::Bottom);
        assert_eq!(x,-2560);
        // Anchor at the right edge: the surface cannot spill past it.
        let (x,_)=overlay_position(bar,monitor,(300,50),0,OverlaySide::Bottom);
        assert_eq!(x,-300);
    }
    #[test]fn overlay_anchor_uses_physical_pixels(){
        // 125% scaling with a negative origin and a fractional CSS anchor.
        let bar=RECT{left:-2560,top:0,right:-640,bottom:45};
        let center=bar.left+to_physical(120.5+74.0/2.,1.25);
        assert_eq!(center,-2363); // -2560 + round(157.5 * 1.25)
        let (x,y)=overlay_position(bar,RECT{left:-2560,top:0,right:-640,bottom:1440},(335,33),center,OverlaySide::Bottom);
        assert_eq!(x,-2530); // -2363 - 335/2
        assert_eq!(y,45);
    }
}
