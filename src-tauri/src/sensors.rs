//! Read-only client for the installed privileged sensor service. Pipe I/O runs
//! on its own thread; the audio/metrics worker only reads this bounded cache.
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    fs::{File, OpenOptions},
    io::{Read, Write},
    os::windows::{fs::OpenOptionsExt, io::AsRawHandle},
    sync::{
        atomic::{AtomicBool, AtomicU8, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use windows::{
    core::w,
    Win32::{
        Foundation::HANDLE,
        System::{Pipes::*, Services::*},
    },
};

const CHANNELS: [&str; 4] = ["cpu", "gpu", "memory", "disk"];
const LIMIT: usize = 1024 * 1024;
const STALE: Duration = Duration::from_secs(6);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    version: u32,
    #[serde(rename = "type")]
    kind: String,
    instance_id: String,
    sequence: u64,
    sampled_at: f64,
    channels: HashMap<String, Channel>,
    diagnostics: Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Channel {
    identity: String,
    data: Value,
}
struct Cached {
    identity: String,
    value: Value,
    history: VecDeque<Value>,
    received: Instant,
}
#[derive(Default)]
struct Cache {
    instance: String,
    sequence: u64,
    channels: HashMap<String, Cached>,
    diagnostics: Value,
    error: Option<String>,
    connections: u64,
    disconnects: u64,
    last_transport_error: Option<String>,
    connected: bool,
}
fn number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .filter(|v| v.is_finite() && *v >= 0. && *v <= 9_007_199_254_740_991.)
}
fn fields(channel: &str) -> &'static [&'static str] {
    match channel {
        "cpu" => &[
            "percent",
            "frequencyHz",
            "maxFrequencyHz",
            "physicalCores",
            "logicalProcessors",
            "temperatureCelsius",
        ],
        "gpu" => &[
            "percent",
            "memoryUsedBytes",
            "memoryTotalBytes",
            "sharedUsedBytes",
            "sharedTotalBytes",
            "temperatureCelsius",
            "powerWatts",
            "fanPercent",
        ],
        "memory" => &[
            "totalBytes",
            "availableBytes",
            "usedBytes",
            "cachedBytes",
            "pagingFileBytes",
            "percent",
        ],
        _ => &[],
    }
}
fn validate_data(channel: &str, value: &Value, at: f64) -> Result<(), String> {
    if !value.is_object() {
        return Err("Expected sensor object".into());
    }
    if ["sequence", "sampledAt", "history"]
        .iter()
        .any(|key| value.get(key).is_some())
    {
        return Err("Reserved sensor field".into());
    }
    for key in fields(channel) {
        let metric = &value[*key];
        let valid_number = metric["value"].is_null() || number(&metric["value"]).is_some();
        let valid_time =
            metric["updatedAt"].is_null() || number(&metric["updatedAt"]).is_some_and(|t| t <= at);
        let status_valid = match metric["status"].as_str() {
            Some("ready") => {
                !metric["value"].is_null()
                    && metric["updatedAt"].as_f64() == Some(at)
                    && metric["error"].is_null()
            }
            Some("unavailable") => {
                metric["value"].is_null()
                    && metric["updatedAt"].is_null()
                    && metric["error"].is_string()
            }
            Some("notConfigured") => {
                channel == "memory"
                    && *key == "pagingFileBytes"
                    && metric["value"].is_null()
                    && !metric["updatedAt"].is_null()
                    && metric["error"].is_null()
            }
            _ => false,
        };
        if !valid_number
            || !valid_time
            || !status_valid
            || metric.as_object().is_none_or(|m| m.len() != 4)
        {
            return Err(format!("Invalid {channel}.{key} metric"));
        }
        if let Some(v) = number(&metric["value"]) {
            let max = match *key {
                "percent" | "fanPercent" => 100.,
                "temperatureCelsius" => 200.,
                "powerWatts" => 2000.,
                _ => f64::MAX,
            };
            if v > max
                || (matches!(
                    *key,
                    "frequencyHz" | "maxFrequencyHz" | "physicalCores" | "logicalProcessors"
                ) && v <= 0.)
                || (matches!(*key, "physicalCores" | "logicalProcessors") && v.fract() != 0.)
            {
                return Err(format!("Out of bounds {key}"));
            }
        }
    }
    for (used, total) in [
        ("memoryUsedBytes", "memoryTotalBytes"),
        ("sharedUsedBytes", "sharedTotalBytes"),
        ("usedBytes", "totalBytes"),
        ("availableBytes", "totalBytes"),
    ] {
        if let (Some(u), Some(t)) = (
            number(&value[used]["value"]),
            number(&value[total]["value"]),
        ) {
            if u > t {
                return Err("Inconsistent sensor memory bounds".into());
            }
        }
    }
    if channel == "cpu" || channel == "gpu" {
        let sensor = &value["temperatureSensor"];
        if !sensor.is_null()
            && (sensor["provider"] != "libreHardwareMonitor"
                || ["hardwareId", "sensorId", "name"].iter().any(|k| {
                    sensor[k]
                        .as_str()
                        .is_none_or(|s| s.is_empty() || s.len() > 4096)
                }))
        {
            return Err("Invalid LHM sensor identity".into());
        }
    }
    // Deserialize through the same canonical contract used to generate TS.
    // This rejects unknown/missing fields and malformed device/volume metadata.
    let mut typed = value.clone();
    typed["sequence"] = json!(0);
    typed["sampledAt"] = json!(at);
    if channel != "disk" {
        typed["history"] = json!([]);
    }
    match channel {
        "cpu" => {
            serde_json::from_value::<crate::cpu_contract::CpuData>(typed)
                .map_err(|e| e.to_string())?;
        }
        "gpu" => {
            serde_json::from_value::<crate::gpu_contract::GpuData>(typed)
                .map_err(|e| e.to_string())?;
        }
        "memory" => {
            serde_json::from_value::<crate::memory_contract::MemoryData>(typed)
                .map_err(|e| e.to_string())?;
        }
        "disk" => {
            let disk = serde_json::from_value::<crate::disk_contract::DiskData>(typed)
                .map_err(|e| e.to_string())?;
            if disk.volumes.len() > 26 {
                return Err("Too many drive letters".into());
            }
            let mut mounts = std::collections::HashSet::new();
            let mut previous = String::new();
            for v in disk.volumes {
                let bytes = v.mount.as_bytes();
                if bytes.len() != 2
                    || !bytes[0].is_ascii_uppercase()
                    || bytes[1] != b':'
                    || v.mount <= previous
                    || !mounts.insert(v.mount.clone())
                    || [v.total_bytes, v.free_bytes, v.used_bytes, v.percent]
                        .iter()
                        .any(|v| !v.is_finite() || *v < 0.)
                    || v.total_bytes <= 0.
                    || v.free_bytes > v.total_bytes
                    || v.used_bytes > v.total_bytes
                    || v.percent > 100.
                    || v.total_bytes > 9_007_199_254_740_991.
                    || v.used_bytes != v.total_bytes - v.free_bytes
                    || (v.percent - v.used_bytes / v.total_bytes * 100.).abs() > 1e-6
                {
                    return Err("Invalid volume bounds or identity".into());
                }
                previous = v.mount;
            }
        }
        _ => return Err("Unknown channel".into()),
    }
    Ok(())
}
impl Cache {
    fn accept(&mut self, snapshot: Snapshot, now: Instant) -> Result<(), String> {
        if snapshot.version != 1
            || snapshot.kind != "snapshot"
            || snapshot.instance_id.len() != 32
            || !snapshot.instance_id.bytes().all(|b| b.is_ascii_hexdigit())
            || snapshot.sequence == 0
            || number(&json!(snapshot.sampled_at)).is_none()
            || snapshot.channels.len() > 4
            || snapshot
                .channels
                .keys()
                .any(|k| !CHANNELS.contains(&k.as_str()))
        {
            return Err("Invalid sensor snapshot".into());
        }
        // Validate all channels before committing any part of a frame.
        for (name, channel) in &snapshot.channels {
            if channel.identity.is_empty() || channel.identity.len() > 4096 {
                return Err("Invalid hardware identity".into());
            }
            validate_data(name, &channel.data, snapshot.sampled_at)?;
        }
        if self.instance == snapshot.instance_id && snapshot.sequence <= self.sequence {
            return Ok(());
        }
        let restarted = self.instance != snapshot.instance_id;
        if restarted {
            self.channels.clear();
        }
        self.instance = snapshot.instance_id;
        self.sequence = snapshot.sequence;
        self.diagnostics = snapshot.diagnostics;
        self.error = None;
        for (name, channel) in snapshot.channels {
            let cached = self.channels.entry(name.clone()).or_insert_with(|| Cached {
                identity: channel.identity.clone(),
                value: Value::Null,
                history: VecDeque::new(),
                received: now,
            });
            let sensor_changed = channel.data.get("temperatureSensor").is_some_and(|s| {
                !s.is_null()
                    && cached
                        .value
                        .get("temperatureSensor")
                        .is_some_and(|old| !old.is_null() && old != s)
            });
            if cached.identity != channel.identity
                || sensor_changed
                || cached.value["sampledAt"]
                    .as_f64()
                    .is_some_and(|t| t >= snapshot.sampled_at)
            {
                cached.history.clear();
                cached.value = Value::Null;
            }
            let old = &cached.value;
            let mut data = channel.data;
            for key in fields(&name) {
                if data[*key]["status"] == "unavailable" && old[*key]["value"].is_number() {
                    let reason = data[*key]["error"].clone();
                    data[*key] = old[*key].clone();
                    data[*key]["status"] = json!("error");
                    data[*key]["error"] = reason;
                }
            }
            if data["temperatureSensor"].is_null()
                && !old["temperatureSensor"].is_null()
                && data.get("temperatureSensor").is_some()
            {
                data["temperatureSensor"] = old["temperatureSensor"].clone();
            }
            // Local sequence stays within the public u32 contract and resets with identity/history.
            let sequence = old["sequence"].as_u64().unwrap_or(0).wrapping_add(1) as u32;
            if sequence == 0 {
                cached.history.clear();
            }
            data["sequence"] = json!(sequence);
            data["sampledAt"] = json!(snapshot.sampled_at);
            if name != "disk" {
                let percent = if data["percent"]["status"] == "ready" {
                    data["percent"]["value"].clone()
                } else {
                    Value::Null
                };
                let mut point =
                    json!({"sequence":sequence,"timestamp":snapshot.sampled_at,"percent":percent});
                if name == "cpu" || name == "gpu" {
                    let temperature = &data["temperatureCelsius"];
                    let ready = temperature["status"] == "ready";
                    point["temperatureCelsius"] = if ready {
                        temperature["value"].clone()
                    } else {
                        Value::Null
                    };
                    point["temperatureUpdatedAt"] = if ready {
                        temperature["updatedAt"].clone()
                    } else {
                        Value::Null
                    };
                }
                cached.history.push_back(point);
                while cached.history.len() > 61
                    || cached.history.front().is_some_and(|p| {
                        snapshot.sampled_at - p["timestamp"].as_f64().unwrap_or(0.) > 120000.
                    })
                {
                    cached.history.pop_front();
                }
                data["history"] = json!(cached.history);
            }
            cached.identity = channel.identity;
            cached.received = now;
            cached.value = data;
        }
        Ok(())
    }
    fn sample(&self, channel: &str, now: Instant) -> Result<Value, String> {
        let cache = self.channels.get(channel).ok_or_else(|| {
            self.error
                .clone()
                .unwrap_or_else(|| "Sensor service not ready".into())
        })?;
        let mut value = cache.value.clone();
        if now.saturating_duration_since(cache.received) > STALE {
            if channel == "disk" {
                return Err("Sensor service snapshot expired".into());
            }
            for key in fields(channel) {
                if value[*key]["value"].is_number() {
                    value[*key]["status"] = json!("error");
                    value[*key]["error"] = json!("Sensor service snapshot expired");
                } else if value[*key]["status"] == "notConfigured" {
                    value[*key] = json!({"status":"unavailable","value":null,"updatedAt":null,"error":"Sensor service snapshot expired"});
                }
            }
        }
        Ok(value)
    }
}

pub struct Client {
    active: Arc<AtomicU8>,
    stop: Arc<AtomicBool>,
    cache: Arc<Mutex<Cache>>,
}
impl Client {
    pub fn new() -> Self {
        let active = Arc::new(AtomicU8::new(0));
        let stop = Arc::new(AtomicBool::new(false));
        let cache = Arc::new(Mutex::new(Cache::default()));
        let (wanted, stopped, shared) = (active.clone(), stop.clone(), cache.clone());
        thread::Builder::new()
            .name("strata-sensor-pipe".into())
            .spawn(move || {
                let mut delay = 1u64;
                while !stopped.load(Ordering::Acquire) {
                    if wanted.load(Ordering::Acquire) == 0 {
                        thread::sleep(Duration::from_millis(100));
                        continue;
                    }
                    let result = session(&wanted, &stopped, &shared);
                    if let Err(e) = result {
                        {
                            let mut cache = shared.lock().unwrap_or_else(|e| e.into_inner());
                            cache.error = Some(e.clone());
                            cache.last_transport_error = Some(e);
                            cache.disconnects += 1;
                            cache.connected = false;
                        }
                        let until = Instant::now() + Duration::from_secs(delay);
                        while Instant::now() < until
                            && !stopped.load(Ordering::Acquire)
                            && wanted.load(Ordering::Acquire) != 0
                        {
                            thread::sleep(Duration::from_millis(100));
                        }
                        delay = (delay * 2).min(30);
                    } else {
                        shared.lock().unwrap_or_else(|e| e.into_inner()).connected = false;
                        delay = 1;
                    }
                }
            })
            .expect("Spawn sensor pipe client");
        Self {
            active,
            stop,
            cache,
        }
    }
    pub fn subscribe(&self, channels: &[&str]) {
        self.active.store(
            CHANNELS.iter().enumerate().fold(0, |mask, (i, c)| {
                mask | if channels.contains(c) { 1 << i } else { 0 }
            }),
            Ordering::Release,
        );
    }
    pub fn sample(&self, channel: &str) -> Result<Value, String> {
        self.cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .sample(channel, Instant::now())
    }
    pub fn diagnostics(&self) -> Value {
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        let channels: serde_json::Map<String, Value> = cache.channels.iter().map(|(name, channel)| {
            (name.clone(), json!({"ageMs":now.saturating_duration_since(channel.received).as_millis() as u64,"sampledAt":channel.value["sampledAt"],"sequence":channel.value["sequence"]}))
        }).collect();
        json!({"instanceId":cache.instance,"sequence":cache.sequence,"error":cache.error,"service":cache.diagnostics,"channels":channels,"connected":cache.connected,"connections":cache.connections,"disconnects":cache.disconnects,"lastTransportError":cache.last_transport_error})
    }
}
impl Drop for Client {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
    }
}

fn session(active: &AtomicU8, stop: &AtomicBool, cache: &Mutex<Cache>) -> Result<(), String> {
    let mut pipe = OpenOptions::new()
        .read(true)
        .write(true)
        .access_mode(0x12019b)
        .open(r"\\.\pipe\Strata.SensorService.v1")
        .map_err(|e| format!("Sensor service unavailable: {e}"))?;
    verify_server(&pipe)?;
    {
        let mut cache = cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.connections += 1;
        cache.connected = true;
    }
    unsafe {
        SetNamedPipeHandleState(HANDLE(pipe.as_raw_handle()), Some(&PIPE_NOWAIT), None, None)
            .map_err(|e| e.to_string())?;
    }
    while !stop.load(Ordering::Acquire) {
        let mask = active.load(Ordering::Acquire);
        let channels: Vec<_> = CHANNELS
            .iter()
            .enumerate()
            .filter_map(|(i, c)| (mask & (1 << i) != 0).then_some(c))
            .collect();
        let body = serde_json::to_vec(&json!({"version":1,"type":"subscribe","channels":channels}))
            .map_err(|e| e.to_string())?;
        let deadline = Instant::now() + STALE;
        transfer(
            &mut pipe,
            &mut (body.len() as u32).to_le_bytes(),
            true,
            deadline,
            stop,
        )?;
        transfer(&mut pipe, &mut body.clone(), true, deadline, stop)?;
        let mut header = [0u8; 4];
        transfer(&mut pipe, &mut header, false, deadline, stop)?;
        let length = frame_length(header)?;
        let mut body = vec![0; length];
        transfer(&mut pipe, &mut body, false, deadline, stop)?;
        let value: Value = serde_json::from_slice(&body).map_err(|e| e.to_string())?;
        if value == json!({"version":1,"type":"loading"}) { /* waiting for first tick */
        } else {
            let snapshot: Snapshot = serde_json::from_value(value).map_err(|e| e.to_string())?;
            let age = crate::metrics::timestamp() as f64 - snapshot.sampled_at;
            if !(-1000.0..=6000.0).contains(&age) {
                return Err("Sensor snapshot time is outside the freshness window".into());
            }
            cache
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .accept(snapshot, Instant::now())?;
        }
        if mask == 0 {
            return Ok(());
        }
        for _ in 0..5 {
            if stop.load(Ordering::Acquire) {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }
    Ok(())
}
fn frame_length(header: [u8; 4]) -> Result<usize, String> {
    let length = u32::from_le_bytes(header) as usize;
    if length == 0 || length > LIMIT {
        Err("Invalid sensor frame length".into())
    } else {
        Ok(length)
    }
}
fn transfer(
    pipe: &mut File,
    bytes: &mut [u8],
    write: bool,
    deadline: Instant,
    stop: &AtomicBool,
) -> Result<(), String> {
    let mut offset = 0;
    while offset < bytes.len() {
        if stop.load(Ordering::Acquire) || Instant::now() >= deadline {
            return Err("Sensor pipe deadline exceeded".into());
        }
        if !write {
            // std::fs maps ERROR_NO_DATA to Ok(0) on Windows pipes. In NOWAIT
            // mode that means "not yet", not EOF. Peek distinguishes an idle
            // connected peer from a genuinely closed pipe before reading.
            let mut available = 0;
            unsafe {
                PeekNamedPipe(
                    HANDLE(pipe.as_raw_handle()),
                    None,
                    0,
                    None,
                    Some(&mut available),
                    None,
                )
                .map_err(|e| format!("Sensor pipe read: {e}"))?;
            }
            if available == 0 {
                thread::sleep(Duration::from_millis(20));
                continue;
            }
        }
        let result = if write {
            pipe.write(&bytes[offset..])
        } else {
            pipe.read(&mut bytes[offset..])
        };
        match result {
            Ok(0) => return Err("Sensor service disconnected".into()),
            Ok(n) => offset += n,
            Err(e)
                if matches!(e.raw_os_error(), Some(232) | Some(536))
                    || e.kind() == std::io::ErrorKind::WouldBlock =>
            {
                thread::sleep(Duration::from_millis(20))
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
fn verify_server(pipe: &File) -> Result<(), String> {
    // SCM is authoritative; a user-created pipe with the right name is not.
    unsafe {
        let mut pid = 0;
        GetNamedPipeServerProcessId(HANDLE(pipe.as_raw_handle()), &mut pid)
            .map_err(|e| e.to_string())?;
        let manager = OpenSCManagerW(None, None, SC_MANAGER_CONNECT).map_err(|e| e.to_string())?;
        let result = (|| {
            let service = OpenServiceW(manager, w!("Strata.SensorService"), SERVICE_QUERY_STATUS)
                .map_err(|e| e.to_string())?;
            let mut status = SERVICE_STATUS_PROCESS::default();
            let mut needed = 0;
            let buffer = std::slice::from_raw_parts_mut(
                &mut status as *mut _ as *mut u8,
                std::mem::size_of::<SERVICE_STATUS_PROCESS>(),
            );
            let result =
                QueryServiceStatusEx(service, SC_STATUS_PROCESS_INFO, Some(buffer), &mut needed)
                    .map_err(|e| e.to_string());
            let _ = CloseServiceHandle(service);
            result?;
            if status.dwCurrentState != SERVICE_RUNNING
                || status.dwProcessId == 0
                || status.dwProcessId != pid
            {
                return Err("Pipe server is not the installed Strata sensor service".into());
            }
            Ok(())
        })();
        let _ = CloseServiceHandle(manager);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires installed service; SENSOR_SOAK_SECONDS defaults to 90"]
    fn installed_service_remains_fresh() {
        let client = Client::new();
        client.subscribe(&CHANNELS);
        let seconds = std::env::var("SENSOR_SOAK_SECONDS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(90);
        let started = Instant::now();
        let mut supported = Vec::new();
        let mut failures = 0;
        let mut previous = Vec::new();
        let popup = Client::new();
        let mut report = std::env::var_os("SENSOR_SOAK_REPORT").map(|path| {
            OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(path)
                .expect("Create soak report")
        });
        while started.elapsed() < Duration::from_secs(seconds) {
            popup.subscribe(if started.elapsed().as_secs() % 10 < 5 {
                &["cpu", "gpu", "memory", "disk"]
            } else {
                &[]
            });
            let mut interrupted = Vec::new();
            let mut samples = serde_json::Map::new();
            for channel in CHANNELS {
                match client.sample(channel) {
                    Ok(data) => {
                        if crate::metrics::timestamp() as f64
                            - data["sampledAt"].as_f64().unwrap_or(0.)
                            > 6000.
                        {
                            interrupted.push(format!("{channel}: observation expired"));
                        }
                        for key in fields(channel) {
                            let pair = (channel, *key);
                            if data[*key]["status"] == "ready" {
                                if !supported.contains(&pair) {
                                    supported.push(pair);
                                }
                            } else if supported.contains(&pair) {
                                interrupted.push(format!("{channel}.{key}"));
                            }
                        }
                        samples.insert(channel.into(), data);
                    }
                    Err(error) if started.elapsed() > Duration::from_secs(10) => {
                        interrupted.push(format!("{channel}: {error}"));
                    }
                    Err(_) => {}
                }
            }
            if !interrupted.is_empty() {
                failures += 1;
            }
            if interrupted != previous {
                println!(
                    "TRANSITION elapsed={:?} interrupted={interrupted:?}; diagnostics={}",
                    started.elapsed(),
                    client.diagnostics()
                );
                previous = interrupted.clone();
            }
            if let Some(file) = &mut report {
                writeln!(file, "{}", json!({"observedAt":crate::metrics::timestamp(),"elapsedMs":started.elapsed().as_millis() as u64,"interrupted":interrupted,"samples":samples,"diagnostics":client.diagnostics()})).unwrap();
            }
            thread::sleep(Duration::from_millis(500));
        }
        println!("SOAK seconds={seconds} failingObservations={failures} supported={supported:?}; diagnostics={}", client.diagnostics());
        assert!(!supported.is_empty(), "No supported readings received");
        assert_eq!(failures, 0, "Sensor interruptions detected");
    }
    #[test]
    #[ignore = "Requires installed service; restart it after READY_FOR_RESTART is printed"]
    fn installed_service_recovers_after_restart() {
        let client = Client::new();
        client.subscribe(&CHANNELS);
        let started = Instant::now();
        while CHANNELS
            .iter()
            .any(|channel| client.sample(channel).is_err())
        {
            assert!(
                started.elapsed() < Duration::from_secs(30),
                "Initial service unavailable: {}",
                client.diagnostics()
            );
            thread::sleep(Duration::from_millis(100));
        }
        let instance = client.diagnostics()["instanceId"].clone();
        let supported: Vec<_> = CHANNELS
            .iter()
            .flat_map(|channel| {
                let data = client.sample(channel).unwrap();
                fields(channel).iter().filter_map(move |key| {
                    (data[*key]["status"] == "ready").then_some((*channel, *key))
                })
            })
            .collect();
        println!("READY_FOR_RESTART instance={instance}");
        std::io::stdout().flush().unwrap();
        let deadline = Instant::now() + Duration::from_secs(90);
        while Instant::now() < deadline {
            if client.diagnostics()["instanceId"] != instance
                && CHANNELS
                    .iter()
                    .all(|channel| client.sample(channel).is_ok())
                && supported.iter().all(|(channel, key)| {
                    client
                        .sample(channel)
                        .is_ok_and(|data| data[*key]["status"] == "ready")
                })
            {
                println!(
                    "RECOVERED elapsed={:?}; diagnostics={}",
                    started.elapsed(),
                    client.diagnostics()
                );
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        panic!(
            "Service did not recover after restart: {}",
            client.diagnostics()
        );
    }
    #[test]
    #[ignore = "Requires the installed service and a GPU exposing all current metrics"]
    fn installed_service_gpu_metrics_are_ready() {
        let client = Client::new();
        client.subscribe(&["gpu"]);
        let until = Instant::now() + Duration::from_secs(15);
        while Instant::now() < until {
            if let Ok(gpu) = client.sample("gpu") {
                if fields("gpu")
                    .iter()
                    .all(|key| gpu[*key]["status"] == "ready")
                {
                    println!("Live GPU readings: {gpu}");
                    println!("Physical association: {}", client.diagnostics());
                    return;
                }
            }
            thread::sleep(Duration::from_millis(100));
        }
        panic!(
            "GPU metrics unavailable: {:?}; {}",
            client.sample("gpu"),
            client.diagnostics()
        );
    }
    #[test]
    #[ignore = "Requires the installed Strata.SensorService and real hardware"]
    fn installed_service_delivers_all_sensor_channels() {
        let client = Client::new();
        client.subscribe(&CHANNELS);
        let until = Instant::now() + Duration::from_secs(30);
        while Instant::now() < until {
            if CHANNELS
                .iter()
                .all(|channel| client.sample(channel).is_ok())
            {
                println!(
                    "Installed service delivered all channels: {}",
                    client.diagnostics()
                );
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        panic!(
            "Installed service did not supply sensor channels: {}",
            client.diagnostics()
        );
    }
    #[test]
    fn nonblocking_pipe_waits_for_a_delayed_response() {
        use std::os::windows::io::FromRawHandle;
        use windows::{
            core::PCWSTR,
            Win32::Storage::FileSystem::{FlushFileBuffers, FILE_FLAGS_AND_ATTRIBUTES},
        };
        let name = format!(r"\\.\pipe\strata-transfer-test-{}", rand::random::<u64>());
        let server_name = name.clone();
        let (ready, connected) = std::sync::mpsc::sync_channel(1);
        let server = thread::spawn(move || unsafe {
            let wide: Vec<u16> = server_name.encode_utf16().chain(Some(0)).collect();
            let handle = CreateNamedPipeW(
                PCWSTR(wide.as_ptr()),
                FILE_FLAGS_AND_ATTRIBUTES(3),
                NAMED_PIPE_MODE(0),
                1,
                4096,
                4096,
                0,
                None,
            );
            assert!(!handle.is_invalid());
            let mut file = File::from_raw_handle(handle.0);
            ready.send(()).unwrap();
            let _ = ConnectNamedPipe(handle, None);
            let mut request = [0];
            file.read_exact(&mut request).unwrap();
            thread::sleep(Duration::from_millis(150));
            let _ = file.write_all(&[42]);
            let _ = FlushFileBuffers(handle);
        });
        connected.recv().unwrap();
        let mut pipe = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&name)
            .unwrap();
        unsafe {
            SetNamedPipeHandleState(HANDLE(pipe.as_raw_handle()), Some(&PIPE_NOWAIT), None, None)
                .unwrap();
        }
        pipe.write_all(&[1]).unwrap();
        let mut response = [0];
        let result = transfer(
            &mut pipe,
            &mut response,
            false,
            Instant::now() + Duration::from_secs(2),
            &AtomicBool::new(false),
        );
        drop(pipe);
        server.join().unwrap();
        assert!(
            result.is_ok(),
            "Delayed response treated as disconnect: {result:?}"
        );
        assert_eq!(response, [42]);
    }
    fn recorded() -> Snapshot {
        serde_json::from_str(include_str!(
            "../../docs/evidence/lhm-unprivileged-2026-10-23.json"
        ))
        .unwrap()
    }
    #[test]
    fn real_csharp_probe_roundtrips_every_native_channel_contract() {
        let mut cache = Cache::default();
        let now = Instant::now();
        cache.accept(recorded(), now).unwrap();
        for channel in CHANNELS {
            assert!(cache.sample(channel, now).is_ok(), "{channel}");
        }
        assert_eq!(
            cache.sample("gpu", now).unwrap()["temperatureSensor"]["provider"],
            "libreHardwareMonitor"
        );
    }
    #[test]
    fn sensor_identity_changes_reset_only_the_affected_history() {
        let mut cache = Cache::default();
        let now = Instant::now();
        let first = recorded();
        cache.accept(first, now).unwrap();
        let mut next = recorded();
        next.sequence += 1;
        next.sampled_at += 2000.;
        for (name, channel) in &mut next.channels {
            for key in fields(name) {
                if channel.data[*key]["status"] == "ready" {
                    channel.data[*key]["updatedAt"] = json!(next.sampled_at);
                }
            }
        }
        next.channels.get_mut("gpu").unwrap().data["temperatureSensor"]["sensorId"] =
            json!("/other/temperature/0");
        cache.accept(next, now).unwrap();
        assert_eq!(
            cache.sample("gpu", now).unwrap()["history"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            cache.sample("memory", now).unwrap()["history"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }
    #[test]
    fn protocol_versions_unknown_fields_and_inconsistent_volume_math_are_rejected() {
        let now = Instant::now();
        let mut bad = recorded();
        bad.version = 2;
        assert!(Cache::default().accept(bad, now).is_err());
        let mut value = serde_json::to_value(json!({"version":1,"type":"snapshot","instanceId":"a".repeat(32),"sequence":1,"sampledAt":1,"channels":{},"diagnostics":{},"writeFan":true})).unwrap();
        assert!(serde_json::from_value::<Snapshot>(value.clone()).is_err());
        value.as_object_mut().unwrap().remove("writeFan");
        assert!(serde_json::from_value::<Snapshot>(value).is_ok());
        let mut bad = recorded();
        bad.channels.get_mut("disk").unwrap().data["volumes"][0]["usedBytes"] = json!(1);
        assert!(Cache::default().accept(bad, now).is_err());
    }
    #[test]
    fn history_is_bounded_and_wall_clock_regression_starts_a_new_series() {
        let mut cache = Cache::default();
        let now = Instant::now();
        for i in 1..70 {
            cache
                .accept(
                    snapshot("a", i, 10000. + i as f64 * 2000., "ram", Some(10.)),
                    now,
                )
                .unwrap();
        }
        let data = cache.sample("memory", now).unwrap();
        assert_eq!(data["history"].as_array().unwrap().len(), 61);
        cache
            .accept(snapshot("a", 70, 5000., "ram", Some(10.)), now)
            .unwrap();
        assert_eq!(
            cache.sample("memory", now).unwrap()["history"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    fn snapshot(
        instance: &str,
        sequence: u64,
        at: f64,
        identity: &str,
        value: Option<f64>,
    ) -> Snapshot {
        let data = fields("memory").iter().map(|key| ((*key).to_owned(), if let Some(v) = value {
            json!({"status":"ready","value":v,"updatedAt":at,"error":null})
        } else { json!({"status":"unavailable","value":null,"updatedAt":null,"error":"offline"}) })).collect::<serde_json::Map<_,_>>();
        Snapshot {
            version: 1,
            kind: "snapshot".into(),
            instance_id: instance.repeat(32),
            sequence,
            sampled_at: at,
            channels: HashMap::from([(
                "memory".into(),
                Channel {
                    identity: identity.into(),
                    data: Value::Object(data),
                },
            )]),
            diagnostics: json!({}),
        }
    }
    #[test]
    fn rejects_unbounded_frames_before_allocating() {
        for n in [0, LIMIT as u32 + 1, u32::MAX] {
            assert!(frame_length(n.to_le_bytes()).is_err());
        }
        assert_eq!(frame_length((LIMIT as u32).to_le_bytes()).unwrap(), LIMIT);
    }
    #[test]
    fn repeated_frames_do_not_refresh_freshness_or_add_history() {
        let mut cache = Cache::default();
        let now = Instant::now();
        cache
            .accept(snapshot("a", 1, 10000., "ram", Some(10.)), now)
            .unwrap();
        cache
            .accept(
                snapshot("a", 1, 10000., "ram", Some(10.)),
                now + Duration::from_secs(5),
            )
            .unwrap();
        let stale = cache
            .sample("memory", now + Duration::from_secs(7))
            .unwrap();
        assert_eq!(stale["percent"]["status"], "error");
        assert_eq!(stale["percent"]["updatedAt"], 10000.);
        assert_eq!(stale["history"].as_array().unwrap().len(), 1);
    }
    #[test]
    fn equal_values_on_new_observations_are_valid_and_restart_clears_history() {
        let mut cache = Cache::default();
        let now = Instant::now();
        cache
            .accept(snapshot("a", 1, 10000., "ram", Some(10.)), now)
            .unwrap();
        cache
            .accept(snapshot("a", 2, 12000., "ram", Some(10.)), now)
            .unwrap();
        assert_eq!(
            cache.sample("memory", now).unwrap()["history"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        cache
            .accept(snapshot("b", 1, 14000., "ram", None), now)
            .unwrap();
        assert!(cache.sample("memory", now).unwrap()["percent"]["value"].is_null());
    }
    #[test]
    fn independent_failure_preserves_timestamp_but_changed_device_forgets_values() {
        let mut cache = Cache::default();
        let now = Instant::now();
        cache
            .accept(snapshot("a", 1, 10000., "ram", Some(10.)), now)
            .unwrap();
        cache
            .accept(snapshot("a", 2, 12000., "ram", None), now)
            .unwrap();
        let data = cache.sample("memory", now).unwrap();
        assert_eq!(data["percent"]["status"], "error");
        assert_eq!(data["percent"]["updatedAt"], 10000.);
        cache
            .accept(snapshot("a", 3, 14000., "other", None), now)
            .unwrap();
        assert!(cache.sample("memory", now).unwrap()["percent"]["value"].is_null());
    }
    #[test]
    fn invalid_frame_is_atomic_and_cannot_poison_valid_cache() {
        let mut cache = Cache::default();
        let now = Instant::now();
        cache
            .accept(snapshot("a", 1, 10000., "ram", Some(10.)), now)
            .unwrap();
        let mut bad = snapshot("a", 2, 12000., "ram", Some(20.));
        bad.channels.get_mut("memory").unwrap().data["percent"]["value"] = json!(101.);
        assert!(cache.accept(bad, now).is_err());
        assert_eq!(
            cache.sample("memory", now).unwrap()["percent"]["value"],
            10.
        );
    }
}
