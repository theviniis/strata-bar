//! Configuration defaults, native validation and the file-backed store.
//!
//! Schema version 2 lives in `config_contract.rs`. This module applies the same
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
/// Published JSON Schema for the hand-edited document. A remote URL keeps the
/// reference working from any machine without shipping a second copy next to
/// `config.json`; editors fetch it for completion and inline range errors.
pub const SCHEMA_URL: &str =
    "https://raw.githubusercontent.com/theviniis/strata-bar/main/config.schema.json";
const MIN_INTERVAL_MS: u32 = 1_000;
const MAX_INTERVAL_MS: u32 = 60_000;
const MIN_HEIGHT: u32 = 28;
const MAX_HEIGHT: u32 = 80;
const MAX_SPACING: f64 = 32.0;

/// Shared installation preset, also validated by the frontend Zod schema.
pub fn defaults() -> Config {
    parse(include_str!(
        "../../src/services/configuration/default.json"
    ))
    .expect("bundled default configuration must be valid")
}

/// Normalizes a `monitors` key for comparison: Windows device names arrive as
/// `\\.\\DISPLAY1`, and a hand-written document may omit the prefix or vary case.
pub fn normalize_monitor(key: &str) -> String {
    let trimmed = key.trim();
    trimmed
        .strip_prefix(r"\\.\")
        .unwrap_or(trimmed)
        .trim()
        .to_ascii_uppercase()
}

/// The document one window renders: the shared configuration with that
/// monitor's bar, membership, order and widget behavior overrides merged in.
/// Definitions stay global; each monitor independently arranges and shows them.
pub fn project(config: &Config, monitor: Option<&str>) -> Config {
    let mut projected = config.clone();
    let key = monitor.map(normalize_monitor);
    let over = key.and_then(|key| {
        config
            .monitors
            .iter()
            .find(|(name, _)| normalize_monitor(name) == key)
            .map(|(_, over)| over)
    });
    let layout = over
        .and_then(|o| o.layout.as_ref())
        .or(config.layout.as_ref());
    if let Some(layout) = layout {
        let definitions: BTreeMap<_, _> = config
            .widgets
            .left
            .iter()
            .chain(&config.widgets.center)
            .chain(&config.widgets.right)
            .map(|widget| (widget.id.as_str(), widget))
            .collect();
        let resolve = |ids: &[String]| {
            ids.iter()
                .filter_map(|id| definitions.get(id.as_str()).map(|w| (*w).clone()))
                .collect()
        };
        projected.widgets = WidgetSections {
            left: resolve(&layout.left),
            center: resolve(&layout.center),
            right: resolve(&layout.right),
        };
    }
    let Some(over) = over else {
        return projected;
    };
    if let Some(enabled) = over.enabled {
        projected.bar.enabled = enabled;
    }
    if let Some(value) = &over.position {
        projected.bar.position = value.clone();
    }
    if let Some(value) = over.height {
        projected.bar.height = value;
    }
    if let Some(value) = over.corner_radius {
        projected.bar.corner_radius = Some(value);
    }
    if let Some(value) = over.spacing {
        projected.bar.spacing = value;
    }
    if let Some(value) = &over.color_theme {
        projected.bar.color_theme = value.clone();
    }
    if let Some(value) = &over.theme {
        projected.bar.theme = value.clone();
    }
    if let Some(overrides) = &over.widgets {
        for widget in projected
            .widgets
            .left
            .iter_mut()
            .chain(&mut projected.widgets.center)
            .chain(&mut projected.widgets.right)
        {
            if let Some(value) = overrides.get(&widget.id) {
                if let Some(source) = &value.workspace_source { widget.workspace_source = Some(source.clone()); }
                if let Some(enabled) = value.enabled {
                    widget.enabled = enabled;
                }
                if let Some(interval) = value.interval_ms {
                    widget.interval_ms = interval;
                }
                if let Some(format) = &value.format {
                    widget.format = format.clone();
                }
                if let Some(tooltip) = value.tooltip {
                    widget.tooltip = tooltip;
                }
                if let Some(margin) = value.margin_x {
                    widget.margin_x = Some(margin);
                }
            }
        }
    }
    projected
}

/// One monitor's projection of a snapshot, carrying the revision and any
/// rejection reason unchanged so every window reports the same document state.
pub fn project_snapshot(snapshot: &ConfigSnapshot, monitor: Option<&str>) -> ConfigSnapshot {
    let mut config = project(&snapshot.config, monitor);
    // A bar receives a render document, never a catalog with references to absent widgets.
    config.layout = None;
    config.monitors.clear();
    ConfigSnapshot {
        revision: snapshot.revision,
        config,
        error: snapshot.error.clone(),
    }
}

fn validate_bar(bar: &BarConfig) -> Result<(), String> {
    validate_corner_radius(bar.corner_radius)?;
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

fn validate_corner_radius(radius: Option<f64>) -> Result<(), String> {
    if radius.is_some_and(|value| !value.is_finite() || !(0.0..=40.0).contains(&value)) {
        return Err("Corner radius must be between 0 and 40".into());
    }
    Ok(())
}

/// Re-validates a parsed document. `serde` already enforced structure, enums and
/// required fields; this checks the ranges, uniqueness and cross-field rules the
/// frontend schema also enforces.
pub fn validate(config: &Config) -> Result<(), String> {
    if config
        .bar
        .separator_margin_x
        .is_some_and(|margin| !margin.is_finite() || !(0.0..=32.0).contains(&margin))
    {
        return Err("Separator margin must be between 0 and 32 px".into());
    }
    if config.version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported config version {} (expected {SCHEMA_VERSION})",
            config.version
        ));
    }
    for channel in [&config.audio.output, &config.audio.input] {
        if u32::from(channel.target_index) > crate::voicemeeter::MAX_INDEX {
            return Err("Audio targetIndex must be between 0 and 7".into());
        }
    }
    if let Some(weather) = &config.weather { weather.validate()?; }
    validate_bar(&config.bar)?;
    let mut monitors = std::collections::HashSet::new();
    let ids: std::collections::HashSet<_> = config
        .widgets
        .left
        .iter()
        .chain(&config.widgets.center)
        .chain(&config.widgets.right)
        .map(|w| w.id.as_str())
        .collect();
    let check_layout = |layout: &WidgetLayout| -> Result<(), String> {
        let mut seen = std::collections::HashSet::new();
        for id in layout
            .left
            .iter()
            .chain(&layout.center)
            .chain(&layout.right)
        {
            if !ids.contains(id.as_str()) {
                return Err(format!("Layout references unknown widget {id}"));
            }
            if !seen.insert(id) {
                return Err(format!("Layout repeats widget {id}"));
            }
        }
        Ok(())
    };
    if let Some(layout) = &config.layout {
        check_layout(layout)?;
    }
    for over in config.monitors.values() {
        if let Some(layout) = &over.layout {
            check_layout(layout)?;
        }
    }
    for (monitor, over) in &config.monitors {
        let normalized = normalize_monitor(monitor);
        if normalized.is_empty() {
            return Err("Monitor name must not be empty".into());
        }
        if !monitors.insert(normalized) {
            return Err(format!("Monitor {monitor} duplicates another monitor name"));
        }
        if let Some(height) = over.height {
            if !(MIN_HEIGHT..=MAX_HEIGHT).contains(&height) {
                return Err(format!("Monitor {monitor} bar height is out of range"));
            }
        }
        validate_corner_radius(over.corner_radius)?;
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
        if widget
            .margin_x
            .is_some_and(|margin| !margin.is_finite() || !(0.0..=32.0).contains(&margin))
        {
            return Err(format!(
                "Widget {} marginX must be between 0 and 32 px",
                widget.id
            ));
        }
    }
    for (monitor, over) in &config.monitors {
        if let Some(widgets) = &over.widgets {
            for id in widgets.keys() {
                if !ids.contains(id) {
                    return Err(format!("Monitor {monitor} references unknown widget {id}"));
                }
            }
            let mut all = config.clone();
            all.layout = None;
            for over in all.monitors.values_mut() {
                over.layout = None;
            }
            let mut projected = project(&all, Some(monitor));
            projected.monitors.clear();
            projected.layout = None;
            validate(&projected).map_err(|error| format!("Monitor {monitor}: {error}"))?;
        }
    }
    Ok(())
}

/// Parses a JSON document, applying schema defaults before validation.
pub fn parse(text: &str) -> Result<Config, String> {
    let mut value: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("Invalid config: {e}"))?;
    if value.get("version").and_then(|v| v.as_u64()) == Some(1) {
        value["version"] = serde_json::json!(2);
        value["audio"] = serde_json::json!({"output": {"source": "windows", "targetIndex": 0}, "input": {"source": "windows", "targetIndex": 0}});
        if let Some(sections) = value.get_mut("widgets").and_then(|v| v.as_object_mut()) {
            for section in sections.values_mut() {
                if let Some(widgets) = section.as_array_mut() {
                    for widget in widgets {
                        if let Some(widget) = widget.as_object_mut() {
                            widget.remove("audio");
                        }
                    }
                }
            }
        }
        if let Some(monitors) = value.get_mut("monitors").and_then(|v| v.as_object_mut()) {
            for monitor in monitors.values_mut() {
                if let Some(widgets) = monitor.get_mut("widgets").and_then(|v| v.as_object_mut()) {
                    for widget in widgets.values_mut() {
                        if let Some(widget) = widget.as_object_mut() {
                            widget.remove("audio");
                        }
                    }
                }
            }
        }
    }
    let config: Config =
        serde_json::from_value(value).map_err(|e| format!("Invalid config: {e}"))?;
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

/// Publishes one projection per window: each bar renders its own monitor's
/// overrides, while surfaces that are not mounted on a monitor (the overlay)
/// render the shared document. Sending one payload to every window would make a
/// secondary-monitor bar obey the primary monitor's overrides.
///
/// `emit` is a broadcast in Tauri 2: `Manager::emit` forwards the payload to
/// every webview, so calling it once per window would deliver every monitor's
/// projection to every bar and the last one would win. `emit_to` addresses a
/// single window, which is what a per-monitor projection requires.
pub fn publish(app: &AppHandle, snapshot: &ConfigSnapshot) {
    if let Some(weather) = app.try_state::<crate::weather::Weather>() {
        weather.configure(snapshot.config.weather.clone().unwrap_or_default());
    }
    let app = app.clone();
    let snapshot = snapshot.clone();
    std::thread::spawn(move || {
        if let Err(error) = crate::desktop::reconcile(&app) {
            eprintln!("Config reconcile: {error}");
        }
        let current = app.state::<ConfigStore>().snapshot().unwrap_or(snapshot);
        publish_windows(&app, &current);
    });
}

/// Include global audio so a route-only edit is never deduplicated away.
fn bar_render_state(snapshot: &ConfigSnapshot) -> serde_json::Value {
    serde_json::json!({"bar": snapshot.config.bar, "widgets": snapshot.config.widgets, "agents": snapshot.config.agents, "audio": snapshot.config.audio, "weather": snapshot.config.weather, "error": snapshot.error})
}

fn publish_windows(app: &AppHandle, snapshot: &ConfigSnapshot) {
    static SENT: std::sync::LazyLock<Mutex<BTreeMap<String, serde_json::Value>>> =
        std::sync::LazyLock::new(|| Mutex::new(BTreeMap::new()));
    let windows = app.webview_windows();
    SENT.lock()
        .unwrap()
        .retain(|label, _| windows.contains_key(label));
    for (label, window) in app.webview_windows() {
        if !accepts_config(&label) {
            continue;
        }
        let projected = if label.starts_with("bar-") {
            project_snapshot(snapshot, crate::desktop::monitor_name(&window).as_deref())
        } else {
            snapshot.clone()
        };
        let payload = serde_json::to_value(&projected).expect("Config snapshot serializes");
        if label.starts_with("bar-") {
            let rendered = bar_render_state(&projected);
            if SENT
                .lock()
                .unwrap()
                .insert(label.clone(), rendered.clone())
                .as_ref()
                == Some(&rendered)
            {
                continue;
            }
        }
        if let Err(e) = window.emit_to(&label, EVENT, payload) {
            eprintln!("Emit config to {label}: {e}");
        }
    }
}

/// The snapshot a caller renders: a bar gets its monitor's projection, every
/// other surface gets the shared document.
pub fn snapshot_for(
    store: &ConfigStore,
    window: &tauri::WebviewWindow,
) -> Result<ConfigSnapshot, String> {
    let snapshot = store.snapshot()?;
    if !window.label().starts_with("bar-") {
        return Ok(snapshot);
    }
    Ok(project_snapshot(
        &snapshot,
        crate::desktop::monitor_name(window).as_deref(),
    ))
}

/// Only surfaces that render configuration consume the event: the bars (each
/// with its monitor's projection), the overlay, and the settings window, whose
/// draft must follow external edits so Apply never silently reverts them.
fn accepts_config(label: &str) -> bool {
    label.starts_with("bar-")
        || label == crate::desktop::OVERLAY
        || label == crate::desktop::SETTINGS
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
    #[test]
    fn color_palettes_default_validate_project_and_survive_restart() {
        let directory = Directory::new();
        let store = ConfigStore::open(directory.path());
        let mut value = serde_json::to_value(defaults()).unwrap();
        value["bar"].as_object_mut().unwrap().remove("colorTheme");
        assert_eq!(
            parse(&value.to_string()).unwrap().bar.color_theme,
            ColorTheme::Current
        );
        for name in ["current", "amoled", "nord", "dracula", "catppuccin"] {
            value["bar"]["colorTheme"] = serde_json::json!(name);
            value["monitors"] =
                serde_json::json!({"DISPLAY2": {"colorTheme": "catppuccin", "theme": "light"}});
            let parsed = parse(&value.to_string()).unwrap();
            store.save(parsed.clone()).unwrap();
            let restored = ConfigStore::open(directory.path())
                .snapshot()
                .unwrap()
                .config;
            assert_eq!(restored, parsed);
            let secondary = project(&restored, Some(r"\\.\DISPLAY2"));
            assert_eq!(secondary.bar.color_theme, ColorTheme::Catppuccin);
            assert_eq!(secondary.bar.theme, BarTheme::Light);
            assert_eq!(
                project(&restored, Some("DISPLAY1")).bar.color_theme,
                parsed.bar.color_theme
            );
        }
        value["bar"]["colorTheme"] = serde_json::json!("unknown");
        assert!(parse(&value.to_string()).is_err());
        value["bar"]["colorTheme"] = serde_json::json!("current");
        value["monitors"]["DISPLAY2"]["colorTheme"] = serde_json::json!("unknown");
        assert!(parse(&value.to_string()).is_err());
    }

    #[test]
    fn monitor_layout_and_disabled_bar_survive_save_and_restart() {
        let directory = Directory::new();
        let store = ConfigStore::open(directory.path());
        let mut value = serde_json::to_value(defaults()).unwrap();
        value["monitors"] = serde_json::json!({"DISPLAY2": {
            "enabled": false,
            "layout": {"left": ["cpu"], "center": [], "right": []},
            "widgets": {"cpu": {"tooltip": false}}
        }});
        store.save(parse(&value.to_string()).unwrap()).unwrap();
        let restored = ConfigStore::open(directory.path()).snapshot().unwrap();
        let secondary = serde_json::to_value(project(&restored.config, Some("DISPLAY2"))).unwrap();
        assert_eq!(secondary["bar"]["enabled"], false);
        assert_eq!(secondary["widgets"]["left"][0]["id"], "cpu");
        assert_eq!(secondary["widgets"]["left"][0]["tooltip"], false);
        assert_eq!(secondary["widgets"]["right"], serde_json::json!([]));
        assert_eq!(
            project(&restored.config, Some("DISPLAY1")).widgets,
            defaults().widgets
        );
    }
    #[test]
    fn invalid_layouts_and_hidden_widget_settings_never_replace_the_saved_document() {
        let directory = Directory::new();
        let store = ConfigStore::open(directory.path());
        let original = store.snapshot().unwrap().config;
        for layout in [
            serde_json::json!({"left":["missing"],"center":[],"right":[]}),
            serde_json::json!({"left":["cpu"],"center":["cpu"],"right":[]}),
        ] {
            let mut value = serde_json::to_value(&original).unwrap();
            value["monitors"]["DISPLAY2"] = serde_json::json!({"layout":layout});
            assert!(parse(&value.to_string()).is_err());
        }
        let mut value = serde_json::to_value(&original).unwrap();
        value["monitors"]["DISPLAY2"] = serde_json::json!({"layout":{"left":[],"center":[],"right":[]},"widgets":{"cpu":{"intervalMs":999}}});
        assert!(parse(&value.to_string()).is_err());
        assert_eq!(store.snapshot().unwrap().config, original);
    }

    #[test]
    fn stable_monitor_settings_survive_ordinal_changes_and_legacy_migration_is_idempotent() {
        let directory = Directory::new();
        let store = ConfigStore::open(directory.path());
        let mut value = serde_json::to_value(defaults()).unwrap();
        value["monitors"] = serde_json::json!({"DISPLAY2":{"enabled":false,"widgets":{"cpu":{"intervalMs":8000}}},"offline":{"height":48}});
        let mut config = parse(&value.to_string()).unwrap();
        let monitor = |device: &str| SettingsMonitor {
            id: "hardware-b".into(),
            device_name: device.into(),
            name: "Panel".into(),
            width: 1920,
            height: 1080,
            primary: false,
        };
        assert!(crate::monitors::migrate(
            &mut config,
            &[monitor("DISPLAY2")]
        ));
        assert!(!crate::monitors::migrate(
            &mut config,
            &[monitor("DISPLAY1")]
        ));
        store.save(config).unwrap();
        let restored = ConfigStore::open(directory.path()).snapshot().unwrap();
        assert!(!project(&restored.config, Some("hardware-b")).bar.enabled);
        assert_eq!(
            project(&restored.config, Some("hardware-b")).widgets.center[0].interval_ms,
            8000
        );
        assert_eq!(restored.config.monitors["offline"].height, Some(48));
        let mut ambiguous = restored.config.clone();
        ambiguous
            .monitors
            .insert("DISPLAY2".into(), BarOverride::default());
        assert!(!crate::monitors::migrate(
            &mut ambiguous,
            &[monitor("DISPLAY2")]
        ));
        assert!(ambiguous.monitors.contains_key("DISPLAY2"));
    }
    #[test]
    fn saved_widget_overrides_project_only_to_the_matching_monitor_and_reject_invalid_edits() {
        let directory = Directory::new();
        let store = ConfigStore::open(directory.path());
        let mut value = serde_json::to_value(defaults()).unwrap();
        value["monitors"] = serde_json::json!({"DISPLAY2": {"widgets": {"cpu": {"enabled": false, "intervalMs": 8000, "format": "compact", "tooltip": false}}}});
        let config = parse(&value.to_string()).unwrap();
        let saved = store.save(config).unwrap();
        let secondary = project_snapshot(&saved, Some(r"\\.\DISPLAY2"));
        let cpu = secondary
            .config
            .widgets
            .center
            .iter()
            .find(|w| w.id == "cpu")
            .unwrap();
        assert!(!cpu.enabled);
        assert_eq!(cpu.interval_ms, 8000);
        assert_eq!(cpu.format, WidgetFormat::Compact);
        assert!(!cpu.tooltip);
        assert_eq!(
            project(&saved.config, Some("DISPLAY1")).widgets,
            defaults().widgets
        );
        value["monitors"]["DISPLAY2"]["widgets"]["cpu"]["intervalMs"] = serde_json::json!(999);
        assert!(parse(&value.to_string()).is_err());
        assert_eq!(store.snapshot().unwrap().config, saved.config);
    }

    #[test]
    fn save_rejects_duplicate_monitor_aliases_without_mutating_the_document() {
        let directory = Directory::new();
        let store = ConfigStore::open(directory.path());
        let before = store.snapshot().unwrap();
        let mut value = serde_json::to_value(defaults()).unwrap();
        value["monitors"] = serde_json::json!({
            "DISPLAY2": {"widgets": {"cpu": {"intervalMs": 2000}}},
            "display2": {"widgets": {"cpu": {"intervalMs": 999}}}
        });
        let invalid: Config = serde_json::from_value(value).unwrap();
        assert!(store.save(invalid).is_err());
        assert_eq!(store.snapshot().unwrap(), before);
        assert_eq!(
            parse(&fs::read_to_string(directory.path()).unwrap()).unwrap(),
            before.config
        );
    }

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
    fn audio_only_edits_change_the_bar_publication_state() {
        let mut snapshot = ConfigSnapshot {
            revision: 1,
            config: defaults(),
            error: None,
        };
        let before = bar_render_state(&snapshot);
        snapshot.config.audio.input.source = AudioSource::Voicemeeter;
        assert_ne!(bar_render_state(&snapshot), before);
    }

    #[test]
    fn global_audio_validates_and_survives_projection_and_restart() {
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        let before = fs::read(dir.path()).unwrap();
        let mut config = defaults();
        config.audio.output = AudioChannelConfig {
            source: AudioSource::Voicemeeter,
            target_index: 8,
        };
        assert!(store.save(config.clone()).is_err());
        assert_eq!(fs::read(dir.path()).unwrap(), before);
        config.audio.output.target_index = 7;
        config.audio.input = AudioChannelConfig {
            source: AudioSource::Voicemeeter,
            target_index: 2,
        };
        store.save(config.clone()).unwrap();
        assert_eq!(project(&config, Some("DISPLAY2")).audio, config.audio);
        assert_eq!(
            ConfigStore::open(dir.path())
                .snapshot()
                .unwrap()
                .config
                .audio,
            config.audio
        );
    }

    #[test]
    fn legacy_audio_migrates_on_read_without_writing_the_file() {
        let dir = Directory::new();
        let mut legacy = serde_json::to_value(defaults()).unwrap();
        legacy["version"] = serde_json::json!(1);
        legacy.as_object_mut().unwrap().remove("audio");
        legacy["widgets"]["right"][2]["audio"] = serde_json::json!({"source":"voicemeeter","target":{"kind":"strip","index":3},"label":"old","enabled":false});
        legacy["monitors"] = serde_json::json!({"DISPLAY2":{"widgets":{"volume":{"audio":{"source":"voicemeeter","target":{"kind":"bus","index":7}},"tooltip":false}}}});
        let text = legacy.to_string();
        fs::create_dir_all(dir.path().parent().unwrap()).unwrap();
        fs::write(dir.path(), &text).unwrap();
        let store = ConfigStore::open(dir.path());
        let migrated = store.snapshot().unwrap();
        assert!(migrated.error.is_none());
        assert_eq!(migrated.config.version, 2);
        assert_eq!(migrated.config.audio, AudioConfig::default());
        assert_eq!(
            migrated.config.monitors["DISPLAY2"]
                .widgets
                .as_ref()
                .unwrap()["volume"]
                .tooltip,
            Some(false)
        );
        assert_eq!(fs::read_to_string(dir.path()).unwrap(), text);
        store.save(migrated.config).unwrap();
        let saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(dir.path()).unwrap()).unwrap();
        assert_eq!(saved["version"], 2);
        assert!(saved["widgets"]["right"][2].get("audio").is_none());
    }

    #[test]
    fn version_two_rejects_legacy_audio_fields() {
        for field in ["label", "enabled", "kind", "target"] {
            let mut value = serde_json::to_value(defaults()).unwrap();
            value["audio"]["output"][field] = serde_json::json!("legacy");
            assert!(parse(&value.to_string()).is_err(), "accepted {field}");
        }
        let mut value = serde_json::to_value(defaults()).unwrap();
        value["widgets"]["right"][2]["audio"] = serde_json::json!({"source":"windows"});
        assert!(parse(&value.to_string()).is_err());
        value["widgets"]["right"][2]
            .as_object_mut()
            .unwrap()
            .remove("audio");
        value["monitors"] =
            serde_json::json!({"DISPLAY2":{"widgets":{"volume":{"audio":{"source":"windows"}}}}});
        assert!(parse(&value.to_string()).is_err());
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
            margin_x: None,
            workspace_source: None,
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
        assert_eq!(config.bar.theme, BarTheme::System);
        assert_eq!(config.widgets.center[0].interval_ms, 2_000);
        assert_eq!(config.widgets.center[0].format, WidgetFormat::Label);
        assert!(config.widgets.center[0].tooltip);
        assert!(config.widgets.center[0].enabled);
        assert!(config.agents.visible.codex);
        assert!(config.monitors.is_empty());
    }

    #[test]
    fn the_schema_pointer_is_preserved_across_a_parse() {
        // A hand-edited document carries `$schema` for editor completion. It must
        // survive parsing and a save, or the first write drops the author's
        // pointer and their editor silently stops validating.
        let mut value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&defaults()).unwrap()).unwrap();
        assert_eq!(value["$schema"], serde_json::json!(SCHEMA_URL));
        value["$schema"] = serde_json::json!("https://example.test/config.json");
        let config = parse(&value.to_string()).unwrap();
        assert_eq!(
            config.schema.as_deref(),
            Some("https://example.test/config.json")
        );
        // Round-trips back out under the JSON name, not the Rust field name.
        let saved: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&config).unwrap()).unwrap();
        assert_eq!(
            saved["$schema"],
            serde_json::json!("https://example.test/config.json")
        );
        assert!(saved.get("schema").is_none());
    }

    #[test]
    fn a_document_without_the_schema_pointer_still_parses() {
        // Documents written before the pointer existed stay readable.
        let mut value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&defaults()).unwrap()).unwrap();
        value.as_object_mut().unwrap().remove("$schema");
        let config = parse(&value.to_string()).unwrap();
        assert!(config.schema.is_none());
        // And a save does not invent one, so an omitted pointer stays omitted.
        let saved: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&config).unwrap()).unwrap();
        assert!(saved.get("$schema").is_none());
    }

    #[test]
    fn unknown_versions_and_fields_are_rejected() {
        let mut value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&defaults()).unwrap()).unwrap();
        value["version"] = serde_json::json!(3);
        assert!(parse(&value.to_string()).unwrap_err().contains("version"));
        value["version"] = serde_json::json!(1);
        value["bar"]["height"] = serde_json::json!(12);
        assert!(parse(&value.to_string()).unwrap_err().contains("height"));
        value["bar"]["height"] = serde_json::json!(36);
        value["widgets"]["right"] = serde_json::json!([{ "id": "a", "type": "nonsense" }]);
        assert!(parse(&value.to_string()).is_err());
    }

    #[test]
    fn monitor_keys_normalize_device_names() {
        assert_eq!(normalize_monitor(r"\\.\DISPLAY2"), "DISPLAY2");
        assert_eq!(normalize_monitor("display2"), "DISPLAY2");
        assert_eq!(normalize_monitor("  DISPLAY2  "), "DISPLAY2");
    }

    #[test]
    fn projection_merges_only_that_monitors_overrides() {
        let mut config = defaults();
        config.monitors.insert(
            "DISPLAY2".into(),
            BarOverride {
                theme: Some(BarTheme::Light),
                spacing: Some(4.0),
                ..Default::default()
            },
        );
        config.monitors.insert(
            "DISPLAY1".into(),
            BarOverride {
                theme: Some(BarTheme::Dark),
                spacing: Some(16.0),
                ..Default::default()
            },
        );
        let secondary = project(&config, Some(r"\\.\DISPLAY2"));
        assert_eq!(secondary.bar.theme, BarTheme::Light);
        assert_eq!(secondary.bar.spacing, 4.0);
        // Untouched fields keep the shared value.
        assert_eq!(secondary.bar.height, config.bar.height);
        assert_eq!(secondary.bar.position, config.bar.position);

        let primary = project(&config, Some("display1"));
        assert_eq!(primary.bar.theme, BarTheme::Dark);
        assert_eq!(primary.bar.spacing, 16.0);
        assert_eq!(
            secondary.bar.spacing, 4.0,
            "monitors never share a projection"
        );
    }

    #[test]
    fn a_monitor_without_overrides_renders_the_shared_document() {
        let mut config = defaults();
        config.monitors.insert(
            "DISPLAY1".into(),
            BarOverride {
                spacing: Some(20.0),
                ..Default::default()
            },
        );
        assert_eq!(project(&config, Some("DISPLAY3")), config);
        assert_eq!(project(&config, None), config);
    }

    #[test]
    fn projection_keeps_revision_widgets_and_error_source() {
        let mut config = defaults();
        config.monitors.insert(
            "DISPLAY2".into(),
            BarOverride {
                height: Some(48),
                ..Default::default()
            },
        );
        let snapshot = ConfigSnapshot {
            revision: 7,
            config,
            error: Some("Widget time interval must be between 1000 and 60000 ms".into()),
        };
        let projected = project_snapshot(&snapshot, Some("DISPLAY2"));
        assert_eq!(projected.revision, 7);
        assert_eq!(projected.error, snapshot.error);
        assert_eq!(projected.config.bar.height, 48);
        // Widget composition is global: a monitor override never edits widgets.
        assert_eq!(projected.config.widgets, snapshot.config.widgets);
    }

    #[test]
    fn the_settings_window_receives_the_shared_document() {
        // The editor's draft must follow external edits, or the next Apply
        // would silently overwrite a hand edit made while it was open. It is
        // not mounted on a monitor, so it never receives a projection.
        assert!(accepts_config(crate::desktop::SETTINGS));
        assert!(accepts_config("bar-1"));
        assert!(accepts_config(crate::desktop::OVERLAY));
        assert!(!accepts_config("studio"));
        assert!(!accepts_config("popup-check"));
    }
    #[test]
    fn separator_margins_validate_project_and_persist() {
        let mut config = defaults();
        config.widgets.center[0].r#type = WidgetKind::Separator;
        config.widgets.center[0].margin_x = Some(4.5);
        config.monitors.insert(
            "DISPLAY1".into(),
            BarOverride {
                widgets: Some(BTreeMap::from([(
                    "cpu".into(),
                    WidgetOverride {
                        margin_x: Some(20.0),
                        ..Default::default()
                    },
                )])),
                ..Default::default()
            },
        );
        validate(&config).unwrap();
        assert_eq!(
            project(&config, Some("DISPLAY1")).widgets.center[0].margin_x,
            Some(20.0)
        );
        let dir = Directory::new();
        let store = ConfigStore::open(dir.path());
        store.save(config.clone()).unwrap();
        assert_eq!(
            ConfigStore::open(dir.path()).snapshot().unwrap().config,
            config
        );
        for margin in [-1.0, 33.0, f64::NAN, f64::INFINITY] {
            let mut invalid = config.clone();
            invalid.widgets.center[0].margin_x = Some(margin);
            assert!(validate(&invalid).is_err());
            let mut invalid = config.clone();
            invalid
                .monitors
                .get_mut("DISPLAY1")
                .unwrap()
                .widgets
                .as_mut()
                .unwrap()
                .get_mut("cpu")
                .unwrap()
                .margin_x = Some(margin);
            assert!(validate(&invalid).is_err());
        }
    }
    #[test]
    fn shared_separator_margin_validates_and_reaches_every_monitor() {
        let mut config = defaults();
        config.bar.separator_margin_x = Some(12.5);
        config
            .monitors
            .insert("DISPLAY1".into(), BarOverride::default());
        validate(&config).unwrap();
        assert_eq!(
            project(&config, Some("DISPLAY1")).bar.separator_margin_x,
            Some(12.5)
        );
        assert_eq!(
            parse(&serde_json::to_string(&config).unwrap())
                .unwrap()
                .bar
                .separator_margin_x,
            Some(12.5)
        );
        for margin in [-1.0, 33.0, f64::NAN, f64::INFINITY] {
            config.bar.separator_margin_x = Some(margin);
            assert!(validate(&config).is_err());
        }
    }
}
