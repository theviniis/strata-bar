use crate::reminders_contract::*;
use std::{fs, io::Write, path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};

pub const EVENT: &str = "reminders:snapshot";
const MAX_TIME: f64 = 8_640_000_000_000_000.0;

pub fn now() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

fn valid_time(value: f64) -> bool {
    value.is_finite() && value >= 0.0 && value <= MAX_TIME && value.fract() == 0.0
}

fn valid_mode(mode: &ReminderMode) -> bool {
    !matches!(mode, ReminderMode::Duration { seconds } if *seconds == 0)
}

fn validate(snapshot: &ReminderSnapshot) -> Result<(), String> {
    if snapshot.version != 1 {
        return Err("Unsupported reminders version".into());
    }
    let mut ids = std::collections::HashSet::new();
    for r in &snapshot.reminders {
        let uuid = r.id.len() == 36
            && r.id.bytes().enumerate().all(|(i, b)| {
                if [8, 13, 18, 23].contains(&i) {
                    b == b'-'
                } else {
                    b.is_ascii_hexdigit()
                }
            });
        if !uuid
            || !ids.insert(&r.id)
            || r.message.trim().is_empty()
            || r.message.chars().count() > 2000
            || !valid_mode(&r.mode)
            || ![r.original_at, r.notify_at, r.created_at, r.updated_at]
                .into_iter()
                .all(valid_time)
            || r.updated_at < r.created_at
            || r.event_duration_seconds == 0
            || matches!(r.mode, ReminderMode::Duration { .. }) && r.event_duration_seconds != 300
        {
            return Err("Invalid reminder document".into());
        }
    }
    Ok(())
}

pub struct Reminders {
    path: PathBuf,
    state: Mutex<Result<ReminderSnapshot, String>>,
}

impl Reminders {
    pub fn open(path: PathBuf) -> Self {
        let state = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice::<ReminderSnapshot>(&bytes)
                .map_err(|e| format!("Cannot read reminders: {e}"))
                .and_then(|s| {
                    validate(&s)?;
                    Ok(s)
                }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ReminderSnapshot {
                version: 1,
                revision: 0,
                reminders: vec![],
            }),
            Err(e) => Err(format!("Cannot read reminders: {e}")),
        };
        Self {
            path,
            state: Mutex::new(state),
        }
    }

    pub fn snapshot(&self) -> Result<ReminderSnapshot, String> {
        self.state.lock().map_err(|e| e.to_string())?.clone()
    }

    fn change(
        &self,
        edit: impl FnOnce(&mut ReminderSnapshot) -> Result<(), String>,
    ) -> Result<ReminderSnapshot, String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;
        let mut next = guard.as_ref().map_err(Clone::clone)?.clone();
        edit(&mut next)?;
        next.revision = next.revision.checked_add(1).ok_or("Revision exhausted")?;
        validate(&next)?;
        self.persist(&next)?;
        *guard = Ok(next.clone());
        Ok(next)
    }

    fn persist(&self, snapshot: &ReminderSnapshot) -> Result<(), String> {
        let write = || -> Result<(), Box<dyn std::error::Error>> {
            fs::create_dir_all(self.path.parent().ok_or("Missing reminders directory")?)?;
            let temporary = self.path.with_extension("json.tmp");
            let mut file = fs::File::create(&temporary)?;
            file.write_all(&serde_json::to_vec(snapshot)?)?;
            file.sync_all()?;
            drop(file);
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                use windows::{
                    core::PCWSTR,
                    Win32::Storage::FileSystem::{
                        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
                    },
                };
                let from: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
                let to: Vec<u16> = self.path.as_os_str().encode_wide().chain(Some(0)).collect();
                unsafe {
                    MoveFileExW(
                        PCWSTR(from.as_ptr()),
                        PCWSTR(to.as_ptr()),
                        MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                    )?;
                }
            }
            #[cfg(not(windows))]
            fs::rename(temporary, &self.path)?;
            Ok(())
        };
        write().map_err(|e| format!("Cannot save reminders: {e}"))
    }

    pub fn create(&self, request: CreateReminder, at: f64) -> Result<ReminderSnapshot, String> {
        if !valid_time(at) || !valid_mode(&request.mode) {
            return Err("Invalid reminder time or duration".into());
        }
        let (original_at, duration) = match request.mode {
            ReminderMode::Duration { seconds } => {
                if request.scheduled_at.is_some()
                    || request.event_duration_seconds.is_some_and(|v| v != 300)
                {
                    return Err("Duration reminders use a fixed five-minute event".into());
                }
                (at + f64::from(seconds) * 1000.0, 300)
            }
            ReminderMode::DateTime => (
                request.scheduled_at.ok_or("Missing scheduled time")?,
                request
                    .event_duration_seconds
                    .ok_or("Missing event duration")?,
            ),
        };
        if !valid_time(original_at) || original_at <= at {
            return Err("Reminder must be in the future".into());
        }
        let mut bytes: [u8; 16] = rand::random();
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        let id = format!(
            "{}-{}-{}-{}-{}",
            &hex[..8],
            &hex[8..12],
            &hex[12..16],
            &hex[16..20],
            &hex[20..]
        );
        self.change(|s| {
            s.reminders.push(Reminder {
                id,
                message: request.message.trim().into(),
                mode: request.mode,
                original_at,
                notify_at: original_at,
                event_duration_seconds: duration,
                status: ReminderStatus::Scheduled,
                created_at: at,
                updated_at: at,
                google_event_id: None,
                calendar_requested: request.sync_calendar.unwrap_or(false),
                calendar_error: None,
            });
            Ok(())
        })
    }

    pub fn sync_calendar(
        &self,
        id: &str,
        create: impl FnOnce(&Reminder) -> Result<String, String>,
    ) -> Result<ReminderSnapshot, String> {
        let snapshot = self.snapshot()?;
        let reminder = snapshot
            .reminders
            .iter()
            .find(|r| r.id == id)
            .ok_or("Reminder not found")?;
        if reminder.google_event_id.is_some() {
            return Ok(snapshot);
        }
        if !reminder.calendar_requested {
            return Err("Google Calendar não foi solicitado para este lembrete".into());
        }
        let result = create(reminder);
        self.change(|s| {
            let r = s
                .reminders
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or("Reminder not found")?;
            match result {
                Ok(event) => {
                    r.google_event_id = Some(event);
                    r.calendar_error = None;
                }
                Err(error) => {
                    r.calendar_error = Some(error);
                }
            }
            r.updated_at = now().max(r.updated_at);
            Ok(())
        })
    }

    pub fn due(&self, at: f64) -> Result<Option<ReminderSnapshot>, String> {
        if !valid_time(at) {
            return Err("Invalid scheduler time".into());
        }
        if !self
            .snapshot()?
            .reminders
            .iter()
            .any(|r| r.status == ReminderStatus::Scheduled && r.notify_at <= at)
        {
            return Ok(None);
        }
        self.change(|s| {
            for r in &mut s.reminders {
                if r.status == ReminderStatus::Scheduled && r.notify_at <= at {
                    r.status = ReminderStatus::Ringing;
                    r.updated_at = at.max(r.updated_at);
                }
            }
            Ok(())
        })
        .map(Some)
    }

    pub fn transition(
        &self,
        id: &str,
        snooze: Option<SnoozeOption>,
        at: f64,
    ) -> Result<ReminderSnapshot, String> {
        if !valid_time(at) {
            return Err("Invalid action time".into());
        }
        self.change(|s| {
            let r = s
                .reminders
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or("Reminder not found")?;
            if r.status == ReminderStatus::Dismissed {
                return Err("Reminder already dismissed".into());
            }
            if let Some(option) = snooze {
                r.notify_at = at + f64::from(option.minutes()) * 60_000.0;
                r.status = ReminderStatus::Scheduled;
            } else {
                r.status = ReminderStatus::Dismissed;
            }
            r.updated_at = at.max(r.created_at);
            Ok(())
        })
    }
}

pub(crate) fn authorize(window: &tauri::WebviewWindow) -> Result<(), String> {
    if crate::desktop::content_window(window.label()) {
        Ok(())
    } else {
        Err("Reminders require a bar or overlay window".into())
    }
}

fn publish(app: &tauri::AppHandle, snapshot: ReminderSnapshot) -> ReminderSnapshot {
    for (label, window) in app.webview_windows() {
        if crate::desktop::content_window(&label) {
            if let Err(error) = window.emit(EVENT, &snapshot) {
                eprintln!("Reminder delivery failed: {error}");
            }
        }
    }
    if let Some(scheduler) = app.try_state::<ReminderScheduler>() {
        scheduler.wake();
    }
    snapshot
}

enum SchedulerSignal {
    Wake,
    RetryAlert(String, u64),
    Presented(String, u64),
    Stop,
}

/// One successful sound delivery per persisted occurrence, independent of popup delivery.
/// Dropping keys after snooze/dismiss also bounds this session-only cache.
fn deliver_due_sounds(
    snapshot: &ReminderSnapshot,
    sounded: &mut std::collections::HashSet<(String, u64)>,
    mut play: impl FnMut() -> bool,
) {
    sounded.retain(|(id, time)| {
        snapshot.reminders.iter().any(|r| {
            &r.id == id && r.notify_at as u64 == *time && r.status == ReminderStatus::Ringing
        })
    });
    for reminder in &snapshot.reminders {
        if reminder.status == ReminderStatus::Ringing
            && !sounded.contains(&(reminder.id.clone(), reminder.notify_at as u64))
            && play()
        {
            sounded.insert((reminder.id.clone(), reminder.notify_at as u64));
        }
    }
}

pub struct ReminderScheduler {
    tx: std::sync::mpsc::Sender<SchedulerSignal>,
    stopped: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl ReminderScheduler {
    pub fn start(app: tauri::AppHandle) -> Self {
        use std::{
            collections::HashSet,
            sync::{
                atomic::{AtomicBool, Ordering},
                mpsc, Arc,
            },
            time::Duration,
        };
        let (tx, rx) = mpsc::channel();
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = stopped.clone();
        std::thread::spawn(move || {
            let mut announced = HashSet::<(String, u64)>::new();
            let mut sounded = HashSet::<(String, u64)>::new();
            let mut last_error: Option<String> = None;
            while !stop.load(Ordering::Acquire) {
                let state = app.state::<Reminders>();
                let at = now();
                let due_failed = match state.due(at) {
                    Ok(snapshot) => {
                        if let Some(snapshot) = snapshot {
                            publish(&app, snapshot);
                        }
                        last_error = None;
                        false
                    }
                    Err(error) => {
                        if last_error.as_ref() != Some(&error) {
                            for (label, window) in app.webview_windows() {
                                if crate::desktop::content_window(&label) {
                                    let _ = window.emit("reminders:error", &error);
                                }
                            }
                            last_error = Some(error);
                        }
                        true
                    }
                };
                let snapshot = state.snapshot().ok();
                if let Some(snapshot) = snapshot.as_ref() {
                    if !stop.load(Ordering::Acquire) {
                        deliver_due_sounds(snapshot, &mut sounded, || {
                            match crate::desktop::play_reminder_sound() {
                                Ok(()) => true,
                                Err(error) => {
                                    eprintln!("Reminder sound failed: {error}");
                                    false
                                }
                            }
                        });
                    }
                    announced.retain(|(id, time)| {
                        snapshot.reminders.iter().any(|r| {
                            &r.id == id
                                && r.notify_at as u64 == *time
                                && r.status == ReminderStatus::Ringing
                        })
                    });
                }
                let next = snapshot
                    .as_ref()
                    .and_then(|s| {
                        s.reminders
                            .iter()
                            .filter(|r| {
                                r.status == ReminderStatus::Ringing
                                    && !announced.contains(&(r.id.clone(), r.notify_at as u64))
                            })
                            .min_by(|a, b| {
                                a.notify_at.total_cmp(&b.notify_at).then(a.id.cmp(&b.id))
                            })
                    })
                    .cloned();
                if let Some(reminder) = next.as_ref() {
                    let (reply, result) = mpsc::sync_channel(1);
                    let handle = app.clone();
                    let stopped = stop.clone();
                    let id = reminder.id.clone();
                    let notify_at = reminder.notify_at;
                    let dispatched = app.run_on_main_thread(move || {
                        if stopped.load(Ordering::Acquire) {
                            let _ = reply.send(());
                            return;
                        }
                        // A snooze/dismiss can arrive while the GUI callback is queued.
                        let still_ringing = handle
                            .state::<Reminders>()
                            .snapshot()
                            .ok()
                            .is_some_and(|s| {
                                s.reminders.iter().any(|r| {
                                    r.id == id
                                        && r.notify_at == notify_at
                                        && r.status == ReminderStatus::Ringing
                                })
                            });
                        if still_ringing {
                            if let Err(error) =
                                crate::desktop::request_reminder_alert(&handle, &id, notify_at)
                            {
                                eprintln!("Reminder popup failed: {error}");
                                for (label, window) in handle.webview_windows() {
                                    if crate::desktop::content_window(&label) {
                                        let _ = window.emit("reminders:error", &error);
                                    }
                                }
                            }
                        }
                        let _ = reply.send(());
                    });
                    if dispatched.is_ok() {
                        let _ = result.recv();
                    }
                    // Dispatch is not delivery. Only the visible renderer (or
                    // an explicit close) confirms this occurrence below.
                }
                let has_unannounced = snapshot.as_ref().is_some_and(|s| {
                    s.reminders.iter().any(|r| {
                        r.status == ReminderStatus::Ringing
                            && !announced.contains(&(r.id.clone(), r.notify_at as u64))
                    })
                });
                let delay = if due_failed {
                    Some(Duration::from_secs(30))
                } else if has_unannounced
                    || snapshot.as_ref().is_some_and(|s| {
                        s.reminders.iter().any(|r| {
                            r.status == ReminderStatus::Ringing
                                && !sounded.contains(&(r.id.clone(), r.notify_at as u64))
                        })
                    })
                {
                    Some(Duration::from_secs(1))
                } else {
                    snapshot.as_ref().and_then(|s| {
                        s.reminders
                            .iter()
                            .filter(|r| r.status == ReminderStatus::Scheduled)
                            .map(|r| {
                                Duration::from_millis(
                                    (r.notify_at - now()).clamp(1.0, 30_000.0) as u64
                                )
                            })
                            .min()
                    })
                };
                let signal = match delay {
                    Some(delay) => rx.recv_timeout(delay).map(Some).or_else(|e| {
                        if matches!(e, mpsc::RecvTimeoutError::Timeout) {
                            Ok(None)
                        } else {
                            Err(())
                        }
                    }),
                    None => rx.recv().map(Some).map_err(|_| ()),
                };
                if matches!(signal, Ok(Some(SchedulerSignal::Stop)) | Err(())) {
                    break;
                }
                match signal {
                    Ok(Some(SchedulerSignal::RetryAlert(id, time))) => {
                        announced.remove(&(id, time));
                    }
                    Ok(Some(SchedulerSignal::Presented(id, time))) => {
                        announced.insert((id, time));
                    }
                    _ => {}
                }
                // Coalesce bursts from several monitors instead of spinning per event.
                while let Ok(signal) = rx.try_recv() {
                    match signal {
                        SchedulerSignal::Stop => return,
                        SchedulerSignal::RetryAlert(id, time) => {
                            announced.remove(&(id, time));
                        }
                        SchedulerSignal::Presented(id, time) => {
                            announced.insert((id, time));
                        }
                        SchedulerSignal::Wake => {}
                    }
                }
            }
        });
        Self { tx, stopped }
    }

    pub fn retry_alert(&self, session: &str) {
        if let Some((id, time)) = session
            .strip_prefix("reminder-")
            .and_then(|s| s.rsplit_once('-'))
        {
            if let Ok(time) = time.parse::<u64>() {
                let _ = self.tx.send(SchedulerSignal::RetryAlert(id.into(), time));
            }
        }
    }

    pub fn confirm_alert(&self, session: &str) {
        if let Some((id, time)) = session
            .strip_prefix("reminder-")
            .and_then(|s| s.rsplit_once('-'))
        {
            if let Ok(time) = time.parse::<u64>() {
                let _ = self.tx.send(SchedulerSignal::Presented(id.into(), time));
            }
        }
    }

    pub fn wake(&self) {
        let _ = self.tx.send(SchedulerSignal::Wake);
    }
    pub fn stop(&self) {
        self.stopped
            .store(true, std::sync::atomic::Ordering::Release);
        let _ = self.tx.send(SchedulerSignal::Stop);
    }
}

#[tauri::command]
pub fn reminders_snapshot(
    window: tauri::WebviewWindow,
    state: tauri::State<Reminders>,
) -> Result<ReminderSnapshot, String> {
    authorize(&window)?;
    state.snapshot()
}

#[tauri::command]
pub async fn reminders_create(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request: CreateReminder,
) -> Result<ReminderSnapshot, String> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Reminders>();
        let snapshot = publish(&app, state.create(request, now())?);
        let reminder = snapshot.reminders.last().ok_or("Reminder not found")?;
        if reminder.calendar_requested {
            let calendar = app.state::<crate::google_calendar::GoogleCalendar>();
            Ok(publish(
                &app,
                state.sync_calendar(&reminder.id, |r| calendar.create_event(r))?,
            ))
        } else {
            Ok(snapshot)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reminders_calendar_sync(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    id: String,
) -> Result<ReminderSnapshot, String> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Reminders>();
        let calendar = app.state::<crate::google_calendar::GoogleCalendar>();
        Ok(publish(
            &app,
            state.sync_calendar(&id, |r| calendar.create_event(r))?,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn reminders_transition(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<Reminders>,
    id: String,
    snooze: Option<SnoozeOption>,
) -> Result<ReminderSnapshot, String> {
    authorize(&window)?;
    Ok(publish(&app, state.transition(&id, snooze, now())?))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            Self(
                std::env::temp_dir()
                    .join(format!("strata-reminders-{:032x}", rand::random::<u128>())),
            )
        }
        fn path(&self) -> PathBuf {
            self.0.join("reminders.json")
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn request() -> CreateReminder {
        CreateReminder {
            message: "Tea".into(),
            mode: ReminderMode::Duration { seconds: 60 },
            scheduled_at: None,
            event_duration_seconds: None,
            sync_calendar: None,
        }
    }

    #[test]
    fn fullscreen_hidden_alert_is_requeued_by_its_exact_occurrence() {
        let (tx, rx) = std::sync::mpsc::channel();
        let scheduler = ReminderScheduler {
            tx,
            stopped: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        let id = "12345678-1234-4123-8123-123456789abc";
        scheduler.retry_alert(&format!("reminder-{id}-123456789"));
        assert!(
            matches!(rx.try_recv(), Ok(SchedulerSignal::RetryAlert(key, time))
            if key == id && time == 123456789)
        );
        scheduler.retry_alert("unrelated-popup");
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn reloads_and_preserves_original_event_through_snooze_and_dismiss() {
        let dir = Directory::new();
        let store = Reminders::open(dir.path());
        assert!(store.snapshot().unwrap().reminders.is_empty());
        let created = store.create(request(), 1000.0).unwrap();
        let r = &created.reminders[0];
        assert_eq!(r.event_duration_seconds, 300);
        assert_eq!(r.original_at, 61000.0);
        let snoozed = store
            .transition(&r.id, Some(SnoozeOption::Ten), 2000.0)
            .unwrap();
        assert_eq!(snoozed.reminders[0].notify_at, 602000.0);
        assert_eq!(snoozed.reminders[0].original_at, r.original_at);
        assert_eq!(snoozed.reminders[0].google_event_id, r.google_event_id);
        let reloaded = Reminders::open(dir.path());
        assert_eq!(reloaded.snapshot().unwrap().revision, 2);
        reloaded.transition(&r.id, None, 3000.0).unwrap();
        assert_eq!(
            Reminders::open(dir.path()).snapshot().unwrap().reminders[0].status,
            ReminderStatus::Dismissed
        );
        assert!(reloaded
            .transition(&r.id, Some(SnoozeOption::Five), 4000.0)
            .is_err());
    }

    #[test]
    fn invalid_documents_are_preserved_and_block_mutations() {
        let dir = Directory::new();
        fs::create_dir_all(&dir.0).unwrap();
        for text in ["broken", r#"{"version":2,"revision":0,"reminders":[]}"#] {
            fs::write(dir.path(), text).unwrap();
            let store = Reminders::open(dir.path());
            assert!(store.snapshot().is_err());
            assert!(store.create(request(), 1000.0).is_err());
            assert_eq!(fs::read_to_string(dir.path()).unwrap(), text);
        }
    }

    #[test]
    fn failed_replacement_keeps_memory_and_existing_file() {
        let dir = Directory::new();
        let store = Reminders::open(dir.path());
        store.create(request(), 1000.0).unwrap();
        let bytes = fs::read(dir.path()).unwrap();
        // A directory at the staging path reliably makes creation fail on Windows.
        fs::create_dir(dir.path().with_extension("json.tmp")).unwrap();
        assert!(store.create(request(), 2000.0).is_err());
        assert_eq!(store.snapshot().unwrap().revision, 1);
        assert_eq!(fs::read(dir.path()).unwrap(), bytes);
    }

    #[test]
    fn rejects_invalid_input_and_keeps_custom_date_time_duration() {
        let dir = Directory::new();
        let store = Reminders::open(dir.path());
        for bad in [
            CreateReminder {
                message: " ".into(),
                ..request()
            },
            CreateReminder {
                mode: ReminderMode::Duration { seconds: 0 },
                ..request()
            },
            CreateReminder {
                event_duration_seconds: Some(60),
                ..request()
            },
            CreateReminder {
                mode: ReminderMode::DateTime,
                scheduled_at: Some(999.0),
                event_duration_seconds: Some(600),
                ..request()
            },
            CreateReminder {
                mode: ReminderMode::DateTime,
                scheduled_at: Some(f64::NAN),
                event_duration_seconds: Some(600),
                ..request()
            },
        ] {
            assert!(store.create(bad, 1000.0).is_err());
        }
        let s = store
            .create(
                CreateReminder {
                    mode: ReminderMode::DateTime,
                    scheduled_at: Some(2000.0),
                    event_duration_seconds: Some(900),
                    ..request()
                },
                1000.0,
            )
            .unwrap();
        assert_eq!(s.revision, 1);
        assert_eq!(s.reminders[0].event_duration_seconds, 900);
    }

    #[test]
    fn concurrent_creates_are_serialized_without_losing_records() {
        let dir = Directory::new();
        let store = std::sync::Arc::new(Reminders::open(dir.path()));
        let jobs: Vec<_> = (0..8)
            .map(|_| {
                let store = store.clone();
                std::thread::spawn(move || store.create(request(), 1000.0).unwrap())
            })
            .collect();
        for job in jobs {
            job.join().unwrap();
        }
        let s = Reminders::open(dir.path()).snapshot().unwrap();
        assert_eq!(s.reminders.len(), 8);
        assert_eq!(s.revision, 8);
    }

    #[test]
    fn calendar_failure_is_persisted_without_losing_local_reminder_and_retry_is_idempotent() {
        let dir = Directory::new();
        let store = Reminders::open(dir.path());
        let created = store
            .create(
                CreateReminder {
                    sync_calendar: Some(true),
                    ..request()
                },
                1000.0,
            )
            .unwrap();
        let id = &created.reminders[0].id;
        let failed = store.sync_calendar(id, |_| Err("offline".into())).unwrap();
        assert_eq!(failed.reminders[0].status, ReminderStatus::Scheduled);
        assert_eq!(
            failed.reminders[0].calendar_error.as_deref(),
            Some("offline")
        );
        assert!(Reminders::open(dir.path()).snapshot().unwrap().reminders[0].calendar_requested);
        let synced = store.sync_calendar(id, |_| Ok("event".into())).unwrap();
        assert_eq!(
            synced.reminders[0].google_event_id.as_deref(),
            Some("event")
        );
        assert!(synced.reminders[0].calendar_error.is_none());
        let again = store
            .sync_calendar(id, |_| panic!("already synced"))
            .unwrap();
        assert_eq!(again.revision, synced.revision);
        let snoozed = store
            .transition(id, Some(SnoozeOption::Five), 2000.0)
            .unwrap();
        assert_eq!(
            snoozed.reminders[0].google_event_id.as_deref(),
            Some("event")
        );
    }

    #[test]
    fn scheduler_persists_due_queue_and_never_retriggers_before_snooze_expires() {
        let dir = Directory::new();
        let store = Reminders::open(dir.path());
        let first = store.create(request(), 1000.0).unwrap().reminders[0]
            .id
            .clone();
        store.create(request(), 1000.0).unwrap();
        assert!(store.due(60_999.0).unwrap().is_none());
        assert_eq!(store.snapshot().unwrap().revision, 2);
        let due = store.due(61_000.0).unwrap().unwrap();
        assert_eq!(
            due.reminders
                .iter()
                .filter(|r| r.status == ReminderStatus::Ringing)
                .count(),
            2
        );
        let reloaded = Reminders::open(dir.path());
        assert_eq!(
            reloaded.snapshot().unwrap().reminders[0].status,
            ReminderStatus::Ringing
        );
        assert!(reloaded.due(120_000.0).unwrap().is_none());
        reloaded
            .transition(&first, Some(SnoozeOption::Five), 120_000.0)
            .unwrap();
        assert!(reloaded.due(419_999.0).unwrap().is_none());
        assert!(reloaded.due(420_000.0).unwrap().is_some());
        reloaded.transition(&first, None, 420_001.0).unwrap();
        assert!(reloaded.due(900_000.0).unwrap().is_none());
    }

    #[test]
    fn overdue_after_restart_and_failed_due_write_remain_recoverable() {
        let dir = Directory::new();
        let store = Reminders::open(dir.path());
        store.create(request(), 1000.0).unwrap();
        let reloaded = Reminders::open(dir.path());
        let temporary = dir.path().with_extension("json.tmp");
        fs::create_dir(&temporary).unwrap();
        assert!(reloaded.due(999_000.0).is_err());
        assert_eq!(
            reloaded.snapshot().unwrap().reminders[0].status,
            ReminderStatus::Scheduled
        );
        fs::remove_dir(&temporary).unwrap();
        assert!(reloaded.due(999_000.0).unwrap().is_some());
        assert_eq!(
            Reminders::open(dir.path()).snapshot().unwrap().reminders[0].status,
            ReminderStatus::Ringing
        );
    }

    #[test]
    fn sounds_due_occurrences_once_without_waiting_for_popup_delivery() {
        let dir = Directory::new();
        let store = Reminders::open(dir.path());
        let id = store.create(request(), 1000.0).unwrap().reminders[0]
            .id
            .clone();
        store.create(request(), 1000.0).unwrap();
        let mut sounded = std::collections::HashSet::new();
        let mut sounds = 0;
        deliver_due_sounds(&store.snapshot().unwrap(), &mut sounded, || {
            sounds += 1;
            true
        });
        assert_eq!(sounds, 0);
        let due = store.due(61_000.0).unwrap().unwrap();
        // No overlay show or frontend acknowledgment is required for audio.
        deliver_due_sounds(&due, &mut sounded, || {
            sounds += 1;
            true
        });
        assert_eq!(sounds, 2);
        for _ in 0..3 {
            deliver_due_sounds(&due, &mut sounded, || {
                sounds += 1;
                true
            });
        }
        assert_eq!(sounds, 2);
        let snoozed = store
            .transition(&id, Some(SnoozeOption::Five), 62_000.0)
            .unwrap();
        deliver_due_sounds(&snoozed, &mut sounded, || {
            sounds += 1;
            true
        });
        assert_eq!(sounded.len(), 1);
        let due_again = store.due(362_000.0).unwrap().unwrap();
        deliver_due_sounds(&due_again, &mut sounded, || {
            sounds += 1;
            true
        });
        assert_eq!(sounds, 3);
        let dismissed = store.transition(&id, None, 363_000.0).unwrap();
        deliver_due_sounds(&dismissed, &mut sounded, || {
            sounds += 1;
            true
        });
        assert_eq!(sounds, 3);
        assert_eq!(sounded.len(), 1);
    }

    #[test]
    fn failed_sound_delivery_remains_pending_for_retry() {
        let dir = Directory::new();
        let store = Reminders::open(dir.path());
        store.create(request(), 1000.0).unwrap();
        let due = store.due(61_000.0).unwrap().unwrap();
        let mut sounded = std::collections::HashSet::new();
        deliver_due_sounds(&due, &mut sounded, || false);
        assert!(sounded.is_empty());
        deliver_due_sounds(&due, &mut sounded, || true);
        assert_eq!(sounded.len(), 1);
        deliver_due_sounds(&due, &mut sounded, || panic!("Already played"));
    }

    #[test]
    #[ignore = "Plays the real Windows reminder sound; run explicitly"]
    fn live_windows_reminder_sound_request_succeeds() {
        crate::desktop::play_reminder_sound().expect("Windows rejected the reminder sound request");
        // Keep the test process alive until asynchronous playback completes.
        std::thread::sleep(std::time::Duration::from_millis(750));
    }
}
