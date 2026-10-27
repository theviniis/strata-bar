//! Voicemeeter Remote API client.
//!
//! The volume and microphone widgets can be routed through Voicemeeter (Banana,
//! Potato) instead of the default Windows endpoints. Strata talks to Voicemeeter
//! exclusively through the vendor's `VoicemeeterRemote64.dll`, loaded
//! dynamically so the rest of the bar keeps working on machines without a
//! Voicemeeter installation: routed channels simply publish `unavailable`.
//!
//! All calls happen on the metrics worker thread, matching the remote API's
//! thread-affinity expectations, and a lost Voicemeeter session (Voicemeeter
//! closed or restarted) re-logins on the next poll instead of disabling the
//! channel permanently.

use libloading::Library;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::{c_char, CString};
use std::fmt;

/// Widest supported index before the actual Voicemeeter application is known.
pub const MAX_INDEX: u32 = 7;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Strip,
    Bus,
}

impl Kind {
    const NAMES: [(&'static str, Kind); 2] = [("strip", Kind::Strip), ("bus", Kind::Bus)];

    fn binding(self) -> &'static str {
        match self {
            Kind::Strip => "Strip",
            Kind::Bus => "Bus",
        }
    }

    /// Input strips / output buses installed per Voicemeeter application type
    /// (`VBVMR_GetVoicemeeterType`: 1 Voicemeeter, 2 Banana, 3 Potato).
    fn count(self, application: i32) -> u32 {
        match application {
            1 => match self {
                Kind::Strip => 3,
                Kind::Bus => 2,
            },
            2 => 5,
            _ => 8,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Target {
    pub kind: Kind,
    pub index: u32,
}

/// Wire shape of `set_channel_source`'s `target` argument.
#[derive(Debug, Deserialize)]
pub struct TargetRequest {
    pub kind: String,
    pub index: u32,
}

impl Target {
    /// Validates and builds a routing target. Unknown kinds and out-of-range
    /// indices are rejected before anything reaches the worker.
    pub fn parse(kind: Option<&str>, index: Option<u32>) -> Option<Target> {
        let kind = Kind::NAMES
            .iter()
            .copied()
            .find(|(name, _)| Some(*name) == kind)
            .map(|(_, kind)| kind)?;
        let index = index?;
        if index > MAX_INDEX {
            return None;
        }
        Some(Target { kind, index })
    }

    pub fn gain_parameter(&self) -> String {
        format!("{}[{}].Gain", self.kind.binding(), self.index)
    }

    pub fn mute_parameter(&self) -> String {
        format!("{}[{}].Mute", self.kind.binding(), self.index)
    }

    pub fn within(&self, application: i32) -> bool {
        self.index < self.kind.count(application)
    }

    pub fn describe(&self) -> String {
        format!("{} {}", self.kind.binding(), self.index)
    }
}

/// Voicemeeter gain slider range. The widgets speak percent, the engine dB.
pub const MIN_DB: f32 = -60.0;
pub const MAX_DB: f32 = 12.0;

/// Linear 0-100% over the full slider range; out-of-range levels clamp.
pub fn level_to_db(level: f32) -> f32 {
    (MIN_DB + level.clamp(0.0, 100.0) / 100.0 * (MAX_DB - MIN_DB)).clamp(MIN_DB, MAX_DB)
}

pub fn db_to_level(db: f32) -> i32 {
    (((db - MIN_DB) / (MAX_DB - MIN_DB) * 100.0)
        .round()
        .clamp(0.0, 100.0)) as i32
}

pub trait RemoteApi: Send {
    fn login(&self) -> i32;
    fn logout(&self) -> i32;
    fn dirty(&self) -> i32;
    fn get_float(&self, parameter: &str) -> Result<f32, i32>;
    fn set_float(&self, parameter: &str, value: f32) -> Result<(), i32>;
    fn get_string(&self, parameter: &str) -> Result<String, i32>;
    fn application(&self) -> Result<i32, i32>;
}

const REMOTE_DLLS: [&str; 2] = [
    "C:\\Program Files (x86)\\VB\\Voicemeeter\\VoicemeeterRemote64.dll",
    "C:\\Program Files\\VB\\Voicemeeter\\VoicemeeterRemote64.dll",
];

/// Whether a Voicemeeter installation exposes the remote DLL (informs `capabilities`).
pub fn installed() -> bool {
    REMOTE_DLLS
        .iter()
        .any(|path| std::fs::metadata(path).is_ok())
}

pub struct RemoteDll {
    library: Library,
}

impl RemoteDll {
    pub fn open() -> Option<Self> {
        REMOTE_DLLS.iter().find_map(|path| unsafe {
            let library = Library::new(path).ok()?;
            Some(Self { library })
        })
    }

    fn void_call(&self, name: &[u8]) -> i32 {
        unsafe {
            match self.library.get::<unsafe extern "C" fn() -> i32>(name) {
                Ok(function) => (*function)(),
                Err(_) => -1,
            }
        }
    }
}

impl RemoteApi for RemoteDll {
    fn login(&self) -> i32 {
        self.void_call(b"VBVMR_Login\0")
    }

    fn logout(&self) -> i32 {
        self.void_call(b"VBVMR_Logout\0")
    }

    fn dirty(&self) -> i32 {
        self.void_call(b"VBVMR_IsParametersDirty\0")
    }

    fn application(&self) -> Result<i32, i32> {
        unsafe {
            let function = self
                .library
                .get::<unsafe extern "C" fn(*mut i32) -> i32>(b"VBVMR_GetVoicemeeterType\0")
                .map_err(|_| -1)?;
            let mut kind = 0i32;
            let code = function(&mut kind);
            if code == 0 {
                Ok(kind)
            } else {
                Err(code)
            }
        }
    }

    fn get_float(&self, parameter: &str) -> Result<f32, i32> {
        let name = CString::new(parameter).map_err(|_| -1)?;
        unsafe {
            let function = self
                .library
                .get::<unsafe extern "C" fn(*const c_char, *mut f32) -> i32>(
                    b"VBVMR_GetParameterFloat\0",
                )
                .map_err(|_| -1)?;
            let mut value = 0f32;
            let code = function(name.as_ptr(), &mut value);
            if code == 0 {
                Ok(value)
            } else {
                Err(code)
            }
        }
    }

    fn get_string(&self, parameter: &str) -> Result<String, i32> {
        let name = CString::new(parameter).map_err(|_| -1)?;
        unsafe {
            let function = self
                .library
                .get::<unsafe extern "C" fn(*const c_char, *mut c_char) -> i32>(
                    b"VBVMR_GetParameterStringA\0",
                )
                .map_err(|_| -1)?;
            let mut buffer = [0u8; 512];
            let code = function(name.as_ptr(), buffer.as_mut_ptr().cast());
            if code == 0 {
                let end = buffer.iter().position(|byte| *byte == 0).unwrap_or(0);
                Ok(String::from_utf8_lossy(&buffer[..end]).to_string())
            } else {
                Err(code)
            }
        }
    }

    fn set_float(&self, parameter: &str, value: f32) -> Result<(), i32> {
        let name = CString::new(parameter).map_err(|_| -1)?;
        unsafe {
            let function = self
                .library
                .get::<unsafe extern "C" fn(*const c_char, f32) -> i32>(
                    b"VBVMR_SetParameterFloat\0",
                )
                .map_err(|_| -1)?;
            let code = function(name.as_ptr(), value);
            if code == 0 {
                Ok(())
            } else {
                Err(code)
            }
        }
    }
}

impl RemoteDll {
    /// Names of the devices available for strip/bus assignment (the same list
    /// Voicemeeter shows in the device dropdown of a physical strip).
    pub fn device_list(&self, input: bool) -> Vec<String> {
        unsafe {
            let number = match self.library.get::<unsafe extern "C" fn() -> i32>(if input {
                b"VBVMR_Input_GetDeviceNumber\0"
            } else {
                b"VBVMR_Output_GetDeviceNumber\0"
            }) {
                Ok(function) => (*function)(),
                Err(_) => 0,
            };
            let mut devices = Vec::new();
            for index in 0..number.max(0) as i32 {
                let desc = self.library.get::<unsafe extern "C" fn(
                    i32,
                    *mut i32,
                    *mut c_char,
                    *mut c_char,
                ) -> i32>(if input {
                    b"VBVMR_Input_GetDeviceDescA\0"
                } else {
                    b"VBVMR_Output_GetDeviceDescA\0"
                });
                let Ok(desc) = desc else { break };
                let mut kind = 0i32;
                let mut name = [0u8; 512];
                let mut hardware_id = [0u8; 512];
                if desc(
                    index,
                    &mut kind,
                    name.as_mut_ptr().cast(),
                    hardware_id.as_mut_ptr().cast(),
                ) == 0
                {
                    let end = name.iter().position(|byte| *byte == 0).unwrap_or(0);
                    devices.push(String::from_utf8_lossy(&name[..end]).to_string());
                }
            }
            devices
        }
    }
}

/// Session-level failure published to the UI as the `unavailable` status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Failure {
    NotInstalled,
    NotRunning,
}

impl fmt::Display for Failure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Failure::NotInstalled => "Voicemeeter não está instalado",
            Failure::NotRunning => "Voicemeeter não está em execução",
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Poll {
    /// No parameter changed since the last read.
    Idle,
    /// Parameters changed, or the session was just (re)established.
    Changed,
}

/// One remote Voicemeeter session; owned by the metrics worker thread.
pub struct Client {
    api: Option<Box<dyn RemoteApi>>,
    connected: bool,
    application: Option<i32>,
    confirmation_timeouts: HashMap<Target, u8>,
}

impl Client {
    /// A live DLL can accept setters without the engine applying them. Two
    /// consecutive timeouts on one target invalidate the shared session. The
    /// worker reconnects on its normal recovery deadline, never replaying writes.
    pub fn record_confirmation(&mut self, target: Target, confirmed: bool) -> bool {
        if confirmed {
            self.confirmation_timeouts.remove(&target);
            return false;
        }
        let timeouts = self.confirmation_timeouts.entry(target).or_default();
        *timeouts = timeouts.saturating_add(1);
        if *timeouts < 2 {
            return false;
        }
        self.disconnect();
        true
    }

    pub fn native() -> Self {
        Self {
            api: RemoteDll::open().map(|api| Box::new(api) as Box<dyn RemoteApi>),
            connected: false,
            application: None,
            confirmation_timeouts: HashMap::new(),
        }
    }

    #[cfg(test)]
    pub fn with_api(api: Box<dyn RemoteApi>) -> Self {
        Self {
            api: Some(api),
            connected: false,
            application: None,
            confirmation_timeouts: HashMap::new(),
        }
    }

    /// Maintain the session and decide whether parameters must be re-read.
    /// Always retry on the next poll: a stopped Voicemeeter resumes our view as
    /// soon as the application is back (or was installed while the bar runs).
    /// Returns `Err` with the failure the UI should publish as `unavailable`.
    pub fn poll(&mut self) -> Result<Poll, Failure> {
        if self.api.is_none() {
            // Attached Voicemeeter after startup: retry the DLL load on every poll.
            self.api = RemoteDll::open().map(|api| Box::new(api) as Box<dyn RemoteApi>);
        }
        let Some(api) = &self.api else {
            self.connected = false;
            return Err(Failure::NotInstalled);
        };
        if !self.connected {
            if api.login() < 0 {
                return Err(Failure::NotRunning);
            }
            self.connected = true;
            self.application = api.application().ok();
            // Publish a baseline snapshot right after (re)connecting.
            return Ok(Poll::Changed);
        }
        match api.dirty() {
            code if code > 0 => Ok(Poll::Changed),
            0 => Ok(Poll::Idle),
            _ => {
                // Voicemeeter closed: drop the session and recover on a later poll.
                self.disconnect();
                Err(Failure::NotRunning)
            }
        }
    }

    fn disconnect(&mut self) {
        if let (true, Some(api)) = (self.connected, self.api.as_ref()) {
            let _ = api.logout();
        }
        self.connected = false;
        self.application = None;
        self.confirmation_timeouts.clear();
    }

    fn check(&self, target: Target) -> Result<(), String> {
        if self.api.is_none() {
            return Err(Failure::NotInstalled.to_string());
        }
        if !self.connected {
            return Err(Failure::NotRunning.to_string());
        }
        if let Some(application) = self.application {
            if !target.within(application) {
                return Err(format!(
                    "{} está fora do alcance deste Voicemeeter (índices válidos: 0-{})",
                    target.describe(),
                    target.kind.count(application) - 1
                ));
            }
        }
        Ok(())
    }

    /// Reads the target as the widgets expect it: level 0-100 plus mute.
    pub fn read(&self, target: Target) -> Result<(i32, bool), String> {
        self.check(target)?;
        let api = self.api.as_ref().expect("check requires an api");
        let gain = api
            .get_float(&target.gain_parameter())
            .map_err(|code| format!("Voicemeeter {}: código {code}", target.gain_parameter()))?;
        let mute = api
            .get_float(&target.mute_parameter())
            .map_err(|code| format!("Voicemeeter {}: código {code}", target.mute_parameter()))?;
        Ok((db_to_level(gain), mute >= 0.5))
    }

    /// Returns the accepted intent, not confirmation: setters are asynchronous
    /// in the engine and an immediate read may still contain the old values.
    pub fn write(
        &self,
        target: Target,
        level: Option<f32>,
        muted: Option<bool>,
    ) -> Result<(i32, bool), String> {
        self.check(target)?;
        let previous = self.read(target)?;
        let api = self.api.as_ref().expect("check requires an api");
        if let Some(level) = level {
            api.set_float(&target.gain_parameter(), level_to_db(level))
                .map_err(|code| {
                    format!("Voicemeeter {}: código {code}", target.gain_parameter())
                })?;
        }
        if let Some(muted) = muted {
            api.set_float(&target.mute_parameter(), if muted { 1.0 } else { 0.0 })
                .map_err(|code| {
                    format!("Voicemeeter {}: código {code}", target.mute_parameter())
                })?;
        }
        Ok((
            level
                .map(|value| db_to_level(level_to_db(value)))
                .unwrap_or(previous.0),
            muted.unwrap_or(previous.1),
        ))
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        self.disconnect();
    }
}

/// One strip/bus as shown by the configuration menu: device name plus live state.
#[derive(Debug, Clone, serde::Serialize)]
pub struct VmIo {
    pub index: u32,
    /// Short engine label: `A1`..`A5`/`B1`.. for buses, `Hardware n`/`V1`.. for strips.
    pub slot: String,
    /// `false` for the virtual strips/buses (VAIO ins/outs).
    pub physical: bool,
    pub name: String,
    pub gain: f32,
    pub mute: bool,
}

/// Human slot name of a strip/bus for the current application layout.
pub fn slot(kind: Kind, index: u32, application: i32) -> String {
    match kind {
        Kind::Bus => {
            let physical = physical_count(kind, application);
            if index < physical {
                format!("A{}", index + 1)
            } else {
                format!("B{}", index - physical + 1)
            }
        }
        Kind::Strip => {
            let physical = physical_count(kind, application);
            if index < physical {
                format!("Hardware {}", index + 1)
            } else {
                format!("V{}", index - physical + 1)
            }
        }
    }
}

/// What the `voicemeeter` channel publishes for the routing menu.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Snapshot {
    /// `VBVMR_GetVoicemeeterType`: 1 Voicemeeter, 2 Banana, 3 Potato.
    pub application: i32,
    pub strips: Vec<VmIo>,
    pub buses: Vec<VmIo>,
}

/// Installed strips / output buses per application type (docs of the remote API
/// and the `voicemeeter` SDK table).
fn count(kind: Kind, application: i32) -> u32 {
    kind.count(application)
}

/// Number of *physical* strips/buses before the virtual VAIO ones start.
fn physical_count(kind: Kind, application: i32) -> u32 {
    match (application, kind) {
        (1, Kind::Strip) => 2,
        (_, Kind::Strip) => match application {
            2 => 3,
            _ => 5,
        },
        (_, Kind::Bus) => match application {
            1 => 2,
            2 => 3,
            _ => 5,
        },
    }
}

fn device_parameter(kind: Kind, index: u32, suffix: &str) -> String {
    format!("{}[{}].{}", kind.binding(), index, suffix)
}

fn read_family(api: &dyn RemoteApi, kind: Kind, application: i32) -> Vec<VmIo> {
    (0..count(kind, application))
        .filter_map(|index| {
            let target = Target { kind, index };
            let name = api
                .get_string(&device_parameter(kind, index, "Device.name"))
                .ok()
                .filter(|value| !value.trim().is_empty())
                .or_else(|| {
                    api.get_string(&device_parameter(kind, index, "Label"))
                        .ok()
                        .filter(|value| !value.trim().is_empty())
                })
                .unwrap_or_default();
            let gain = api.get_float(&target.gain_parameter()).ok()?;
            let mute = api.get_float(&target.mute_parameter()).ok()?;
            Some(VmIo {
                index,
                slot: slot(kind, index, application),
                physical: index < physical_count(kind, application),
                name,
                gain,
                mute: mute >= 0.5,
            })
        })
        .collect()
}

impl Client {
    /// Enumerates strips/buses with device names for the routing menu.
    /// Requires an established session (`poll` first).
    pub fn snapshot(&self) -> Result<Snapshot, String> {
        let Some(api) = &self.api else {
            return Err(Failure::NotInstalled.to_string());
        };
        if !self.connected {
            return Err(Failure::NotRunning.to_string());
        }
        let application = self.application.unwrap_or(2);
        Ok(Snapshot {
            application,
            strips: read_family(api.as_ref(), Kind::Strip, application),
            buses: read_family(api.as_ref(), Kind::Bus, application),
        })
    }
}

/// Opt-in live diagnostic. Every attempted change is followed by exact raw
/// gain/mute restoration, including failure paths. No bars are opened.
fn probe_target(client: &mut Client, target: Target) -> serde_json::Value {
    use std::time::{Duration, Instant};
    let baseline = (|| -> Result<(f32, f32), String> {
        let api = client.api.as_ref().ok_or("Voicemeeter indisponível")?;
        Ok((
            api.get_float(&target.gain_parameter())
                .map_err(|e| e.to_string())?,
            api.get_float(&target.mute_parameter())
                .map_err(|e| e.to_string())?,
        ))
    })();
    let (gain, mute) = match baseline {
        Ok(value) => value,
        Err(error) => return serde_json::json!({"error": error}),
    };
    let level = db_to_level(gain);
    let bumped = if level < 99 { level + 1 } else { level - 1 };
    let mut samples = Vec::new();
    let mut errors = Vec::new();
    let mut restored = false;
    for _ in 0..10 {
        for (operation, requested_level, requested_mute) in [
            ("mute", None, Some(mute < 0.5)),
            ("gain", Some(bumped as f32), None),
        ] {
            let started = Instant::now();
            let result = (|| -> Result<serde_json::Value, String> {
                let expected = client.write(target, requested_level, requested_mute)?;
                let write_ms = started.elapsed().as_secs_f64() * 1000.0;
                let immediate_started = Instant::now();
                let immediate = client.read(target)?;
                let immediate_read_ms = immediate_started.elapsed().as_secs_f64() * 1000.0;
                loop {
                    std::thread::sleep(Duration::from_millis(50));
                    client.poll().map_err(|e| e.to_string())?;
                    let actual = client.read(target)?;
                    if requested_level.is_none_or(|_| actual.0 == expected.0)
                        && requested_mute.is_none_or(|_| actual.1 == expected.1)
                    {
                        return Ok(serde_json::json!({"operation": operation,
                            "writeMs": write_ms, "immediateReadMs": immediate_read_ms,
                            "immediateWasStale": (requested_level.is_some() && immediate.0 != expected.0)
                                || (requested_mute.is_some() && immediate.1 != expected.1),
                            "confirmedMs": started.elapsed().as_secs_f64() * 1000.0}));
                    }
                    if started.elapsed() >= Duration::from_secs(1) {
                        return Err("Voicemeeter confirmation timeout".into());
                    }
                }
            })();
            match result {
                Ok(sample) => samples.push(sample),
                Err(error) => errors.push(error),
            }
        }
        // Always attempt both restores; never let one failed setter skip the other.
        let restore = (|| -> Result<(), String> {
            let api = client.api.as_ref().ok_or("Voicemeeter indisponível")?;
            let gain_result = api.set_float(&target.gain_parameter(), gain);
            let mute_result = api.set_float(&target.mute_parameter(), mute);
            gain_result.map_err(|e| e.to_string())?;
            mute_result.map_err(|e| e.to_string())?;
            let started = Instant::now();
            loop {
                std::thread::sleep(Duration::from_millis(50));
                client.poll().map_err(|e| e.to_string())?;
                let api = client.api.as_ref().ok_or("Voicemeeter indisponível")?;
                let actual_gain = api
                    .get_float(&target.gain_parameter())
                    .map_err(|e| e.to_string())?;
                let actual_mute = api
                    .get_float(&target.mute_parameter())
                    .map_err(|e| e.to_string())?;
                if (actual_gain - gain).abs() < 0.001 && actual_mute == mute {
                    return Ok(());
                }
                if started.elapsed() >= Duration::from_secs(1) {
                    return Err("Voicemeeter restoration timeout".into());
                }
            }
        })();
        restored = restore.is_ok();
        if let Err(error) = restore {
            errors.push(error);
        }
        if !errors.is_empty() {
            break;
        }
    }
    let mut times: Vec<f64> = samples
        .iter()
        .filter_map(|sample| sample["confirmedMs"].as_f64())
        .collect();
    times.sort_by(f64::total_cmp);
    let p95 = if times.is_empty() {
        None
    } else {
        Some(times[(times.len() * 95).div_ceil(100) - 1])
    };
    serde_json::json!({"before": {"gainDb": gain, "level": level, "muted": mute >= 0.5},
        "gainRestored": restored, "muteRestored": restored,
        "p95ConfirmedMs": p95, "samples": samples, "errors": errors,
        "measurement": "Live DLL, 50 ms confirmation cadence; excludes Tauri queue, WebView rendering and full-bar idle CPU"})
}

/// First-boot diagnostic: prints one JSON value with the live Voicemeeter state
/// and proves read/write round-trips on Bus[0] and Strip[0] (values restored
/// and verified after each cycle). Run with `--probe-vm`.
pub fn probe_vm() -> serde_json::Value {
    if !installed() {
        return serde_json::json!({ "installed": false });
    }
    let mut client = Client::native();
    let report = (|| -> Result<serde_json::Value, String> {
        client.poll().map_err(|e| e.to_string())?;
        let snapshot = client.snapshot()?;
        let api = RemoteDll::open().expect("probe requires the DLL");
        let input_devices = api.device_list(true);
        let output_devices = api.device_list(false);
        Ok(serde_json::json!({
            "installed": true,
            "snapshot": snapshot,
            "inputDevices": input_devices,
            "outputDevices": output_devices,
            "bus0": probe_target(&mut client, Target::parse(Some("bus"), Some(0)).unwrap()),
            "strip0": probe_target(&mut client, Target::parse(Some("strip"), Some(0)).unwrap()),
        }))
    })();
    match report {
        Ok(report) => report,
        Err(e) => serde_json::json!({ "installed": true, "error": e }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, Ordering};
    use std::sync::{Arc, Mutex};

    /// Shared state so the test can morph the fake API while the client owns it.
    #[derive(Default)]
    struct State {
        logged_in: std::sync::atomic::AtomicBool,
        login_code: std::sync::atomic::AtomicI32,
        dirty_code: std::sync::atomic::AtomicI32,
        application: std::sync::atomic::AtomicI32,
        logouts: std::sync::atomic::AtomicU32,
        values: std::sync::Mutex<HashMap<String, f32>>,
        strings: std::sync::Mutex<HashMap<String, String>>,
        delayed: AtomicBool,
        staged: Mutex<HashMap<String, f32>>,
        stalled_until_relogin: AtomicBool,
    }

    #[derive(Clone)]
    struct Fake(Arc<State>);

    impl Fake {
        fn banana() -> Self {
            let state = State {
                logged_in: AtomicBool::new(false),
                login_code: AtomicI32::new(0),
                dirty_code: AtomicI32::new(1),
                application: AtomicI32::new(2),
                logouts: AtomicU32::new(0),
                values: Mutex::new(HashMap::from([
                    ("Bus[0].Gain".to_string(), -24.0),
                    ("Bus[0].Mute".to_string(), 0.0),
                    ("Strip[4].Gain".to_string(), -60.0),
                    ("Strip[4].Mute".to_string(), 1.0),
                ])),
                delayed: AtomicBool::new(false),
                staged: Mutex::new(HashMap::new()),
                stalled_until_relogin: AtomicBool::new(false),
                strings: Mutex::new(HashMap::from([
                    (
                        "Bus[0].Device.name".to_string(),
                        "Speakers (Realtek Audio)".to_string(),
                    ),
                    ("Strip[4].Device.name".to_string(), String::new()),
                ])),
            };
            Self(Arc::new(state))
        }
    }

    impl RemoteApi for Fake {
        fn login(&self) -> i32 {
            self.0.stalled_until_relogin.store(false, Ordering::SeqCst);
            let code = self.0.login_code.load(Ordering::SeqCst);
            self.0.logged_in.store(code >= 0, Ordering::SeqCst);
            code
        }

        fn logout(&self) -> i32 {
            self.0.logged_in.store(false, Ordering::SeqCst);
            self.0.logouts.fetch_add(1, Ordering::SeqCst);
            0
        }

        fn dirty(&self) -> i32 {
            if !self.0.logged_in.load(Ordering::SeqCst) {
                -1
            } else {
                self.0.dirty_code.load(Ordering::SeqCst)
            }
        }

        fn get_float(&self, parameter: &str) -> Result<f32, i32> {
            self.0
                .values
                .lock()
                .unwrap()
                .get(parameter)
                .copied()
                .ok_or(-5)
        }

        fn set_float(&self, parameter: &str, value: f32) -> Result<(), i32> {
            if self.0.stalled_until_relogin.load(Ordering::SeqCst) {
                return Ok(());
            }
            if self.0.delayed.load(Ordering::SeqCst) {
                self.0.staged.lock().unwrap().insert(parameter.to_string(), value);
                return Ok(());
            }
            self.0
                .values
                .lock()
                .unwrap()
                .insert(parameter.to_string(), value);
            Ok(())
        }

        fn get_string(&self, parameter: &str) -> Result<String, i32> {
            self.0
                .strings
                .lock()
                .unwrap()
                .get(parameter)
                .cloned()
                .ok_or(-5)
        }

        fn application(&self) -> Result<i32, i32> {
            Ok(self.0.application.load(Ordering::SeqCst))
        }
    }

    fn percent_from_client(db: f32) -> i32 {
        db_to_level(db)
    }

    fn bus_0() -> Target {
        Target::parse(Some("bus"), Some(0)).unwrap()
    }

    #[test]
    fn builds_remote_api_parameter_names() {
        let strip = Target::parse(Some("strip"), Some(0)).unwrap();
        assert_eq!(strip.gain_parameter(), "Strip[0].Gain");
        assert_eq!(strip.mute_parameter(), "Strip[0].Mute");
        let bus = Target::parse(Some("bus"), Some(4)).unwrap();
        assert_eq!(bus.gain_parameter(), "Bus[4].Gain");
        assert_eq!(bus.mute_parameter(), "Bus[4].Mute");
        assert_eq!(strip.describe(), "Strip 0");
        assert_eq!(bus.describe(), "Bus 4");
    }

    #[test]
    fn rejects_unknown_or_oversized_targets() {
        assert!(Target::parse(Some("aux"), Some(0)).is_none());
        assert!(Target::parse(None, Some(0)).is_none());
        assert!(Target::parse(Some("bus"), None).is_none());
        assert!(Target::parse(Some("bus"), Some(MAX_INDEX + 1)).is_none());
        assert_eq!(
            Target::parse(Some("strip"), Some(MAX_INDEX)),
            Some(Target {
                kind: Kind::Strip,
                index: MAX_INDEX
            })
        );
    }

    #[test]
    fn maps_percent_to_the_slider_db_range() {
        assert_eq!(level_to_db(0.0), MIN_DB);
        assert_eq!(level_to_db(50.0), -24.0_f32);
        assert_eq!(level_to_db(100.0), MAX_DB);
        assert_eq!(level_to_db(150.0), MAX_DB);
        assert_eq!(level_to_db(-3.0), MIN_DB);
        assert_eq!(db_to_level(-24.0), 50);
        assert_eq!(db_to_level(MIN_DB), 0);
        assert_eq!(db_to_level(MAX_DB), 100);
        assert_eq!(db_to_level(-120.0), 0);
        assert_eq!(db_to_level(40.0), 100);
    }

    #[test]
    fn bounds_follow_the_detected_application() {
        // Banana: 5 strips and 5 buses, indexes 0-4 on both families.
        assert!(Target::parse(Some("strip"), Some(4))
            .expect("a valid strip")
            .within(2));
        assert!(!Target::parse(Some("strip"), Some(4))
            .expect("a valid strip")
            .within(1));
        // Basic ships 3 strips / 2 buses; Potato 8/8.
        assert!(!Target::parse(Some("strip"), Some(3))
            .expect("a valid strip")
            .within(1));
        assert!(Target::parse(Some("bus"), Some(7))
            .expect("a valid bus")
            .within(3));
    }

    #[test]
    fn accepted_writes_do_not_claim_a_stale_read_is_the_requested_value() {
        let fake = Fake::banana();
        fake.0.delayed.store(true, Ordering::SeqCst);
        let mut client = Client::with_api(Box::new(fake.clone()));
        client.poll().unwrap();
        assert_eq!(client.write(bus_0(), Some(85.0), Some(true)), Ok((85, true)));
        // The engine has accepted the setters but has not processed them yet.
        assert_eq!(client.read(bus_0()), Ok((50, false)));
        let staged = std::mem::take(&mut *fake.0.staged.lock().unwrap());
        fake.0.values.lock().unwrap().extend(staged);
        client.poll().unwrap();
        assert_eq!(client.read(bus_0()), Ok((85, true)));
    }

    #[test]
    fn connects_and_serves_the_configured_target() {
        let fake = Fake::banana();
        let mut client = Client::with_api(Box::new(fake.clone()));
        let bus = bus_0();
        // Writes and reads never reach Voicemeeter without an established session.
        assert!(!client.read(bus).is_ok());
        assert_eq!(client.poll(), Ok(Poll::Changed));
        assert_eq!(client.read(bus), Ok((percent_from_client(-24.0), false)));
        assert_eq!(client.poll(), Ok(Poll::Changed));
        fake.0.dirty_code.store(0, Ordering::SeqCst);
        assert_eq!(client.poll(), Ok(Poll::Idle));
        assert_eq!(client.write(bus, Some(85.0), Some(true)), Ok((85, true)));
        assert_eq!(
            fake.0.values.lock().unwrap().get("Bus[0].Gain").copied(),
            Some(level_to_db(85.0))
        );
    }

    #[test]
    fn rejects_targets_beyond_the_running_application() {
        let mut client = Client::with_api(Box::new(Fake::banana()));
        let strip = Target::parse(Some("strip"), Some(5)).unwrap();
        assert!(client.poll().is_ok());
        let error = client.read(strip).unwrap_err();
        assert!(error.contains("fora do alcance"), "{error}");
        assert!(error.contains("0-4"), "{error}");
    }

    #[test]
    fn recovery_rejects_login_until_voicemeeter_returns() {
        let fake = Fake::banana();
        fake.0.login_code.store(-3, Ordering::SeqCst);
        let mut client = Client::with_api(Box::new(fake.clone()));
        assert_eq!(client.poll(), Err(Failure::NotRunning));
        // Keep reporting the gap until the application accepts the login.
        assert_eq!(client.poll(), Err(Failure::NotRunning));
        assert!(!fake.0.logged_in.load(Ordering::SeqCst));
        fake.0.login_code.store(0, Ordering::SeqCst);
        assert_eq!(client.poll(), Ok(Poll::Changed));
        assert_eq!(
            client.read(bus_0()),
            Ok((percent_from_client(-24.0), false))
        );
    }

    #[test]
    fn a_dropped_session_logs_out_and_recovers_on_the_next_poll() {
        let fake = Fake::banana();
        let mut client = Client::with_api(Box::new(fake.clone()));
        assert!(client.poll().is_ok());
        // The remote API reports a dead engine:
        fake.0.dirty_code.store(-7, Ordering::SeqCst);
        assert_eq!(client.poll(), Err(Failure::NotRunning));
        assert_eq!(fake.0.logouts.load(Ordering::SeqCst), 1);
        assert!(
            !fake.0.logged_in.load(Ordering::SeqCst),
            "session must be dropped"
        );
        // Recovery: the client re-logins and publishes the current state.
        fake.0.dirty_code.store(1, Ordering::SeqCst);
        assert_eq!(client.poll(), Ok(Poll::Changed));
        assert_eq!(fake.0.logouts.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn repeated_unconfirmed_writes_reconnect_a_silently_stalled_session() {
        let fake = Fake::banana();
        let mut client = Client::with_api(Box::new(fake.clone()));
        client.poll().unwrap();
        fake.0.stalled_until_relogin.store(true, Ordering::SeqCst);
        for attempt in 0..2 {
            assert_eq!(client.write(bus_0(), None, Some(true)), Ok((50, true)));
            assert_eq!(client.read(bus_0()), Ok((50, false)));
            assert_eq!(client.record_confirmation(bus_0(), false), attempt == 1);
            // Activity on another destination must not hide this target's stall.
            if attempt == 0 {
                let strip = Target::parse(Some("strip"), Some(4)).unwrap();
                assert!(!client.record_confirmation(strip, true));
                assert_eq!(fake.0.logouts.load(Ordering::SeqCst), 0);
            }
        }
        assert_eq!(fake.0.logouts.load(Ordering::SeqCst), 1);
        assert!(!fake.0.logged_in.load(Ordering::SeqCst));
        assert_eq!(client.poll(), Ok(Poll::Changed));
        assert_eq!(
            client.read(bus_0()),
            Ok((50, false)),
            "reconnect must not replay writes"
        );
        client.write(bus_0(), None, Some(true)).unwrap();
        assert_eq!(client.read(bus_0()), Ok((50, true)));
        assert!(!client.record_confirmation(bus_0(), true));
    }

    #[test]
    fn a_confirmed_write_resets_only_its_targets_timeout_count() {
        let fake = Fake::banana();
        let mut client = Client::with_api(Box::new(fake.clone()));
        client.poll().unwrap();
        assert!(!client.record_confirmation(bus_0(), false));
        assert!(!client.record_confirmation(bus_0(), true));
        assert!(!client.record_confirmation(bus_0(), false));
        assert_eq!(fake.0.logouts.load(Ordering::SeqCst), 0);
        assert!(client.record_confirmation(bus_0(), false));
        fake.0.login_code.store(-3, Ordering::SeqCst);
        assert_eq!(client.poll(), Err(Failure::NotRunning));
        assert_eq!(fake.0.logouts.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn dropping_the_client_releases_the_remote_session() {
        let fake = Fake::banana();
        let mut client = Client::with_api(Box::new(fake.clone()));
        assert!(client.poll().is_ok());
        assert!(fake.0.logged_in.load(Ordering::SeqCst));
        drop(client);
        assert_eq!(
            fake.0.logouts.load(Ordering::SeqCst),
            1,
            "cleanup: the DLL session must be released"
        );
        assert!(!fake.0.logged_in.load(Ordering::SeqCst));
    }
}
