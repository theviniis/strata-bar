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
        Foundation::PROPERTYKEY,
        Media::Audio::{Endpoints::*, *},
        System::{
            Com::*,
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
pub fn memory() -> windows::core::Result<Value> {
    Ok(serde_json::to_value(crate::memory::MemoryCollector::default().collect()).expect("Memory contract serializes"))
}
unsafe fn endpoint(
    enumerator: &IMMDeviceEnumerator,
    flow: EDataFlow,
) -> windows::core::Result<IAudioEndpointVolume> {
    enumerator
        .GetDefaultAudioEndpoint(flow, eMultimedia)?
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
        bool,
        Option<f32>,
        Option<bool>,
        mpsc::SyncSender<Result<Value, String>>,
    ),
    Output(bool, String, mpsc::SyncSender<Result<Value, String>>),
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
        if !["cpu", "gpu", "memory", "disk", "volume", "audioOutputs", "microphone", "audioInputs"].contains(&channel.as_str()) {
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
            if (channel=="volume" || channel=="microphone") && d.latest.get(channel).is_some_and(|old|old["status"]==value["status"] && old["data"]==value["data"] && old["error"]==value["error"]){return;}
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
        self.audio_volume(false, level, muted)
    }
    pub fn audio_volume(&self, capture: bool, level: Option<f32>, muted: Option<bool>) -> Result<Value, String> {
        if level.is_some_and(|v| !v.is_finite() || !(0.0..=100.0).contains(&v)) {
            return Err("Volume must be between 0 and 100".into());
        }
        let (tx, rx) = mpsc::sync_channel(1);
        self.tx
            .send(Request::Volume(capture, level, muted, tx))
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(3))
            .map_err(|e| e.to_string())?
    }
    pub fn audio_output(&self, id: String) -> Result<Value, String> {
        self.audio_device(false, id)
    }
    pub fn audio_device(&self, capture: bool, id: String) -> Result<Value, String> {
        if id.is_empty() || id.contains('\0') || id.len() > 4096 { return Err("Invalid endpoint ID".into()); }
        let (tx, rx) = mpsc::sync_channel(1);
        self.tx.send(Request::Output(capture, id, tx)).map_err(|e| e.to_string())?;
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
                for c in ["cpu", "gpu", "memory", "disk", "volume", "audioOutputs", "microphone", "audioInputs"] {
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
            let mut audio: [Option<(IAudioEndpointVolume, IAudioEndpointVolumeCallback)>; 2] = [None, None];
            let mut cpu_collector = crate::cpu::CpuCollector::new(crate::cpu_windows::WindowsCpuSource::default());
            let mut gpu_collector = crate::gpu::GpuCollector::new(crate::gpu_windows::WindowsGpuSource::default());
            let mut disk_collector = crate::disk::DiskCollector::new(crate::disk_windows::WindowsDiskSource);
            let mut memory_collector = crate::memory::MemoryCollector::default();
            let mut next_tick = Instant::now();
            let mut ticks=0;
            let mut devices_active = [false; 2];
            let mut volume_active = [false; 2];
            loop {
                let dirty = changed.swap(false, Ordering::AcqRel);
                for (index, flow, devices_channel, volume_channel) in [(0, eRender, "audioOutputs", "volume"), (1, eCapture, "audioInputs", "microphone")] {
                    let active = self.active(devices_channel);
                    if active && (dirty || !devices_active[index]) {
                        match enumerator.as_ref().map_err(|e| e.clone()).and_then(|en| crate::audio_policy::endpoints(en, flow)) {
                            Ok(v) => self.publish(&app, devices_channel, envelope("ready", v)),
                            Err(e) => self.publish(&app, devices_channel, error(e)),
                        }
                    }
                    devices_active[index] = active;
                    let active_volume = self.active(volume_channel);
                    if active_volume
                        && (dirty || !volume_active[index])
                    {
                        if let Some((e, cb)) = audio[index].take() {
                            let _ = e.UnregisterControlChangeNotify(&cb);
                        }
                        match enumerator
                            .as_ref()
                            .map_err(|e| e.clone())
                            .and_then(|e| endpoint(e, flow))
                        {
                            Ok(e) => {
                                let cb: IAudioEndpointVolumeCallback = VolumeNotify {
                                    owner: self.clone(),
                                    app: app.clone(),
                                    channel: volume_channel,
                                }
                                .into();
                                match e.RegisterControlChangeNotify(&cb) {
                                    Ok(()) => {
                                        match audio_read(&e) {
                                            Ok(v) => self.publish(&app, volume_channel, envelope("ready", v)),
                                            Err(err) => self.publish(&app, volume_channel, error(err)),
                                        };
                                        audio[index] = Some((e, cb));
                                    }
                                    Err(err) => self.publish(&app, volume_channel, error(err)),
                                }
                            }
                            Err(e) => {
                                let absent = enumerator.as_ref().ok().and_then(|en| crate::audio_policy::endpoints(en, flow).ok()).is_some_and(|v|v["defaultDeviceId"].is_null());
                                self.publish(&app, volume_channel, if absent { envelope("unavailable", Value::Null) } else { error(e) });
                            },
                        }
                    } else if !self.active(volume_channel) {
                        if let Some((e, cb)) = audio[index].take() {
                            let _ = e.UnregisterControlChangeNotify(&cb);
                        }
                    }
                    volume_active[index] = active_volume;
                }
                if Instant::now() >= next_tick {
                    if self.active("cpu") {
                        let sample=cpu_collector.collect();
                        self.publish(&app,"cpu",envelope("ready",serde_json::to_value(sample).expect("CPU contract serializes")));
                    }
                    if self.active("gpu") {
                        let sample = gpu_collector.collect();
                        self.publish(&app, "gpu", envelope("ready", serde_json::to_value(sample).expect("GPU contract serializes")));
                    }
                    if self.active("disk") {
                        match disk_collector.collect() {
                            Ok(sample) => self.publish(&app, "disk", envelope("ready", serde_json::to_value(sample).expect("Disk contract serializes"))),
                            Err(e) => self.publish(&app, "disk", error(e)),
                        }
                    }
                    if self.active("memory") {
                        let sample = memory_collector.collect();
                        self.publish(&app, "memory", envelope("ready", serde_json::to_value(sample).expect("Memory contract serializes")));
                    }
                    next_tick = Instant::now() + Duration::from_secs(2);
                    ticks+=1;
                    if ticks==10{let report=json!({"metrics":self.diagnostics(),"windows":crate::desktop::profile()});if let Err(e)=std::fs::write(std::env::temp_dir().join("strata-runtime-profile.json"),report.to_string()){eprintln!("Runtime profile: {e}");}}
                }
                match rx.recv_timeout(next_tick.saturating_duration_since(Instant::now())) {
                    Ok(Request::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Ok(Request::Output(capture, id, reply)) => {
                        let flow = if capture { eCapture } else { eRender };
                        let channel = if capture { "audioInputs" } else { "audioOutputs" };
                        let result = enumerator.as_ref().map_err(|e| e.to_string()).and_then(|en| crate::audio_policy::select_endpoint(en, &id, flow));
                        // Always reread after a partial failure too.
                        if let Ok(en) = &enumerator {
                            match crate::audio_policy::endpoints(en, flow) {
                                Ok(v) => self.publish(&app, channel, envelope("ready", v)),
                                Err(e) => self.publish(&app, channel, error(e)),
                            }
                        }
                        changed.store(true, Ordering::Release);
                        let _ = reply.send(result);
                    }
                    Ok(Request::Volume(capture, level, muted, reply)) => {
                        let result = (|| -> windows::core::Result<Value> {
                            let e = endpoint(enumerator.as_ref().map_err(|e| e.clone())?, if capture { eCapture } else { eRender })?;
                            if let Some(v) = level {
                                e.SetMasterVolumeLevelScalar(v / 100., std::ptr::null())?;
                            }
                            if let Some(v) = muted {
                                e.SetMute(v, std::ptr::null())?;
                            }
                            audio_read(&e)
                        })();
                        if let Ok(v) = &result { self.publish(&app, if capture { "microphone" } else { "volume" }, envelope("ready", v.clone())); }
                        let _ = reply.send(result.map_err(|e| e.to_string()));
                    }
                    Ok(Request::Wake) => { devices_active = [false; 2]; volume_active = [false; 2]; },
                    _ => {}
                }
            }
            for slot in &mut audio {
                if let Some((e, cb)) = slot.take() {
                    let _ = e.UnregisterControlChangeNotify(&cb);
                }
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
    channel: &'static str,
}
impl IAudioEndpointVolumeCallback_Impl for VolumeNotify_Impl {
    fn OnNotify(&self, p: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> windows::core::Result<()> {
        if let Some(v) = unsafe { p.as_ref() } {
            self.owner.publish(
                &self.app,
                self.channel,
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
        if (flow == eRender || flow == eCapture) && (role == eMultimedia || role == eConsole || role == eCommunications) {
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
            let mut collector=crate::cpu::CpuCollector::new(crate::cpu_windows::WindowsCpuSource::default());
            let mut gpu_collector=crate::gpu::GpuCollector::new(crate::gpu_windows::WindowsGpuSource::default());
            let mut disk_collector=crate::disk::DiskCollector::new(crate::disk_windows::WindowsDiskSource);
            collector.collect();
            gpu_collector.collect();
            std::thread::sleep(Duration::from_secs(2));
            let cpu=collector.collect();
            let gpu=gpu_collector.collect();
            let mem = memory().map_err(|e| e.to_string())?;
            let disk = disk_collector.collect();
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| e.to_string())?;
            let audio = endpoint(&en, eRender).and_then(|e| audio_read(&e));
            Ok(
                json!({"cpu":cpu,"gpu":gpu,"memory":mem,"disk":disk,"volume":audio.map_err(|e|e.to_string()),"microphone":endpoint(&en, eCapture).and_then(|e|audio_read(&e)).map_err(|e|e.to_string()),"audioInputs":crate::audio_policy::endpoints(&en, eCapture).map_err(|e|e.to_string()),"audioOutputs":crate::audio_policy::outputs(&en).map_err(|e|e.to_string()),"timestamp":timestamp()}),
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
    fn real_windows_memory_is_bounded() {
        let m = memory().unwrap();
        assert!(m["totalBytes"]["value"].as_f64().unwrap() > 0.);
        assert!(m["sampledAt"].as_f64().unwrap() > 0.);
        if let Some(percent) = m["percent"]["value"].as_f64() {
            assert!((0.0..=100.0).contains(&percent));
        }
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
        assert!(m.subscribe("network".into(), "bar-one".into(), 2000).is_err());
        assert!(m.subscribe("cpu".into(), "bar-one".into(), 1).is_err());
        assert_eq!(m.diagnostics()["subscribers"], 0);
        assert!(m.volume(Some(f32::NAN), None).is_err());
        assert!(m.volume(Some(101.), None).is_err());
        for level in [f32::NAN, f32::INFINITY, -1., 101.] {
            assert!(m.audio_volume(true, Some(level), None).is_err());
        }
        for id in ["", "bad\0id"] { assert!(m.audio_device(true, id.into()).is_err()); }
        m.subscribe("microphone".into(), "bar-one".into(), 2000).unwrap();
        assert!(m.active("microphone"));
        assert!(!m.active("volume"));
    }
}
