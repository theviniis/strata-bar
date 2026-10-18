//! One shared GPU observation and history, independent of windows and transport.
use crate::gpu_contract::{GpuAdapter, GpuData, GpuMetric, GpuMetricStatus as Status, GpuPoint};
use std::{collections::VecDeque, time::Instant};

/// Vendor-neutral Windows sources plus one optional Afterburner snapshot.
pub struct GpuReadings {
    pub timestamp: f64,
    pub instant: Instant,
    pub adapter: Result<GpuAdapter, String>,
    pub percent: Result<f64, String>,
    pub memory_used: Result<f64, String>,
    pub memory_total: Result<f64, String>,
    pub shared_used: Result<f64, String>,
    pub shared_total: Result<f64, String>,
    pub afterburner: Result<Vec<u8>, String>,
}
pub trait GpuSource {
    fn read(&mut self) -> GpuReadings;
}
pub struct GpuCollector<S> {
    source: S,
    last: Option<GpuData>,
    history: VecDeque<(Instant, GpuPoint)>,
    sequence: u32,
}
fn metric(result: Result<f64, String>, old: Option<&GpuMetric>, at: f64) -> GpuMetric {
    match result {
        Ok(value) if value.is_finite() && value >= 0. => GpuMetric {
            status: Status::Ready,
            value: Some(value),
            updated_at: Some(at),
            error: None,
        },
        result => GpuMetric {
            status: if old.and_then(|m| m.value).is_some() {
                Status::Error
            } else {
                Status::Unavailable
            },
            value: old.and_then(|m| m.value),
            updated_at: old.and_then(|m| m.updated_at),
            error: Some(result.err().unwrap_or_else(|| "Invalid GPU reading".into())),
        },
    }
}
/// Used and limit are only meaningful together; an inconsistent pair is no
/// measurement at all rather than a plausible-looking one.
fn pair(
    used: Result<f64, String>,
    total: Result<f64, String>,
) -> (Result<f64, String>, Result<f64, String>) {
    match (used, total) {
        (Ok(used), Ok(total)) if used >= 0. && total > 0. && used <= total => (Ok(used), Ok(total)),
        (Ok(_), Ok(_)) => {
            let error = "Inconsistent GPU memory observations".to_string();
            (Err(error.clone()), Err(error))
        }
        (used, total) => (used, total),
    }
}
impl<S: GpuSource> GpuCollector<S> {
    pub fn new(source: S) -> Self {
        Self {
            source,
            last: None,
            history: VecDeque::new(),
            sequence: 0,
        }
    }
    pub fn collect(&mut self) -> GpuData {
        let readings = self.source.read();
        let at = readings.timestamp;
        let old = self.last.as_ref();
        let adapter = readings.adapter.and_then(|adapter| {
            if adapter.dedicated_bytes.is_finite() && adapter.dedicated_bytes >= 0. {
                Ok(adapter)
            } else {
                Err("Invalid GPU dedicated memory".into())
            }
        });
        let percent = metric(
            readings.percent.and_then(|percent| {
                if (0.0..=100.).contains(&percent) {
                    Ok(percent)
                } else {
                    Err("Invalid GPU utilization".into())
                }
            }),
            old.map(|d| &d.percent),
            at,
        );
        let (memory_used, memory_total) = pair(readings.memory_used, readings.memory_total);
        let (shared_used, shared_total) = pair(readings.shared_used, readings.shared_total);
        // The Afterburner sensors are attributed by the adapter identity, so a
        // failed DXGI read falls back to the last adapter we saw instead of
        // guessing which GPU the sensors belong to.
        let identity = adapter
            .as_ref()
            .ok()
            .map(|adapter| (adapter.vendor_id, adapter.device_id))
            .or_else(|| {
                old.and_then(|data| data.adapter.as_ref())
                    .map(|adapter| (adapter.vendor_id, adapter.device_id))
            });
        let observations = readings.afterburner.and_then(|bytes| match identity {
            Some((vendor_id, device_id)) => {
                crate::afterburner::gpu_observations(&bytes, at, vendor_id, device_id)
            }
            None => Err("GPU identity unavailable for Afterburner sensors".into()),
        });
        let previous_temperature = old.and_then(|d| d.temperature_celsius.updated_at);
        let temperature_at = observations
            .as_ref()
            .map(|observations| observations.updated_at)
            .unwrap_or(at);
        let temperature = match &observations {
            Ok(observations) => observations.temperature.clone().and_then(|value| {
                if previous_temperature.is_some_and(|previous| observations.updated_at < previous)
                    && old.is_some_and(|data| at >= data.sampled_at)
                {
                    Err("Afterburner observation time regressed".into())
                } else {
                    Ok(value)
                }
            }),
            Err(error) => Err(error.clone()),
        };
        let (power, fan) = match &observations {
            Ok(observations) => (
                observations.power_watts.clone(),
                observations.fan_percent.clone(),
            ),
            Err(error) => (Err(error.clone()), Err(error.clone())),
        };
        let temperature_celsius = metric(
            temperature,
            old.map(|d| &d.temperature_celsius),
            temperature_at,
        );
        let new_temperature = temperature_celsius.status == Status::Ready
            && previous_temperature.is_none_or(|previous| temperature_at > previous);
        self.sequence += 1;
        if old.is_some_and(|d| at <= d.sampled_at) {
            self.history.clear();
        }
        self.history.push_back((
            readings.instant,
            GpuPoint {
                sequence: self.sequence,
                timestamp: at,
                percent: (percent.status == Status::Ready)
                    .then_some(percent.value)
                    .flatten(),
                temperature_celsius: if new_temperature {
                    temperature_celsius.value
                } else {
                    None
                },
                // A timestamp without a new value means a still-valid repeated
                // observation. Neither field means the source was unavailable.
                temperature_updated_at: if temperature_celsius.status == Status::Ready {
                    temperature_celsius.updated_at
                } else {
                    None
                },
            },
        ));
        while self.history.front().is_some_and(|(instant, point)| {
            readings
                .instant
                .saturating_duration_since(*instant)
                .as_millis()
                > 120000
                || at - point.timestamp > 120000.
        }) || self.history.len() > 61
        {
            self.history.pop_front();
        }
        let data = GpuData {
            sequence: self.sequence,
            sampled_at: at,
            adapter: adapter
                .as_ref()
                .ok()
                .cloned()
                .or_else(|| old.and_then(|d| d.adapter.clone())),
            percent,
            memory_used_bytes: metric(memory_used, old.map(|d| &d.memory_used_bytes), at),
            memory_total_bytes: metric(memory_total, old.map(|d| &d.memory_total_bytes), at),
            shared_used_bytes: metric(shared_used, old.map(|d| &d.shared_used_bytes), at),
            shared_total_bytes: metric(shared_total, old.map(|d| &d.shared_total_bytes), at),
            temperature_celsius,
            power_watts: metric(power, old.map(|d| &d.power_watts), temperature_at),
            fan_percent: metric(fan, old.map(|d| &d.fan_percent), temperature_at),
            temperature_sensor: observations
                .as_ref()
                .ok()
                .map(crate::afterburner::gpu_sensor)
                .or_else(|| old.and_then(|d| d.temperature_sensor.clone())),
            history: self
                .history
                .iter()
                .map(|(_, point)| point.clone())
                .collect(),
        };
        self.last = Some(data.clone());
        data
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::afterburner;
    use std::time::Duration;

    impl GpuSource for VecDeque<GpuReadings> {
        fn read(&mut self) -> GpuReadings {
            self.pop_front().expect("Scripted GPU observation")
        }
    }
    fn adapter() -> GpuAdapter {
        GpuAdapter {
            name: "GeForce RTX".into(),
            vendor_id: 0x10de,
            device_id: 0x2489,
            dedicated_bytes: 8.0e9,
        }
    }
    fn reading(at: f64, instant: Instant) -> GpuReadings {
        GpuReadings {
            timestamp: at,
            instant,
            adapter: Ok(adapter()),
            percent: Ok(25.5),
            memory_used: Ok(1.5e9),
            memory_total: Ok(8.0e9),
            shared_used: Ok(3.22e8),
            shared_total: Ok(16.0e9),
            afterburner: Err("Not running".into()),
        }
    }
    const STRIDE: usize = 1324;
    /// Minimal MAHM snapshot with the GPU sensors under test.
    fn mahm(at_seconds: u32, sensors: &[(u32, f32)]) -> Vec<u8> {
        let mut entries = vec![(0u32, 0f32, 0u32, "GPU temperature")];
        for (source, value) in sensors {
            entries.push((*source, *value, 0, "GPU sensor"));
        }
        let mut bytes = vec![0u8; 32 + entries.len() * STRIDE + 1304];
        for (offset, value) in [
            (0, 0x4d41484du32),
            (4, 0x20000),
            (8, 32),
            (12, entries.len() as u32),
            (16, STRIDE as u32),
            (20, at_seconds),
            (24, 1u32),
            (28, 1304u32),
        ] {
            bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        for (index, (source, value, gpu, name)) in entries.iter().enumerate() {
            let offset = 32 + index * STRIDE;
            bytes[offset..offset + name.len()].copy_from_slice(name.as_bytes());
            bytes[offset + 1300..offset + 1304].copy_from_slice(&value.to_le_bytes());
            bytes[offset + 1316..offset + 1320].copy_from_slice(&gpu.to_le_bytes());
            bytes[offset + 1320..offset + 1324].copy_from_slice(&source.to_le_bytes());
        }
        let descriptor = 32 + entries.len() * STRIDE;
        let id = b"VEN_10DE&DEV_2489";
        bytes[descriptor..descriptor + id.len()].copy_from_slice(id);
        bytes
    }
    /// Snapshot whose first entry carries the temperature under test.
    fn temperature_mahm(at_seconds: u32, temperature: f32) -> Vec<u8> {
        let mut bytes = mahm(at_seconds, &[]);
        bytes[32 + 1300..32 + 1304].copy_from_slice(&temperature.to_le_bytes());
        bytes
    }

    #[test]
    fn composes_every_metric_and_keeps_missing_sensors_independent() {
        let mut collector = GpuCollector::new(VecDeque::from([reading(100000., Instant::now())]));
        let data = collector.collect();
        assert_eq!(data.percent.value, Some(25.5));
        assert_eq!(data.memory_used_bytes.value, Some(1.5e9));
        assert_eq!(data.memory_total_bytes.value, Some(8.0e9));
        assert_eq!(data.shared_used_bytes.value, Some(3.22e8));
        assert_eq!(data.shared_total_bytes.value, Some(16.0e9));
        assert_eq!(data.adapter.unwrap().name, "GeForce RTX");
        assert_eq!(data.temperature_celsius.status, Status::Unavailable);
        assert_eq!(data.history.len(), 1);
        assert_eq!(data.history[0].percent, Some(25.5));
    }

    #[test]
    fn preserves_independent_values_through_failures_and_recovery() {
        let instant = Instant::now();
        let first = reading(100000., instant);
        let mut failed = reading(102000., instant + Duration::from_secs(2));
        failed.percent = Err("PDH warm-up".into());
        failed.memory_used = Err("Adapter memory offline".into());
        let recovered = reading(104000., instant + Duration::from_secs(4));
        let mut collector = GpuCollector::new(VecDeque::from([first, failed, recovered]));
        collector.collect();
        let data = collector.collect();
        assert_eq!(data.percent.value, Some(25.5));
        assert_eq!(data.percent.updated_at, Some(100000.));
        assert_eq!(data.percent.status, Status::Error);
        assert_eq!(data.memory_used_bytes.status, Status::Error);
        assert_eq!(data.memory_used_bytes.value, Some(1.5e9));
        assert_eq!(data.memory_total_bytes.status, Status::Ready);
        assert_eq!(data.shared_used_bytes.status, Status::Ready);
        assert!(data.history[1].percent.is_none());
        let data = collector.collect();
        assert_eq!(data.percent.status, Status::Ready);
        assert_eq!(data.memory_used_bytes.status, Status::Ready);
    }

    #[test]
    fn rejects_impossible_bounds_without_fabricating_a_reading() {
        let instant = Instant::now();
        let mut over = reading(100000., instant);
        over.percent = Ok(180.);
        let mut inconsistent = reading(102000., instant + Duration::from_secs(2));
        inconsistent.memory_used = Ok(9.0e9);
        let mut collector = GpuCollector::new(VecDeque::from([over, inconsistent]));
        let data = collector.collect();
        assert_eq!(data.percent.status, Status::Unavailable);
        assert_eq!(data.percent.value, None);
        assert_eq!(data.shared_used_bytes.status, Status::Ready);
        let data = collector.collect();
        assert_eq!(data.percent.status, Status::Ready);
        assert_eq!(data.memory_used_bytes.status, Status::Error);
        assert_eq!(data.memory_used_bytes.value, Some(1.5e9));
        assert_eq!(data.memory_total_bytes.value, Some(8.0e9));
        assert!(data
            .memory_used_bytes
            .error
            .unwrap()
            .contains("Inconsistent"));
    }

    #[test]
    fn keeps_the_last_known_adapter_and_sensor_identity_through_failures() {
        let instant = Instant::now();
        let mut first = reading(100000., instant);
        first.afterburner = Ok(temperature_mahm(100, 51.));
        let mut failed = reading(102000., instant + Duration::from_secs(2));
        failed.adapter = Err("DXGI unavailable".into());
        failed.afterburner = Err("Afterburner mapping lost".into());
        let mut collector = GpuCollector::new(VecDeque::from([first, failed]));
        let data = collector.collect();
        let sensor = data.temperature_sensor.clone().unwrap();
        assert_eq!(sensor.provider, "msiAfterburner");
        assert_eq!(sensor.gpu, 0);
        assert_eq!(data.temperature_celsius.value, Some(51.));
        let data = collector.collect();
        assert_eq!(data.adapter.unwrap().name, "GeForce RTX");
        assert_eq!(data.temperature_sensor.unwrap().name, sensor.name);
        assert_eq!(data.temperature_celsius.status, Status::Error);
        assert_eq!(data.temperature_celsius.value, Some(51.));
    }

    #[test]
    fn distinguishes_unchanged_stale_and_recovered_temperature() {
        let instant = Instant::now();
        let mut samples = Vec::new();
        for seconds in [0, 2, 4, 6, 8, 10] {
            let mut sample = reading(
                100000. + seconds as f64 * 1000.,
                instant + Duration::from_secs(seconds),
            );
            sample.afterburner = Ok(if seconds == 10 {
                temperature_mahm(110, 55.)
            } else {
                temperature_mahm(100, 51.)
            });
            samples.push(sample);
        }
        let mut collector = GpuCollector::new(VecDeque::from(samples));
        assert_eq!(
            collector.collect().history[0].temperature_celsius,
            Some(51.)
        );
        for _ in 0..3 {
            let data = collector.collect();
            let point = data.history.last().unwrap();
            assert_eq!(data.temperature_celsius.status, Status::Ready);
            assert_eq!(data.temperature_celsius.updated_at, Some(100000.));
            assert!(point.temperature_celsius.is_none());
            assert_eq!(point.temperature_updated_at, Some(100000.));
        }
        let stale = collector.collect();
        assert_eq!(stale.temperature_celsius.status, Status::Error);
        assert_eq!(stale.temperature_celsius.value, Some(51.));
        assert!(stale
            .history
            .last()
            .unwrap()
            .temperature_updated_at
            .is_none());
        let recovered = collector.collect();
        assert_eq!(recovered.temperature_celsius.status, Status::Ready);
        assert_eq!(
            recovered.history.last().unwrap().temperature_celsius,
            Some(55.)
        );
    }

    #[test]
    fn bounds_history_and_expires_it_when_the_clock_moves_forward() {
        let instant = Instant::now();
        let mut readings = (0..64)
            .map(|index| {
                reading(
                    100000. + index as f64 * 2000.,
                    instant + Duration::from_secs(index * 2),
                )
            })
            .collect::<Vec<_>>();
        readings.push(reading(240000., instant + Duration::from_secs(140)));
        readings.push(reading(50000., instant + Duration::from_secs(142)));
        let mut collector = GpuCollector::new(VecDeque::from(readings));
        let mut data = collector.collect();
        for _ in 1..64 {
            data = collector.collect();
        }
        assert_eq!(data.history.len(), 61);
        assert_eq!(data.history[0].timestamp, 106000.);
        let data = collector.collect();
        assert_eq!(data.history.last().unwrap().timestamp, 240000.);
        assert_eq!(collector.collect().history.len(), 1);
        let mut collector = GpuCollector::new(VecDeque::from([
            reading(100000., instant),
            reading(300000., instant + Duration::from_secs(2)),
        ]));
        collector.collect();
        assert_eq!(collector.collect().history.len(), 1);
    }

    #[test]
    fn forgets_sensors_when_no_adapter_identity_was_ever_seen() {
        let instant = Instant::now();
        let mut sample = reading(100000., instant);
        sample.adapter = Err("DXGI unavailable".into());
        sample.afterburner = Ok(temperature_mahm(100, 51.));
        let mut collector = GpuCollector::new(VecDeque::from([sample]));
        let data = collector.collect();
        assert_eq!(data.temperature_celsius.status, Status::Unavailable);
        assert!(data.temperature_sensor.is_none());
        assert!(data
            .temperature_celsius
            .error
            .unwrap()
            .contains("identity unavailable"));
    }

    #[test]
    fn parses_the_afterburner_snapshot_through_the_public_sensor_path() {
        let bytes = mahm(100, &[(0x61, 20.5), (0x10, 0.)]);
        let observations = afterburner::gpu_observations(&bytes, 102000., 0x10de, 0x2489).unwrap();
        assert_eq!(observations.power_watts.unwrap(), 20.5);
        assert_eq!(observations.fan_percent.unwrap(), 0.);
    }
}
