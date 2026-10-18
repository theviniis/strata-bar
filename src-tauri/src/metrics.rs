use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use windows::{
    core::{implement, PCWSTR},
    Win32::{
        Foundation::{FILETIME, PROPERTYKEY},
        Media::Audio::{Endpoints::*, *},
        System::{
            Com::*,
            SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
            Threading::GetSystemTimes,
        },
    },
};

pub fn timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
pub fn envelope(status: &str, data: Value) -> Value {
    json!({"status":status,"data":data,"timestamp":timestamp()})
}
fn error(e: impl std::fmt::Display) -> Value {
    json!({"status":"error","data":null,"error":e.to_string(),"timestamp":timestamp()})
}
fn ticks(v: FILETIME) -> u64 {
    ((v.dwHighDateTime as u64) << 32) | v.dwLowDateTime as u64
}
pub fn cpu_times() -> windows::core::Result<[u64; 3]> {
    unsafe {
        let (mut i, mut k, mut u) = (
            FILETIME::default(),
            FILETIME::default(),
            FILETIME::default(),
        );
        GetSystemTimes(Some(&mut i), Some(&mut k), Some(&mut u))?;
        Ok([ticks(i), ticks(k), ticks(u)])
    }
}
pub fn cpu_percent(old: [u64; 3], new: [u64; 3]) -> Option<f64> {
    if new.iter().zip(old).any(|(n, o)| *n < o) {
        return None;
    }
    let total = (new[1] - old[1]) + (new[2] - old[2]);
    if total == 0 {
        return None;
    }
    Some((100.0 * (total.saturating_sub(new[0] - old[0])) as f64 / total as f64).clamp(0., 100.))
}
pub fn memory() -> windows::core::Result<Value> {
    unsafe {
        let mut m = MEMORYSTATUSEX {
            dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
            ..Default::default()
        };
        GlobalMemoryStatusEx(&mut m)?;
        Ok(
            json!({"percent":100.0*(m.ullTotalPhys-m.ullAvailPhys) as f64/m.ullTotalPhys as f64,"usedBytes":m.ullTotalPhys-m.ullAvailPhys,"totalBytes":m.ullTotalPhys}),
        )
    }
}
unsafe fn endpoint(
    enumerator: &IMMDeviceEnumerator,
) -> windows::core::Result<IAudioEndpointVolume> {
    enumerator
        .GetDefaultAudioEndpoint(eRender, eMultimedia)?
        .Activate(CLSCTX_ALL, None)
}
pub unsafe fn audio_read(ep: &IAudioEndpointVolume) -> windows::core::Result<Value> {
    Ok(
        json!({"level":(ep.GetMasterVolumeLevelScalar()?*100.).round(),"muted":ep.GetMute()?.as_bool()}),
    )
}

struct Sub {
    channel: String,
    window: String,
}
#[derive(Default)]
struct Data {
    next: u64,
    subs: HashMap<String, Sub>,
    latest: HashMap<String, Value>,
    incoming: HashMap<String,u64>,
    emitted: HashMap<String,u64>,
}
#[derive(Clone)]
pub struct Metrics {
    data: Arc<Mutex<Data>>,
    tx: mpsc::Sender<Request>,
}
enum Request {
    Wake,
    Volume(
        Option<f32>,
        Option<bool>,
        mpsc::SyncSender<Result<Value, String>>,
    ),
    Output(String, mpsc::SyncSender<Result<Value, String>>),
    Stop,
}
impl Metrics {
    pub fn start(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel();
        let this = Self {
            data: Default::default(),
            tx,
        };
        let owner = this.clone();
        std::thread::spawn(move || owner.run(app, rx));
        this
    }
    pub fn subscribe(
        &self,
        channel: String,
        window: String,
        interval: u64,
    ) -> Result<Value, String> {
        if !["cpu", "memory", "volume", "audioOutputs"].contains(&channel.as_str()) {
            return Err(format!("Unsupported channel: {channel}"));
        }
        if interval != 2000 {
            return Err("MVP native sampling interval is 2000 ms".into());
        }
        let mut d = self.data.lock().map_err(|e| e.to_string())?;
        d.next += 1;
        let token = d.next.to_string();
        let initial = d
            .latest
            .get(&channel)
            .cloned()
            .unwrap_or_else(|| envelope("loading", Value::Null));
        d.subs.insert(token.clone(), Sub { channel, window });
        drop(d);
        let _ = self.tx.send(Request::Wake);
        Ok(json!({"token":token,"initial":initial}))
    }
    pub fn unsubscribe(&self, token: &str, window: &str) {
        let mut d = self.data.lock().unwrap();
        if d.subs.get(token).is_some_and(|s| s.window == window) {
            d.subs.remove(token);
        }
        drop(d);
        let _ = self.tx.send(Request::Wake);
    }
    pub fn remove_window(&self, window: &str) {
        self.data
            .lock()
            .unwrap()
            .subs
            .retain(|_, s| s.window != window);
        let _ = self.tx.send(Request::Wake);
    }
    fn active(&self, channel: &str) -> bool {
        self.data
            .lock()
            .unwrap()
            .subs
            .values()
            .any(|s| s.channel == channel)
    }
    fn publish(&self, app: &AppHandle, channel: &str, value: Value) {
        let windows = {
            let mut d = self.data.lock().unwrap();
            *d.incoming.entry(channel.into()).or_default()+=1;
            // Core Audio may repeat the same state. Do not wake every WebView
            // for a notification that cannot change the displayed volume.
            if channel=="volume" && d.latest.get(channel).is_some_and(|old|old["status"]==value["status"] && old["data"]==value["data"] && old["error"]==value["error"]){return;}
            *d.emitted.entry(channel.into()).or_default()+=1;
            d.latest.insert(channel.into(), value.clone());
            d.subs
                .values()
                .filter(|s| s.channel == channel)
                .map(|s| s.window.clone())
                .collect::<std::collections::HashSet<_>>()
        };
        for window in windows {
            if let Err(e) = app.emit_to(window, &format!("system:{channel}"), &value) {
                eprintln!("Emit {channel}: {e}");
            }
        }
    }
    pub fn volume(&self, level: Option<f32>, muted: Option<bool>) -> Result<Value, String> {
        if level.is_some_and(|v| !v.is_finite() || !(0.0..=100.0).contains(&v)) {
            return Err("Volume must be between 0 and 100".into());
        }
        let (tx, rx) = mpsc::sync_channel(1);
        self.tx
            .send(Request::Volume(level, muted, tx))
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(3))
            .map_err(|e| e.to_string())?
    }
    pub fn audio_output(&self, id: String) -> Result<Value, String> {
        if id.is_empty() || id.contains('\0') || id.len() > 4096 { return Err("Invalid endpoint ID".into()); }
        let (tx, rx) = mpsc::sync_channel(1);
        self.tx.send(Request::Output(id, tx)).map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(3)).map_err(|e| e.to_string())?
    }
    pub fn diagnostics(&self) -> Value {
        let d = self.data.lock().unwrap();
        json!({"subscribers":d.subs.len(),"channels":d.latest,"collectorThreads":1,"intervalMs":2000,"incoming":d.incoming,"emitted":d.emitted})
    }
    pub fn stop(&self) {
        let _ = self.tx.send(Request::Stop);
    }
    fn run(&self, app: AppHandle, rx: mpsc::Receiver<Request>) {
        unsafe {
            if let Err(e) = CoInitializeEx(None, COINIT_MULTITHREADED).ok() {
                for c in ["cpu", "memory", "volume", "audioOutputs"] {
                    self.publish(&app, c, error(&e));
                }
                return;
            }
            let enumerator: windows::core::Result<IMMDeviceEnumerator> =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL);
            let changed = Arc::new(AtomicBool::new(true));
            let device_notify: IMMNotificationClient = DeviceNotify {
                changed: changed.clone(),
                tx: self.tx.clone(),
            }
            .into();
            if let Ok(e) = &enumerator {
                if let Err(err) = e.RegisterEndpointNotificationCallback(&device_notify) {
                    eprintln!("Audio device notifications: {err}");
                }
            }
            let mut audio: Option<(IAudioEndpointVolume, IAudioEndpointVolumeCallback)> = None;
            let mut previous = None;
            let mut next_tick = Instant::now();
            let mut ticks=0;
            let mut outputs_active = false;
            loop {
                let dirty = changed.swap(false, Ordering::AcqRel);
                let active = self.active("audioOutputs");
                if active && (dirty || !outputs_active) {
                    match enumerator.as_ref().map_err(|e| e.clone()).and_then(|en| crate::audio_policy::outputs(en)) {
                        Ok(v) => self.publish(&app, "audioOutputs", envelope("ready", v)),
                        Err(e) => self.publish(&app, "audioOutputs", error(e)),
                    }
                }
                outputs_active = active;
                if self.active("volume")
                    && (dirty || audio.is_none())
                {
                    if let Some((e, cb)) = audio.take() {
                        let _ = e.UnregisterControlChangeNotify(&cb);
                    }
                    match enumerator
                        .as_ref()
                        .map_err(|e| e.clone())
                        .and_then(|e| endpoint(e))
                    {
                        Ok(e) => {
                            let cb: IAudioEndpointVolumeCallback = VolumeNotify {
                                owner: self.clone(),
                                app: app.clone(),
                            }
                            .into();
                            match e.RegisterControlChangeNotify(&cb) {
                                Ok(()) => {
                                    match audio_read(&e) {
                                        Ok(v) => self.publish(&app, "volume", envelope("ready", v)),
                                        Err(err) => self.publish(&app, "volume", error(err)),
                                    };
                                    audio = Some((e, cb));
                                }
                                Err(err) => self.publish(&app, "volume", error(err)),
                            }
                        }
                        Err(e) => self.publish(&app, "volume", error(e)),
                    }
                } else if !self.active("volume") {
                    if let Some((e, cb)) = audio.take() {
                        let _ = e.UnregisterControlChangeNotify(&cb);
                    }
                }
                if Instant::now() >= next_tick {
                    if self.active("cpu") {
                        match cpu_times() {
                            Ok(now) => {
                                if let Some(old) = previous {
                                    if let Some(p) = cpu_percent(old, now) {
                                        self.publish(
                                            &app,
                                            "cpu",
                                            envelope("ready", json!({"percent":p})),
                                        );
                                    }
                                }
                                previous = Some(now);
                            }
                            Err(e) => self.publish(&app, "cpu", error(e)),
                        }
                    } else {
                        previous = None;
                    }
                    if self.active("memory") {
                        match memory() {
                            Ok(v) => self.publish(&app, "memory", envelope("ready", v)),
                            Err(e) => self.publish(&app, "memory", error(e)),
                        }
                    }
                    next_tick = Instant::now() + Duration::from_secs(2);
                    ticks+=1;
                    if ticks==10{let report=json!({"metrics":self.diagnostics(),"windows":crate::desktop::profile()});if let Err(e)=std::fs::write(std::env::temp_dir().join("strata-runtime-profile.json"),report.to_string()){eprintln!("Runtime profile: {e}");}}
                }
                match rx.recv_timeout(next_tick.saturating_duration_since(Instant::now())) {
                    Ok(Request::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Ok(Request::Output(id, reply)) => {
                        let result = enumerator.as_ref().map_err(|e| e.to_string()).and_then(|en| crate::audio_policy::select(en, &id));
                        // Always reread after a partial failure too.
                        if let Ok(en) = &enumerator {
                            match crate::audio_policy::outputs(en) {
                                Ok(v) => self.publish(&app, "audioOutputs", envelope("ready", v)),
                                Err(e) => self.publish(&app, "audioOutputs", error(e)),
                            }
                        }
                        changed.store(true, Ordering::Release);
                        let _ = reply.send(result);
                    }
                    Ok(Request::Volume(level, muted, reply)) => {
                        let result = (|| -> windows::core::Result<Value> {
                            let e = endpoint(enumerator.as_ref().map_err(|e| e.clone())?)?;
                            if let Some(v) = level {
                                e.SetMasterVolumeLevelScalar(v / 100., std::ptr::null())?;
                            }
                            if let Some(v) = muted {
                                e.SetMute(v, std::ptr::null())?;
                            }
                            audio_read(&e)
                        })();
                        let _ = reply.send(result.map_err(|e| e.to_string()));
                    }
                    Ok(Request::Wake) => { outputs_active = false; },
                    _ => {}
                }
            }
            if let Some((e, cb)) = audio.take() {
                let _ = e.UnregisterControlChangeNotify(&cb);
            }
            if let Ok(e) = enumerator {
                let _ = e.UnregisterEndpointNotificationCallback(&device_notify);
                drop(e);
            }
            drop(device_notify);
            CoUninitialize();
        }
    }
}
#[implement(IAudioEndpointVolumeCallback)]
struct VolumeNotify {
    owner: Metrics,
    app: AppHandle,
}
impl IAudioEndpointVolumeCallback_Impl for VolumeNotify_Impl {
    fn OnNotify(&self, p: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> windows::core::Result<()> {
        if let Some(v) = unsafe { p.as_ref() } {
            self.owner.publish(
                &self.app,
                "volume",
                envelope(
                    "ready",
                    json!({"level":(v.fMasterVolume*100.).round(),"muted":v.bMuted.as_bool()}),
                ),
            );
        }
        Ok(())
    }
}
#[implement(IMMNotificationClient)]
struct DeviceNotify {
    changed: Arc<AtomicBool>,
    tx: mpsc::Sender<Request>,
}
impl IMMNotificationClient_Impl for DeviceNotify_Impl {
    fn OnDeviceStateChanged(&self, _: &PCWSTR, _: DEVICE_STATE) -> windows::core::Result<()> {
        self.changed.store(true, Ordering::Release);
        let _ = self.tx.send(Request::Wake);
        Ok(())
    }
    fn OnDeviceAdded(&self, _: &PCWSTR) -> windows::core::Result<()> {
        self.changed.store(true, Ordering::Release);
        let _ = self.tx.send(Request::Wake);
        Ok(())
    }
    fn OnDeviceRemoved(&self, _: &PCWSTR) -> windows::core::Result<()> {
        self.changed.store(true, Ordering::Release);
        let _ = self.tx.send(Request::Wake);
        Ok(())
    }
    fn OnDefaultDeviceChanged(
        &self,
        flow: EDataFlow,
        role: ERole,
        _: &PCWSTR,
    ) -> windows::core::Result<()> {
        if flow == eRender && (role == eMultimedia || role == eConsole) {
            self.changed.store(true, Ordering::Release);
            let _ = self.tx.send(Request::Wake);
        }
        Ok(())
    }
    fn OnPropertyValueChanged(&self, _: &PCWSTR, _: &PROPERTYKEY) -> windows::core::Result<()> {
        self.changed.store(true, Ordering::Release);
        let _ = self.tx.send(Request::Wake);
        Ok(())
    }
}
pub fn probe() -> Result<Value, String> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|e| e.to_string())?;
        let result = (|| {
            let old = cpu_times().map_err(|e| e.to_string())?;
            std::thread::sleep(Duration::from_millis(300));
            let cpu = cpu_percent(old, cpu_times().map_err(|e| e.to_string())?);
            let mem = memory().map_err(|e| e.to_string())?;
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| e.to_string())?;
            let audio = endpoint(&en).and_then(|e| audio_read(&e));
            Ok(
                json!({"cpu":cpu,"memory":mem,"volume":audio.map_err(|e|e.to_string()),"audioOutputs":crate::audio_policy::outputs(&en).map_err(|e|e.to_string()),"timestamp":timestamp()}),
            )
        })();
        CoUninitialize();
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cpu_accounts_for_idle_inside_kernel() {
        assert_eq!(cpu_percent([10, 20, 30], [30, 60, 70]), Some(75.));
    }
    #[test]
    fn cpu_rejects_no_elapsed_or_reset() {
        assert_eq!(cpu_percent([1, 2, 3], [1, 2, 3]), None);
        assert_eq!(cpu_percent([2, 3, 4], [1, 2, 3]), None);
    }
    #[test]
    fn real_windows_memory_is_bounded() {
        let m = memory().unwrap();
        assert!(m["totalBytes"].as_u64().unwrap() > 0);
        assert!((0.0..=100.0).contains(&m["percent"].as_f64().unwrap()));
    }
}
#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    fn owner() -> Metrics {
        let (tx, _) = mpsc::channel();
        Metrics {
            data: Default::default(),
            tx,
        }
    }
    #[test]
    fn subscribers_are_owned_by_their_window() {
        let m = owner();
        let sub = m.subscribe("cpu".into(), "bar-one".into(), 2000).unwrap();
        let token = sub["token"].as_str().unwrap();
        m.unsubscribe(token, "bar-two");
        assert!(m.active("cpu"));
        m.unsubscribe(token, "bar-one");
        m.unsubscribe(token, "bar-one");
        assert!(!m.active("cpu"));
    }
    #[test]
    fn destroying_one_monitor_preserves_other_subscribers() {
        let m = owner();
        m.subscribe("memory".into(), "bar-one".into(), 2000)
            .unwrap();
        m.subscribe("memory".into(), "bar-two".into(), 2000)
            .unwrap();
        m.remove_window("bar-one");
        assert!(m.active("memory"));
        assert_eq!(m.diagnostics()["subscribers"], 1);
        m.remove_window("bar-two");
        assert!(!m.active("memory"));
    }
    #[test]
    fn invalid_requests_do_not_create_resources() {
        let m = owner();
        assert!(m.subscribe("gpu".into(), "bar-one".into(), 2000).is_err());
        assert!(m.subscribe("cpu".into(), "bar-one".into(), 1).is_err());
        assert_eq!(m.diagnostics()["subscribers"], 0);
        assert!(m.volume(Some(f32::NAN), None).is_err());
        assert!(m.volume(Some(101.), None).is_err());
    }
}
