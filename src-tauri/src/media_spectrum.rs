//! One machine-local capture shared by all bar consumers. Only six FFT energies
//! are emitted, with a generation/sequence fence across every capture reset.
use crate::{
    media::Media,
    media_contract::MediaSpectrumData,
    metrics::{self, Metrics},
    spectrum_capture::Capture,
};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

const INTERNAL: &str = "bar-spectrum-internal";
const FRAME: Duration = Duration::from_millis(34);
#[derive(Default)]
struct Data {
    next: u64,
    subscribers: HashMap<String, String>,
    latest: Option<Value>,
    reason: Option<String>,
    capturing: bool,
    pid: Option<u32>,
    generation: u32,
    frames: u64,
}
#[derive(Clone)]
pub struct MediaSpectrum {
    data: Arc<Mutex<Data>>,
    tx: mpsc::Sender<bool>,
    thread: Arc<Mutex<Option<std::thread::JoinHandle<()>>>>,
}
impl MediaSpectrum {
    pub fn start(app: AppHandle, media: Media, metrics: Metrics) -> Self {
        let (tx, rx) = mpsc::channel();
        let this = Self {
            data: Default::default(),
            tx,
            thread: Default::default(),
        };
        let worker = this.clone();
        *this.thread.lock().unwrap() = Some(std::thread::spawn(move || {
            worker.run(app, media, metrics, rx)
        }));
        this
    }
    pub fn subscribe(&self, window: &str) -> Result<Value, String> {
        if !window.starts_with("bar-") {
            return Err("Spectrum subscriptions require a bar window".into());
        }
        let mut data = self.data.lock().unwrap();
        data.next += 1;
        let token = format!("spectrum{}", data.next);
        let initial = if data.subscribers.is_empty() {
            metrics::envelope("loading", Value::Null)
        } else {
            data.latest
                .clone()
                .unwrap_or_else(|| metrics::envelope("loading", Value::Null))
        };
        data.subscribers.insert(token.clone(), window.into());
        drop(data);
        let _ = self.tx.send(false);
        Ok(json!({"token":token,"initial":initial}))
    }
    pub fn unsubscribe(&self, token: &str, window: &str) {
        let mut data = self.data.lock().unwrap();
        if data
            .subscribers
            .get(token)
            .is_some_and(|owner| owner == window)
        {
            data.subscribers.remove(token);
        }
        drop(data);
        let _ = self.tx.send(false);
    }
    pub fn remove_window(&self, window: &str) {
        self.data
            .lock()
            .unwrap()
            .subscribers
            .retain(|_, owner| owner != window);
        let _ = self.tx.send(false);
    }
    pub fn diagnostics(&self) -> Value {
        let data = self.data.lock().unwrap();
        json!({"subscribers":data.subscribers.len(),"capturing":data.capturing,"pid":data.pid,
            "generation":data.generation,"frames":data.frames,"reason":data.reason,"latest":data.latest})
    }
    pub fn stop(&self) {
        let _ = self.tx.send(true);
        if let Some(thread) = self.thread.lock().unwrap().take() {
            let _ = thread.join();
        }
    }
    fn publish(&self, app: &AppHandle, event: Value, reason: Option<String>) {
        let windows = {
            let mut data = self.data.lock().unwrap();
            data.reason = reason;
            if data
                .latest
                .as_ref()
                .is_some_and(|v| v["status"] == event["status"] && v["data"] == event["data"])
            {
                return;
            }
            data.latest = Some(event.clone());
            data.subscribers.values().cloned().collect::<HashSet<_>>()
        };
        for window in windows {
            let _ = app.emit_to(window, "system:mediaSpectrum", &event);
        }
    }
    fn run(&self, app: AppHandle, media: Media, metrics: Metrics, rx: mpsc::Receiver<bool>) {
        use windows::Win32::System::Com::*;
        let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok() };
        let mut subscriptions: Option<(String, String)> = None;
        let mut capture: Option<Capture> = None;
        let mut identity = None;
        let mut retry = Instant::now();
        let mut last_audio = Instant::now();
        let mut generation = 0u32;
        let mut sequence = 0u32;
        let mut verify = Instant::now();
        loop {
            let active = !self.data.lock().unwrap().subscribers.is_empty();
            if !active {
                capture = None;
                identity = None;
                if let Some((m, v)) = subscriptions.take() {
                    media.unsubscribe(&m, INTERNAL);
                    metrics.unsubscribe(&v, INTERNAL);
                }
                let mut data = self.data.lock().unwrap();
                data.latest = None;
                data.capturing = false;
                data.pid = None;
                drop(data);
                match rx.recv() {
                    Ok(false) => continue,
                    _ => break,
                }
            }
            if subscriptions.is_none() {
                // Internal subscriptions keep both dependencies alive even in
                // a layout containing only the spectrum widget.
                let m = media
                    .subscribe(INTERNAL)
                    .expect("internal media subscriber");
                let v = metrics
                    .subscribe("volume".into(), INTERNAL.into(), 2000)
                    .expect("internal output subscriber");
                subscriptions = Some((
                    m["token"].as_str().unwrap().into(),
                    v["token"].as_str().unwrap().into(),
                ));
            }
            let target = media.spectrum_target();
            let (output_generation, output) = metrics.spectrum_output();
            let next = target.map(|(session, player)| (session, player, output_generation));
            if next != identity {
                capture = None;
                identity = next;
                generation += 1;
                sequence = 0;
                retry = Instant::now();
                self.publish(&app, metrics::envelope("loading", Value::Null), None);
            }
            let mut reason = None;
            if identity.is_none() || output.is_none() {
                capture = None;
                reason = Some(
                    if identity.is_none() {
                        "Mídia não está reproduzindo"
                    } else {
                        "Saída configurada indisponível"
                    }
                    .into(),
                );
            } else if output == Some(true) {
                // Avoid analysis while muted, and never reuse a pre-mute window.
                capture = None;
                sequence += 1;
                let event = MediaSpectrumData {
                    session_id: identity.as_ref().unwrap().0.clone(),
                    generation,
                    sequence,
                    bands: [0.; 6],
                };
                self.publish(
                    &app,
                    metrics::envelope("ready", serde_json::to_value(event).unwrap()),
                    None,
                );
            } else {
                if capture.is_none() && Instant::now() >= retry {
                    let opened = initialized
                        .as_ref()
                        .map_err(|e| e.to_string())
                        .and_then(|_| {
                            crate::media_windows::spectrum_process(&identity.as_ref().unwrap().1)
                        })
                        .and_then(|pid| Capture::open(pid).map(|c| (pid, c)));
                    match opened {
                        Ok((pid, value)) => {
                            capture = Some(value);
                            generation += 1;
                            sequence = 0;
                            last_audio = Instant::now();
                            verify = Instant::now() + Duration::from_secs(2);
                            self.data.lock().unwrap().pid = Some(pid);
                        }
                        Err(error) => {
                            reason = Some(error);
                            retry = Instant::now() + Duration::from_secs(2);
                        }
                    }
                }
                if capture.is_some() && Instant::now() >= verify {
                    let resolved =
                        crate::media_windows::spectrum_process(&identity.as_ref().unwrap().1);
                    let current_pid = self.data.lock().unwrap().pid;
                    if resolved.as_ref().ok().copied() != current_pid {
                        capture = None;
                        reason = Some(
                            resolved
                                .err()
                                .unwrap_or_else(|| "Processo de áudio alterado".into()),
                        );
                        retry = Instant::now();
                    }
                    verify = Instant::now() + Duration::from_secs(2);
                }
                // Activation is asynchronous and may outlast a player/route
                // change. Never publish a completed old capture into its place.
                let still_current = media
                    .spectrum_target()
                    .map(|(session, player)| (session, player, metrics.spectrum_output().0))
                    == identity
                    && metrics.spectrum_output().1 == Some(false);
                if !still_current {
                    capture = None;
                    reason = Some("Sessão ou saída alterada".into());
                }
                if let Some(value) = &mut capture {
                    match value.drain() {
                        Ok(received) => {
                            if received {
                                last_audio = Instant::now();
                            }
                            if last_audio.elapsed() > Duration::from_millis(150) {
                                value.analyzer.clear();
                            }
                            let bands = value.analyzer.bands();
                            sequence += 1;
                            let event = MediaSpectrumData {
                                session_id: identity.as_ref().unwrap().0.clone(),
                                generation,
                                sequence,
                                bands,
                            };
                            self.publish(
                                &app,
                                metrics::envelope("ready", serde_json::to_value(event).unwrap()),
                                None,
                            );
                            self.data.lock().unwrap().frames += 1;
                        }
                        Err(error) => {
                            capture = None;
                            reason = Some(error);
                            retry = Instant::now() + Duration::from_secs(2);
                        }
                    }
                }
            }
            if let Some(reason) = reason {
                self.publish(
                    &app,
                    metrics::envelope("unavailable", Value::Null),
                    Some(reason),
                );
            }
            {
                let mut data = self.data.lock().unwrap();
                data.capturing = capture.is_some();
                data.generation = generation;
                if capture.is_none() {
                    data.pid = None;
                }
            }
            // A fresh deadline prevents catch-up bursts. Consumer churn wakes
            // cleanup promptly without increasing the maximum publication rate.
            let deadline = Instant::now()
                + if capture.is_some() {
                    FRAME
                } else {
                    Duration::from_millis(100)
                };
            loop {
                match rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                    Ok(true) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                        drop(capture);
                        if let Some((m, v)) = subscriptions.take() {
                            media.unsubscribe(&m, INTERNAL);
                            metrics.unsubscribe(&v, INTERNAL);
                        }
                        if initialized.is_ok() {
                            unsafe {
                                CoUninitialize();
                            }
                        }
                        return;
                    }
                    Ok(false) => {
                        if self.data.lock().unwrap().subscribers.is_empty() {
                            break;
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                }
            }
        }
        drop(capture);
        if initialized.is_ok() {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

/// Read-only native acceptance probe. No bar, recording or player action.
pub fn probe() -> Value {
    use windows::Win32::System::WinRT::*;
    let initialized = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
    if let Err(error) = initialized {
        return json!({"status":"error","error":error.to_string()});
    }
    let result = (|| -> Result<Value, String> {
        let (tx, _rx) = mpsc::channel();
        let mut media = crate::media_windows::WindowsMedia::new(tx).map_err(|e| e.to_string())?;
        let selected = media
            .read_settled()
            .map_err(|e| e.to_string())?
            .ok_or("Nenhuma sessão de mídia")?;
        if selected.playback != "playing" {
            return Err("Mídia não está reproduzindo".into());
        }
        let pid = crate::media_windows::spectrum_process(&selected.player_id)?;
        let cpu_seconds = || -> Result<f64, String> {
            use windows::Win32::{
                Foundation::FILETIME,
                System::Threading::{GetCurrentProcess, GetProcessTimes},
            };
            let mut created = FILETIME::default();
            let mut exited = FILETIME::default();
            let mut kernel = FILETIME::default();
            let mut user = FILETIME::default();
            unsafe {
                GetProcessTimes(
                    GetCurrentProcess(),
                    &mut created,
                    &mut exited,
                    &mut kernel,
                    &mut user,
                )
                .map_err(|e| e.to_string())?;
            }
            let ticks = |v: FILETIME| ((v.dwHighDateTime as u64) << 32) | v.dwLowDateTime as u64;
            Ok((ticks(kernel) + ticks(user)) as f64 / 10_000_000.)
        };
        let idle_start = cpu_seconds()?;
        std::thread::sleep(Duration::from_secs(1));
        let idle_cpu = cpu_seconds()? - idle_start;
        let cpu_start = cpu_seconds()?;
        let mut capture = Capture::open(pid)?;
        // This process renders no audio. A parallel loopback on it must remain
        // silent while the real player is audible, proving process exclusion.
        let mut silent = Capture::open(std::process::id())?;
        let mut unrelated_peak = 0f32;
        let start = Instant::now();
        let mut frames = Vec::new();
        while start.elapsed() < Duration::from_secs(3) {
            let deadline = Instant::now() + FRAME;
            capture.drain()?;
            silent.drain()?;
            for value in silent.analyzer.bands() {
                unrelated_peak = unrelated_peak.max(value);
            }
            frames.push(capture.analyzer.bands());
            std::thread::sleep(deadline.saturating_duration_since(Instant::now()));
        }
        Ok(
            json!({"status":"ready","playerId":selected.player_id,"pid":pid,
            "sessionId":selected.session_id,"elapsedMs":start.elapsed().as_millis(),
            "packets":capture.packets,"frames":frames,"pcmPersisted":false,
            "unrelatedProcessPeak":unrelated_peak,
            "idleProbeCpuSeconds":idle_cpu,"idleProbeDurationSeconds":1,
            "captureProbeCpuSeconds":cpu_seconds()? - cpu_start,
            "performanceScope":"native probe only; two captures; excludes WebView rendering and full-bar worker lifecycle"}),
        )
    })();
    unsafe {
        RoUninitialize();
    }
    result.unwrap_or_else(|error| json!({"status":"unavailable","error":error}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tokens_are_owned_and_window_removal_preserves_other_consumers() {
        let (tx, _) = mpsc::channel();
        let service = MediaSpectrum {
            data: Default::default(),
            tx,
            thread: Default::default(),
        };
        let a = service.subscribe("bar-one").unwrap()["token"]
            .as_str()
            .unwrap()
            .to_owned();
        service.subscribe("bar-two").unwrap();
        service.unsubscribe(&a, "bar-two");
        assert_eq!(service.diagnostics()["subscribers"], 2);
        service.remove_window("bar-one");
        assert_eq!(service.diagnostics()["subscribers"], 1);
        assert!(service.subscribe("settings").is_err());
        assert!(service.subscribe("overlay").is_err());
    }
}
