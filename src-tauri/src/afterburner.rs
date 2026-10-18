//! Read-only MAHM v2 hardware-monitoring protocol; never the control interface.
use crate::cpu_contract::CpuTemperatureSensor;

pub const MAX_SNAPSHOT: usize = 16 * 1024 * 1024;
pub struct Temperature {
    pub value: f64,
    pub updated_at: f64,
    pub sensor: CpuTemperatureSensor,
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
pub fn package_temperature(bytes: &[u8], now: f64) -> Result<Temperature, String> {
    let size = snapshot_size(bytes)?;
    if bytes.len() < size {
        return Err("Truncated Afterburner snapshot".into());
    }
    let updated_at = word(bytes, 20)? as f64 * 1000.;
    if updated_at <= 0. || updated_at > now || now - updated_at > 6000. {
        return Err("Afterburner observations are stale".into());
    }
    let header = word(bytes, 8)? as usize;
    let stride = word(bytes, 16)? as usize;
    let mut selected = None;
    for index in 0..word(bytes, 12)? as usize {
        let offset = header + index * stride;
        if word(bytes, offset + 1320)? != 0x80 || word(bytes, offset + 1316)? != u32::MAX {
            continue;
        }
        if selected.is_some() {
            return Err("Ambiguous Afterburner CPU package sensors".into());
        }
        let value = f32::from_bits(word(bytes, offset + 1300)?) as f64;
        if !value.is_finite() || !(0.0..=200.).contains(&value) {
            return Err("Invalid Afterburner temperature".into());
        }
        let raw = &bytes[offset..offset + 260];
        let end = raw
            .iter()
            .position(|b| *b == 0)
            .ok_or("Unterminated sensor name")?;
        let name = String::from_utf8_lossy(&raw[..end]).into_owned();
        selected = Some(Temperature {
            value,
            updated_at,
            sensor: CpuTemperatureSensor {
                provider: "msiAfterburner".into(),
                source_id: 0x80,
                instance: u32::MAX,
                name,
            },
        });
    }
    selected.ok_or_else(|| {
        "Afterburner CPU package sensor unavailable; enable CPU temperature monitoring".into()
    })
}
