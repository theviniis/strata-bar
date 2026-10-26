use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
struct Data {
    next: u64,
    subs: HashMap<String, String>,
}
#[derive(Clone, Default)]
pub struct WindowsWorkspaces {
    data: Arc<Mutex<Data>>,
    stop: Arc<AtomicBool>,
}

fn snapshot() -> Result<Value, String> {
    let current = winvd::get_current_desktop().map_err(|e| format!("Windows desktops: {e:?}"))?;
    let desktops = winvd::get_desktops().map_err(|e| format!("Windows desktops: {e:?}"))?;
    let mut workspaces = Vec::new();
    for desktop in desktops {
        let index = desktop
            .get_index()
            .map_err(|e| format!("Windows desktop index: {e:?}"))?;
        let name = desktop
            .get_name()
            .map_err(|e| format!("Windows desktop name: {e:?}"))?;
        workspaces.push(json!({"index":index,"name":name,"status":if desktop == current {"active"} else {"empty"},"windows":0,"layer":"Tiling"}));
    }
    Ok(json!({"monitor":0,"floatOverride":false,"workspaces":workspaces}))
}
fn event() -> Value {
    match snapshot() {
        Ok(data) => crate::metrics::envelope("ready", data),
        Err(error) => json!({"status":"error","data":null,"error":error}),
    }
}
impl WindowsWorkspaces {
    pub fn start(app: AppHandle) -> Self {
        let this = Self::default();
        let owner = this.clone();
        std::thread::spawn(move || {
            while !owner.stop.load(Ordering::Acquire) {
                if owner.data.lock().unwrap().subs.is_empty() {
                    std::thread::sleep(Duration::from_millis(250));
                    continue;
                }
                let (tx, rx) = std::sync::mpsc::channel::<winvd::DesktopEvent>();
                let _listener = winvd::listen_desktop_events(tx);
                let mut previous = String::new();
                loop {
                    // The timeout also recovers from Explorer restarts and notification failures.
                    let value = event();
                    let key = json!([value["status"], value["data"], value["error"]]).to_string();
                    let data = owner.data.lock().unwrap();
                    if data.subs.is_empty() || owner.stop.load(Ordering::Acquire) {
                        break;
                    }
                    if key != previous {
                        let windows: std::collections::HashSet<_> = data.subs.values().collect();
                        for window in windows {
                            let _ = app.emit_to(window, "system:workspaces:windows", &value);
                        }
                        previous = key;
                    }
                    drop(data);
                    let _ = rx.recv_timeout(Duration::from_secs(2));
                }
            }
        });
        this
    }
    pub fn subscribe(&self, window: &str) -> Result<Value, String> {
        let mut data = self.data.lock().map_err(|e| e.to_string())?;
        data.next += 1;
        let token = format!("vd{}", data.next);
        data.subs.insert(token.clone(), window.into());
        Ok(json!({"token":token,"initial":event()}))
    }
    pub fn unsubscribe(&self, token: &str, window: &str) {
        let mut data = self.data.lock().unwrap();
        if data.subs.get(token).is_some_and(|owner| owner == window) {
            data.subs.remove(token);
        }
    }
    pub fn remove_window(&self, window: &str) {
        self.data
            .lock()
            .unwrap()
            .subs
            .retain(|_, owner| owner != window);
    }
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }
    pub fn focus(&self, index: u32) -> Result<(), String> {
        let desktops = winvd::get_desktops().map_err(|e| format!("Windows desktops: {e:?}"))?;
        let desktop = desktops
            .into_iter()
            .find(|desktop| desktop.get_index().ok() == Some(index))
            .ok_or("Unknown Windows desktop")?;
        winvd::switch_desktop(desktop).map_err(|e| format!("Switch Windows desktop: {e:?}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Reads the running Windows Explorer virtual desktops; does not switch desktops"]
    fn live_windows_snapshot() {
        let value = snapshot().expect("Read Windows virtual desktops");
        println!("{value}");
        let workspaces = value["workspaces"].as_array().unwrap();
        assert!(!workspaces.is_empty());
        assert_eq!(
            workspaces
                .iter()
                .filter(|w| w["status"] == "active")
                .count(),
            1
        );
    }
    #[test]
    fn unsubscribe_checks_window_owner() {
        let owner = WindowsWorkspaces::default();
        owner
            .data
            .lock()
            .unwrap()
            .subs
            .insert("vd1".into(), "bar-1".into());
        owner.unsubscribe("vd1", "bar-2");
        assert_eq!(owner.data.lock().unwrap().subs.len(), 1);
        owner.unsubscribe("vd1", "bar-1");
        assert!(owner.data.lock().unwrap().subs.is_empty());
    }
}
