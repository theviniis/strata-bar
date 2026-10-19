use crate::{media_contract::*, media_windows::WindowsMedia, spotify::Spotify};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter};

pub enum Request {
    Wake,
    Tick,
    Action(String, MediaRequest, mpsc::SyncSender<Result<(), String>>),
    Stop,
}
#[derive(Default)]
struct Data {
    next: u64,
    subscribers: HashMap<String, String>,
    latest: Option<Value>,
}
impl Data {
    fn remove_owned(&mut self, token: &str, window: &str) {
        if self.subscribers.get(token).is_some_and(|w| w == window) {
            self.subscribers.remove(token);
        }
    }
}
#[derive(Clone)]
pub struct Media {
    data: Arc<Mutex<Data>>,
    tx: mpsc::Sender<Request>,
    pub spotify: Spotify,
}
pub fn allowed_window(label: &str) -> bool {
    label.starts_with("bar-") || label == "overlay"
}
/// A track change reaches the worker as a burst of GSMTC notifications. Fold the
/// queue into the newest pending request, dropping redundant wakes so one burst
/// costs one read. A wake also promotes the periodic tick, so an event that lands
/// with the timeout is never lost. Actions and `Stop` are preserved.
fn coalesce(request: Request, mut queued: impl FnMut() -> Option<Request>) -> Request {
    if !matches!(request, Request::Wake | Request::Tick) {
        return request;
    }
    let mut current = request;
    while let Some(next) = queued() {
        match next {
            Request::Wake => {
                if matches!(current, Request::Tick) {
                    current = Request::Wake;
                }
            }
            other => {
                current = other;
                break;
            }
        }
    }
    current
}
fn reuse_snapshot(request: &Request, stale: bool, has_snapshot: bool) -> bool {
    matches!(request, Request::Tick) && !stale && has_snapshot
}
pub fn validate(request: &MediaRequest, data: &MediaData) -> Result<(), String> {
    if request.session_id != data.session_id || request.track_id != data.track_id {
        return Err("Media session or track changed".into());
    }
    let supported = match request.action {
        MediaAction::OpenPlayer => data.capabilities.open_player,
        MediaAction::Previous => data.capabilities.previous,
        MediaAction::PlayPause => data.capabilities.play_pause,
        MediaAction::Next => data.capabilities.next,
        MediaAction::Seek { position_ms } => {
            if !position_ms.is_finite()
                || data
                    .progress
                    .value
                    .as_ref()
                    .is_none_or(|p| position_ms < p.min_seek_ms || position_ms > p.max_seek_ms)
            {
                return Err("Seek position is outside the media timeline".into());
            }
            data.capabilities.seek
        }
        MediaAction::Volume { level } => {
            if !level.is_finite() || !(0.0..=100.0).contains(&level) {
                return Err("Player volume must be between 0 and 100".into());
            }
            data.capabilities.volume
        }
        MediaAction::Mute { .. } => data.capabilities.mute,
        MediaAction::Shuffle { .. } => data.capabilities.shuffle,
        MediaAction::Repeat { .. } => data.capabilities.repeat,
        MediaAction::Favorite { .. } => data.capabilities.favorite,
    };
    if !supported {
        return Err("Media action unavailable for this player".into());
    }
    Ok(())
}
impl Media {
    pub fn start(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel();
        let this = Self {
            data: Default::default(),
            tx,
            spotify: Spotify::start(),
        };
        let worker = this.clone();
        std::thread::spawn(move || worker.run(app, rx));
        this
    }
    pub fn subscribe(&self, window: &str) -> Result<Value, String> {
        if !allowed_window(window) {
            return Err("Media subscriptions require a bar or overlay window".into());
        }
        let mut data = self.data.lock().unwrap();
        data.next += 1;
        let token = format!("m{}", data.next);
        data.subscribers.insert(token.clone(), window.into());
        let initial = data
            .latest
            .clone()
            .unwrap_or_else(|| crate::metrics::envelope("loading", Value::Null));
        drop(data);
        let _ = self.tx.send(Request::Wake);
        Ok(json!({"token":token,"initial":initial}))
    }
    pub fn unsubscribe(&self, token: &str, window: &str) {
        self.data.lock().unwrap().remove_owned(token, window);
        let _ = self.tx.send(Request::Wake);
    }
    pub fn remove_window(&self, window: &str) {
        self.data
            .lock()
            .unwrap()
            .subscribers
            .retain(|_, w| w != window);
        let _ = self.tx.send(Request::Wake);
    }
    pub fn action(&self, window: String, request: MediaRequest) -> Result<(), String> {
        if !allowed_window(&window) {
            return Err("Media controls require a bar or overlay window".into());
        }
        let (tx, rx) = mpsc::sync_channel(1);
        self.tx
            .send(Request::Action(window, request, tx))
            .map_err(|_| "Media service stopped")?;
        rx.recv_timeout(Duration::from_secs(35))
            .map_err(|_| "Media command timed out")?
    }
    pub fn stop(&self) {
        self.spotify.stop();
        let _ = self.tx.send(Request::Stop);
    }
    fn publish(&self, app: &AppHandle, event: Value) {
        let windows = {
            let mut data = self.data.lock().unwrap();
            if data.latest.as_ref().is_some_and(|old| {
                old["status"] == event["status"]
                    && old["data"] == event["data"]
                    && old["error"] == event["error"]
            }) {
                return;
            }
            data.latest = Some(event.clone());
            data.subscribers.values().cloned().collect::<HashSet<_>>()
        };
        for window in windows {
            let _ = app.emit_to(window, "system:media", &event);
        }
    }
    fn run(&self, app: AppHandle, rx: mpsc::Receiver<Request>) {
        let initialized = unsafe {
            windows::Win32::System::WinRT::RoInitialize(
                windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
            )
        };
        let mut source = None;
        let mut stale = false;
        loop {
            let active = !self.data.lock().unwrap().subscribers.is_empty();
            if !active {
                source = None;
                self.spotify.invalidate();
                self.data.lock().unwrap().latest = None;
            }
            let mut request = if active {
                match rx.recv_timeout(Duration::from_secs(1)) {
                    Ok(r) => r,
                    Err(mpsc::RecvTimeoutError::Timeout) => Request::Tick,
                    Err(_) => break,
                }
            } else {
                match rx.recv() {
                    Ok(r) => r,
                    Err(_) => break,
                }
            };
            request = coalesce(request, || rx.try_recv().ok());
            if matches!(request, Request::Stop) {
                break;
            }
            let active = !self.data.lock().unwrap().subscribers.is_empty();
            if !active {
                if let Request::Action(_, _, reply) = request {
                    let _ = reply.send(Err("No active media subscription".into()));
                }
                continue;
            }
            let read = (|| -> Result<Option<MediaData>, String> {
                initialized.as_ref().map_err(|e| e.to_string())?;
                if source.is_none() {
                    source = Some(WindowsMedia::new(self.tx.clone()).map_err(|e| e.to_string())?);
                } else if matches!(request, Request::Action(..)) {
                    return source.as_ref().unwrap().action_snapshot().map(Some);
                } else if reuse_snapshot(
                    &request,
                    stale,
                    source.as_ref().unwrap().snapshot().is_some(),
                ) {
                    return Ok(source.as_ref().unwrap().snapshot());
                }
                source.as_mut().unwrap().read().map_err(|e| e.to_string())
            })();
            match read {
                Ok(Some(mut data)) => {
                    stale = false;
                    self.spotify.enrich(&mut data);
                    if let Request::Action(window, request, reply) = request {
                        let owned = self
                            .data
                            .lock()
                            .unwrap()
                            .subscribers
                            .values()
                            .any(|w| w == &window)
                            || window == "overlay";
                        let validation = if owned {
                            validate(&request, &data)
                        } else {
                            Err("Media subscription is no longer owned by this window".into())
                        };
                        match (validation, &request.action) {
                            (Ok(()), MediaAction::Favorite { saved }) => {
                                let spotify = self.spotify.clone();
                                let data = data.clone();
                                let saved = *saved;
                                let tx = self.tx.clone();
                                // Web requests never block local transport controls or events.
                                std::thread::spawn(move || {
                                    let _ = reply.send(spotify.favorite(&data, saved));
                                    // Only enrichment changed; publish it without
                                    // waiting for another Windows metadata read.
                                    let _ = tx.send(Request::Tick);
                                });
                            }
                            (validation, _) => {
                                let result = validation.and_then(|()| {
                                    source.as_mut().unwrap().act(&request.action, &data)
                                });
                                let _ = reply.send(result);
                                let _ = self.tx.send(Request::Wake);
                            }
                        }
                    }
                    self.spotify.enqueue(&data);
                    self.publish(
                        &app,
                        crate::metrics::envelope("ready", serde_json::to_value(data).unwrap()),
                    );
                }
                Ok(None) => {
                    stale = false;
                    if let Request::Action(_, _, reply) = request {
                        let _ = reply.send(Err("No current media session".into()));
                    }
                    self.spotify.invalidate();
                    self.publish(&app, crate::metrics::envelope("unavailable", Value::Null));
                }
                Err(error) => {
                    // A transient read failure (a timed-out WinRT call, a session
                    // caught mid-switch) must not blank the bar or rebuild the
                    // session. Keep the last good snapshot and retry on the tick.
                    stale = true;
                    eprintln!("Media read failed, retrying: {error}");
                    if let Request::Action(_, _, reply) = request {
                        let _ = reply.send(Err("Media is temporarily unavailable".into()));
                    }
                    if self.data.lock().unwrap().latest.is_none() {
                        self.spotify.invalidate();
                        self.publish(
                            &app,
                            json!({"status":"error","error":error,"data":null,"timestamp":crate::metrics::timestamp()}),
                        );
                    }
                }
            }
        }
        drop(source);
        if initialized.is_ok() {
            unsafe {
                windows::Win32::System::WinRT::RoUninitialize();
            }
        }
    }
}

pub fn probe() -> Value {
    let result = unsafe {
        windows::Win32::System::WinRT::RoInitialize(
            windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
        )
    };
    if let Err(e) = result {
        return json!({"status":"error","error":e.to_string()});
    }
    let (tx, _rx) = mpsc::channel();
    let result = WindowsMedia::new(tx).and_then(|mut source| source.read());
    let audio = result
        .as_ref()
        .ok()
        .and_then(|data| data.as_ref())
        .map(|data| crate::media_windows::audio_diagnostics(&data.player_id));
    unsafe {
        windows::Win32::System::WinRT::RoUninitialize();
    }
    match result {
        Ok(Some(data)) => {
            let mut event = crate::metrics::envelope("ready", serde_json::to_value(data).unwrap());
            event["audioDiagnostics"] = audio.unwrap_or(Value::Null);
            event
        }
        Ok(None) => crate::metrics::envelope("unavailable", Value::Null),
        Err(e) => json!({"status":"error","error":e.to_string()}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retries_a_temporarily_missing_session_without_another_windows_event() {
        assert!(!reuse_snapshot(&Request::Tick, false, false));
        assert!(reuse_snapshot(&Request::Tick, false, true));
        assert!(!reuse_snapshot(&Request::Tick, true, true));
        assert!(!reuse_snapshot(&Request::Wake, false, true));
    }
    fn request(action: MediaAction) -> MediaRequest {
        MediaRequest {
            session_id: "session-1".into(),
            track_id: "track-1".into(),
            action,
        }
    }
    fn action_request() -> Request {
        let (tx, _rx) = mpsc::sync_channel(1);
        Request::Action("bar-1".into(), request(MediaAction::PlayPause), tx)
    }
    #[test]
    fn folds_notification_bursts_into_one_read() {
        // Repeated wakes from the same burst collapse into a single read.
        let mut queued = vec![Request::Wake, Request::Wake, Request::Wake].into_iter();
        assert!(matches!(
            coalesce(Request::Wake, || queued.next()),
            Request::Wake
        ));
        // A wake landing with the periodic tick promotes it, never lost.
        let mut queued = vec![Request::Wake].into_iter();
        assert!(matches!(
            coalesce(Request::Tick, || queued.next()),
            Request::Wake
        ));
        // A queued action is preserved, never merged away.
        let mut queued = vec![Request::Wake, action_request()].into_iter();
        assert!(matches!(
            coalesce(Request::Tick, || queued.next()),
            Request::Action(..)
        ));
        // Stop still wins over the coalesced wake.
        let mut queued = vec![Request::Wake, Request::Stop].into_iter();
        assert!(matches!(
            coalesce(Request::Wake, || queued.next()),
            Request::Stop
        ));
        // A non-wake request is returned untouched, leaving the queue alone.
        let mut queued = vec![Request::Wake].into_iter();
        assert!(matches!(
            coalesce(action_request(), || queued.next()),
            Request::Action(..)
        ));
        assert!(queued.next().is_some());
    }
    #[test]
    fn opening_player_requires_capability_and_current_identity() {
        let mut data = crate::media_contract::fixture();
        let mut r = request(MediaAction::OpenPlayer);
        assert!(validate(&r, &data).is_err());
        data.capabilities.open_player = true;
        assert!(validate(&r, &data).is_ok());
        r.session_id = "old-session".into();
        assert!(validate(&r, &data).is_err());
    }
    #[test]
    fn rejects_stale_session_and_track() {
        let data = fixture();
        let mut r = request(MediaAction::Next);
        r.session_id = "old".into();
        assert!(validate(&r, &data).is_err());
        r.session_id = data.session_id.clone();
        r.track_id = "old".into();
        assert!(validate(&r, &data).is_err());
    }
    #[test]
    fn validates_seek_and_application_volume() {
        let data = fixture();
        for v in [-1., f64::NAN, f64::INFINITY, 343001.] {
            assert!(validate(&request(MediaAction::Seek { position_ms: v }), &data).is_err());
        }
        for v in [-1., f32::NAN, f32::INFINITY, 101.] {
            assert!(validate(&request(MediaAction::Volume { level: v }), &data).is_err());
        }
        for v in [0., 343000.] {
            assert!(validate(&request(MediaAction::Seek { position_ms: v }), &data).is_ok());
        }
        assert!(validate(&request(MediaAction::Volume { level: 0. }), &data).is_ok());
    }
    #[test]
    fn honors_shuffle_and_repeat_capabilities() {
        let mut data = fixture();
        assert!(validate(&request(MediaAction::Shuffle { active: true }), &data).is_ok());
        assert!(validate(
            &request(MediaAction::Repeat {
                mode: RepeatMode::List
            }),
            &data
        )
        .is_ok());
        data.capabilities.shuffle = false;
        data.capabilities.repeat = false;
        assert!(validate(&request(MediaAction::Shuffle { active: false }), &data).is_err());
        assert!(validate(
            &request(MediaAction::Repeat {
                mode: RepeatMode::Track
            }),
            &data
        )
        .is_err());
    }
    #[test]
    fn honors_capabilities_and_unknown_favorite() {
        let mut data = fixture();
        assert!(validate(&request(MediaAction::Favorite { saved: true }), &data).is_err());
        data.capabilities.favorite = true;
        data.favorite = MediaValue::ready(false);
        assert!(validate(&request(MediaAction::Favorite { saved: true }), &data).is_ok());
        data.capabilities.next = false;
        assert!(validate(&request(MediaAction::Next), &data).is_err());
    }
    #[test]
    fn tokens_remain_owned_by_the_subscribing_monitor() {
        let mut data = Data::default();
        data.subscribers.insert("m1".into(), "bar-one".into());
        data.subscribers.insert("m2".into(), "bar-two".into());
        data.remove_owned("m1", "bar-two");
        assert_eq!(data.subscribers.len(), 2);
        data.remove_owned("m1", "bar-one");
        data.remove_owned("m1", "bar-one");
        assert_eq!(data.subscribers.len(), 1);
        assert_eq!(data.subscribers["m2"], "bar-two");
    }
    #[test]
    fn only_floating_app_windows_can_control_media() {
        assert!(allowed_window("bar-0"));
        assert!(allowed_window("overlay"));
        assert!(!allowed_window("studio"));
        assert!(!allowed_window("main"));
    }
    #[test]
    fn malformed_actions_are_rejected() {
        for value in [
            json!({"action":"shell","command":"anything"}),
            json!({"action":"volume","level":20,"endpoint":"master"}),
            json!({"action":"seek","positionMs":"10"}),
            json!({"action":"repeat","mode":"forever"}),
            json!({"action":"repeat"}),
            json!({"action":"shuffle","active":"yes"}),
        ] {
            assert!(serde_json::from_value::<MediaAction>(value).is_err());
        }
    }
}
