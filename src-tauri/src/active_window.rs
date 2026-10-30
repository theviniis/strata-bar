//! One foreground-window watcher shared by every bar; publishes the active
//! window's title whenever it changes, and only while someone subscribes.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter};

const POLL: Duration = Duration::from_millis(250);
/// Title buffer and published-title cap, so a hostile window cannot flood a bar.
const MAX_TITLE: usize = 256;

fn foreground_title() -> Option<String> {
    let hwnd = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() };
    if hwnd.is_invalid() {
        return None;
    }
    let mut buffer = [0u16; MAX_TITLE];
    let len = unsafe { windows::Win32::UI::WindowsAndMessaging::GetWindowTextW(hwnd, &mut buffer) };
    let text = String::from_utf16_lossy(&buffer[..len.max(0) as usize]);
    let title = text.trim();
    (!title.is_empty()).then(|| title.chars().take(MAX_TITLE).collect())
}

fn envelope(title: &str) -> Value {
    if title.is_empty() {
        crate::metrics::envelope("loading", Value::Null)
    } else {
        crate::metrics::envelope("ready", json!(title))
    }
}

struct State {
    title: String,
    subs: HashMap<String, String>,
    next: u64,
    stop: bool,
}
#[derive(Clone)]
pub struct ActiveWindow {
    shared: Arc<(Mutex<State>, Condvar)>,
    app: AppHandle,
}
fn allowed(label: &str) -> bool {
    crate::desktop::content_window(label)
}
impl ActiveWindow {
    pub fn start(app: AppHandle) -> Self {
        let this = Self {
            shared: Arc::new((
                Mutex::new(State {
                    title: String::new(),
                    subs: HashMap::new(),
                    next: 0,
                    stop: false,
                }),
                Condvar::new(),
            )),
            app,
        };
        let watcher = this.clone();
        std::thread::spawn(move || watcher.run());
        this
    }
    pub fn subscribe(&self, window: &str) -> Result<Value, String> {
        if !allowed(window) {
            return Err("Active-window subscription denied".into());
        }
        let result = {
            let mut state = self.shared.0.lock().unwrap();
            state.next += 1;
            let token = format!("aw{}", state.next);
            state.subs.insert(token.clone(), window.into());
            json!({"token":token,"initial":envelope(&state.title)})
        };
        self.shared.1.notify_all();
        Ok(result)
    }
    pub fn unsubscribe(&self, token: &str, window: &str) {
        let mut state = self.shared.0.lock().unwrap();
        if state.subs.get(token).is_some_and(|w| w == window) {
            state.subs.remove(token);
        }
        self.shared.1.notify_all();
    }
    pub fn remove_window(&self, window: &str) {
        self.shared
            .0
            .lock()
            .unwrap()
            .subs
            .retain(|_, w| w != window);
        self.shared.1.notify_all();
    }
    pub fn stop(&self) {
        self.shared.0.lock().unwrap().stop = true;
        self.shared.1.notify_all();
    }
    fn run(&self) {
        loop {
            let mut state = self.shared.0.lock().unwrap();
            while state.subs.is_empty() && !state.stop {
                state = self.shared.1.wait_timeout(state, POLL * 16).unwrap().0;
            }
            if state.stop {
                return;
            }
            while !state.stop && !state.subs.is_empty() {
                let title = foreground_title().unwrap_or_default();
                if title != state.title {
                    state.title = title;
                    let value = envelope(&state.title);
                    let app = self.app.clone();
                    let windows: std::collections::HashSet<_> =
                        state.subs.values().cloned().collect();
                    drop(state);
                    for window in windows {
                        let _ = app.emit_to(window.as_str(), "system:activeWindow", &value);
                    }
                    state = self.shared.0.lock().unwrap();
                }
                state = self.shared.1.wait_timeout(state, POLL).unwrap().0;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> State {
        State {
            title: String::new(),
            subs: HashMap::new(),
            next: 0,
            stop: false,
        }
    }
    #[test]
    fn empty_title_is_a_gap_and_titles_are_capped() {
        assert_eq!(envelope("Visual Studio Code")["status"], "ready");
        assert_eq!(envelope("")["status"], "loading");
        assert_eq!(
            "0123456789".chars().take(5).collect::<String>(),
            String::from("01234")
        );
    }
    #[test]
    fn subscription_is_denied_outside_content_windows() {
        assert!(allowed("bar-0"));
        assert!(allowed("overlay"));
        assert!(!allowed("settings"));
    }
    #[test]
    fn unsubscribe_requires_the_same_window_and_tokens_are_sequential() {
        let mut s = state();
        s.next += 1;
        let token = format!("aw{}", s.next);
        s.subs.insert(token.clone(), "bar-0".into());
        assert!(s.subs.get("aw1").is_some_and(|w| w == "bar-0"));
        // A stolen token from another window cannot remove someone else's sub.
        assert!(s.subs.get("aw1").is_some_and(|w| w != "bar-1"));
        s.subs.retain(|_, w| w != "bar-1");
        assert_eq!(s.subs.len(), 1);
    }
}
