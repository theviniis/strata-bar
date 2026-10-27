use std::{
    cell::Cell,
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    sync::{
        atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows::{
    core::w,
    Win32::{
        Foundation::*,
        Graphics::{
            Dwm::{DwmEnableBlurBehindWindow, DWM_BB_BLURREGION, DWM_BB_ENABLE, DWM_BLURBEHIND},
            Gdi::*,
        },
        UI::{HiDpi::GetDpiForWindow, Shell::*, WindowsAndMessaging::*},
    },
};
const CALLBACK: u32 = WM_APP + 42;
const REFRESH_GEOMETRY: u32 = WM_APP + 43;
const FULLSCREEN_TIMER: usize = 0x53544653;
const SUBCLASS: usize = 0x53545241;
const OVERLAY_SUBCLASS: usize = 0x5354524F;
const SETTINGS_SUBCLASS: usize = 0x53545253;
/// Keep the host clear, including the decorative corners outside the AppBar.
const BAR_BACKGROUND: tauri::window::Color = tauri::window::Color(0, 0, 0, 0);
/// Window label and title of the shared floating surface. The title deliberately
/// does not start with `"Strata ·"`, which `bar_snapshot` uses to find AppBars.
pub const OVERLAY: &str = "overlay";
const OVERLAY_TITLE: &str = "Strata overlay";
/// Window label and title of the single settings window. The label doubles as
/// the singleton key: `open_settings` focuses the existing window instead of
/// creating a second one, so the tray entry can never stack duplicates. The
/// title must not start with `"Strata ·"`, which `bar_snapshot` uses to find
/// AppBars — a settings window reported as a bar would break the geometry gate.
pub const SETTINGS: &str = "settings";
pub const SETTINGS_TITLE: &str = "Configurações do Strata";

static RELEASING: AtomicBool = AtomicBool::new(false);
static RECONCILE_PENDING: AtomicBool = AtomicBool::new(false);
static FULLSCREEN_APP: AtomicBool = AtomicBool::new(false);
static COUNTS: [AtomicU64; 4] = [const { AtomicU64::new(0) }; 4];
/// Overlay shows, positions and hides, surface failures in `diagnostics`.
static OVERLAY_COUNTS: [AtomicU64; 3] = [const { AtomicU64::new(0) }; 3];
pub fn profile() -> serde_json::Value {
    serde_json::json!({"windowMessages":COUNTS[0].load(Ordering::Relaxed),"appbarNotifications":COUNTS[1].load(Ordering::Relaxed),"positionWrites":COUNTS[2].load(Ordering::Relaxed),"windowPositionMessages":COUNTS[3].load(Ordering::Relaxed),"overlayShows":OVERLAY_COUNTS[0].load(Ordering::Relaxed),"overlayPositions":OVERLAY_COUNTS[1].load(Ordering::Relaxed),"overlayHides":OVERLAY_COUNTS[2].load(Ordering::Relaxed)})
}
#[derive(Clone)]
struct PopupSession {
    id: String,
    component: String,
    source: String,
    side: OverlaySide,
    anchor: OverlayAnchor,
    revealed: bool,
    closing: bool,
    restore_focus: bool,
}
static POPUP: Mutex<Option<PopupSession>> = Mutex::new(None);
static REMINDER_ANCHORS: std::sync::LazyLock<
    Mutex<std::collections::HashMap<String, (OverlayAnchor, Option<String>)>>,
> = std::sync::LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));
static LAST_OVERLAY_RENDER: Mutex<Option<serde_json::Value>> = Mutex::new(None);
static OVERLAY_OWNER: Mutex<Option<String>> = Mutex::new(None);
static OVERLAY_PLACING: AtomicBool = AtomicBool::new(false);
static OVERLAY_SESSION: AtomicU64 = AtomicU64::new(0);

/// Physical AppBar policy, built from the validated per-monitor projection.
#[derive(Clone, Copy, Debug, PartialEq)]
struct BarGeometry {
    height: i32,
    radius: i32,
    bottom: bool,
    left_corner: bool,
    right_corner: bool,
}
impl BarGeometry {
    fn from_config(config: &crate::config_contract::Config, scale: f64) -> Self {
        let bar = &config.bar;
        let height = (bar.height as f64 * scale).round() as i32;
        Self {
            height,
            radius: bar
                .corner_radius
                .map(|radius| (radius * scale).round() as i32)
                .unwrap_or(height / 2)
                .clamp(0, height / 2),
            bottom: bar.position == crate::config_contract::BarPosition::Bottom,
            left_corner: config.widgets.left.iter().any(|widget| widget.enabled),
            right_corner: config.widgets.right.iter().any(|widget| widget.enabled),
        }
    }
    fn edge(self) -> u32 {
        if self.bottom {
            ABE_BOTTOM
        } else {
            ABE_TOP
        }
    }
    fn strip(self, monitor: RECT) -> RECT {
        let height = self.height.clamp(1, (monitor.bottom - monitor.top).max(1));
        if self.bottom {
            RECT {
                top: monitor.bottom - height,
                ..monitor
            }
        } else {
            top_strip(monitor, height)
        }
    }
    fn window_rect(self, mut reservation: RECT) -> RECT {
        if self.bottom {
            reservation.top -= self.radius;
        } else {
            reservation.bottom += self.radius;
        }
        reservation
    }
}

/// Read the actual HWND first; the decoration is not part of popup placement
/// or the desktop reservation.
unsafe fn bar_content_rect(hwnd: HWND) -> windows::core::Result<RECT> {
    let mut rect = RECT::default();
    GetWindowRect(hwnd, &mut rect)?;
    // A signed physical height is also readable by the separate --probe process.
    let height = GetPropW(hwnd, w!("StrataBarHeight")).0 as isize as i32;
    if height > 0 {
        rect.bottom = rect.top + height;
    } else if height < 0 {
        rect.top = rect.bottom + height;
    }
    Ok(rect)
}

/// Frame and region changes can discard tao's transparent DWM composition,
/// exposing the white host surface and title behind transparent web content.
/// An empty blur region restores per-pixel transparency without adding blur.
unsafe fn restore_bar_transparency(hwnd: HWND) {
    let region = CreateRectRgn(0, 0, -1, -1);
    let blur = DWM_BLURBEHIND {
        dwFlags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
        fEnable: true.into(),
        hRgnBlur: region,
        fTransitionOnMaximized: false.into(),
    };
    if let Err(error) = DwmEnableBlurBehindWindow(hwnd, &blur) {
        eprintln!("Bar transparency: {error}");
    }
    let _ = DeleteObject(region.into());
}

/// An undecorated host has no non-client surface to paint. Default activation
/// painting otherwise draws a system caption over the transparent webview.
/// Forward activation to tao (focus events still matter), with the documented
/// -1 lParam that suppresses DefWindowProc's non-client repaint.
unsafe fn floating_nonclient_message(hwnd: HWND, msg: u32, wp: WPARAM) -> Option<LRESULT> {
    match msg {
        WM_NCPAINT => Some(LRESULT(0)),
        WM_NCACTIVATE => Some(DefSubclassProc(hwnd, msg, wp, LPARAM(-1))),
        _ => None,
    }
}

/// Restrict the enlarged HWND to the bar and its two concave corner silhouettes.
/// The desktop below the transparent middle receives input directly.
unsafe fn apply_bar_region(hwnd: HWND, geometry: BarGeometry, width: i32) {
    let radius = geometry.radius;
    let height = geometry.height + radius;
    let region = CreateRectRgn(0, 0, width, height);
    if radius == 0 {
        if SetWindowRgn(hwnd, Some(region), true) == 0 {
            let _ = DeleteObject(region.into());
        }
        return;
    }
    let (top, bottom, circle_top, circle_bottom) = if geometry.bottom {
        (0, radius, -radius, radius)
    } else {
        (
            geometry.height,
            height,
            geometry.height,
            geometry.height + 2 * radius,
        )
    };
    let middle = CreateRectRgn(radius, top, width - radius, bottom);
    CombineRgn(Some(region), Some(region), Some(middle), RGN_DIFF);
    let _ = DeleteObject(middle.into());
    for (left, right, enabled) in [
        (0, 2 * radius, geometry.left_corner),
        (width - 2 * radius, width, geometry.right_corner),
    ] {
        if !enabled {
            let corner = CreateRectRgn(left.max(0), top, right.min(width), bottom);
            CombineRgn(Some(region), Some(region), Some(corner), RGN_DIFF);
            let _ = DeleteObject(corner.into());
            continue;
        }
        let circle = CreateEllipticRgn(left, circle_top, right, circle_bottom);
        // Only remove the part of the ellipse outside the reserved strip.
        let outside = CreateRectRgn(0, top, width, bottom);
        CombineRgn(Some(circle), Some(circle), Some(outside), RGN_AND);
        CombineRgn(Some(region), Some(region), Some(circle), RGN_DIFF);
        let _ = DeleteObject(outside.into());
        let _ = DeleteObject(circle.into());
    }
    // Windows owns the region after a successful SetWindowRgn.
    if SetWindowRgn(hwnd, Some(region), true) == 0 {
        let _ = DeleteObject(region.into());
    }
}

struct Reservation {
    app: AppHandle,
    rect: RECT,
    geometry: Cell<BarGeometry>,
    busy: Cell<bool>,
    fullscreen: Cell<bool>,
    applied: Cell<Option<[i32; 4]>>,
    shaped: Cell<Option<(BarGeometry, i32)>>,
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
    const FRAME: u32 =
        WS_CAPTION.0 | WS_THICKFRAME.0 | WS_SYSMENU.0 | WS_MINIMIZEBOX.0 | WS_MAXIMIZEBOX.0;
    const FRAME_EX: u32 =
        WS_EX_WINDOWEDGE.0 | WS_EX_CLIENTEDGE.0 | WS_EX_DLGMODALFRAME.0 | WS_EX_APPWINDOW.0;
    (
        style & !FRAME,
        (ex & !FRAME_EX) | WS_EX_TOOLWINDOW.0 | WS_EX_TOPMOST.0,
    )
}

/// Mirror of komorebi's default frame eligibility (without user rule overrides),
/// used as a regression guard and reported by the window snapshots.
fn komorebi_eligible(style: u32, ex: u32) -> bool {
    style & WS_CAPTION.0 != 0 && ex & WS_EX_WINDOWEDGE.0 != 0 && ex & WS_EX_DLGMODALFRAME.0 == 0
}

unsafe fn enforce_floating_frame(hwnd: HWND) {
    enforce_frame(hwnd, true);
}

unsafe fn enforce_frame(hwnd: HWND, topmost: bool) {
    let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
    let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    let (want_style, mut want_ex) = floating_frame_style(style, ex);
    if !topmost {
        want_ex &= !WS_EX_TOPMOST.0;
    }
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
        Some(if topmost {
            HWND_TOPMOST
        } else {
            HWND_NOTOPMOST
        }),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
    ) {
        eprintln!("Floating frame style: {e}");
    }
}

unsafe fn apply_fullscreen_visibility(hwnd: HWND, fullscreen: bool) {
    enforce_frame(hwnd, !fullscreen);
    let _ = SetWindowPos(
        hwnd,
        Some(if fullscreen {
            HWND_BOTTOM
        } else {
            HWND_TOPMOST
        }),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
    );
    let _ = ShowWindow(
        hwnd,
        if fullscreen {
            SW_HIDE
        } else {
            SW_SHOWNOACTIVATE
        },
    );
    if !fullscreen {
        enforce_frame(hwnd, true);
        restore_bar_transparency(hwnd);
    }
}

/// Reconcile visibility per monitor, including borderless apps without a shell notification.
unsafe fn refresh_fullscreen(hwnd: HWND, state: &Reservation) {
    let fullscreen = foreground_fullscreen_monitor()
        .is_some_and(|monitor| foreground_covers_monitor(monitor, state.rect));
    if state.fullscreen.replace(fullscreen) != fullscreen {
        if fullscreen {
            retry_active_reminder(&state.app);
            overlay_hide(&state.app);
        }
        apply_fullscreen_visibility(hwnd, fullscreen);
    }
}

unsafe fn position(hwnd: HWND, state: &Reservation) {
    if state.busy.replace(true) {
        return;
    }
    let geometry = state.geometry.get();
    let signed_height = if geometry.bottom {
        -geometry.height
    } else {
        geometry.height
    };
    let _ = SetPropW(
        hwnd,
        w!("StrataBarHeight"),
        Some(HANDLE(signed_height as isize as *mut _)),
    );
    // tao re-applies its own frame and stacking styles on visibility changes.
    enforce_frame(hwnd, !state.fullscreen.get());
    let mut d = data(hwnd);
    d.uEdge = geometry.edge();
    d.rc = geometry.strip(state.rect);
    SHAppBarMessage(ABM_QUERYPOS, &mut d);
    if geometry.bottom {
        d.rc.top = d.rc.bottom - geometry.height;
    } else {
        d.rc.bottom = d.rc.top + geometry.height;
    }
    let proposed = [d.rc.left, d.rc.top, d.rc.right, d.rc.bottom];
    // ABM_SETPOS itself broadcasts ABN_POSCHANGED. Do not answer an echoed
    // notification by setting the same rectangle again (an asynchronous loop).
    if state.applied.get() != Some(proposed) {
        // Cache the accepted reservation, not an assumption about the HWND.
        state.applied.set(Some(proposed));
        COUNTS[2].fetch_add(1, Ordering::Relaxed);
        SHAppBarMessage(ABM_SETPOS, &mut d);
        state
            .applied
            .set(Some([d.rc.left, d.rc.top, d.rc.right, d.rc.bottom]));
    }
    let target = geometry.window_rect(d.rc);
    let mut actual = RECT::default();
    let matches = GetWindowRect(hwnd, &mut actual).is_ok()
        && [actual.left, actual.top, actual.right, actual.bottom]
            == [target.left, target.top, target.right, target.bottom];
    if !matches {
        if let Err(e) = SetWindowPos(
            hwnd,
            Some(if !state.fullscreen.get() {
                HWND_TOPMOST
            } else {
                HWND_NOTOPMOST
            }),
            target.left,
            target.top,
            target.right - target.left,
            target.bottom - target.top,
            SWP_NOACTIVATE,
        ) {
            eprintln!("Bar positioning: {e}");
        }
    }
    let shape = (geometry, target.right - target.left);
    if state.shaped.get() != Some(shape) {
        apply_bar_region(hwnd, geometry, shape.1);
        state.shaped.set(Some(shape));
    }
    // Showing/repositioning can reset DWM even when the cached region is still
    // correct. Restore composition after every placement, including the final
    // post-show pass; the shape cache must not skip this step.
    restore_bar_transparency(hwnd);
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
    COUNTS[0].fetch_add(1, Ordering::Relaxed);
    if msg == WM_WINDOWPOSCHANGED {
        COUNTS[3].fetch_add(1, Ordering::Relaxed);
    }
    let state = &*(reference as *const Reservation);
    if let Some(result) = floating_nonclient_message(hwnd, msg, wp) {
        return result;
    }
    // Windows can move a newly shown window inside rcWork, which starts BELOW
    // our reservation. Keep the bar HWND on its negotiated physical rectangle.
    if msg == WM_WINDOWPOSCHANGING && !state.busy.get() {
        if let Some([left, top, right, bottom]) = state.applied.get() {
            let target = state.geometry.get().window_rect(RECT {
                left,
                top,
                right,
                bottom,
            });
            if let Some(p) = (lp.0 as *mut WINDOWPOS).as_mut() {
                if !p.flags.contains(SWP_NOMOVE) {
                    p.x = target.left;
                    p.y = target.top;
                }
                if !p.flags.contains(SWP_NOSIZE) {
                    p.cx = right - left;
                    p.cy = target.bottom - target.top;
                }
            }
        }
    }
    if msg == WM_TIMER && wp.0 == FULLSCREEN_TIMER {
        refresh_fullscreen(hwnd, state);
        return LRESULT(0);
    }
    if msg == REFRESH_GEOMETRY {
        refresh_fullscreen(hwnd, state);
        position(hwnd, state);
        return LRESULT(0);
    }
    if msg == WM_STYLECHANGED {
        enforce_frame(hwnd, !state.fullscreen.get());
        restore_bar_transparency(hwnd);
        return LRESULT(0);
    }
    if msg == WM_DWMCOMPOSITIONCHANGED {
        restore_bar_transparency(hwnd);
    }
    if msg == WM_SHOWWINDOW && wp.0 != 0 {
        // Let tao finish its visibility work before restoring the clear host.
        let result = DefSubclassProc(hwnd, msg, wp, lp);
        restore_bar_transparency(hwnd);
        return result;
    }
    if msg == WM_NCDESTROY {
        let _ = KillTimer(Some(hwnd), FULLSCREEN_TIMER);
        let mut d = data(hwnd);
        SHAppBarMessage(ABM_REMOVE, &mut d);
        let _ = RemoveWindowSubclass(hwnd, Some(procedure), SUBCLASS);
        drop(Box::from_raw(reference as *mut Reservation));
        return DefSubclassProc(hwnd, msg, wp, lp);
    }
    if msg == CALLBACK {
        COUNTS[1].fetch_add(1, Ordering::Relaxed);
        if wp.0 as u32 == ABN_POSCHANGED {
            position(hwnd, state);
        }
        if wp.0 as u32 == ABN_FULLSCREENAPP {
            FULLSCREEN_APP.store(lp.0 != 0, Ordering::Relaxed);
            // Keep an alert hidden by fullscreen queued for delivery afterwards.
            if lp.0 != 0 {
                retry_active_reminder(&state.app);
                overlay_hide(&state.app);
            }
            refresh_fullscreen(hwnd, state);
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
            std::thread::spawn(move || {
                if let Err(e) = reconcile(&app) {
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
fn top_strip(monitor: RECT, height: i32) -> RECT {
    RECT {
        left: monitor.left,
        top: monitor.top,
        right: monitor.right,
        bottom: monitor.top + height.clamp(1, (monitor.bottom - monitor.top).max(1)),
    }
}
pub fn reconcile(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Dynamic WebView construction must run off the UI thread on Windows.
    static SERIAL: Mutex<()> = Mutex::new(());
    let _serial = SERIAL.lock().map_err(|e| e.to_string())?;
    if RELEASING.load(Ordering::Acquire) {
        return Ok(());
    }
    // A stale anchor must never survive a monitor/DPI change.
    REMINDER_ANCHORS.lock().unwrap().clear();
    overlay_hide(app);
    let connected = crate::monitors::list()?;
    let store = app.state::<crate::config::ConfigStore>();
    let mut snapshot = store.snapshot()?;
    if crate::monitors::migrate(&mut snapshot.config, &connected) {
        snapshot = store.save(snapshot.config)?;
    }
    let _ = app.emit_to(SETTINGS, "monitors:changed", &connected);
    let monitors = app.available_monitors()?;
    let mut desired = Vec::new();
    for m in monitors {
        if RELEASING.load(Ordering::Acquire) {
            return Ok(());
        }
        let device = m.name().map(String::as_str).unwrap_or("");
        let identity = connected
            .iter()
            .find(|monitor| {
                crate::config::normalize_monitor(&monitor.device_name)
                    == crate::config::normalize_monitor(device)
            })
            .map(|monitor| monitor.id.as_str())
            .unwrap_or(device);
        let projected = crate::config::project(&snapshot.config, Some(identity));
        if !projected.bar.enabled {
            continue;
        }
        let signature = format!("{identity}|{}", fingerprint(&m));
        let mut hash = DefaultHasher::new();
        signature.hash(&mut hash);
        let label = format!("bar-{:x}", hash.finish());
        desired.push(label.clone());
        let geometry = BarGeometry::from_config(&projected, m.scale_factor());
        if let Some(window) = app.get_webview_window(&label) {
            configure_geometry(app, window, geometry)?;
            continue;
        }
        let window = WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::App(
                if cfg!(debug_assertions) && std::env::args().any(|arg| arg == "--check-popups") {
                    "index.html?view=bar&popup-check=1"
                } else {
                    "index.html?view=bar"
                }
                .into(),
            ),
        )
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
        .focused(false)
        .transparent(true)
        .background_color(BAR_BACKGROUND)
        .inner_size(
            m.size().width as f64 / m.scale_factor(),
            (geometry.height + geometry.radius) as f64 / m.scale_factor(),
        )
        .position(
            m.position().x as f64 / m.scale_factor(),
            m.position().y as f64 / m.scale_factor(),
        )
        .build()?;
        activate_bar(app, window, m, geometry)?;
    }
    for (label, w) in app.webview_windows() {
        if label.starts_with("bar-") && !desired.contains(&label) {
            w.destroy()?;
        }
    }
    let bars = bar_snapshot();
    let layout = serde_json::json!({"bars":bars,"monitors":monitor_snapshot()});
    if let Err(e) = std::fs::write(
        std::env::temp_dir().join("strata-layout.json"),
        serde_json::to_string_pretty(&layout)?,
    ) {
        eprintln!("Layout diagnostic: {e}");
    }
    Ok(())
}

/// Reservation state belongs to the HWND's thread; never mutate it from the worker.
fn configure_geometry(
    app: &AppHandle,
    window: WebviewWindow,
    geometry: BarGeometry,
) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
            unsafe {
                let mut reference = 0;
                if !GetWindowSubclass(hwnd, Some(procedure), SUBCLASS, Some(&mut reference))
                    .as_bool()
                {
                    return Err("AppBar reservation handler is missing".into());
                }
                let state = &*(reference as *const Reservation);
                if state.geometry.replace(geometry) != geometry {
                    state.applied.set(None);
                    position(hwnd, state);
                }
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })?;
    rx.recv()??;
    Ok(())
}

/// WebView creation is thread-safe, but Win32 subclass installation belongs to its owner.
fn activate_bar(
    app: &AppHandle,
    window: WebviewWindow,
    m: tauri::Monitor,
    geometry: BarGeometry,
) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let job = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            if RELEASING.load(Ordering::Acquire) {
                let _ = window.destroy();
                return Err("AppBar creation cancelled during shutdown".into());
            }
            unsafe {
                let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
                let owner = Box::new(Reservation {
                    app: job.clone(),
                    rect: RECT {
                        left: m.position().x,
                        top: m.position().y,
                        right: m.position().x + m.size().width as i32,
                        bottom: m.position().y + m.size().height as i32,
                    },
                    geometry: Cell::new(geometry),
                    busy: Cell::new(false),
                    fullscreen: Cell::new(false),
                    applied: Cell::new(None),
                    shaped: Cell::new(None),
                    taskbar_message: RegisterWindowMessageW(w!("TaskbarCreated")),
                });
                let pointer = Box::into_raw(owner);
                if !SetWindowSubclass(hwnd, Some(procedure), SUBCLASS, pointer as usize).as_bool() {
                    drop(Box::from_raw(pointer));
                    window.destroy().map_err(|e| e.to_string())?;
                    return Err("Cannot install AppBar window handler".into());
                }
                let mut d = data(hwnd);
                if SHAppBarMessage(ABM_NEW, &mut d) == 0 {
                    window.destroy().map_err(|e| e.to_string())?;
                    return Err("Windows rejected AppBar registration".into());
                }
                SetTimer(Some(hwnd), FULLSCREEN_TIMER, 250, None);
                position(hwnd, &*pointer);
            }
            unsafe {
                let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
                // tao clears its initial don't-focus marker before a hidden window is shown.
                // Use the same show policy as the floating overlay, without WS_EX_NOACTIVATE.
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                enforce_frame(hwnd, true);
            }
            // ShowWindow/DPI initialization must finish before the final placement.
            unsafe {
                SendMessageW(
                    HWND(window.hwnd().map_err(|e| e.to_string())?.0),
                    REFRESH_GEOMETRY,
                    Some(WPARAM(0)),
                    Some(LPARAM(0)),
                );
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })?;
    rx.recv()??;
    Ok(())
}
pub fn release_all(app: &AppHandle) {
    RELEASING.store(true, Ordering::Release);
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

fn deserialize_popup_params<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<serde_json::Value>, D::Error> {
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
            if !self
                .component
                .as_deref()
                .is_some_and(crate::popup_ids::contains)
                || self
                    .session
                    .as_ref()
                    .is_none_or(|s| s.is_empty() || s.len() > 128)
            {
                return Err("Invalid popup component or session".into());
            }
            if self
                .params
                .as_ref()
                .is_some_and(|params| params.to_string().len() > 16 * 1024)
            {
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
#[serde(rename_all = "camelCase")]
struct OverlayAppearance {
    theme: crate::config_contract::BarTheme,
    color_theme: crate::config_contract::ColorTheme,
}

#[derive(Clone, serde::Serialize)]
struct RenderPayload<'a> {
    appearance: OverlayAppearance,

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

/// Keep interactive panels 12 CSS pixels from either horizontal monitor edge.
fn popup_monitor_bounds(mut monitor: RECT, scale: f64) -> RECT {
    let margin = to_physical(12.0, scale)
        .max(0)
        .min((monitor.right - monitor.left - 1).max(0) / 2);
    monitor.left += margin;
    monitor.right -= margin;
    monitor
}

/// Widget CSS coordinates cannot tell whether its AppBar is on the top or bottom.
fn overlay_side_for_bar(bar: RECT, monitor: RECT) -> OverlaySide {
    if i64::from(bar.top) + i64::from(bar.bottom)
        < i64::from(monitor.top) + i64::from(monitor.bottom)
    {
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

/// The monitor's Windows device name (`\\.\\DISPLAY1`) for the window's
/// current monitor. Configuration overrides are keyed by this name because it
/// survives moves, scale changes and reboots, unlike a positional fingerprint.
pub fn monitor_name(window: &WebviewWindow) -> Option<String> {
    let device = monitor_device(HWND(window.hwnd().ok()?.0))?;
    Some(
        crate::monitors::list()
            .ok()?
            .into_iter()
            .find(|monitor| {
                crate::config::normalize_monitor(&monitor.device_name)
                    == crate::config::normalize_monitor(&device)
            })
            .map(|monitor| monitor.id)
            .unwrap_or(device),
    )
}

fn monitor_device(hwnd: HWND) -> Option<String> {
    unsafe {
        let handle = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFOEXW {
            monitorInfo: MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
                ..Default::default()
            },
            ..Default::default()
        };
        if !GetMonitorInfoW(handle, &mut info.monitorInfo).as_bool() {
            return None;
        }
        let chars = &info.szDevice[..info
            .szDevice
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(info.szDevice.len())];
        let name = String::from_utf16_lossy(chars);
        (!name.is_empty()).then_some(name)
    }
}

/// Opens the single settings window, or focuses the one that already exists.
///
/// Keeps the normal caption, resizing and taskbar entry, but removes
/// `WS_EX_WINDOWEDGE` and sets `WS_EX_DLGMODALFRAME` so komorebi cannot tile it.
/// Windows can restore WINDOWEDGE on captioned, resizable windows; the dialog
/// frame is the explicit exclusion in komorebi's default eligibility check.
/// Unlike the bar/overlay frame
/// policy, this does not make it a topmost tool window. It reserves no AppBar.
pub fn open_settings(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        // A tray click while the window is minimised must restore it, and a
        // second request must never build a duplicate.
        let _ = window.unminimize();
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(
        app,
        SETTINGS,
        WebviewUrl::App("index.html?view=settings".into()),
    )
    .title(SETTINGS_TITLE)
    .inner_size(1280., 800.)
    .min_inner_size(640., 480.)
    .resizable(true)
    .decorations(true)
    .skip_taskbar(false)
    .always_on_top(false)
    .focused(false)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;
    unsafe {
        let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
        if !SetWindowSubclass(hwnd, Some(settings_procedure), SETTINGS_SUBCLASS, 0).as_bool() {
            let _ = window.destroy();
            return Err("Cannot install the settings window handler".into());
        }
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, settings_extended_style(ex) as isize);
        SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )
        .map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(window)
}

fn settings_extended_style(ex: u32) -> u32 {
    (ex & !WS_EX_WINDOWEDGE.0) | WS_EX_DLGMODALFRAME.0
}

unsafe extern "system" fn settings_procedure(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    _: usize,
) -> LRESULT {
    // tao restores its extended styles on visibility/state changes. Filter the
    // proposed style before Windows applies it, including on show and restore.
    if msg == WM_STYLECHANGING && wp.0 == GWL_EXSTYLE.0 as usize {
        let styles = &mut *(lp.0 as *mut STYLESTRUCT);
        styles.styleNew = settings_extended_style(styles.styleNew);
    }
    if msg == WM_NCDESTROY {
        let _ = RemoveWindowSubclass(hwnd, Some(settings_procedure), SETTINGS_SUBCLASS);
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}

/// What `--probe` and `diagnostics` report about the settings window: whether it
/// exists and whether it stayed captioned and excluded from tiling.
pub fn settings_snapshot() -> serde_json::Value {
    unsafe extern "system" fn collect(hwnd: HWND, param: LPARAM) -> windows::core::BOOL {
        let mut title = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut title);
        let title = String::from_utf16_lossy(&title[..len.max(0) as usize]);
        if title == SETTINGS_TITLE {
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            let values = &mut *(param.0 as *mut Vec<serde_json::Value>);
            values.push(serde_json::json!({
                "title": title,
                "captioned": style & WS_CAPTION.0 != 0,
                "dialogFrame": ex & WS_EX_DLGMODALFRAME.0 != 0,
                "komorebiEligible": komorebi_eligible(style, ex),
                "toolWindow": ex & WS_EX_TOOLWINDOW.0 != 0,
                "topmost": ex & WS_EX_TOPMOST.0 != 0,
                "clickThrough": ex & WS_EX_TRANSPARENT.0 != 0,
                "noActivate": ex & WS_EX_NOACTIVATE.0 != 0,
            }));
        }
        true.into()
    }
    let mut values: Vec<serde_json::Value> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut values as *mut _ as isize));
    }
    serde_json::json!({ "present": !values.is_empty(), "windows": values })
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
    finish_overlay_hide(app, hwnd, restore_focus, false);
}

fn finish_overlay_hide(app: &AppHandle, hwnd: HWND, restore_focus: bool, docked: bool) {
    let closed = POPUP.lock().unwrap().take();
    *LAST_OVERLAY_RENDER.lock().unwrap() = None;
    *OVERLAY_OWNER.lock().unwrap() = None;
    if unsafe { IsWindowVisible(hwnd).as_bool() } {
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        OVERLAY_COUNTS[2].fetch_add(1, Ordering::Relaxed);
    }
    if let Some(window) = app.get_webview_window(OVERLAY) {
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
    }
    // Drop the stale pill so the next show cannot flash the previous tooltip.
    let cleared = OVERLAY_SESSION.fetch_add(1, Ordering::Relaxed) + 1;
    let _ = app.emit_to(OVERLAY, "overlay:clear", cleared);
    if let Some(closed) = closed {
        let _ = app.emit_to(
            &closed.source,
            "overlay:closed",
            serde_json::json!({"session": closed.id, "restoreFocus": restore_focus, "docked": docked}),
        );
    }
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
    if let Some(popup) = popup {
        if session != Some(popup.id.as_str()) {
            return;
        }
    }
    let owner = OVERLAY_OWNER.lock().unwrap().clone();
    if owner.as_deref() != session {
        return;
    }
    if animate_popup_close(app, false) {
        return;
    }
    overlay_hide(app);
}

/// Hold the visible surface for its exit animation. The delayed completion
/// checks ownership so it cannot hide a newer popup or tooltip.
fn animate_popup_close(app: &AppHandle, restore_focus: bool) -> bool {
    let popup = {
        let mut active = POPUP.lock().unwrap();
        let Some(popup) = active.as_mut() else {
            return false;
        };
        if popup.closing {
            return true;
        }
        popup.closing = true;
        popup.restore_focus = restore_focus;
        popup.clone()
    };
    let _ = app.emit_to(OVERLAY, "overlay:closing", &popup.id);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let current = POPUP.lock().unwrap().clone();
            if !current.is_some_and(|p| p.id == popup.id && p.closing) {
                return;
            }
            if let Some(window) = handle.get_webview_window(OVERLAY) {
                if let Ok(hwnd) = window.hwnd() {
                    hide_overlay_hwnd_with_focus(&handle, HWND(hwnd.0), restore_focus);
                }
            }
            if restore_focus {
                if let Some(source) = handle.get_webview_window(&popup.source) {
                    let _ = source.set_focus();
                }
            }
        });
    });
    true
}

/// Only the overlay may acknowledge an exit, and only for the closing session.
/// The timeout above remains a fail-safe if its renderer stops responding.
pub fn overlay_exit_complete(
    app: &AppHandle,
    caller: &WebviewWindow,
    session: &str,
) -> Result<(), String> {
    if caller.label() != OVERLAY {
        return Err("Only overlay may complete an exit".into());
    }
    let popup = POPUP
        .lock()
        .unwrap()
        .clone()
        .filter(|p| p.id == session && p.closing);
    let Some(popup) = popup else {
        return Ok(());
    };
    let window = app.get_webview_window(OVERLAY).ok_or("No overlay")?;
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
    finish_overlay_hide(app, hwnd, popup.restore_focus, true);
    if popup.restore_focus {
        if let Some(source) = app.get_webview_window(&popup.source) {
            let _ = source.set_focus();
        }
    }
    Ok(())
}

pub fn overlay_dismiss(app: &AppHandle, session: Option<&str>) {
    let current = POPUP.lock().unwrap().clone();
    if let Some(popup) = current {
        if session != Some(popup.id.as_str()) {
            return;
        }
        animate_popup_close(app, popup_takes_focus(&popup.component));
    }
}

/// Replay after listeners install, so a cold/refreshing overlay cannot lose preparation.
pub fn overlay_ready(caller: &WebviewWindow) -> Result<serde_json::Value, String> {
    if caller.label() != OVERLAY {
        return Err("Only overlay may read prepared content".into());
    }
    Ok(
        serde_json::json!({"session": OVERLAY_SESSION.load(Ordering::Relaxed), "render": LAST_OVERLAY_RENDER.lock().unwrap().clone()}),
    )
}

// Safety bound for Win32 conversion; popup layout is never clamped to this value.
fn valid_popup_size(size: &OverlaySize) -> bool {
    [size.width, size.height]
        .into_iter()
        .all(|value| value.is_finite() && value > 0.0 && value <= 1_000_000.0)
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
    let popup = POPUP
        .lock()
        .unwrap()
        .clone()
        .filter(|p| p.id == session && !p.closing)
        .ok_or("Popup session is no longer active")?;
    if popup.component == "reminderAlert" && fullscreen_application_active() {
        retry_active_reminder(app);
        overlay_hide(app);
        return Err("Reminder alert deferred during fullscreen".into());
    }
    let source = app
        .get_webview_window(&popup.source)
        .ok_or("Popup source is unavailable")?;
    let source_hwnd = HWND(source.hwnd().map_err(|e| e.to_string())?.0);
    let hwnd = HWND(caller.hwnd().map_err(|e| e.to_string())?.0);
    let bar;
    let mut current = RECT::default();
    unsafe {
        bar = bar_content_rect(source_hwnd).map_err(|e| e.to_string())?;
        GetWindowRect(hwnd, &mut current).map_err(|e| e.to_string())?;
    }
    let monitor = monitor_rect(source_hwnd).ok_or("Popup monitor is unavailable")?;
    let scale = source.scale_factor().map_err(|e| e.to_string())?;
    let width = to_physical(size.width, scale).max(1);
    let height = to_physical(size.height, scale).max(1);
    let center = bar.left + to_physical(popup.anchor.x + popup.anchor.width / 2.0, scale);
    let (x, y) = overlay_position(
        bar,
        popup_monitor_bounds(monitor, scale),
        (width, height),
        center,
        popup.side,
    );
    let arrow_x = overlay_arrow_x(center, x, scale);
    if !popup.revealed
        || current.right - current.left != width
        || current.bottom - current.top != height
        || current.left != x
        || current.top != y
    {
        unsafe {
            enforce_floating_frame(hwnd);
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
        OVERLAY_COUNTS[1].fetch_add(1, Ordering::Relaxed);
    }
    if !popup.revealed {
        if let Some(active) = POPUP.lock().unwrap().as_mut().filter(|p| p.id == session) {
            active.revealed = true;
        }
        // Keep tao visibility state in sync: set_focus ignores windows it thinks are hidden.
        if popup_takes_focus(&popup.component) {
            caller.show().map_err(|e| e.to_string())?;
            caller.set_focus().map_err(|e| e.to_string())?;
        } else {
            // Show without activation; never use WS_EX_NOACTIVATE on WebView2.
            unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            }
        }
        OVERLAY_COUNTS[0].fetch_add(1, Ordering::Relaxed);
    }
    if let Some(render) = LAST_OVERLAY_RENDER.lock().unwrap().as_mut() {
        render["arrowX"] = serde_json::json!(arrow_x);
    }
    Ok(
        serde_json::json!({"arrowX": arrow_x, "anchorSize": {"width": popup.anchor.width, "height": popup.anchor.height}}),
    )
}

#[cfg(debug_assertions)]
pub fn check_resize_active(app: &AppHandle) -> Result<(), String> {
    let popup = POPUP.lock().unwrap().clone().ok_or("No active popup")?;
    let window = app.get_webview_window(OVERLAY).ok_or("No overlay")?;
    let mut rect = RECT::default();
    unsafe {
        GetWindowRect(HWND(window.hwnd().map_err(|e| e.to_string())?.0), &mut rect)
            .map_err(|e| e.to_string())?;
    }
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    overlay_resize(
        app,
        &window,
        &popup.id,
        &OverlaySize {
            width: (rect.right - rect.left) as f64 / scale,
            height: (rect.bottom - rect.top) as f64 / scale,
        },
    )?;
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
        // Expiry alerts require an explicit close from their own controls.
        if popup_requires_explicit_close(&current.component) {
            return Ok(());
        }
        if request.kind == "tooltip" {
            return Ok(());
        }
        if request.session.as_deref() == Some(current.id.as_str())
            && current.source == caller.label()
        {
            overlay_hide(app);
            return Ok(());
        }
    }
    if request.kind == "popover" {
        overlay_hide(app);
    }
    let config = crate::config::snapshot_for(&app.state::<crate::config::ConfigStore>(), caller)?;
    let window = ensure_overlay(app).map_err(|e| e.to_string())?;
    let bar_hwnd = HWND(caller.hwnd().map_err(|e| e.to_string())?.0);
    let bar;
    unsafe {
        bar = bar_content_rect(bar_hwnd)
            .map_err(|_| "The reporting bar window has no rectangle".to_string())?;
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
    let logical_width = if request.kind == "popover" {
        1.0
    } else {
        request.size.width
    };
    let width =
        to_physical(logical_width, scale).clamp(1, (monitor.right - monitor.left).clamp(1, 4096));
    let height = to_physical(
        if request.kind == "popover" {
            1.0
        } else {
            request.size.height
        },
        scale,
    )
    .clamp(1, (monitor.bottom - monitor.top).clamp(1, 4096));
    let center = bar.left + to_physical(request.anchor.x + request.anchor.width / 2.0, scale);
    let bounds = if request.kind == "popover" {
        popup_monitor_bounds(monitor, scale)
    } else {
        monitor
    };
    let (x, y) = overlay_position(bar, bounds, (width, height), center, side);
    let session = OVERLAY_SESSION.fetch_add(1, Ordering::Relaxed) + 1;
    let interactive = request.kind == "popover";
    if interactive {
        *POPUP.lock().unwrap() = Some(PopupSession {
            id: request.session.clone().unwrap(),
            component: request.component.clone().unwrap(),
            source: caller.label().into(),
            side,
            anchor: OverlayAnchor {
                x: request.anchor.x,
                y: request.anchor.y,
                width: request.anchor.width,
                height: request.anchor.height,
            },
            revealed: false,
            closing: false,
            restore_focus: false,
        });
    }
    *OVERLAY_OWNER.lock().unwrap() = request.session.clone();
    window
        .set_ignore_cursor_events(!interactive)
        .map_err(|e| e.to_string())?;
    let payload = serde_json::to_value(RenderPayload {
        appearance: OverlayAppearance {
            theme: config.config.bar.theme,
            color_theme: config.config.bar.color_theme,
        },
        arrow_x: overlay_arrow_x(center, x, scale),
        kind: &request.kind,
        text: &request.text,
        side: side.as_str(),
        session,
        component: request.component.as_deref(),
        params: request.params.as_ref(),
        popup_session: request.session.as_deref(),
    })
    .map_err(|e| e.to_string())?;
    *LAST_OVERLAY_RENDER.lock().unwrap() = Some(payload.clone());
    app.emit_to(OVERLAY, "overlay:render", payload)
        .map_err(|e| e.to_string())?;
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
    struct Placement;
    impl Drop for Placement {
        fn drop(&mut self) {
            OVERLAY_PLACING.store(false, Ordering::Relaxed);
        }
    }
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
            if interactive {
                SWP_NOACTIVATE
            } else {
                SWP_NOACTIVATE | SWP_SHOWWINDOW
            },
        ) {
            return Err(format!("Cannot place the overlay: {e}"));
        }
        if !interactive {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
    }
    if !interactive {
        OVERLAY_COUNTS[0].fetch_add(1, Ordering::Relaxed);
    }
    OVERLAY_COUNTS[1].fetch_add(1, Ordering::Relaxed);
    Ok(())
}

fn monitor_is_primary(flags: u32) -> bool {
    flags & MONITORINFOF_PRIMARY != 0
}

fn valid_reminder_anchor(anchor: &OverlayAnchor, width: f64, height: f64) -> bool {
    [anchor.x, anchor.y, anchor.width, anchor.height]
        .iter()
        .all(|n| n.is_finite())
        && anchor.x >= 0.0
        && anchor.y >= 0.0
        && anchor.width > 0.0
        && anchor.height > 0.0
        && anchor.x + anchor.width <= width + 1.0
        && anchor.y + anchor.height <= height + 1.0
}

#[tauri::command]
pub fn reminders_set_anchor(
    window: WebviewWindow,
    anchor: OverlayAnchor,
    occurrence: Option<String>,
) -> Result<(), String> {
    if !window.label().starts_with("bar-") {
        return Err("Only bars may report reminder anchors".into());
    }
    let mut rect = RECT::default();
    unsafe {
        GetWindowRect(HWND(window.hwnd().map_err(|e| e.to_string())?.0), &mut rect)
            .map_err(|e| e.to_string())?;
    }
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    if !valid_reminder_anchor(
        &anchor,
        f64::from(rect.right - rect.left) / scale,
        f64::from(rect.bottom - rect.top) / scale,
    ) {
        return Err("Invalid reminder widget anchor".into());
    }
    if occurrence.as_ref().is_some_and(|value| value.len() > 128) {
        return Err("Invalid reminder anchor occurrence".into());
    }
    let mut anchors = REMINDER_ANCHORS.lock().unwrap();
    let previous = anchors
        .get(window.label())
        .and_then(|(_, value)| value.clone());
    anchors.insert(window.label().into(), (anchor, occurrence.or(previous)));
    drop(anchors);
    if let Some(scheduler) = window
        .app_handle()
        .try_state::<crate::reminders::ReminderScheduler>()
    {
        scheduler.wake();
    }
    Ok(())
}

/// A native-only scheduler entrypoint. Reuses the shared popup surface and
/// reads the selected AppBar's actual Win32 rectangle for its anchor.
pub fn show_reminder_alert(app: &AppHandle, id: &str, notify_at: f64) -> Result<bool, String> {
    let active = POPUP.lock().unwrap().clone();
    if defer_reminder_alert(
        fullscreen_application_active(),
        active.as_ref().map(|popup| popup.component.as_str()),
    ) {
        return Ok(false);
    }
    let mut bars: Vec<_> = app
        .webview_windows()
        .into_iter()
        .filter(|(name, _)| name.starts_with("bar-"))
        .collect();
    bars.sort_by(|a, b| a.0.cmp(&b.0));
    let selected = bars.iter().find(|(_, window)| {
        window.hwnd().ok().is_some_and(|hwnd| unsafe {
            let monitor = MonitorFromWindow(HWND(hwnd.0), MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            GetMonitorInfoW(monitor, &mut info).as_bool() && monitor_is_primary(info.dwFlags)
        })
    });
    let Some((_, source)) = selected else {
        return Ok(false);
    };
    // Require a fresh measurement for this occurrence, not an old layout snapshot.
    let occurrence = format!("{id}:{notify_at:.0}");
    let measured = REMINDER_ANCHORS
        .lock()
        .unwrap()
        .get(source.label())
        .cloned();
    let anchor = match measured {
        Some((anchor, Some(key))) if key == occurrence => anchor,
        _ => {
            source
                .emit("reminders:measure-anchor", &occurrence)
                .map_err(|e| e.to_string())?;
            return Ok(false);
        }
    };
    overlay_show(
        app,
        source,
        &OverlayRequest {
            v: 1,
            source: Some(source.label().into()),
            kind: "popover".into(),
            component: Some("reminderAlert".into()),
            params: Some(
                serde_json::json!({"id": id, "revision": app.state::<crate::reminders::Reminders>().snapshot()?.revision}),
            ),
            session: Some(format!("reminder-{id}-{notify_at:.0}")),
            text: "Lembrete".into(),
            anchor,
            size: OverlaySize {
                width: 1.0,
                height: 1.0,
            },
            side: "bottom".into(),
        },
    )?;
    Ok(true)
}

fn popup_takes_focus(component: &str) -> bool {
    component != "reminderAlert"
}

fn foreground_covers_monitor(window: RECT, monitor: RECT) -> bool {
    window.left <= monitor.left
        && window.top <= monitor.top
        && window.right >= monitor.right
        && window.bottom >= monitor.bottom
}

fn foreground_fullscreen_monitor() -> Option<RECT> {
    unsafe {
        let foreground = GetForegroundWindow();
        if foreground.0.is_null()
            || foreground == GetShellWindow()
            || foreground == GetDesktopWindow()
            || !IsWindowVisible(foreground).as_bool()
            || IsIconic(foreground).as_bool()
        {
            return None;
        }
        let mut process = 0;
        GetWindowThreadProcessId(foreground, Some(&mut process));
        if process == std::process::id() {
            return None;
        }
        let monitor = monitor_rect(foreground)?;
        let mut rect = RECT::default();
        if GetWindowRect(foreground, &mut rect).is_ok()
            && (foreground_covers_monitor(rect, monitor) || FULLSCREEN_APP.load(Ordering::Relaxed))
        {
            Some(monitor)
        } else {
            None
        }
    }
}

fn fullscreen_application_active() -> bool {
    if FULLSCREEN_APP.load(Ordering::Relaxed) {
        return true;
    }
    unsafe {
        if SHQueryUserNotificationState().is_ok_and(|state| {
            state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE
        }) {
            return true;
        }
        let foreground = GetForegroundWindow();
        if foreground.0.is_null()
            || foreground == GetShellWindow()
            || foreground == GetDesktopWindow()
        {
            return false;
        }
        let mut process = 0;
        GetWindowThreadProcessId(foreground, Some(&mut process));
        if process == std::process::id() {
            return false;
        }
        let mut rect = RECT::default();
        GetWindowRect(foreground, &mut rect).is_ok()
            && monitor_rect(foreground)
                .is_some_and(|monitor| foreground_covers_monitor(rect, monitor))
    }
}

fn retry_active_reminder(app: &AppHandle) {
    let popup = POPUP.lock().unwrap().clone();
    if let Some(popup) = popup.filter(|p| p.component == "reminderAlert") {
        if let Some(scheduler) = app.try_state::<crate::reminders::ReminderScheduler>() {
            scheduler.retry_alert(&popup.id);
        }
    }
}

fn popup_requires_explicit_close(component: &str) -> bool {
    component == "reminderAlert"
}

/// Expiry alerts may replace an ordinary widget popup, but never another alert.
fn defer_reminder_alert(fullscreen: bool, active_component: Option<&str>) -> bool {
    fullscreen || active_component == Some("reminderAlert")
}

/// Independent of overlay availability and Windows' configurable system sounds.
pub fn play_reminder_sound() -> windows::core::Result<()> {
    crate::reminder_sound::play()
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
                let source = state
                    .app
                    .get_webview_window(&popup.source)
                    .and_then(|w| w.hwnd().ok())
                    .map(|h| HWND(h.0));
                if !popup_requires_explicit_close(&popup.component) && source != Some(foreground) {
                    animate_popup_close(&state.app, false);
                }
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
pub fn bar_snapshot() -> serde_json::Value {
    unsafe extern "system" fn collect(hwnd: HWND, param: LPARAM) -> windows::core::BOOL {
        let mut title = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut title);
        let title = String::from_utf16_lossy(&title[..len.max(0) as usize]);
        if title.starts_with("Strata ·") {
            let mut rect = RECT::default();
            let mut client = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                let _ = GetClientRect(hwnd, &mut client);
                let reservation = bar_content_rect(hwnd).unwrap_or(rect);
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
                let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
                let values = &mut *(param.0 as *mut Vec<serde_json::Value>);
                values.push(serde_json::json!({"title":title,"dpi":GetDpiForWindow(hwnd),"rect":[rect.left,rect.top,rect.right,rect.bottom],"reservationRect":[reservation.left,reservation.top,reservation.right,reservation.bottom],"client":[client.right,client.bottom],"visible":IsWindowVisible(hwnd).as_bool(),"toolWindow":ex & WS_EX_TOOLWINDOW.0 != 0,"topmost":ex & WS_EX_TOPMOST.0 != 0,"noActivate":ex & WS_EX_NOACTIVATE.0 != 0,"komorebiEligible":komorebi_eligible(style,ex)}));
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
#[cfg(test)]
mod geometry_tests {
    use super::*;
    #[test]
    fn fullscreen_hides_bar_and_restores_it_without_activation() {
        unsafe {
            let hwnd = CreateWindowExW(
                WS_EX_TOOLWINDOW,
                w!("STATIC"),
                w!("Strata fullscreen test"),
                WS_POPUP,
                0,
                0,
                100,
                36,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            let foreground = GetForegroundWindow();
            apply_fullscreen_visibility(hwnd, true);
            let hidden = !IsWindowVisible(hwnd).as_bool();
            apply_fullscreen_visibility(hwnd, false);
            let restored = IsWindowVisible(hwnd).as_bool();
            let unchanged_focus = foreground == GetForegroundWindow();
            DestroyWindow(hwnd).unwrap();
            assert!(hidden, "fullscreen must hide the bar HWND");
            assert!(restored, "leaving fullscreen must restore the bar");
            assert!(unchanged_focus, "restoring the bar must not steal focus");
        }
    }
    #[test]
    fn transparent_bar_forwards_activation_without_painting_a_system_caption() {
        struct Probe {
            activation: Cell<Option<isize>>,
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
                probe.activation.set(Some(lp.0));
            }
            if msg == WM_NCPAINT {
                probe.paints.set(probe.paints.get() + 1);
            }
            DefSubclassProc(hwnd, msg, wp, lp)
        }
        unsafe extern "system" fn guard(
            hwnd: HWND,
            msg: u32,
            wp: WPARAM,
            lp: LPARAM,
            _: usize,
            _: usize,
        ) -> LRESULT {
            floating_nonclient_message(hwnd, msg, wp)
                .unwrap_or_else(|| DefSubclassProc(hwnd, msg, wp, lp))
        }
        unsafe {
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("STATIC"),
                w!("Strata frame test"),
                WS_POPUP,
                0,
                0,
                800,
                54,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            let probe = Probe {
                activation: Cell::new(None),
                paints: Cell::new(0),
            };
            assert!(
                SetWindowSubclass(hwnd, Some(observe), 1, &probe as *const _ as usize).as_bool()
            );
            assert!(SetWindowSubclass(hwnd, Some(guard), 2, 0).as_bool());
            for active in [0, 1, 0, 1] {
                SendMessageW(hwnd, WM_NCACTIVATE, Some(WPARAM(active)), Some(LPARAM(0)));
                assert_eq!(probe.activation.get(), Some(-1));
                SendMessageW(hwnd, WM_NCPAINT, Some(WPARAM(1)), Some(LPARAM(0)));
                assert_eq!(probe.paints.get(), 0);
            }
            let _ = RemoveWindowSubclass(hwnd, Some(guard), 2);
            let _ = RemoveWindowSubclass(hwnd, Some(observe), 1);
            DestroyWindow(hwnd).unwrap();
        }
    }
    #[test]
    fn configured_curve_radius_is_scaled_clamped_and_projected() {
        let mut config = crate::config::defaults();
        // Geometry assertions use a fixed fixture, independent of the install preset.
        config.bar.height = 36;
        config.bar.corner_radius = None;
        assert_eq!(BarGeometry::from_config(&config, 1.5).radius, 27);
        for (radius, expected) in [(0.0, 0), (8.0, 12), (40.0, 27)] {
            config.bar.corner_radius = Some(radius);
            let geometry = BarGeometry::from_config(&config, 1.5);
            assert_eq!(geometry.radius, expected);
            let strip = geometry.strip(RECT {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1080,
            });
            assert_eq!(strip.bottom, 54);
            assert_eq!(geometry.window_rect(strip).bottom, 54 + expected);
        }
        config.monitors.insert(
            "DISPLAY2".into(),
            crate::config_contract::BarOverride {
                corner_radius: Some(6.0),
                ..Default::default()
            },
        );
        let projected = crate::config::project(&config, Some("DISPLAY2"));
        assert_eq!(BarGeometry::from_config(&projected, 1.5).radius, 9);
        for radius in [-1.0, 41.0, f64::NAN, f64::INFINITY] {
            config.bar.corner_radius = Some(radius);
            assert!(crate::config::validate(&config).is_err());
            config.bar.corner_radius = None;
            config.monitors.get_mut("DISPLAY2").unwrap().corner_radius = Some(radius);
            assert!(crate::config::validate(&config).is_err());
        }
    }
    #[test]
    fn desktop_corners_extend_the_window_without_extending_the_reservation() {
        let mut config = crate::config::defaults();
        // Pin the geometry fixture independently of the shipped appearance defaults.
        config.bar.height = 36;
        config.bar.corner_radius = None;
        for bottom in [false, true] {
            config.bar.position = if bottom {
                crate::config_contract::BarPosition::Bottom
            } else {
                crate::config_contract::BarPosition::Top
            };
            let geometry = BarGeometry::from_config(&config, 1.5);
            let reservation = geometry.strip(RECT {
                left: -1920,
                top: -1080,
                right: 0,
                bottom: 0,
            });
            let window = geometry.window_rect(reservation);
            assert_eq!(reservation.bottom - reservation.top, 54);
            assert_eq!(window.bottom - window.top, 81);
            assert_eq!(window.left, -1920);
            assert_eq!(window.right, 0);
            if bottom {
                assert_eq!(window.bottom, reservation.bottom);
                assert_eq!(window.top, reservation.top - 27);
            } else {
                assert_eq!(window.top, reservation.top);
                assert_eq!(window.bottom, reservation.bottom + 27);
            }
        }
    }

    #[test]
    fn native_corner_region_leaves_the_desktop_clickable() {
        unsafe {
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("STATIC"),
                w!("Strata corner test"),
                WS_POPUP,
                0,
                0,
                800,
                54,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            let mut config = crate::config::defaults();
            for bottom in [false, true] {
                config.bar.position = if bottom {
                    crate::config_contract::BarPosition::Bottom
                } else {
                    crate::config_contract::BarPosition::Top
                };
                let mut geometry = BarGeometry::from_config(&config, 1.0);
                geometry.left_corner = true;
                geometry.right_corner = true;
                apply_bar_region(hwnd, geometry, 800);
                let region = CreateRectRgn(0, 0, 0, 0);
                assert_ne!(GetWindowRgn(hwnd, region).0, ERROR);
                let outside_y = if bottom { 9 } else { 45 };
                let bar_y = if bottom { 30 } else { 18 };
                assert!(PtInRegion(region, 400, bar_y).as_bool());
                assert!(!PtInRegion(region, 400, outside_y).as_bool());
                assert!(PtInRegion(region, 0, outside_y).as_bool());
                assert!(PtInRegion(region, 799, outside_y).as_bool());
                assert!(!PtInRegion(region, 16, outside_y).as_bool());
                geometry.left_corner = false;
                geometry.right_corner = false;
                apply_bar_region(hwnd, geometry, 800);
                GetWindowRgn(hwnd, region);
                assert!(!PtInRegion(region, 0, outside_y).as_bool());
                assert!(!PtInRegion(region, 799, outside_y).as_bool());
                let _ = DeleteObject(region.into());
            }
            DestroyWindow(hwnd).unwrap();
        }
    }

    #[test]
    fn alerts_never_autofocus_and_borderless_fullscreen_is_detected() {
        assert!(!popup_takes_focus("reminderAlert"));
        assert!(popup_takes_focus("reminders"));
        let monitor = RECT {
            left: -1920,
            top: 0,
            right: 0,
            bottom: 1080,
        };
        assert!(foreground_covers_monitor(monitor, monitor));
        assert!(!foreground_covers_monitor(
            RECT { top: 36, ..monitor },
            monitor
        ));
    }

    #[test]
    fn reminder_uses_primary_flag_and_validates_real_widget_bounds() {
        assert!(monitor_is_primary(MONITORINFOF_PRIMARY));
        assert!(!monitor_is_primary(0));
        let anchor = OverlayAnchor {
            x: 3000.0,
            y: 4.0,
            width: 32.0,
            height: 28.0,
        };
        assert!(valid_reminder_anchor(&anchor, 3440.0, 36.0));
        assert!(!valid_reminder_anchor(&anchor, 1920.0, 36.0));
        assert!(!valid_reminder_anchor(
            &OverlayAnchor {
                x: f64::NAN,
                ..anchor
            },
            3440.0,
            36.0
        ));
        let scale = 1.25;
        let center = -2560 + to_physical(anchor.x + anchor.width / 2.0, scale);
        let left = center - 300;
        assert_eq!(overlay_arrow_x(center, left, scale), 240.0);
    }

    #[test]
    fn expiry_alert_requires_explicit_close_while_widgets_allow_light_dismiss() {
        assert!(popup_requires_explicit_close("reminderAlert"));
        assert!(!popup_requires_explicit_close("reminders"));
        assert!(!popup_requires_explicit_close("volume"));
    }

    #[test]
    fn reminder_alert_preempts_widget_popups_but_queues_behind_alerts_and_fullscreen() {
        assert!(!defer_reminder_alert(false, None));
        assert!(!defer_reminder_alert(false, Some("reminders")));
        assert!(!defer_reminder_alert(false, Some("volume")));
        assert!(defer_reminder_alert(false, Some("reminderAlert")));
        assert!(defer_reminder_alert(true, None));
        assert!(defer_reminder_alert(true, Some("reminders")));
    }

    #[test]
    fn popup_sizes_allow_large_content_but_reject_invalid_numbers() {
        for (width, height) in [
            (0.0, 20.0),
            (20.0, -1.0),
            (f64::NAN, 20.0),
            (20.0, f64::INFINITY),
            (1_000_001.0, 20.0),
        ] {
            assert!(!valid_popup_size(&OverlaySize { width, height }));
        }
        assert!(valid_popup_size(&OverlaySize {
            width: 5000.0,
            height: 3000.0
        }));
    }

    #[test]
    fn oversized_popups_keep_their_size_and_align_to_monitor_origin() {
        let monitor = RECT {
            left: -1920,
            top: -200,
            right: 0,
            bottom: 880,
        };
        let bar = RECT {
            left: -1920,
            top: -200,
            right: 0,
            bottom: -164,
        };
        assert_eq!(
            overlay_position(bar, monitor, (2400, 1400), -900, OverlaySide::Bottom),
            (-1920, -200)
        );
        assert_eq!(
            overlay_position(bar, monitor, (400, 1060), -1900, OverlaySide::Bottom),
            (-1920, -180)
        );
    }

    #[test]
    fn configured_geometry_uses_projected_height_edge_and_stacking() {
        let mut config = crate::config::defaults();
        // Keep scaling expectations independent of the shipped appearance preset.
        config.bar.height = 36;
        config.monitors.insert(
            "DISPLAY2".into(),
            crate::config_contract::BarOverride {
                height: Some(64),
                position: Some(crate::config_contract::BarPosition::Bottom),
                spacing: Some(32.0),
                ..Default::default()
            },
        );
        let projected = crate::config::project(&config, Some("DISPLAY2"));
        assert_eq!(projected.bar.spacing, 32.0);
        let geometry = BarGeometry::from_config(&projected, 1.25);
        let rect = geometry.strip(RECT {
            left: -2560,
            top: -1440,
            right: 0,
            bottom: 0,
        });
        assert_eq!(
            [rect.left, rect.top, rect.right, rect.bottom],
            [-2560, -80, 0, 0]
        );
        assert_eq!(geometry.edge(), ABE_BOTTOM);
        config.bar.position = crate::config_contract::BarPosition::Top;
        let geometry = BarGeometry::from_config(&config, 1.5);
        let rect = geometry.strip(RECT {
            left: 724,
            top: -1080,
            right: 2644,
            bottom: 0,
        });
        assert_eq!(
            [rect.left, rect.top, rect.right, rect.bottom],
            [724, -1080, 2644, -1026]
        );
        assert_eq!(geometry.edge(), ABE_TOP);
    }

    #[test]
    fn secondary_above_primary_uses_monitor_top_not_work_area() {
        let r = top_strip(
            RECT {
                left: 724,
                top: -1080,
                right: 2644,
                bottom: 0,
            },
            36,
        );
        assert_eq!(
            [r.left, r.top, r.right, r.bottom],
            [724, -1080, 2644, -1044]
        );
    }
    #[test]
    fn negative_x_and_scaled_height_keep_physical_origin() {
        let r = top_strip(
            RECT {
                left: -2560,
                top: 120,
                right: 0,
                bottom: 1560,
            },
            54,
        );
        assert_eq!([r.left, r.top, r.right, r.bottom], [-2560, 120, 0, 174]);
    }
    #[test]
    fn settings_stays_activatable_and_in_the_taskbar_without_komorebi_tiling() {
        let style = WS_CAPTION.0 | WS_THICKFRAME.0 | WS_SYSMENU.0;
        let ex = WS_EX_WINDOWEDGE.0 | WS_EX_APPWINDOW.0 | WS_EX_ACCEPTFILES.0;
        assert!(komorebi_eligible(style, ex));
        let ex = settings_extended_style(ex);
        assert!(!komorebi_eligible(style, ex));
        assert_eq!(
            ex,
            WS_EX_APPWINDOW.0 | WS_EX_ACCEPTFILES.0 | WS_EX_DLGMODALFRAME.0
        );
        // Windows may restore WINDOWEDGE for a captioned/resizable frame.
        assert!(!komorebi_eligible(style, ex | WS_EX_WINDOWEDGE.0));
        assert_eq!(settings_extended_style(ex), ex);
    }
    #[test]
    fn settings_native_frame_exclusion_survives_style_reapplication() {
        unsafe {
            let hwnd = CreateWindowExW(
                WS_EX_APPWINDOW,
                w!("STATIC"),
                w!("Strata settings frame regression test"),
                WS_OVERLAPPEDWINDOW,
                0,
                0,
                640,
                480,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            assert!(
                SetWindowSubclass(hwnd, Some(settings_procedure), SETTINGS_SUBCLASS, 0).as_bool()
            );
            for _ in 0..3 {
                // The same style reset tao performs when showing/restoring.
                SetWindowLongPtrW(
                    hwnd,
                    GWL_EXSTYLE,
                    (WS_EX_APPWINDOW.0 | WS_EX_WINDOWEDGE.0) as isize,
                );
                SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                )
                .unwrap();
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
                let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
                assert!(!komorebi_eligible(style, ex), "style={style:x}, ex={ex:x}");
                assert_eq!(style & WS_OVERLAPPEDWINDOW.0, WS_OVERLAPPEDWINDOW.0);
                assert_ne!(ex & WS_EX_APPWINDOW.0, 0);
                assert_ne!(ex & WS_EX_DLGMODALFRAME.0, 0);
                assert_eq!(
                    ex & (WS_EX_TOOLWINDOW.0
                        | WS_EX_TOPMOST.0
                        | WS_EX_NOACTIVATE.0
                        | WS_EX_TRANSPARENT.0),
                    0
                );
            }
            DestroyWindow(hwnd).unwrap();
        }
    }
    #[test]
    fn floating_frame_styles_make_the_window_ineligible_for_komorebi() {
        // Exactly what tao produces for an undecorated, always-on-top top-level window.
        let style = WS_CAPTION.0 | WS_CLIPSIBLINGS.0 | WS_SYSMENU.0 | WS_VISIBLE.0;
        let ex = WS_EX_WINDOWEDGE.0 | WS_EX_ACCEPTFILES.0 | WS_EX_APPWINDOW.0 | WS_EX_TOPMOST.0;
        assert!(komorebi_eligible(style, ex));
        let (style, ex) = floating_frame_style(style, ex);
        assert!(!komorebi_eligible(style, ex));
        assert_eq!(style & (WS_CAPTION.0 | WS_THICKFRAME.0 | WS_SYSMENU.0), 0);
        assert_ne!(ex & WS_EX_TOOLWINDOW.0, 0);
        assert_ne!(ex & WS_EX_TOPMOST.0, 0);
        assert_eq!(ex & WS_EX_WINDOWEDGE.0, 0);
        assert_eq!(ex & WS_EX_APPWINDOW.0, 0);
        // Idempotent so the WM_STYLECHANGED re-assert cannot loop.
        assert_eq!(floating_frame_style(style, ex), (style, ex));
    }
    #[test]
    fn floating_frame_style_keeps_click_through_bits() {
        // WS_EX_TRANSPARENT is what set_ignore_cursor_events sets; the style
        // guard runs on every show and must never drop it.
        let (_, ex) = floating_frame_style(WS_VISIBLE.0, WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0);
        assert_ne!(ex & WS_EX_TRANSPARENT.0, 0);
        assert_ne!(ex & WS_EX_LAYERED.0, 0);
    }
    #[test]
    fn floating_frame_style_keeps_unrelated_bits() {
        let (style, ex) =
            floating_frame_style(WS_VISIBLE.0 | WS_CLIPSIBLINGS.0, WS_EX_ACCEPTFILES.0);
        assert_eq!(style, WS_VISIBLE.0 | WS_CLIPSIBLINGS.0);
        assert_eq!(
            ex,
            WS_EX_ACCEPTFILES.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TOPMOST.0
        );
    }
    fn request(kind: &str, side: &str) -> OverlayRequest {
        OverlayRequest {
            v: 1,
            session: Some("test".into()),
            component: Some("audioOutputs".into()),
            params: Some(serde_json::json!({})),
            source: None,
            kind: kind.into(),
            text: "Uso total de CPU".into(),
            anchor: OverlayAnchor {
                x: 120.5,
                y: 8.,
                width: 74.,
                height: 20.,
            },
            size: OverlaySize {
                width: 268.,
                height: 26.,
            },
            side: side.into(),
        }
    }
    #[test]
    fn overlay_requests_reject_unknown_contracts() {
        assert!(request("tooltip", "bottom").validate().is_ok());
        assert!(request("popover", "top").validate().is_ok());
        assert!(request("dialog", "bottom").validate().is_err());
        assert!(request("tooltip", "left").validate().is_err());
        let mut stale = request("tooltip", "bottom");
        stale.v = 2;
        assert!(stale.validate().is_err());
        let mut empty = request("tooltip", "bottom");
        empty.text = "   ".into();
        assert!(empty.validate().is_err());
        let mut huge = request("tooltip", "bottom");
        huge.text = "x".repeat(MAX_TEXT_CHARS + 1);
        assert!(huge.validate().is_err());
        let mut nan = request("tooltip", "bottom");
        nan.anchor.x = f64::NAN;
        assert!(nan.validate().is_err());
        let mut zero = request("tooltip", "bottom");
        zero.size.width = 0.;
        assert!(zero.validate().is_err());
        let mut oversized = request("tooltip", "bottom");
        oversized.size.height = MAX_LOGICAL_SIZE + 1.;
        assert!(oversized.validate().is_err());
    }
    #[test]
    fn side_is_owned_by_actual_monitor_geometry_not_widget_center() {
        let monitor = RECT {
            left: -1920,
            top: -1080,
            right: 0,
            bottom: 0,
        };
        assert_eq!(
            overlay_side_for_bar(
                RECT {
                    left: -1920,
                    top: -1080,
                    right: 0,
                    bottom: -1044
                },
                monitor
            ),
            OverlaySide::Bottom
        );
        assert_eq!(
            overlay_side_for_bar(
                RECT {
                    left: -1920,
                    top: -36,
                    right: 0,
                    bottom: 0
                },
                monitor
            ),
            OverlaySide::Top
        );
    }
    #[test]
    fn popup_params_preserve_explicit_null_and_missing_input_separately() {
        #[derive(serde::Deserialize)]
        struct Input {
            #[serde(default, deserialize_with = "deserialize_popup_params")]
            params: Option<serde_json::Value>,
        }
        assert!(serde_json::from_str::<Input>("{}")
            .unwrap()
            .params
            .is_none());
        assert_eq!(
            serde_json::from_str::<Input>(r#"{"params":null}"#)
                .unwrap()
                .params,
            Some(serde_json::Value::Null)
        );
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
            (
                RECT {
                    left: 0,
                    top: 0,
                    right: 1920,
                    bottom: 1080,
                },
                1900,
                1.0,
            ),
            (
                RECT {
                    left: 0,
                    top: 0,
                    right: 1920,
                    bottom: 1080,
                },
                20,
                1.0,
            ),
            (
                RECT {
                    left: -2560,
                    top: -1440,
                    right: -640,
                    bottom: 0,
                },
                -660,
                1.25,
            ),
        ] {
            for side in [OverlaySide::Top, OverlaySide::Bottom] {
                let (x, _) = overlay_position(monitor, monitor, (400, 200), center, side);
                let arrow = overlay_arrow_x(center, x, scale);
                assert_eq!(x as f64 + arrow * scale, center as f64);
                assert!((0.0..=400.0 / scale).contains(&arrow));
            }
        }
    }
    #[test]
    fn overlay_below_a_top_bar_starts_at_the_bar_edge() {
        let bar = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 36,
        };
        let monitor = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let (x, y) = overlay_position(bar, monitor, (200, 40), 960, OverlaySide::Bottom);
        assert_eq!((x, y), (860, 36));
    }
    #[test]
    fn overlay_above_a_bottom_bar_ends_at_the_bar_edge() {
        let bar = RECT {
            left: -1920,
            top: 1044,
            right: 0,
            bottom: 1080,
        };
        let monitor = RECT {
            left: -1920,
            top: 0,
            right: 0,
            bottom: 1080,
        };
        let (x, y) = overlay_position(bar, monitor, (200, 40), -960, OverlaySide::Top);
        assert_eq!((x, y), (-1060, 1004));
    }
    #[test]
    fn overlay_clamps_inside_negative_and_scaled_monitors() {
        let bar = RECT {
            left: -2560,
            top: 120,
            right: 0,
            bottom: 174,
        };
        let monitor = RECT {
            left: -2560,
            top: 120,
            right: 0,
            bottom: 1560,
        };
        // Anchor at the left edge: the surface cannot start before the monitor.
        let (x, _) = overlay_position(bar, monitor, (300, 50), -2560, OverlaySide::Bottom);
        assert_eq!(x, -2560);
        // Anchor at the right edge: the surface cannot spill past it.
        let (x, _) = overlay_position(bar, monitor, (300, 50), 0, OverlaySide::Bottom);
        assert_eq!(x, -300);
    }
    #[test]
    fn overlay_anchor_uses_physical_pixels() {
        // 125% scaling with a negative origin and a fractional CSS anchor.
        let bar = RECT {
            left: -2560,
            top: 0,
            right: -640,
            bottom: 45,
        };
        let center = bar.left + to_physical(120.5 + 74.0 / 2., 1.25);
        assert_eq!(center, -2363); // -2560 + round(157.5 * 1.25)
        let (x, y) = overlay_position(
            bar,
            RECT {
                left: -2560,
                top: 0,
                right: -640,
                bottom: 1440,
            },
            (335, 33),
            center,
            OverlaySide::Bottom,
        );
        assert_eq!(x, -2530); // -2363 - 335/2
        assert_eq!(y, 45);
    }
}
