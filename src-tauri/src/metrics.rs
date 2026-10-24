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

/// Channels the shared worker polls. Everything else is event-driven: Core
/// Audio callbacks push volume/microphone, komorebi streams its pipe.
const POLLED: [&str; 4] = ["cpu", "gpu", "memory", "disk"];
/// Documented bounds, identical to the Zod schema and `config.rs` validation.
const MIN_INTERVAL_MS: u64 = 1_000;
const MAX_INTERVAL_MS: u64 = 60_000;

/// Per-channel poll deadlines. A channel first collected on demand is due
/// immediately, then every `interval_ms`; a one-second floor keeps a fast
/// subscriber from starving the audio and message work in the same loop.
#[derive(Default)]
struct Timer {
    due: std::collections::HashMap<&'static str, Instant>,
}

impl Timer {
    fn due(&mut self, channel: &'static str, interval_ms: u64, now: Instant) -> bool {
        match self.due.get(channel) {
            Some(deadline) if *deadline > now => false,
            _ => {
                // Never schedule behind the clock: a stall must not become a burst.
                self.due.insert(channel, now + Duration::from_millis(interval_ms));
                true
            }
        }
    }

    fn clear(&mut self, channel: &'static str) {
        self.due.remove(channel);
    }

    /// How long the worker may sleep: the nearest deadline, capped so message
    /// handling, Voicemeeter maintenance and the runtime profile still run.
    fn next_wait(&self, now: Instant) -> Duration {
        self.due
            .values()
            .min()
            .map(|deadline| deadline.saturating_duration_since(now))
            .unwrap_or(Duration::from_secs(2))
            .min(Duration::from_secs(2))
    }
}
pub fn envelope(status: &str, data: Value) -> Value {
    json!({"status":status,"data":data,"timestamp":timestamp()})
}
fn error(e: impl std::fmt::Display) -> Value {
    json!({"status":"error","data":null,"error":e.to_string(),"timestamp":timestamp()})
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
    interval_ms: u64,
}
#[derive(Default)]
struct Data {
    next: u64,
    subs: HashMap<String, Sub>,
    latest: HashMap<String, Value>,
    incoming: HashMap<String,u64>,
    emitted: HashMap<String,u64>,
    sensor_service: Value,
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
    Source(
        String,
        Option<crate::voicemeeter::Target>,
        mpsc::SyncSender<Result<(), String>>,
    ),
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
        if !["cpu", "gpu", "memory", "disk", "volume", "audioOutputs", "microphone", "audioInputs", "voicemeeter"].contains(&channel.as_str()) {
            return Err(format!("Unsupported channel: {channel}"));
        }
        if !(MIN_INTERVAL_MS..=MAX_INTERVAL_MS).contains(&interval) {
            return Err(format!(
                "Sampling interval must be between {MIN_INTERVAL_MS} and {MAX_INTERVAL_MS} ms"
            ));
        }
        let mut d = self.data.lock().map_err(|e| e.to_string())?;
        d.next += 1;
        let token = d.next.to_string();
        let initial = d
            .latest
            .get(&channel)
            .cloned()
            .unwrap_or_else(|| envelope("loading", Value::Null));
        d.subs.insert(
            token.clone(),
            Sub {
                channel,
                window,
                interval_ms: interval,
            },
        );
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
    /// Shortest interval any live subscriber asked for, so the shared worker
    /// collects at the cadence the fastest widget needs. `None` for channels
    /// that are event-driven or have no subscribers.
    fn interval(&self, channel: &str) -> Option<u64> {
        if !POLLED.contains(&channel) {
            return None;
        }
        self.data
            .lock()
            .unwrap()
            .subs
            .values()
            .filter(|s| s.channel == channel)
            .map(|s| s.interval_ms)
            .min()
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
    /// Routes a channel through Voicemeeter (`Some`) or back to the Windows
    /// default endpoints (`None`). The worker owns the routing, so reads and
    /// writes on that channel follow it consistently.
    pub fn set_channel_source(
        &self,
        channel: String,
        target: Option<crate::voicemeeter::TargetRequest>,
    ) -> Result<(), String> {
        if !["volume", "microphone"].contains(&channel.as_str()) {
            return Err("set_channel_source supports the volume and microphone channels".into());
        }
        let target = match target {
            None => None,
            Some(request) => Some(
                crate::voicemeeter::Target::parse(Some(&request.kind), Some(request.index))
                    .ok_or_else(|| {
                        format!(
                            "Invalid Voicemeeter target: {}[{}]",
                            request.kind, request.index
                        )
                    })?,
            ),
        };
        let (tx, rx) = mpsc::sync_channel(1);
        self.tx
            .send(Request::Source(channel, target, tx))
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(3))
            .map_err(|e| e.to_string())?
    }
    pub fn diagnostics(&self) -> Value {
        let intervals: serde_json::Map<String, Value> = POLLED
            .into_iter()
            .filter_map(|channel| {
                self.interval(channel).map(|ms| (channel.to_string(), json!(ms)))
            })
            .collect();
        let d = self.data.lock().unwrap();
        json!({"subscribers":d.subs.len(),"channels":d.latest,"collectorThreads":1,"sensorClientThreads":1,"sensorService":d.sensor_service,"intervals":intervals,"incoming":d.incoming,"emitted":d.emitted})
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
            let sensor_client = crate::sensors::Client::new();
            let mut sensor_trace = std::env::var_os("STRATA_SENSOR_TRACE").and_then(|path| {
                match std::fs::OpenOptions::new().create_new(true).write(true).open(path) {
                    Ok(file) => Some(file),
                    Err(error) => { eprintln!("Sensor trace: {error}"); None }
                }
            });
            let sensor_trace_started = Instant::now();
            let mut voicemeeter = crate::voicemeeter::Client::native();
            let mut sources: HashMap<String, crate::voicemeeter::Target> = HashMap::new();
            let mut vm_published = false;
            let mut timer = Timer::default();
            let mut ticks=0;
            let mut devices_active = [false; 2];
            let mut volume_active = [false; 2];
            loop {
                let dirty = changed.swap(false, Ordering::AcqRel);
                // Voicemeeter maintenance: keep the remote session warm when the
                // routing menu or a routed audio channel needs it, then publish
                // per-channel levels and the strip/bus snapshot (the remote API
                // is poll-driven).
                let routed: Vec<&str> = ["volume", "microphone"]
                    .into_iter()
                    .filter(|channel| sources.contains_key(*channel) && self.active(channel))
                    .collect();
                let menu_wanted = self.active("voicemeeter");
                if !routed.is_empty() || menu_wanted {
                    match voicemeeter.poll() {
                        Err(_) => {
                            // Never fall through to Windows demo values: routed
                            // channels and the menu stay unavailable until
                            // Voicemeeter is back.
                            for channel in &routed {
                                self.publish(&app, channel, envelope("unavailable", Value::Null));
                            }
                            if menu_wanted {
                                self.publish(&app, "voicemeeter", envelope("unavailable", Value::Null));
                            }
                        }
                        Ok(state) => {
                            for channel in &routed {
                                let target = sources.get(*channel).copied().expect("filtered");
                                match voicemeeter.read(target) {
                                    Ok((level, muted)) => self.publish(
                                        &app,
                                        channel,
                                        envelope("ready", json!({"level": level, "muted": muted})),
                                    ),
                                    Err(e) => self.publish(&app, channel, error(e)),
                                }
                            }
                            if menu_wanted && (matches!(state, crate::voicemeeter::Poll::Changed) || !vm_published) {
                                match voicemeeter.snapshot() {
                                    Ok(snapshot) => self.publish(
                                        &app,
                                        "voicemeeter",
                                        envelope("ready", serde_json::to_value(&snapshot).expect("Voicemeeter snapshot serializes")),
                                    ),
                                    Err(e) => self.publish(&app, "voicemeeter", error(e)),
                                }
                                vm_published = true;
                            }
                        }
                    }
                } else {
                    vm_published = false;
                }
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
                    if sources.contains_key(volume_channel) {
                        // Voicemeeter owns this channel: never read the Windows
                        // default endpoint and drop any WASAPI callback.
                        if let Some((e, cb)) = audio[index].take() {
                            let _ = e.UnregisterControlChangeNotify(&cb);
                        }
                    } else if active_volume && (dirty || !volume_active[index]) {
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
                    } else if !active_volume {
                        if let Some((e, cb)) = audio[index].take() {
                            let _ = e.UnregisterControlChangeNotify(&cb);
                        }
                    }
                    volume_active[index] = active_volume && !sources.contains_key(volume_channel);
                }
                let now = Instant::now();
                let wanted: Vec<_> = POLLED.into_iter().filter(|c| self.active(c)).collect();
                sensor_client.subscribe(&wanted);
                self.data.lock().unwrap().sensor_service = sensor_client.diagnostics();
                let mut collected = false;
                for channel in POLLED {
                    let Some(interval) = self.interval(channel) else {
                        timer.clear(channel);
                        continue;
                    };
                    if !timer.due(channel, interval, now) {
                        continue;
                    }
                    collected = true;
                    match sensor_client.sample(channel) {
                        Ok(sample) => self.publish(&app, channel, envelope("ready", sample)),
                        Err(e) => self.publish(&app, channel, error(e)),
                    }
                }
                if collected {
                    // Diagnostic capture must not grow for the lifetime of a
                    // user's bar. Leave five minutes beyond the one-hour soak
                    // for the deliberate service-restart check.
                    if sensor_trace_started.elapsed() >= Duration::from_secs(65 * 60)
                        || sensor_trace.as_ref().is_some_and(|file| file.metadata().is_ok_and(|m| m.len() >= 128 * 1024 * 1024))
                    {
                        sensor_trace = None;
                    }
                    if let Some(file) = &mut sensor_trace {
                        use std::io::Write;
                        let report = json!({"observedAt":timestamp(),"metrics":self.diagnostics(),"sensors":sensor_client.diagnostics()});
                        if let Err(error) = writeln!(file, "{report}") {
                            eprintln!("Sensor trace: {error}");
                            sensor_trace = None;
                        }
                    }
                    ticks+=1;
                    if ticks==10{let report=json!({"metrics":self.diagnostics(),"windows":crate::desktop::profile(),"sensors":sensor_client.diagnostics()});if let Err(e)=std::fs::write(std::env::temp_dir().join("strata-runtime-profile.json"),report.to_string()){eprintln!("Runtime profile: {e}");}}
                }
                match rx.recv_timeout(timer.next_wait(Instant::now())) {
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
                        let channel = if capture { "microphone" } else { "volume" };
                        let result: Result<Value, String> = match sources.get(channel).copied() {
                            // Routed through Voicemeeter: the writes land on the
                            // configured strip/bus, not on any WASAPI endpoint.
                            Some(target) => voicemeeter
                                .write(target, level, muted)
                                .map(|(level, muted)| json!({"level": level, "muted": muted})),
                            None => {
                                let flow = if capture { eCapture } else { eRender };
                                (|| -> windows::core::Result<Value> {
                                    let e =
                                        endpoint(enumerator.as_ref().map_err(|e| e.clone())?, flow)?;
                                    if let Some(v) = level {
                                        e.SetMasterVolumeLevelScalar(v / 100., std::ptr::null())?;
                                    }
                                    if let Some(v) = muted {
                                        e.SetMute(v, std::ptr::null())?;
                                    }
                                    audio_read(&e)
                                })()
                                .map_err(|e| e.to_string())
                            }
                        };
                        if let Ok(v) = &result {
                            self.publish(&app, channel, envelope("ready", v.clone()));
                        }
                        let _ = reply.send(result);
                    }
                    Ok(Request::Source(channel, target, reply)) => {
                        match target {
                            Some(target) => {
                                sources.insert(channel.clone(), target);
                            }
                            None => {
                                sources.remove(&channel);
                            }
                        }
                        devices_active = [false; 2];
                        volume_active = [false; 2];
                        changed.store(true, Ordering::Release);
                        let _ = reply.send(Ok(()));
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
            let sensors = crate::sensors::Client::new();
            sensors.subscribe(&POLLED);
            let deadline = Instant::now() + Duration::from_secs(8);
            while Instant::now() < deadline && POLLED.iter().any(|c| sensors.sample(c).is_err()) {
                std::thread::sleep(Duration::from_millis(100));
            }
            let cpu = sensors.sample("cpu");
            let gpu = sensors.sample("gpu");
            let mem = sensors.sample("memory");
            let disk = sensors.sample("disk");
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| e.to_string())?;
            let audio = endpoint(&en, eRender).and_then(|e| audio_read(&e));
            Ok(
                json!({"cpu":cpu,"gpu":gpu,"memory":mem,"disk":disk,"sensors":sensors.diagnostics(),"volume":audio.map_err(|e|e.to_string()),"microphone":endpoint(&en, eCapture).and_then(|e|audio_read(&e)).map_err(|e|e.to_string()),"audioInputs":crate::audio_policy::endpoints(&en, eCapture).map_err(|e|e.to_string()),"audioOutputs":crate::audio_policy::outputs(&en).map_err(|e|e.to_string()),"timestamp":timestamp()}),
            )
        })();
        CoUninitialize();
        result
    }
}
#[cfg(test)]
mod channel_source_tests {
    use super::*;

    #[test]
    fn routing_validates_the_channel_and_target() {
        let (tx, rx) = mpsc::channel();
        drop(rx); // No worker: valid requests must stop at the worker hop.
        let m = Metrics {
            data: Default::default(),
            tx,
        };
        let error = m.set_channel_source("cpu".into(), None).unwrap_err();
        assert!(error.contains("volume and microphone"), "{error}");
        assert!(m
            .set_channel_source(
                "volume".into(),
                Some(crate::voicemeeter::TargetRequest {
                    kind: "aux".into(),
                    index: 0
                })
            )
            .unwrap_err()
            .contains("Invalid Voicemeeter target"));
        assert!(m
            .set_channel_source(
                "volume".into(),
                Some(crate::voicemeeter::TargetRequest {
                    kind: "bus".into(),
                    index: 8
                })
            )
            .unwrap_err()
            .contains("Invalid Voicemeeter target"));
        // A validated request reaches the (dead) worker instead of failing validation.
        assert!(m
            .set_channel_source(
                "microphone".into(),
                Some(crate::voicemeeter::TargetRequest {
                    kind: "strip".into(),
                    index: 0
                })
            )
            .is_err());
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
    #[test]
    fn configured_intervals_are_accepted_within_the_documented_bounds() {
        let m = owner();
        for interval in [1000, 1500, 2000, 5000, 60_000] {
            assert!(
                m.subscribe("cpu".into(), "bar-one".into(), interval).is_ok(),
                "{interval} ms must be accepted"
            );
        }
        assert!(m.subscribe("cpu".into(), "bar-one".into(), 999).is_err());
        assert!(m.subscribe("cpu".into(), "bar-one".into(), 60_001).is_err());
    }
    #[test]
    fn the_fastest_subscriber_sets_each_channels_effective_interval() {
        let m = owner();
        m.subscribe("cpu".into(), "bar-one".into(), 5000).unwrap();
        m.subscribe("cpu".into(), "bar-two".into(), 2000).unwrap();
        m.subscribe("memory".into(), "bar-one".into(), 10_000).unwrap();
        assert_eq!(m.interval("cpu"), Some(2000));
        assert_eq!(m.interval("memory"), Some(10_000));
        assert_eq!(m.interval("gpu"), None);
        // Removing every subscriber returns the channel to "not scheduled".
        m.remove_window("bar-one");
        m.remove_window("bar-two");
        assert_eq!(m.interval("cpu"), None);
        assert_eq!(m.interval("memory"), None);
    }
    #[test]
    fn event_channels_ignore_the_poll_interval() {
        let m = owner();
        // Volume and microphone are Core Audio callbacks, komorebi is a pipe.
        for channel in ["volume", "microphone", "audioOutputs", "voicemeeter"] {
            m.subscribe(channel.into(), "bar-one".into(), 60_000).unwrap();
            assert_eq!(m.interval(channel), None, "{channel} is event-driven");
        }
    }
}
