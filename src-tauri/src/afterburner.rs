//! Read-only MAHM v2 hardware-monitoring protocol; never the control interface.
use crate::{cpu_contract::CpuTemperatureSensor, gpu_contract::GpuSensor};

pub const MAX_SNAPSHOT: usize = 16 * 1024 * 1024;
/// MAHM uses MAX_PATH for every name field, including the GPU descriptors.
const NAME: usize = 260;
/// Afterburner's own CPU package temperature source, on the global instance.
const CPU_PACKAGE: (u32, u32) = (0x80, u32::MAX);
/// GPU sources, addressed by the zero-based GPU index of the same entry.
const GPU_TEMPERATURE: u32 = 0x00;
const GPU_FAN_SPEED: u32 = 0x10;
const GPU_ABS_POWER: u32 = 0x61;

pub struct Temperature {
    pub value: f64,
    pub updated_at: f64,
    pub sensor: CpuTemperatureSensor,
}

/// The three independent GPU sensors of one Afterburner snapshot. Each metric
/// fails on its own, so an unmonitored fan or power rail never hides a valid
/// temperature and vice versa.
pub struct GpuObservations {
    pub updated_at: f64,
    pub gpu: u32,
    pub name: String,
    pub temperature: Result<f64, String>,
    pub power_watts: Result<f64, String>,
    pub fan_percent: Result<f64, String>,
}

fn word(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let raw = bytes
        .get(offset..offset + 4)
        .ok_or("Truncated Afterburner mapping")?;
    Ok(u32::from_le_bytes(raw.try_into().unwrap()))
}
pub fn snapshot_size(bytes: &[u8]) -> Result<usize, String> {
    if word(bytes, 0)? != 0x4d41484d || word(bytes, 4)? != 0x20000 {
        return Err("Afterburner mapping unavailable or unsupported".into());
    }
    let header = word(bytes, 8)? as usize;
    let count = word(bytes, 12)? as usize;
    let stride = word(bytes, 16)? as usize;
    let gpus = word(bytes, 24)? as usize;
    let gpu_stride = word(bytes, 28)? as usize;
    if header < 32 || stride < 1324 || (gpus > 0 && gpu_stride < 1304) {
        return Err("Invalid Afterburner layout".into());
    }
    header
        .checked_add(
            count
                .checked_mul(stride)
                .ok_or("Afterburner size overflow")?,
        )
        .and_then(|size| {
            gpus.checked_mul(gpu_stride)
                .and_then(|gpu| size.checked_add(gpu))
        })
        .filter(|size| *size <= MAX_SNAPSHOT)
        .ok_or_else(|| "Afterburner mapping exceeds bounds".into())
}

fn text(bytes: &[u8], offset: usize) -> Result<String, String> {
    let raw = bytes
        .get(offset..offset + NAME)
        .ok_or("Truncated Afterburner mapping")?;
    let end = raw
        .iter()
        .position(|b| *b == 0)
        .ok_or("Unterminated sensor name")?;
    Ok(String::from_utf8_lossy(&raw[..end]).into_owned())
}

/// One monitored value of the shared array. `gpu` is the zero-based GPU index
/// for GPU sources and `0xFFFFFFFF` for global sources such as the CPU package.
struct Entry {
    value: f64,
    name: String,
    source_id: u32,
    gpu: u32,
}
struct Snapshot {
    updated_at: f64,
    entries: Vec<Entry>,
    /// `szGpuId` (`VEN_`/`DEV_`/`SUBSYS_`...) and `szDevice` per descriptor.
    gpu_ids: Vec<String>,
    gpu_names: Vec<String>,
}
fn parse(bytes: &[u8], now: f64) -> Result<Snapshot, String> {
    let size = snapshot_size(bytes)?;
    if bytes.len() < size {
        return Err("Truncated Afterburner snapshot".into());
    }
    let updated_at = word(bytes, 20)? as f64 * 1000.;
    if updated_at <= 0. || updated_at > now || now - updated_at > 6000. {
        return Err("Afterburner observations are stale".into());
    }
    let header = word(bytes, 8)? as usize;
    let count = word(bytes, 12)? as usize;
    let stride = word(bytes, 16)? as usize;
    let mut entries = Vec::with_capacity(count);
    for index in 0..count {
        let offset = header + index * stride;
        let value = f32::from_bits(word(bytes, offset + 1300)?) as f64;
        if !value.is_finite() {
            continue;
        }
        entries.push(Entry {
            value,
            name: text(bytes, offset)?,
            gpu: word(bytes, offset + 1316)?,
            source_id: word(bytes, offset + 1320)?,
        });
    }
    let gpu_count = word(bytes, 24)? as usize;
    let gpu_stride = word(bytes, 28)? as usize;
    let gpu_base = header + count * stride;
    let mut gpu_ids = Vec::with_capacity(gpu_count);
    let mut gpu_names = Vec::with_capacity(gpu_count);
    for index in 0..gpu_count {
        let offset = gpu_base + index * gpu_stride;
        gpu_ids.push(text(bytes, offset)?);
        gpu_names.push(text(bytes, offset + 2 * NAME)?);
    }
    Ok(Snapshot {
        updated_at,
        entries,
        gpu_ids,
        gpu_names,
    })
}

pub fn package_temperature(bytes: &[u8], now: f64) -> Result<Temperature, String> {
    let snapshot = parse(bytes, now)?;
    let mut selected = None;
    for entry in &snapshot.entries {
        if (entry.source_id, entry.gpu) != CPU_PACKAGE {
            continue;
        }
        if selected.is_some() {
            return Err("Ambiguous Afterburner CPU package sensors".into());
        }
        if !(0.0..=200.).contains(&entry.value) {
            return Err("Invalid Afterburner temperature".into());
        }
        selected = Some(Temperature {
            value: entry.value,
            updated_at: snapshot.updated_at,
            sensor: CpuTemperatureSensor {
                provider: "msiAfterburner".into(),
                source_id: CPU_PACKAGE.0,
                instance: CPU_PACKAGE.1,
                name: entry.name.clone(),
            },
        });
    }
    selected.ok_or_else(|| {
        "Afterburner CPU package sensor unavailable; enable CPU temperature monitoring".into()
    })
}

/// Resolve the Afterburner GPU index for the adapter identified by its PCI IDs.
/// With several monitored GPUs the identity must match; a lone GPU descriptor is
/// accepted as-is so a partial or renamed identifier cannot hide the sensors.
fn gpu_index(snapshot: &Snapshot, vendor_id: u32, device_id: u32) -> Result<usize, String> {
    let wanted = format!("VEN_{vendor_id:04X}&DEV_{device_id:04X}");
    snapshot
        .gpu_ids
        .iter()
        .position(|id| id.to_ascii_uppercase().starts_with(&wanted))
        .or_else(|| (snapshot.gpu_ids.len() == 1).then_some(0))
        .ok_or_else(|| "Afterburner GPU identity unavailable".into())
}

pub fn gpu_observations(
    bytes: &[u8],
    now: f64,
    vendor_id: u32,
    device_id: u32,
) -> Result<GpuObservations, String> {
    let snapshot = parse(bytes, now)?;
    let gpu = gpu_index(&snapshot, vendor_id, device_id)? as u32;
    let sensor = |source_id: u32, limit: std::ops::RangeInclusive<f64>, label: &str| {
        let mut selected = None;
        for entry in snapshot
            .entries
            .iter()
            .filter(|entry| entry.source_id == source_id && entry.gpu == gpu)
        {
            if selected.is_some() {
                return Err(format!("Ambiguous Afterburner GPU {label} sensors"));
            }
            selected = Some(entry.value);
        }
        match selected {
            Some(value) if limit.contains(&value) => Ok(value),
            Some(_) => Err(format!("Invalid Afterburner GPU {label}")),
            None => Err(format!(
                "Afterburner GPU {label} unavailable; enable it in Afterburner"
            )),
        }
    };
    let index = gpu as usize;
    let name = snapshot
        .gpu_names
        .get(index)
        .filter(|name| !name.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| format!("GPU {}", index + 1));
    Ok(GpuObservations {
        updated_at: snapshot.updated_at,
        gpu,
        name,
        temperature: sensor(GPU_TEMPERATURE, 0.0..=200., "temperature"),
        power_watts: sensor(GPU_ABS_POWER, 0.0..=2000., "power"),
        fan_percent: sensor(GPU_FAN_SPEED, 0.0..=100., "fan speed"),
    })
}

/// Identity of the GPU temperature source. Kept here so the provider and
/// source IDs stay next to the parsing that reads them.
pub fn gpu_sensor(observations: &GpuObservations) -> GpuSensor {
    GpuSensor {
        provider: "msiAfterburner".into(),
        source_id: GPU_TEMPERATURE,
        gpu: observations.gpu,
        name: observations.name.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STRIDE: usize = 1324;
    const GPU_STRIDE: usize = 1304;

    struct Spec {
        gpu: u32,
        source: u32,
        value: f32,
        name: &'static str,
    }
    fn entry(gpu: u32, source: u32, value: f32, name: &'static str) -> Spec {
        Spec {
            gpu,
            source,
            value,
            name,
        }
    }
    fn cpu_package(value: f32) -> Spec {
        entry(u32::MAX, 0x80, value, "CPU temperature")
    }
    /// Published MAHM v2 layout: 32-byte header, 1324-byte entries, then the
    /// 1304-byte GPU descriptors.
    fn mahm(at_seconds: u32, entries: &[Spec], gpus: &[(&str, &str)]) -> Vec<u8> {
        let mut bytes = vec![0u8; 32 + entries.len() * STRIDE + gpus.len() * GPU_STRIDE];
        for (offset, value) in [
            (0, 0x4d41484du32),
            (4, 0x20000),
            (8, 32),
            (12, entries.len() as u32),
            (16, STRIDE as u32),
            (20, at_seconds),
            (24, gpus.len() as u32),
            (28, GPU_STRIDE as u32),
        ] {
            bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        for (index, spec) in entries.iter().enumerate() {
            let offset = 32 + index * STRIDE;
            bytes[offset..offset + spec.name.len()].copy_from_slice(spec.name.as_bytes());
            bytes[offset + 1300..offset + 1304].copy_from_slice(&spec.value.to_le_bytes());
            bytes[offset + 1316..offset + 1320].copy_from_slice(&spec.gpu.to_le_bytes());
            bytes[offset + 1320..offset + 1324].copy_from_slice(&spec.source.to_le_bytes());
        }
        for (index, (id, name)) in gpus.iter().enumerate() {
            let offset = 32 + entries.len() * STRIDE + index * GPU_STRIDE;
            bytes[offset..offset + id.len()].copy_from_slice(id.as_bytes());
            bytes[offset + 2 * NAME..offset + 2 * NAME + name.len()]
                .copy_from_slice(name.as_bytes());
        }
        bytes
    }
    fn nvidia() -> (&'static str, &'static str) {
        ("VEN_10DE&DEV_2489&SUBSYS_00000000", "GeForce RTX")
    }

    #[test]
    fn reads_the_cpu_package_sensor_and_never_mistakes_a_gpu_sensor() {
        let bytes = mahm(
            100,
            &[
                entry(0, GPU_TEMPERATURE, 70., "GPU temperature"),
                cpu_package(42.5),
            ],
            &[],
        );
        assert_eq!(package_temperature(&bytes, 102000.).unwrap().value, 42.5);
        assert!(gpu_observations(&bytes, 102000., 0x10de, 0x2489).is_err());
    }

    #[test]
    fn selects_the_gpu_sensors_by_pci_identity_rather_than_position() {
        let bytes = mahm(
            100,
            &[
                entry(0, GPU_TEMPERATURE, 99., "GPU temperature"),
                entry(1, GPU_TEMPERATURE, 55., "GPU temperature"),
            ],
            &[("VEN_1002&DEV_0000", "Decoy"), nvidia()],
        );
        let observations = gpu_observations(&bytes, 102000., 0x10de, 0x2489).unwrap();
        assert_eq!(observations.gpu, 1);
        assert_eq!(observations.name, "GeForce RTX");
        assert_eq!(observations.temperature.unwrap(), 55.);
        // Fan and power are absent, but each fails on its own.
        assert!(observations.fan_percent.is_err());
        assert!(observations.power_watts.is_err());
    }

    #[test]
    fn keeps_a_zero_fan_reading_and_reports_power_independently() {
        let bytes = mahm(
            100,
            &[
                entry(0, GPU_TEMPERATURE, 41., "GPU temperature"),
                entry(0, GPU_FAN_SPEED, 0., "Fan speed"),
                entry(0, GPU_ABS_POWER, 12.5, "GPU power"),
            ],
            &[nvidia()],
        );
        let observations = gpu_observations(&bytes, 102000., 0x10de, 0x2489).unwrap();
        assert_eq!(observations.temperature.unwrap(), 41.);
        assert_eq!(observations.fan_percent.unwrap(), 0.);
        assert_eq!(observations.power_watts.unwrap(), 12.5);
    }

    #[test]
    fn rejects_out_of_range_values_without_hiding_the_other_metrics() {
        let bytes = mahm(
            100,
            &[
                entry(0, GPU_TEMPERATURE, 1e6, "GPU temperature"),
                entry(0, GPU_ABS_POWER, 60., "GPU power"),
            ],
            &[nvidia()],
        );
        let observations = gpu_observations(&bytes, 102000., 0x10de, 0x2489).unwrap();
        assert!(observations.temperature.is_err());
        assert_eq!(observations.power_watts.unwrap(), 60.);
    }

    #[test]
    fn requires_identity_when_several_gpus_are_monitored() {
        let bytes = mahm(
            100,
            &[entry(0, GPU_TEMPERATURE, 40., "GPU temperature")],
            &[nvidia(), ("VEN_8086&DEV_1234", "Other")],
        );
        assert!(gpu_observations(&bytes, 102000., 0x8086, 0x9999).is_err());
        assert_eq!(
            gpu_observations(&bytes, 102000., 0x10de, 0x2489)
                .unwrap()
                .gpu,
            0
        );
    }

    #[test]
    fn accepts_a_single_gpu_without_an_identity_match() {
        let bytes = mahm(
            100,
            &[entry(0, GPU_TEMPERATURE, 40., "GPU temperature")],
            &[("", "")],
        );
        assert_eq!(
            gpu_observations(&bytes, 102000., 0x10de, 0x2489)
                .unwrap()
                .gpu,
            0
        );
    }

    #[test]
    fn rejects_malformed_stale_and_truncated_snapshots() {
        let valid = mahm(100, &[cpu_package(40.)], &[]);
        let mut malformed = valid.clone();
        malformed[16..20].copy_from_slice(&u32::MAX.to_le_bytes());
        let mut deallocated = valid.clone();
        deallocated[..4].copy_from_slice(&0xDEADu32.to_le_bytes());
        let mut unknown = valid.clone();
        unknown[4..8].copy_from_slice(&0x30000u32.to_le_bytes());
        for bytes in [
            vec![0; 4],
            malformed,
            deallocated,
            unknown,
            valid[..100].to_vec(),
        ] {
            assert!(package_temperature(&bytes, 102000.).is_err());
        }
        assert!(package_temperature(&mahm(1, &[cpu_package(40.)], &[]), 102000.).is_err());
        assert_eq!(package_temperature(&valid, 102000.).unwrap().value, 40.);
    }
}
