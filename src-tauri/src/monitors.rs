//! Connected Windows monitors, keyed by their device interface rather than DISPLAY ordinal.
use crate::config_contract::{Config, SettingsMonitor};
use windows::core::{w, BOOL, PCWSTR};
use windows::Win32::UI::WindowsAndMessaging::EDD_GET_DEVICE_INTERFACE_NAME;
use windows::Win32::{Foundation::*, Graphics::Gdi::*};

fn text(value: &[u16]) -> String {
    String::from_utf16_lossy(&value[..value.iter().position(|c| *c == 0).unwrap_or(value.len())])
}

pub fn list() -> Result<Vec<SettingsMonitor>, String> {
    unsafe extern "system" fn collect(
        handle: HMONITOR,
        _: HDC,
        _: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        let result = &mut *(data.0 as *mut Vec<SettingsMonitor>);
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if !GetMonitorInfoW(handle, &mut info.monitorInfo).as_bool() {
            return true.into();
        }
        let device_name = text(&info.szDevice);
        let mut device = DISPLAY_DEVICEW::default();
        device.cb = std::mem::size_of::<DISPLAY_DEVICEW>() as u32;
        let has_device = EnumDisplayDevicesW(
            PCWSTR(info.szDevice.as_ptr()),
            0,
            &mut device,
            EDD_GET_DEVICE_INTERFACE_NAME,
        )
        .as_bool();
        let path = has_device
            .then(|| text(&device.DeviceID))
            .filter(|s| !s.is_empty());
        let id = path.unwrap_or_else(|| device_name.clone());
        let name = if has_device {
            text(&device.DeviceString)
        } else {
            String::new()
        };
        let rect = info.monitorInfo.rcMonitor;
        result.push(SettingsMonitor {
            id,
            device_name,
            name,
            width: (rect.right - rect.left) as u32,
            height: (rect.bottom - rect.top) as u32,
            primary: info.monitorInfo.dwFlags & 1 != 0,
        });
        true.into()
    }
    let mut result: Vec<SettingsMonitor> = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            None,
            None,
            Some(collect),
            LPARAM(&mut result as *mut _ as isize),
        )
        .ok()
        .map_err(|e| e.to_string())?;
    }
    result.sort_by(|a, b| a.device_name.cmp(&b.device_name));
    // Ambiguous interface paths (for example cloned outputs) must not share overrides.
    let ids: Vec<_> = result.iter().map(|m| m.id.clone()).collect();
    for monitor in &mut result {
        if ids.iter().filter(|id| **id == monitor.id).count() > 1 {
            monitor.id = monitor.device_name.clone();
        }
    }
    Ok(result)
}

/// Only move an old key when exactly one connected output owns it and no destination exists.
pub fn migrate(config: &mut Config, monitors: &[SettingsMonitor]) -> bool {
    let mut changed = false;
    for monitor in monitors {
        let aliases: Vec<_> = config
            .monitors
            .keys()
            .filter(|key| {
                crate::config::normalize_monitor(key)
                    == crate::config::normalize_monitor(&monitor.device_name)
                    && crate::config::normalize_monitor(key)
                        != crate::config::normalize_monitor(&monitor.id)
            })
            .cloned()
            .collect();
        if aliases.len() == 1
            && !config.monitors.keys().any(|key| {
                crate::config::normalize_monitor(key)
                    == crate::config::normalize_monitor(&monitor.id)
            })
            && monitors
                .iter()
                .filter(|m| m.device_name == monitor.device_name)
                .count()
                == 1
        {
            let value = config.monitors.remove(&aliases[0]).unwrap();
            config.monitors.insert(monitor.id.clone(), value);
            changed = true;
        }
    }
    changed
}

/// A hidden message-only observer keeps display detection alive even with every bar disabled.
pub fn observe(app: &tauri::AppHandle) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::*;
    static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();
    unsafe extern "system" fn procedure(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        if msg == WM_DISPLAYCHANGE || msg == WM_DEVICECHANGE {
            if let Some(app) = APP.get() {
                let job = app.clone();
                std::thread::spawn(move || {
                    if let Err(error) = crate::desktop::reconcile(&job) {
                        eprintln!("Monitor change: {error}");
                    }
                });
            }
        }
        DefWindowProcW(hwnd, msg, wp, lp)
    }
    let _ = APP.set(app.clone());
    unsafe {
        let class = WNDCLASSW {
            lpfnWndProc: Some(procedure),
            lpszClassName: w!("StrataDisplayObserver"),
            ..Default::default()
        };
        if RegisterClassW(&class) == 0 {
            return Err(windows::core::Error::from_thread().to_string());
        }
        // Hidden top-level windows receive display broadcasts; HWND_MESSAGE does not.
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class.lpszClassName,
            w!("Strata display observer"),
            WINDOW_STYLE::default(),
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
    }
    Ok(())
}
