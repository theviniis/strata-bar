use std::{
    cell::Cell,
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
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
static RECONCILE_PENDING: AtomicBool = AtomicBool::new(false);
static COUNTS: [AtomicU64;4]=[const {AtomicU64::new(0)};4];
pub fn profile()->serde_json::Value{serde_json::json!({"windowMessages":COUNTS[0].load(Ordering::Relaxed),"appbarNotifications":COUNTS[1].load(Ordering::Relaxed),"positionWrites":COUNTS[2].load(Ordering::Relaxed),"windowPositionMessages":COUNTS[3].load(Ordering::Relaxed)})}
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
unsafe fn position(hwnd: HWND, state: &Reservation) {
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
            WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html?view=bar".into()))
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
    for (_, w) in app.webview_windows() {
        if let Ok(h) = w.hwnd() {
            unsafe {
                let mut d = data(HWND(h.0));
                SHAppBarMessage(ABM_REMOVE, &mut d);
            }
        }
    }
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
        if title.starts_with("Strata ·") {let mut rect=RECT::default();let mut client=RECT::default();if GetWindowRect(hwnd,&mut rect).is_ok(){let _=GetClientRect(hwnd,&mut client);let values=&mut *(param.0 as *mut Vec<serde_json::Value>);values.push(serde_json::json!({"title":title,"rect":[rect.left,rect.top,rect.right,rect.bottom],"client":[client.right,client.bottom],"visible":IsWindowVisible(hwnd).as_bool()}));}}true.into()
    }
    let mut values:Vec<serde_json::Value>=Vec::new();unsafe{let _=EnumWindows(Some(collect),LPARAM(&mut values as *mut _ as isize));}serde_json::json!(values)
}
#[cfg(test)]mod geometry_tests{
    use super::*;
    #[test]fn secondary_above_primary_uses_monitor_top_not_work_area(){let r=top_strip(RECT{left:724,top:-1080,right:2644,bottom:0},36);assert_eq!([r.left,r.top,r.right,r.bottom],[724,-1080,2644,-1044]);}
    #[test]fn negative_x_and_scaled_height_keep_physical_origin(){let r=top_strip(RECT{left:-2560,top:120,right:0,bottom:1560},54);assert_eq!([r.left,r.top,r.right,r.bottom],[-2560,120,0,174]);}
}
