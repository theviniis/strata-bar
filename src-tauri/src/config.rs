//! Configuration defaults, native validation and the file-backed store.
//!
//! Schema version 1 lives in `config_contract.rs`. This module applies the same
//! defaults the frontend Zod schema applies, re-validates every write natively,
//! persists atomically (temp file + `MoveFileExW`) and watches the file so an
//! external edit republishes to every window. Rejections never mutate the stored
//! state or the file: callers see the error and keep what they had.
use crate::config_contract::*;
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT: &str = "config";
const FILE: &str = "config.json";
const MIN_INTERVAL_MS: u32 = 1_000;
const MAX_INTERVAL_MS: u32 = 60_000;
const MIN_HEIGHT: u32 = 28;
const MAX_HEIGHT: u32 = 80;
const MAX_SPACING: f64 = 32.0;

/// Every schema field with the default the Zod schema gives it.
pub fn defaults() -> Config {
    let widget = |id: &str, r#type: WidgetKind| WidgetConfig {
        id: id.into(),
        r#type,
        enabled: true,
        interval_ms: 2_000,
        format: WidgetFormat::Label,
        tooltip: true,
        audio: None,
    };
    let right = [
        ("cpu", WidgetKind::Cpu),
        ("memory", WidgetKind::Memory),
        ("gpu", WidgetKind::Gpu),
        ("disk", WidgetKind::Disk),
        ("network", WidgetKind::Network),
        ("music", WidgetKind::Music),
        ("volume", WidgetKind::Volume),
        ("microphone", WidgetKind::Microphone),
        ("reminders", WidgetKind::Reminders),
        ("agents", WidgetKind::Agents),
    ];
    Config {
        version: SCHEMA_VERSION,
        agents: AgentsConfig::default(),
        bar: BarConfig {
            position: BarPosition::Top,
            height: 36,
            spacing: 8.0,
            theme: BarTheme::Dark,
            always_on_top: true,
        },
        widgets: WidgetSections {
            left: vec![
                widget("workspaces", WidgetKind::Komorebi),
                widget("active", WidgetKind::ActiveWindow),
            ],
            center: vec![widget("time", WidgetKind::Clock)],
            right: right
                .into_iter()
                .map(|(id, kind)| widget(id, kind))
                .collect(),
        },
        monitors: BTreeMap::new(),
    }
}

fn validate_bar(bar: &BarConfig) -> Result<(), String> {
    if !(MIN_HEIGHT..=MAX_HEIGHT).contains(&bar.height) {
        return Err(format!(
            "Bar height must be between {MIN_HEIGHT} and {MAX_HEIGHT}"
        ));
    }
    if !bar.spacing.is_finite() || !(0.0..=MAX_SPACING).contains(&bar.spacing) {
        return Err(format!("Bar spacing must be between 0 and {MAX_SPACING}"));
    }
    Ok(())
}

/// Re-validates a parsed document. `serde` already enforced structure, enums and
/// required fields; this checks the ranges, uniqueness and cross-field rules the
/// frontend schema also enforces.
pub fn validate(config: &Config) -> Result<(), String> {
    if config.version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported config version {} (expected {SCHEMA_VERSION})",
            config.version
        ));
    }
    validate_bar(&config.bar)?;
    for (monitor, over) in &config.monitors {
        if let Some(height) = over.height {
            if !(MIN_HEIGHT..=MAX_HEIGHT).contains(&height) {
                return Err(format!("Monitor {monitor} bar height is out of range"));
            }
        }
        if let Some(spacing) = over.spacing {
            if !spacing.is_finite() || !(0.0..=MAX_SPACING).contains(&spacing) {
                return Err(format!("Monitor {monitor} bar spacing is out of range"));
            }
        }
    }
    let mut ids = std::collections::HashSet::new();
    for widget in config
        .widgets
        .left
        .iter()
        .chain(&config.widgets.center)
        .chain(&config.widgets.right)
    {
        if widget.id.is_empty() {
            return Err("Widget IDs must not be empty".into());
        }
        if !ids.insert(widget.id.clone()) {
            return Err(format!("Widget ID {} is duplicated", widget.id));
        }
        if !(MIN_INTERVAL_MS..=MAX_INTERVAL_MS).contains(&widget.interval_ms) {
            return Err(format!(
                "Widget {} interval must be between {MIN_INTERVAL_MS} and {MAX_INTERVAL_MS} ms",
                widget.id
            ));
        }
        if let Some(audio) = &widget.audio {
            if audio.source == AudioSource::Voicemeeter && audio.target.is_none() {
                return Err(format!(
                    "Widget {} needs an audio target when routed through Voicemeeter",
                    widget.id
                ));
            }
            if let Some(target) = &audio.target {
                if u32::from(target.index) > crate::voicemeeter::MAX_INDEX {
                    return Err(format!(
                        "Widget {} audio target index must be between 0 and {}",
                        widget.id,
                        crate::voicemeeter::MAX_INDEX
                    ));
                }
            }
        }
    }
    Ok(())
}

/// Parses a JSON document, applying schema defaults before validation.
pub fn parse(text: &str) -> Result<Config, String> {
    let config: Config = serde_json::from_str(text).map_err(|e| format!("Invalid config: {e}"))?;
    validate(&config)?;
    Ok(config)
}

#[derive(Clone)]
pub struct ConfigStore {
    path: PathBuf,
    state: Arc<Mutex<State>>,
}

struct State {
    revision: u64,
    /// The configuration every consumer renders. Kept across a rejected edit so
    /// bars never lose their content to a typo in the file.
    config: Config,
    /// Why the last edit was rejected, cleared by the next accepted document.
    error: Option<String>,
}

impl ConfigStore {
    /// Loads the file at `path` (missing means defaults). A corrupt file keeps
    /// the defaults and reports the reason instead of failing to open.
    pub fn open(path: PathBuf) -> Self {
        let (config, error) = match fs::read_to_string(&path) {
            Ok(text) => match parse(&text) {
                Ok(config) => (config, None),
                Err(error) => (defaults(), Some(error)),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (defaults(), None),
            Err(e) => (defaults(), Some(format!("Cannot read config: {e}"))),
        };
        // A first launch has no file yet; write the document so it exists for
        // hand edits and for the watcher. Never overwrite a file that exists:
        // the writer of a corrupt file gets to fix it.
        if error.is_none() && !path.exists() {
            let _ = persist(&path, &config);
        }
        if let Some(problem) = &error {
            eprintln!("Config: {problem}");
        }
        Self {
            path,
            state: Arc::new(Mutex::new(State {
                revision: 0,
                config,
                error,
            })),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Returns the current snapshot: always a configuration to render, plus the
    /// reason the last edit was rejected when there is one.
    pub fn snapshot(&self) -> Result<ConfigSnapshot, String> {
        let state = self.state.lock().map_err(|e| e.to_string())?;
        Ok(ConfigSnapshot {
            revision: state.revision,
            config: state.config.clone(),
            error: state.error.clone(),
        })
    }

    /// Validates and persists `config`. The in-memory state only moves on when
    /// the write succeeded, so a failed save leaves both untouched.
    pub fn save(&self, config: Config) -> Result<ConfigSnapshot, String> {
        validate(&config)?;
        persist(&self.path, &config)?;
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        state.revision = state.revision.checked_add(1).ok_or("Revision exhausted")?;
        state.config = config.clone();
        state.error = None;
        Ok(ConfigSnapshot {
            revision: state.revision,
            config,
            error: None,
        })
    }

    /// Re-reads the file after an external edit. An unreadable or invalid file
    /// keeps the previous configuration in place and reports why; the next valid
    /// document clears the error.
    pub fn reload(&self) -> ConfigSnapshot {
        let current = match fs::read_to_string(&self.path) {
            Ok(text) => parse(&text),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(defaults()),
            Err(e) => Err(format!("Cannot read config: {e}")),
        };
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match current {
            Ok(config) => {
                state.revision = state.revision.saturating_add(1);
                state.config = config.clone();
                state.error = None;
                ConfigSnapshot {
                    revision: state.revision,
                    config,
                    error: None,
                }
            }
            Err(error) => {
                // Keep the configuration consumers already render; only the
                // error changes. Revision stays put: nothing was applied.
                state.error = Some(error.clone());
                ConfigSnapshot {
                    revision: state.revision,
                    config: state.config.clone(),
                    error: Some(error),
                }
            }
        }
    }
}

fn persist(path: &Path, config: &Config) -> Result<(), String> {
    let write = || -> Result<(), Box<dyn std::error::Error>> {
        fs::create_dir_all(path.parent().ok_or("Missing config directory")?)?;
        let temporary = path.with_extension("json.tmp");
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(config)?)?;
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
            let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            if let Err(e) = unsafe {
                MoveFileExW(
                    PCWSTR(from.as_ptr()),
                    PCWSTR(to.as_ptr()),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                )
            } {
                // A failed replace must not leave the half-written document
                // behind as though it were the next save's candidate.
                let _ = fs::remove_file(&temporary);
                return Err(e.into());
            }
        }
        #[cfg(not(windows))]
        {
            if let Err(e) = fs::rename(&temporary, path) {
                let _ = fs::remove_file(&temporary);
                return Err(e.into());
            }
        }
        Ok(())
    };
    write().map_err(|e| format!("Cannot save config: {e}"))
}

/// Resolves the configuration file the running app would use, for `--probe`.
pub fn probe(context: &tauri::Context) -> serde_json::Value {
    let identifier = &context.config().identifier;
    let Some(dir) = std::env::var_os("APPDATA")
        .map(|roaming| std::path::PathBuf::from(roaming).join(identifier))
    else {
        return serde_json::json!({"loaded": false, "error": "Cannot resolve app config dir"});
    };
    report(&ConfigStore::open(dir.join(FILE)))
}

/// What both `--probe` and the `diagnostics` command report about the store.
fn report(store: &ConfigStore) -> serde_json::Value {
    match store.snapshot() {
        Ok(snapshot) => serde_json::json!({
            "loaded": true,
            "path": store.path().display().to_string(),
            "revision": snapshot.revision,
            "error": snapshot.error,
            "widgets": snapshot.config.widgets.left.len()
                + snapshot.config.widgets.center.len()
                + snapshot.config.widgets.right.len(),
        }),
        Err(e) => {
            serde_json::json!({"loaded": false, "path": store.path().display().to_string(), "error": e})
        }
    }
}

/// What the `diagnostics` command reports: where the document lives, which
/// revision is loaded and whether the last load was rejected.
pub fn diagnostics(app: &AppHandle) -> serde_json::Value {
    match app.try_state::<ConfigStore>() {
        Some(store) => report(&store),
        None => serde_json::json!({"loaded": false}),
    }
}

/// Re-reads the file in response to a watch event and republishes only when the
/// document actually changed. A save already published its own snapshot, so the
/// watcher must not emit a duplicate revision for it.
pub fn apply_external_change(app: &AppHandle) {
    let Some(store) = app.try_state::<ConfigStore>() else {
        return;
    };
    let before = store.snapshot().ok();
    let snapshot = store.reload();
    if let Some(error) = &snapshot.error {
        eprintln!("Config: {error}");
    }
    let unchanged = before
        .as_ref()
        .is_some_and(|b| b.config == snapshot.config && b.error == snapshot.error);
    if !unchanged {
        publish(app, &snapshot);
    }
}

pub fn publish(app: &AppHandle, snapshot: &ConfigSnapshot) {
    let payload = serde_json::to_value(snapshot).expect("Config snapshot serializes");
    for (label, window) in app.webview_windows() {
        if !accepts_config(&label) {
            continue;
        }
        if let Err(e) = window.emit(EVENT, payload.clone()) {
            eprintln!("Emit config to {label}: {e}");
        }
    }
}

/// Only surfaces that render configuration consume the event. The settings
/// window joins this set when ticket 05 adds it to the event capability.
fn accepts_config(label: &str) -> bool {
    label.starts_with("bar-") || label == crate::desktop::OVERLAY
}

pub fn open_store(app: &AppHandle) -> Result<ConfigStore, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(ConfigStore::open(dir.join(FILE)))
}

/// Watches the configuration directory on a background thread for the lifetime
/// of the process. Edits are debounced by the channel timeout so one save is one
/// reload.
pub fn watch(app: AppHandle, store: &ConfigStore) -> Result<(), String> {
    use notify::{RecursiveMode, Watcher};
    let directory = store
        .path()
        .parent()
        .ok_or("Missing config directory")?
        .to_path_buf();
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let (tx, rx) = channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = tx.send(event);
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&directory, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        // Keep the watcher alive for the thread's lifetime.
        let _watcher = watcher;
        run_loop(app, rx);
    });
    Ok(())
}

fn run_loop(app: AppHandle, rx: Receiver<notify::Result<notify::Event>>) {
    loop {
        match rx.recv_timeout(Duration::from_secs(60)) {
            Ok(Ok(_event)) => {
                // Coalesce bursts (editors write temp files, then rename).
                while rx.recv_timeout(Duration::from_millis(200)).is_ok() {}
                apply_external_change(&app);
            }
            Ok(Err(e)) => eprintln!("Config watch: {e}"),
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            Self(
                std::env::temp_dir().join(format!("strata-config-{:032x}", rand::random::<u128>())),
            )
        }
        fn path(&self) -> PathBuf {
            self.0.join(FILE)
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn defaults_validate_and_round_trip_through_the_file() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let saved = store.save(defaults()).unwrap();
        assert_eq!(saved.config, defaults());

        let reopened = ConfigStore::open(dir.path());
        let loaded = reopened.snapshot().unwrap();
        assert_eq!(loaded.config, defaults());
    }

    #[test]
    fn missing_file_loads_defaults_and_creates_the_document() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        assert_eq!(store.snapshot().unwrap().config, defaults());
        assert!(dir.path().exists(), "defaults are persisted for hand edits");
        assert!(!dir.path().with_extension("json.tmp").exists());
    }

    #[test]
    fn save_rejects_out_of_range_intervals_without_touching_the_file() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let before = fs::read(&dir.path()).unwrap();
        let mut invalid = defaults();
        invalid.widgets.center[0].interval_ms = 999;
        let error = store.save(invalid.clone()).unwrap_err();
        assert!(error.contains("interval"), "unexpected error: {error}");
        assert_eq!(fs::read(&dir.path()).unwrap(), before);
        assert_eq!(store.snapshot().unwrap().config, defaults());
        invalid.widgets.center[0].interval_ms = 60_001;
        assert!(store.save(invalid).is_err());
    }

    #[test]
    fn save_rejects_audio_targets_outside_the_engine_range() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let mut invalid = defaults();
        invalid.widgets.right[6].audio = Some(WidgetAudio {
            source: AudioSource::Voicemeeter,
            target: Some(AudioTarget {
                kind: AudioTargetKind::Strip,
                index: 8,
            }),
            label: None,
            enabled: None,
        });
        let error = store.save(invalid).unwrap_err();
        assert!(error.contains("index"), "unexpected error: {error}");

        let mut missing = defaults();
        missing.widgets.right[6].audio = Some(WidgetAudio {
            source: AudioSource::Voicemeeter,
            target: None,
            label: None,
            enabled: None,
        });
        assert!(store.save(missing).is_err(), "routed audio needs a target");

        let mut valid = defaults();
        valid.widgets.right[6].audio = Some(WidgetAudio {
            source: AudioSource::Voicemeeter,
            target: Some(AudioTarget {
                kind: AudioTargetKind::Bus,
                index: 7,
            }),
            label: Some("Headphones".into()),
            enabled: None,
        });
        assert!(store.save(valid).is_ok());
    }

    #[test]
    fn duplicate_widget_ids_are_rejected() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let mut invalid = defaults();
        invalid.widgets.center.push(WidgetConfig {
            id: "cpu".into(),
            r#type: WidgetKind::Cpu,
            enabled: true,
            interval_ms: 2_000,
            format: WidgetFormat::Label,
            tooltip: true,
            audio: None,
        });
        assert!(store.save(invalid).unwrap_err().contains("duplicated"));
    }

    #[test]
    fn atomic_write_replaces_the_document_without_leaving_a_temp_file() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let mut config = defaults();
        config.bar.spacing = 12.0;
        store.save(config.clone()).unwrap();
        assert!(!dir.path().with_extension("json.tmp").exists());
        assert_eq!(
            serde_json::from_str::<Config>(&fs::read_to_string(dir.path()).unwrap()).unwrap(),
            config
        );
    }

    #[test]
    fn corrupt_file_keeps_the_previous_configuration_and_reports_the_error() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let mut changed = defaults();
        changed.bar.spacing = 10.0;
        store.save(changed.clone()).unwrap();
        fs::write(dir.path(), "{ not json").unwrap();

        let snapshot = store.reload();
        assert!(snapshot
            .error
            .as_deref()
            .unwrap()
            .contains("Invalid config"));
        // The last known-good configuration is still what bars render; the
        // error travels beside it, never as a silent reset to defaults.
        assert_eq!(snapshot.config, changed);
        // A second rejected edit must not fall back to defaults either.
        fs::write(dir.path(), "[1,2,3]").unwrap();
        let second = store.reload();
        assert!(second.error.is_some());
        assert_eq!(second.config, changed);
        // The store keeps reporting that configuration to later callers.
        assert_eq!(store.snapshot().unwrap().config, changed);
        // A later valid save recovers and clears the error.
        store.save(changed).unwrap();
        assert_eq!(store.snapshot().unwrap().error, None);
    }

    #[test]
    fn corrupt_file_at_startup_keeps_defaults_and_reports_the_error() {
        let dir = Directory::new();
        fs::create_dir_all(&dir.0).unwrap();
        fs::write(dir.path(), "{ not json").unwrap();
        let store = ConfigStore::open(dir.path());
        let snapshot = store.snapshot().unwrap();
        assert_eq!(snapshot.config, defaults());
        assert!(snapshot.error.is_some());
        // Opening must not overwrite the file the user has to fix.
        assert_eq!(fs::read_to_string(dir.path()).unwrap(), "{ not json");
    }

    #[test]
    fn external_edit_is_picked_up_with_a_new_revision() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let before = store.snapshot().unwrap();
        let mut edited = before.config.clone();
        edited.widgets.left.reverse();
        fs::write(dir.path(), serde_json::to_vec(&edited).unwrap()).unwrap();

        let reloaded = store.reload();
        assert_eq!(reloaded.error, None);
        assert_eq!(reloaded.config, edited);
        assert_eq!(reloaded.revision, before.revision + 1);
    }

    #[test]
    fn watcher_observes_an_external_edit() {
        use notify::{RecursiveMode, Watcher};
        let dir = Directory::new();
        fs::create_dir_all(&dir.0).unwrap();
        let store = ConfigStore::open(dir.path());
        let before = store.snapshot().unwrap();
        let (tx, rx) = channel();
        let mut watcher = notify::recommended_watcher(move |event| {
            let _ = tx.send(event);
        })
        .unwrap();
        watcher.watch(&dir.0, RecursiveMode::NonRecursive).unwrap();

        let mut edited = before.config.clone();
        edited.widgets.center.clear();
        fs::write(dir.path(), serde_json::to_vec(&edited).unwrap()).unwrap();

        // Wait for the filesystem notification, then reload exactly as the app does.
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while std::time::Instant::now() < deadline {
            if rx.recv_timeout(Duration::from_millis(200)).is_ok() {
                let snapshot = store.reload();
                assert_eq!(snapshot.error, None);
                assert_eq!(snapshot.config.widgets.center.len(), 0);
                return;
            }
        }
        panic!("watch event did not arrive");
    }

    #[test]
    fn missing_file_after_a_delete_falls_back_to_defaults_on_reload() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let mut edited = defaults();
        edited.bar.spacing = 4.0;
        store.save(edited).unwrap();
        fs::remove_file(dir.path()).unwrap();
        // Deleting the file is an explicit reset, unlike a corrupt edit.
        let reloaded = store.reload();
        assert_eq!(reloaded.config, defaults());
        assert_eq!(reloaded.error, None);
    }

    #[test]
    fn schema_defaults_fill_every_omitted_optional_field() {
        let minimal = r#"{
            "version": 1,
            "bar": {},
            "widgets": {
                "left": [],
                "center": [{ "id": "time", "type": "clock" }],
                "right": []
            }
        }"#;
        let config = parse(minimal).unwrap();
        assert_eq!(config.version, SCHEMA_VERSION);
        assert_eq!(config.bar.height, 36);
        assert_eq!(config.bar.spacing, 8.0);
        assert_eq!(config.bar.theme, BarTheme::Dark);
        assert_eq!(config.widgets.center[0].interval_ms, 2_000);
        assert_eq!(config.widgets.center[0].format, WidgetFormat::Label);
        assert!(config.widgets.center[0].tooltip);
        assert!(config.widgets.center[0].enabled);
        assert!(config.agents.visible.codex);
        assert!(config.monitors.is_empty());
    }

    #[test]
    fn unknown_versions_and_fields_are_rejected() {
        let mut value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&defaults()).unwrap()).unwrap();
        value["version"] = serde_json::json!(2);
        assert!(parse(&value.to_string()).unwrap_err().contains("version"));
        value["version"] = serde_json::json!(1);
        value["bar"]["height"] = serde_json::json!(12);
        assert!(parse(&value.to_string()).unwrap_err().contains("height"));
        value["bar"]["height"] = serde_json::json!(36);
        value["widgets"]["right"] = serde_json::json!([{ "id": "a", "type": "nonsense" }]);
        assert!(parse(&value.to_string()).is_err());
    }
}
