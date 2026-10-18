//! One shared CPU observation and history, independent of windows and transport.
use crate::cpu_contract::{CpuData, CpuMetric, CpuMetricStatus as Status, CpuPoint};
use std::{
    collections::{BTreeSet, VecDeque},
    time::Instant,
};

#[derive(Clone)]
pub struct CpuTopology {
    pub physical_cores: u32,
    pub processors: Vec<(u16, u8)>,
}
pub struct CpuReadings {
    pub timestamp: f64,
    pub instant: Instant,
    pub percent: Result<f64, String>,
    pub frequencies: Result<Vec<(u16, u8, f64)>, String>,
    pub topology: Result<CpuTopology, String>,
    pub max_frequency_hz: Result<f64, String>,
    pub afterburner: Result<Vec<u8>, String>,
}
pub trait CpuSource {
    fn read(&mut self) -> CpuReadings;
}
pub struct CpuCollector<S> {
    source: S,
    last: Option<CpuData>,
    history: VecDeque<(Instant, CpuPoint)>,
    sequence: u32,
}
fn metric(result: Result<f64, String>, old: Option<&CpuMetric>, at: f64) -> CpuMetric {
    match result {
        Ok(value) if value.is_finite() && value >= 0. => CpuMetric {
            status: Status::Ready,
            value: Some(value),
            updated_at: Some(at),
            error: None,
        },
        result => CpuMetric {
            status: if old.and_then(|m| m.value).is_some() {
                Status::Error
            } else {
                Status::Unavailable
            },
            value: old.and_then(|m| m.value),
            updated_at: old.and_then(|m| m.updated_at),
            error: Some(result.err().unwrap_or_else(|| "Invalid CPU reading".into())),
        },
    }
}
impl<S: CpuSource> CpuCollector<S> {
    pub fn new(source: S) -> Self {
        Self {
            source,
            last: None,
            history: VecDeque::new(),
            sequence: 0,
        }
    }
    pub fn collect(&mut self) -> CpuData {
        let readings = self.source.read();
        let at = readings.timestamp;
        let old = self.last.as_ref();
        let topology = readings.topology.and_then(|t| {
            let unique: BTreeSet<_> = t.processors.iter().copied().collect();
            if t.physical_cores == 0
                || t.physical_cores as usize > t.processors.len()
                || unique.len() != t.processors.len()
            {
                return Err("Invalid CPU topology".into());
            }
            Ok(t)
        });
        let frequency = (|| {
            let topology = topology.as_ref().map_err(Clone::clone)?;
            let frequencies = readings.frequencies?;
            let identities: BTreeSet<_> = frequencies.iter().map(|(g, p, _)| (*g, *p)).collect();
            if identities != topology.processors.iter().copied().collect()
                || identities.len() != frequencies.len()
                || frequencies
                    .iter()
                    .any(|(_, _, v)| !v.is_finite() || *v <= 0.)
            {
                return Err("Incomplete CPU frequency coverage".into());
            }
            Ok(frequencies.iter().map(|(_, _, v)| v).sum::<f64>() / frequencies.len() as f64)
        })();
        let percent = metric(
            readings.percent.and_then(|p| {
                if (0.0..=100.).contains(&p) {
                    Ok(p)
                } else {
                    Err("Invalid CPU utilization".into())
                }
            }),
            old.map(|d| &d.percent),
            at,
        );
        let frequency_hz = metric(frequency, old.map(|d| &d.frequency_hz), at);
        let max_frequency_hz = metric(
            readings.max_frequency_hz.and_then(|v| {
                if v > 0. {
                    Ok(v)
                } else {
                    Err("Invalid nominal frequency".into())
                }
            }),
            old.map(|d| &d.max_frequency_hz),
            at,
        );
        let physical_cores = metric(
            topology
                .as_ref()
                .map(|t| t.physical_cores as f64)
                .map_err(Clone::clone),
            old.map(|d| &d.physical_cores),
            at,
        );
        let logical_processors = metric(
            topology
                .as_ref()
                .map(|t| t.processors.len() as f64)
                .map_err(Clone::clone),
            old.map(|d| &d.logical_processors),
            at,
        );
        let previous_temperature = old.and_then(|d| d.temperature_celsius.updated_at);
        let temperature = readings
            .afterburner
            .and_then(|bytes| crate::afterburner::package_temperature(&bytes, at))
            .and_then(|value| {
                if previous_temperature.is_some_and(|previous| value.updated_at < previous)
                    && old.is_some_and(|data| at >= data.sampled_at)
                {
                    Err("Afterburner observation time regressed".into())
                } else {
                    Ok(value)
                }
            });
        let temperature_at = temperature.as_ref().map(|t| t.updated_at).unwrap_or(at);
        let temperature_sensor = temperature
            .as_ref()
            .map(|t| t.sensor.clone())
            .ok()
            .or_else(|| old.and_then(|d| d.temperature_sensor.clone()));
        let temperature_celsius = metric(
            temperature.map(|t| t.value),
            old.map(|d| &d.temperature_celsius),
            temperature_at,
        );
        let new_temperature = temperature_celsius.status == Status::Ready
            && previous_temperature.is_none_or(|old| temperature_at > old);
        self.sequence += 1;
        if old.is_some_and(|d| at <= d.sampled_at) {
            self.history.clear();
        }
        self.history.push_back((
            readings.instant,
            CpuPoint {
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
                temperature_updated_at: if new_temperature {
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
                > 60000
                || at - point.timestamp > 60000.
        }) || self.history.len() > 31
        {
            self.history.pop_front();
        }
        let data = CpuData {
            sequence: self.sequence,
            sampled_at: at,
            percent,
            frequency_hz,
            max_frequency_hz,
            physical_cores,
            logical_processors,
            temperature_celsius,
            temperature_sensor,
            history: self.history.iter().map(|(_, p)| p.clone()).collect(),
        };
        self.last = Some(data.clone());
        data
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Source(Vec<CpuReadings>);
    impl CpuSource for Source {
        fn read(&mut self) -> CpuReadings {
            self.0.remove(0)
        }
    }
    fn reading(at: f64, instant: Instant) -> CpuReadings {
        CpuReadings {
            timestamp: at,
            instant,
            percent: Ok(25.5),
            frequencies: Ok(vec![(0, 0, 3_000_000_000.), (1, 0, 4_000_000_000.)]),
            topology: Ok(CpuTopology {
                physical_cores: 2,
                processors: vec![(0, 0), (1, 0)],
            }),
            max_frequency_hz: Ok(2_900_000_000.),
            afterburner: Err("Not running".into()),
        }
    }
    #[test]
    fn public_collector_combines_groups_and_keeps_missing_temperature_independent() {
        let mut collector = CpuCollector::new(Source(vec![reading(100000., Instant::now())]));
        let data = collector.collect();
        assert_eq!(data.percent.value, Some(25.5));
        assert_eq!(data.frequency_hz.value, Some(3_500_000_000.));
        assert_eq!(data.max_frequency_hz.value, Some(2_900_000_000.));
        assert_eq!(data.physical_cores.value, Some(2.));
        assert_eq!(data.logical_processors.value, Some(2.));
        assert!(data.temperature_celsius.value.is_none());
        assert_eq!(data.history.len(), 1);
        assert_eq!(data.history[0].percent, Some(25.5));
    }
    fn mahm(at_seconds: u32, temperature: f32) -> Vec<u8> {
        // Published MAHM v2 layout: header 32 bytes, entry stride 1324.
        let mut bytes = vec![0u8; 32 + 1324 * 2];
        for (offset, value) in [
            (0, 0x4d41484du32),
            (4, 0x20000),
            (8, 32),
            (12, 2),
            (16, 1324),
            (20, at_seconds),
            (28, 1304),
        ] {
            bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        // Include a GPU sensor before CPU so selecting by position is wrong.
        bytes[32 + 1300..32 + 1304].copy_from_slice(&70f32.to_le_bytes());
        let entry = 32 + 1324;
        bytes[entry..entry + 15].copy_from_slice(b"CPU temperature");
        bytes[entry + 1300..entry + 1304].copy_from_slice(&temperature.to_le_bytes());
        bytes[entry + 1316..entry + 1320].copy_from_slice(&u32::MAX.to_le_bytes());
        bytes[entry + 1320..entry + 1324].copy_from_slice(&128u32.to_le_bytes());
        bytes
    }
    #[test]
    fn public_collector_reads_package_sensor_and_does_not_invent_repeated_observations() {
        let instant = Instant::now();
        let mut first = reading(100000., instant);
        first.afterburner = Ok(mahm(100, 42.5));
        let mut repeated = reading(102000., instant + std::time::Duration::from_secs(2));
        repeated.afterburner = Ok(mahm(100, 42.5));
        let mut collector = CpuCollector::new(Source(vec![first, repeated]));
        let data = collector.collect();
        assert_eq!(data.temperature_celsius.value, Some(42.5));
        assert_eq!(data.temperature_celsius.updated_at, Some(100000.));
        assert_eq!(data.temperature_sensor.unwrap().instance, u32::MAX);
        let data = collector.collect();
        assert_eq!(data.temperature_celsius.updated_at, Some(100000.));
        assert!(data.history[1].temperature_celsius.is_none());
        assert_eq!(data.history[0].temperature_celsius, Some(42.5));
    }
    #[test]
    fn public_collector_rejects_regressed_sensor_time_then_recovers() {
        let instant = Instant::now();
        let mut readings = Vec::new();
        for (index, seconds, temp) in [(0, 100, 42.5), (1, 99, 33.), (2, 104, 45.)] {
            let mut sample = reading(
                100000. + index as f64 * 2000.,
                instant + std::time::Duration::from_secs(index * 2),
            );
            sample.afterburner = Ok(mahm(seconds, temp));
            readings.push(sample);
        }
        let mut collector = CpuCollector::new(Source(readings));
        collector.collect();
        let failed = collector.collect();
        assert_eq!(failed.temperature_celsius.value, Some(42.5));
        assert_eq!(failed.temperature_celsius.updated_at, Some(100000.));
        assert_ne!(failed.temperature_celsius.status, Status::Ready);
        assert_eq!(failed.percent.status, Status::Ready);
        let recovered = collector.collect();
        assert_eq!(recovered.temperature_celsius.value, Some(45.));
        assert_eq!(recovered.temperature_celsius.status, Status::Ready);
        assert_eq!(recovered.history[2].temperature_celsius, Some(45.));
    }
    #[test]
    fn public_collector_preserves_independent_values_through_failures_and_recovery() {
        let instant = Instant::now();
        let first = reading(100000., instant);
        let mut failed = reading(102000., instant + std::time::Duration::from_secs(2));
        failed.percent = Err("PDH warm-up".into());
        failed.frequencies = Ok(vec![(0, 0, 3_000_000_000.)]);
        let recovered = reading(104000., instant + std::time::Duration::from_secs(4));
        let mut collector = CpuCollector::new(Source(vec![first, failed, recovered]));
        collector.collect();
        let data = collector.collect();
        assert_eq!(data.percent.value, Some(25.5));
        assert_eq!(data.percent.updated_at, Some(100000.));
        assert_eq!(data.percent.status, Status::Error);
        assert_eq!(data.frequency_hz.value, Some(3_500_000_000.));
        assert_eq!(data.frequency_hz.updated_at, Some(100000.));
        assert_eq!(data.max_frequency_hz.status, Status::Ready);
        assert!(data.history[1].percent.is_none());
        let data = collector.collect();
        assert_eq!(data.percent.status, Status::Ready);
        assert_eq!(data.frequency_hz.status, Status::Ready);
    }
    #[test]
    fn public_collector_handles_malformed_stale_and_deallocated_mappings_without_losing_cpu() {
        let instant = Instant::now();
        let mut samples = Vec::new();
        let mut malformed = mahm(100, 40.);
        malformed[16..20].copy_from_slice(&u32::MAX.to_le_bytes());
        let mut deallocated = mahm(100, 40.);
        deallocated[..4].copy_from_slice(&0xDEADu32.to_le_bytes());
        let mut unknown = mahm(100, 40.);
        unknown[4..8].copy_from_slice(&0x30000u32.to_le_bytes());
        for bytes in [
            vec![0; 4],
            malformed,
            deallocated,
            unknown,
            mahm(1, 40.),
            mahm(100, f32::MAX),
            mahm(100, f32::NAN),
            mahm(100, 40.)[..100].to_vec(),
        ] {
            let mut sample = reading(100000., instant);
            sample.afterburner = Ok(bytes);
            samples.push(sample);
        }
        let mut valid = reading(100000., instant);
        valid.afterburner = Ok(mahm(100, 40.));
        samples.push(valid);
        let mut collector = CpuCollector::new(Source(samples));
        for _ in 0..8 {
            let data = collector.collect();
            assert!(data.temperature_celsius.value.is_none());
            assert_eq!(data.percent.status, Status::Ready);
        }
        assert_eq!(collector.collect().temperature_celsius.value, Some(40.));
    }
    #[test]
    fn public_collector_bounds_history_and_preserves_only_observed_resume_points() {
        let instant = Instant::now();
        let mut readings = (0..34)
            .map(|i| {
                reading(
                    100000. + i as f64 * 2000.,
                    instant + std::time::Duration::from_secs(i * 2),
                )
            })
            .collect::<Vec<_>>();
        readings.push(reading(
            180000.,
            instant + std::time::Duration::from_secs(80),
        ));
        readings.push(reading(
            50000.,
            instant + std::time::Duration::from_secs(82),
        ));
        let mut collector = CpuCollector::new(Source(readings));
        let mut data = collector.collect();
        for _ in 1..34 {
            data = collector.collect();
        }
        assert_eq!(data.history.len(), 31);
        assert_eq!(data.history[0].timestamp, 106000.);
        let data = collector.collect();
        assert_eq!(data.history.last().unwrap().timestamp, 180000.);
        assert_eq!(data.history[data.history.len() - 2].timestamp, 166000.);
        assert_eq!(collector.collect().history.len(), 1);
    }
    #[test]
    fn public_collector_expires_history_when_wall_clock_moves_forward() {
        let instant = Instant::now();
        let mut collector = CpuCollector::new(Source(vec![
            reading(100000., instant),
            reading(200000., instant + std::time::Duration::from_secs(2)),
        ]));
        collector.collect();
        assert_eq!(collector.collect().history.len(), 1);
    }
}
