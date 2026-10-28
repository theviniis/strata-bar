//! A single network owner for all bars, with independent traffic, ICMP and test workers.
use crate::{network_contract::*, network_windows as native};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

const CADENCE: Duration = Duration::from_secs(2);
const WINDOW: f64 = 120_000.;
#[derive(Default)]
struct Counter {
    previous: Option<(u64, u64, Instant)>,
    received: u64,
    sent: u64,
    started: Option<f64>,
}
impl Counter {
    fn sample(
        &mut self,
        received: u64,
        sent: u64,
        now: Instant,
        at: f64,
    ) -> (Option<f64>, Option<f64>) {
        self.started.get_or_insert(at);
        let previous = self.previous.replace((received, sent, now));
        let Some((rx, tx, time)) = previous else {
            return (None, None);
        };
        let elapsed = now.duration_since(time).as_secs_f64();
        // Sleep/resume, stalls and resets establish a new baseline, not a spike.
        if elapsed <= 0. || elapsed > 6. || received < rx || sent < tx {
            return (None, None);
        }
        self.received = self.received.saturating_add(received - rx);
        self.sent = self.sent.saturating_add(sent - tx);
        (
            Some((received - rx) as f64 / elapsed),
            Some((sent - tx) as f64 / elapsed),
        )
    }
}
#[derive(Clone)]
struct Probe {
    at: Instant,
    rtt: Option<f64>,
}
fn quality(samples: &VecDeque<Probe>, target: &str, error: Option<String>) -> NetworkQuality {
    let sent = samples.len() as u32;
    let lost = samples.iter().filter(|p| p.rtt.is_none()).count() as u32;
    let mut differences = vec![];
    for (a, b) in samples.iter().zip(samples.iter().skip(1)) {
        if let (Some(a), Some(b)) = (a.rtt, b.rtt) {
            differences.push((a - b).abs());
        }
    }
    NetworkQuality {
        target: target.into(),
        ping_ms: samples.iter().rev().find_map(|p| p.rtt),
        jitter_ms: (!differences.is_empty())
            .then(|| differences.iter().sum::<f64>() / differences.len() as f64),
        loss_percent: (sent > 0).then(|| lost as f64 * 100. / sent as f64),
        sent,
        lost,
        error,
    }
}
struct State {
    config: NetworkConfig,
    data: NetworkData,
    subs: HashMap<String, String>,
    next: u64,
    stop: bool,
    generation: u64,
    counters: HashMap<String, Counter>,
    probes: VecDeque<Probe>,
    test_cancel: Arc<AtomicBool>,
    test_running: bool,
}
#[derive(Clone)]
pub struct Network {
    shared: Arc<(Mutex<State>, Condvar)>,
    emit_to: Arc<dyn Fn(&str, &Value) + Send + Sync>,
}
pub fn allowed(label: &str) -> bool {
    label.starts_with("bar-") || label == "overlay" || label == "settings"
}
impl Network {
    pub fn start(app: AppHandle, config: NetworkConfig) -> Self {
        Self::with_emitter(
            config,
            Arc::new(move |window, value| {
                let _ = app.emit_to(window, "system:network", value);
            }),
        )
    }
    fn with_emitter(
        config: NetworkConfig,
        emit_to: Arc<dyn Fn(&str, &Value) + Send + Sync>,
    ) -> Self {
        let owner = Self {
            emit_to,
            shared: Arc::new((
                Mutex::new(State {
                    config,
                    data: NetworkData::default(),
                    subs: HashMap::new(),
                    next: 0,
                    stop: false,
                    generation: 0,
                    counters: HashMap::new(),
                    probes: VecDeque::new(),
                    test_cancel: Arc::new(AtomicBool::new(false)),
                    test_running: false,
                }),
                Condvar::new(),
            )),
        };
        let traffic = owner.clone();
        std::thread::spawn(move || traffic.traffic());
        let probes = owner.clone();
        std::thread::spawn(move || probes.probes());
        owner
    }
    fn emit(&self, state: &mut State) {
        state.data.sequence = state.data.sequence.wrapping_add(1);
        let envelope = crate::metrics::envelope("ready", json!(state.data));
        let windows: std::collections::HashSet<_> = state.subs.values().collect();
        for window in windows {
            (self.emit_to)(window.as_str(), &envelope);
        }
    }
    fn invalidate(state: &mut State) {
        state.generation += 1;
        state.probes.clear();
        state.data.quality = quality(&state.probes, &state.config.probe_target, None);
        state.data.download = None;
        state.data.upload = None;
        state.data.history.clear();
        for counter in state.counters.values_mut() {
            counter.previous = None;
        }
    }
    pub fn configure(&self, config: NetworkConfig) {
        let mut state = self.shared.0.lock().unwrap();
        if config != state.config {
            let collection_changed = state.config.probe_target != config.probe_target
                || state.config.probes_enabled != config.probes_enabled;
            state.config = config;
            if collection_changed {
                state.test_cancel.store(true, Ordering::Relaxed);
                Self::invalidate(&mut state);
            }
            self.emit(&mut state);
            self.shared.1.notify_all();
        }
    }
    pub fn subscribe(&self, window: &str) -> Result<Value, String> {
        if !allowed(window) {
            return Err("Network subscription denied".into());
        }
        let mut state = self.shared.0.lock().unwrap();
        if state.subs.is_empty() {
            Self::invalidate(&mut state);
        }
        state.next += 1;
        let token = format!("network{}", state.next);
        state.subs.insert(token.clone(), window.into());
        self.shared.1.notify_all();
        Ok(json!({"token":token,"initial":crate::metrics::envelope("ready",json!(state.data))}))
    }
    pub fn unsubscribe(&self, token: &str, window: &str) {
        let mut state = self.shared.0.lock().unwrap();
        if state.subs.get(token).is_some_and(|label| label == window) {
            state.subs.remove(token);
        }
        if state.subs.is_empty() {
            Self::invalidate(&mut state);
        }
        self.shared.1.notify_all();
    }
    pub fn remove_window(&self, window: &str) {
        let mut state = self.shared.0.lock().unwrap();
        state.subs.retain(|_, w| w != window);
        if state.subs.is_empty() {
            Self::invalidate(&mut state);
        }
        self.shared.1.notify_all();
    }
    pub fn stop(&self) {
        let mut state = self.shared.0.lock().unwrap();
        state.stop = true;
        state.test_cancel.store(true, Ordering::Relaxed);
        self.shared.1.notify_all();
    }
    fn traffic(&self) {
        loop {
            let mut state = self.shared.0.lock().unwrap();
            while !state.stop && state.subs.is_empty() {
                state = self.shared.1.wait(state).unwrap();
            }
            if state.stop {
                return;
            }
            let generation = state.generation;
            drop(state);
            let rows = native::collect();
            let default = native::default_index();
            let mut state = self.shared.0.lock().unwrap();
            if state.stop {
                return;
            }
            if generation != state.generation {
                continue;
            }
            let at = crate::metrics::timestamp() as f64;
            state.data.sampled_at = at;
            match rows {
                Err(error) => {
                    state.data.download = None;
                    state.data.upload = None;
                    state.data.error = Some(error);
                    for c in state.counters.values_mut() {
                        c.previous = None;
                    }
                }
                Ok(rows) => {
                    let selected = rows.iter().find(|r| Some(r.interface.index) == default);
                    let id = selected.map(|r| r.interface.id.clone());
                    if id != state.data.selected_id {
                        state.test_cancel.store(true, Ordering::Relaxed);
                        Self::invalidate(&mut state);
                        state.data.selected_id = id.clone();
                    }
                    state.data.interfaces = rows.iter().map(|r| r.interface.clone()).collect();
                    if let Some(row) = selected.filter(|r| r.interface.connected) {
                        let counter = state.counters.entry(row.interface.id.clone()).or_default();
                        let rates = counter.sample(row.received, row.sent, Instant::now(), at);
                        let (received, sent, started) = (
                            counter.received as f64,
                            counter.sent as f64,
                            counter.started,
                        );
                        state.data.download = rates.0;
                        state.data.upload = rates.1;
                        state.data.received_bytes = received;
                        state.data.sent_bytes = sent;
                        state.data.observation_started_at = started;
                        state.data.error = None;
                    } else {
                        state.data.download = None;
                        state.data.upload = None;
                        state.data.received_bytes = 0.;
                        state.data.sent_bytes = 0.;
                        state.data.observation_started_at = None;
                        state.data.error = Some("Interface desconectada ou indisponÃ­vel".into());
                        if let Some(id) = id {
                            if let Some(c) = state.counters.get_mut(&id) {
                                c.previous = None;
                            }
                        }
                    }
                }
            }
            let point = NetworkPoint {
                timestamp: at,
                download: state.data.download,
                upload: state.data.upload,
            };
            if state.data.history.last().is_some_and(|p| p.timestamp >= at) {
                state.data.history.clear();
            }
            state.data.history.push(point);
            state.data.history.retain(|p| p.timestamp >= at - WINDOW);
            if state.data.history.len() > 61 {
                state.data.history.remove(0);
            }
            self.emit(&mut state);
            let generation = state.generation;
            let _ = self
                .shared
                .1
                .wait_timeout_while(state, CADENCE, |s| {
                    !s.stop && !s.subs.is_empty() && s.generation == generation
                })
                .unwrap();
        }
    }
    fn probes(&self) {
        loop {
            let mut state = self.shared.0.lock().unwrap();
            while !state.stop && (state.subs.is_empty() || !state.config.probes_enabled) {
                state = self.shared.1.wait(state).unwrap();
            }
            if state.stop {
                return;
            }
            let generation = state.generation;
            let target = state.config.probe_target.parse().unwrap();
            let index = state
                .data
                .interfaces
                .iter()
                .find(|r| Some(&r.id) == state.data.selected_id.as_ref() && r.connected)
                .map(|r| r.index);
            drop(state);
            let started = Instant::now();
            let result = index
                .ok_or_else(|| "Sem interface conectada para ICMP".to_string())
                .and_then(|index| native::probe(target, index));
            let mut state = self.shared.0.lock().unwrap();
            if state.stop {
                return;
            }
            if generation != state.generation {
                continue;
            }
            let now = Instant::now();
            while state
                .probes
                .front()
                .is_some_and(|p| now.duration_since(p.at).as_secs_f64() >= 120.)
            {
                state.probes.pop_front();
            }
            let error = match result {
                Ok(rtt) => {
                    state.probes.push_back(Probe { at: now, rtt });
                    None
                }
                Err(error) => Some(error),
            };
            state.data.quality = quality(&state.probes, &state.config.probe_target, error);
            self.emit(&mut state);
            let _ = self
                .shared
                .1
                .wait_timeout_while(state, CADENCE.saturating_sub(started.elapsed()), |s| {
                    !s.stop
                        && !s.subs.is_empty()
                        && s.config.probes_enabled
                        && s.generation == generation
                })
                .unwrap();
        }
    }
    pub fn cancel_test(&self) {
        self.shared
            .0
            .lock()
            .unwrap()
            .test_cancel
            .store(true, Ordering::Relaxed);
    }
    pub fn start_test(&self) -> Result<(), String> {
        let mut state = self.shared.0.lock().unwrap();
        if state.test_running {
            return Err("JÃ¡ hÃ¡ um teste em andamento".into());
        }
        if state.stop {
            return Err("Aplicativo encerrando".into());
        }
        let index = native::default_index().ok_or("Sem rota padrÃ£o para o teste")?;
        let name = state
            .data
            .interfaces
            .iter()
            .find(|r| r.index == index)
            .map(|r| r.name.clone());
        let cancel = Arc::new(AtomicBool::new(false));
        state.test_cancel = cancel.clone();
        state.test_running = true;
        state.data.speed_test = NetworkSpeedTest {
            phase: NetworkTestPhase::Preparing,
            interface_name: name,
            timestamp: Some(crate::metrics::timestamp() as f64),
            ..Default::default()
        };
        self.emit(&mut state);
        let owner = self.clone();
        std::thread::spawn(move || crate::network_speed::run(owner, cancel, index));
        Ok(())
    }
    pub(crate) fn test_update(
        &self,
        phase: NetworkTestPhase,
        bytes: f64,
        elapsed: f64,
        rate: Option<f64>,
        limited: bool,
        error: Option<String>,
        progress: f64,
    ) {
        let mut state = self.shared.0.lock().unwrap();
        let test = &mut state.data.speed_test;
        match phase {
            NetworkTestPhase::Download => test.download_mbps = rate,
            NetworkTestPhase::Upload => test.upload_mbps = rate,
            _ => {}
        }
        test.phase = phase;
        test.transferred_bytes = bytes;
        test.elapsed_ms = elapsed;
        test.stage_progress = progress;
        test.limited |= limited;
        test.error = error;
        if matches!(
            test.phase,
            NetworkTestPhase::Complete | NetworkTestPhase::Cancelled | NetworkTestPhase::Error
        ) {
            state.test_running = false;
        }
        self.emit(&mut state);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rates_use_elapsed_time_and_reset_without_spikes() {
        let mut c = Counter::default();
        let now = Instant::now();
        assert_eq!(c.sample(100, 200, now, 0.), (None, None));
        assert_eq!(
            c.sample(500, 1000, now + Duration::from_secs(2), 2000.),
            (Some(200.), Some(400.))
        );
        assert_eq!(c.received, 400);
        assert_eq!(
            c.sample(1, 1, now + Duration::from_secs(4), 4000.),
            (None, None)
        );
        assert_eq!(
            c.sample(5000, 5000, now + Duration::from_secs(30), 30000.),
            (None, None)
        );
        assert_eq!(c.received, 400);
    }
    #[test]
    fn quality_does_not_bridge_loss_for_jitter() {
        let now = Instant::now();
        let samples = [Some(10.), Some(14.), None, Some(100.)]
            .into_iter()
            .map(|rtt| Probe { at: now, rtt })
            .collect();
        let q = quality(&samples, "1.1.1.1", None);
        assert_eq!(q.ping_ms, Some(100.));
        assert_eq!(q.jitter_ms, Some(4.));
        assert_eq!(q.loss_percent, Some(25.));
        assert_eq!(q.sent, 4);
        assert_eq!(
            quality(&VecDeque::new(), "::1", Some("local".into())).loss_percent,
            None
        );
    }
    #[test]
    fn suspend_clears_baselines_and_quality_without_cancelling_manual_test() {
        let cancel = Arc::new(AtomicBool::new(false));
        let mut counters = HashMap::new();
        let mut counter = Counter::default();
        counter.sample(1, 2, Instant::now(), 1.);
        counters.insert("adapter".into(), counter);
        let mut state = State {
            config: NetworkConfig::default(),
            data: NetworkData::default(),
            subs: HashMap::new(),
            next: 0,
            stop: false,
            generation: 0,
            counters,
            probes: VecDeque::from([Probe {
                at: Instant::now(),
                rtt: Some(12.),
            }]),
            test_cancel: cancel.clone(),
            test_running: true,
        };
        Network::invalidate(&mut state);
        assert_eq!(state.generation, 1);
        assert!(state.counters["adapter"].previous.is_none());
        assert!(state.probes.is_empty());
        assert_eq!(state.data.quality.sent, 0);
        assert!(state.data.history.is_empty());
        assert!(!cancel.load(Ordering::Relaxed));
        assert!(state.test_running);
    }
    #[test]
    fn network_config_persists_and_rejects_invalid_updates_without_changing_layout() {
        let path = std::env::temp_dir().join(format!(
            "strata-network-config-{}.json",
            rand::random::<u64>()
        ));
        let store = crate::config::ConfigStore::open(path.clone());
        let original = store.snapshot().unwrap().config;
        let mut document = original.clone();
        document.network = Some(NetworkConfig {
            unit: NetworkUnit::Bits,
            probes_enabled: false,
            probe_target: "::1".into(),
        });
        store.save(document.clone()).unwrap();
        assert_eq!(
            crate::config::ConfigStore::open(path.clone())
                .snapshot()
                .unwrap()
                .config,
            document
        );
        assert_eq!(document.widgets, original.widgets);
        document.network.as_mut().unwrap().probe_target = "https://example.com".into();
        assert!(store.save(document).is_err());
        assert_eq!(store.snapshot().unwrap().config.widgets, original.widgets);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    #[ignore = "Real Windows worker lifecycle with two subscription labels; no windows or configuration changes"]
    fn live_windows_shared_worker_lifecycle() {
        let events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
        let sink = events.clone();
        let owner = Network::with_emitter(
            NetworkConfig::default(),
            Arc::new(move |label, value| {
                sink.lock().unwrap().push((label.into(), value.clone()));
            }),
        );
        let one = owner.subscribe("bar-network-one").unwrap()["token"]
            .as_str()
            .unwrap()
            .to_string();
        let two = owner.subscribe("bar-network-two").unwrap()["token"]
            .as_str()
            .unwrap()
            .to_string();
        let deadline = Instant::now() + Duration::from_secs(10);
        while owner.shared.0.lock().unwrap().data.download.is_none() {
            assert!(Instant::now() < deadline, "No real traffic sample");
            std::thread::sleep(Duration::from_millis(100));
        }
        let samples = events.lock().unwrap().clone();
        let sequence = samples.last().unwrap().1["data"]["sequence"].clone();
        let paired: Vec<_> = samples
            .iter()
            .filter(|(_, event)| event["data"]["sequence"] == sequence)
            .collect();
        assert_eq!(paired.len(), 2);
        assert_eq!(paired[0].1, paired[1].1);
        // A different caller cannot dispose someone else's token.
        owner.unsubscribe(&one, "bar-network-two");
        assert_eq!(owner.shared.0.lock().unwrap().subs.len(), 2);
        owner.unsubscribe(&one, "bar-network-one");
        let before = events
            .lock()
            .unwrap()
            .iter()
            .filter(|(label, _)| label == "bar-network-one")
            .count();
        std::thread::sleep(Duration::from_millis(2200));
        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .filter(|(label, _)| label == "bar-network-one")
                .count(),
            before
        );
        owner.unsubscribe(&two, "bar-network-two");
        let paused = owner.shared.0.lock().unwrap().data.sequence;
        std::thread::sleep(Duration::from_millis(2200));
        assert_eq!(owner.shared.0.lock().unwrap().data.sequence, paused);
        let resumed = owner.subscribe("bar-network-one").unwrap();
        assert!(resumed["initial"]["data"]["download"].is_null());
        assert!(resumed["initial"]["data"]["history"]
            .as_array()
            .unwrap()
            .is_empty());
        let report = json!({"timestamp":crate::metrics::timestamp() as f64,"passed":true,"twoSubscribersShareSnapshots":true,"tokensCheckOwner":true,"pausedSequence":paused,"resumeStartsWithoutRate":true,"realWindowsCollectors":true,"appBarWindowsCreated":false});
        owner.stop();
        let path = std::env::temp_dir().join(format!(
            "strata-network-lifecycle-{}.json",
            crate::metrics::timestamp()
        ));
        std::fs::write(&path, serde_json::to_string_pretty(&report).unwrap()).unwrap();
        println!("Evidence: {}", path.display());
    }
    #[test]
    fn obsolete_interface_preference_cannot_pin_monitoring() {
        let config: NetworkConfig =
            serde_json::from_value(json!({"interfaceId":"old-pinned-adapter"})).unwrap();
        assert_eq!(config, NetworkConfig::default());
        assert!(serde_json::to_value(config)
            .unwrap()
            .get("interfaceId")
            .is_none());
    }
    #[test]
    fn widget_direction_and_format_survive_native_projection_and_roundtrip() {
        let mut document = crate::config::defaults();
        let widget = &mut document.widgets.left[0];
        widget.r#type = crate::config_contract::WidgetKind::Network;
        widget.network_direction = Some(crate::config_contract::NetworkDirection::Download);
        let id = widget.id.clone();
        document.monitors.insert(
            "DISPLAY1".into(),
            crate::config_contract::BarOverride {
                widgets: Some(std::collections::BTreeMap::from([(
                    id,
                    crate::config_contract::WidgetOverride {
                        network_direction: Some(crate::config_contract::NetworkDirection::Upload),
                        format: Some(crate::config_contract::WidgetFormat::Compact),
                        ..Default::default()
                    },
                )])),
                ..Default::default()
            },
        );
        let saved = crate::config::parse(&serde_json::to_string(&document).unwrap()).unwrap();
        let first = crate::config::project(&saved, Some("DISPLAY1"));
        let second = crate::config::project(&saved, Some("DISPLAY2"));
        assert_eq!(
            first.widgets.left[0].network_direction,
            Some(crate::config_contract::NetworkDirection::Upload)
        );
        assert_eq!(
            first.widgets.left[0].format,
            crate::config_contract::WidgetFormat::Compact
        );
        assert_eq!(
            second.widgets.left[0].network_direction,
            Some(crate::config_contract::NetworkDirection::Download)
        );
        assert!(crate::config::parse(
            &serde_json::to_string(&saved)
                .unwrap()
                .replace("download", "invalid")
        )
        .is_err());
    }
    #[test]
    fn config_validates_literal_targets() {
        let mut c = NetworkConfig::default();
        assert!(c.validate().is_ok());
        c.probe_target = "example.com".into();
        assert!(c.validate().is_err());
        c.probe_target = "2606:4700:4700::1111".into();
        assert!(c.validate().is_ok());
    }
}
