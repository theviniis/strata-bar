//! One shared disk (volume) observation, independent of windows and transport.
use crate::disk_contract::{DiskData, DiskVolume, DiskVolumeKind};

/// One mounted volume as reported by the platform source, in raw bytes.
#[derive(Clone, Debug, PartialEq)]
pub struct VolumeReading {
    pub mount: String,
    pub label: Option<String>,
    pub kind: DiskVolumeKind,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

pub struct DiskReadings {
    pub timestamp: f64,
    pub volumes: Result<Vec<VolumeReading>, String>,
}

pub trait DiskSource {
    fn read(&mut self) -> DiskReadings;
}

pub struct DiskCollector<S> {
    source: S,
    sequence: u32,
}

impl<S: DiskSource> DiskCollector<S> {
    pub fn new(source: S) -> Self {
        Self {
            source,
            sequence: 0,
        }
    }

    /// The used/percent projection lives here so the Windows source only
    /// reports raw capacity. A volume with no capacity, or with a free figure
    /// above its total, carries no usable percentage and is not projected.
    pub fn collect(&mut self) -> Result<DiskData, String> {
        let readings = self.source.read();
        let mut volumes = Vec::new();
        for volume in readings.volumes? {
            if volume.total_bytes == 0 || volume.free_bytes > volume.total_bytes {
                continue;
            }
            let used = volume.total_bytes - volume.free_bytes;
            volumes.push(DiskVolume {
                mount: volume.mount,
                label: volume.label,
                kind: volume.kind,
                total_bytes: volume.total_bytes as f64,
                free_bytes: volume.free_bytes as f64,
                used_bytes: used as f64,
                percent: used as f64 / volume.total_bytes as f64 * 100.,
            });
        }
        volumes.sort_by(|a, b| a.mount.cmp(&b.mount));
        self.sequence += 1;
        Ok(DiskData {
            sequence: self.sequence,
            sampled_at: readings.timestamp,
            volumes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Source(Vec<DiskReadings>);
    impl DiskSource for Source {
        fn read(&mut self) -> DiskReadings {
            self.0.remove(0)
        }
    }

    fn volume(mount: &str, total: u64, free: u64) -> VolumeReading {
        VolumeReading {
            mount: mount.into(),
            label: None,
            kind: DiskVolumeKind::Fixed,
            total_bytes: total,
            free_bytes: free,
        }
    }

    fn readings(at: f64, volumes: Vec<VolumeReading>) -> DiskReadings {
        DiskReadings {
            timestamp: at,
            volumes: Ok(volumes),
        }
    }

    #[test]
    fn projects_used_and_percent_for_every_volume_in_mount_order() {
        let mut collector = DiskCollector::new(Source(vec![readings(
            100000.,
            vec![volume("D:", 200, 90), volume("C:", 100, 56)],
        )]));
        let data = collector.collect().unwrap();
        assert_eq!(data.sequence, 1);
        assert_eq!(data.sampled_at, 100000.);
        let mounts: Vec<_> = data.volumes.iter().map(|v| v.mount.as_str()).collect();
        assert_eq!(mounts, ["C:", "D:"]);
        assert_eq!(data.volumes[0].used_bytes, 44.);
        assert_eq!(data.volumes[0].free_bytes, 56.);
        assert_eq!(data.volumes[0].total_bytes, 100.);
        assert_eq!(data.volumes[0].percent, 44.);
        assert!((data.volumes[1].percent - 55.).abs() < 1e-9);
    }

    #[test]
    fn skips_volumes_without_capacity_or_with_impossible_free_space() {
        let mut collector = DiskCollector::new(Source(vec![readings(
            100000.,
            vec![
                volume("C:", 100, 56),
                volume("E:", 0, 0),
                volume("F:", 100, 101),
            ],
        )]));
        let data = collector.collect().unwrap();
        assert_eq!(data.volumes.len(), 1);
        assert_eq!(data.volumes[0].mount, "C:");
    }

    #[test]
    fn keeps_network_and_optical_volumes_with_their_kind_for_the_ui_to_filter() {
        let mut remote = volume("Z:", 100, 56);
        remote.kind = DiskVolumeKind::Remote;
        let mut optical = volume("E:", 100, 56);
        optical.kind = DiskVolumeKind::Optical;
        let mut collector =
            DiskCollector::new(Source(vec![readings(100000., vec![remote, optical])]));
        let data = collector.collect().unwrap();
        let kinds: Vec<_> = data.volumes.iter().map(|v| v.kind).collect();
        assert_eq!(kinds, [DiskVolumeKind::Optical, DiskVolumeKind::Remote]);
    }

    #[test]
    fn advances_the_sequence_and_reports_an_empty_list_without_volumes() {
        let mut collector = DiskCollector::new(Source(vec![
            readings(100000., vec![]),
            readings(102000., vec![volume("C:", 4, 1)]),
        ]));
        let empty = collector.collect().unwrap();
        assert_eq!(empty.sequence, 1);
        assert!(empty.volumes.is_empty());
        assert_eq!(collector.collect().unwrap().sequence, 2);
    }

    #[test]
    fn propagates_a_source_failure_without_projecting_a_sample() {
        let mut collector = DiskCollector::new(Source(vec![DiskReadings {
            timestamp: 100000.,
            volumes: Err("No disk volumes reported".into()),
        }]));
        assert_eq!(collector.collect().unwrap_err(), "No disk volumes reported");
    }
}
