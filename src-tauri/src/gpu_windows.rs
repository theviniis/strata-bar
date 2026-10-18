//! Windows GPU source, owned exclusively by the shared metrics worker.
//! Usage and VRAM come from PDH and DXGI so no vendor library is required;
//! temperature, power and fan speed come from the Afterburner snapshot.
use crate::{
    gpu::{GpuReadings, GpuSource},
    gpu_contract::GpuAdapter,
};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};
use windows::{
    core::PCWSTR,
    Win32::{
        Graphics::Dxgi::{
            CreateDXGIFactory1, IDXGIAdapter1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE,
            DXGI_ERROR_NOT_FOUND,
        },
        System::{
            Performance::*,
            SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
        },
    },
};

/// `luid_HIGH_LOW` prefix of the PDH GPU counter instance names.
type Luid = (u32, u32);
/// One formatted read of the utilisation, dedicated and shared counters.
type Readings = (
    Result<f64, String>,
    Result<f64, String>,
    Result<f64, String>,
);

struct Selected {
    adapter: GpuAdapter,
    luid: Luid,
}

fn select() -> Result<Selected, String> {
    unsafe {
        let factory: IDXGIFactory1 =
            CreateDXGIFactory1().map_err(|e| format!("DXGI factory: {e}"))?;
        let mut best: Option<Selected> = None;
        for index in 0..64u32 {
            let adapter: IDXGIAdapter1 = match factory.EnumAdapters1(index) {
                Ok(adapter) => adapter,
                Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
                Err(error) => return Err(format!("DXGI adapter {index}: {error}")),
            };
            let desc = adapter
                .GetDesc1()
                .map_err(|e| format!("DXGI descriptor {index}: {e}"))?;
            if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
                continue;
            }
            let dedicated_bytes = desc.DedicatedVideoMemory as f64;
            // Virtual display drivers report no dedicated video memory, so the
            // busiest real adapter wins without naming a vendor.
            if best
                .as_ref()
                .is_some_and(|current| current.adapter.dedicated_bytes >= dedicated_bytes)
            {
                continue;
            }
            best = Some(Selected {
                luid: (desc.AdapterLuid.HighPart as u32, desc.AdapterLuid.LowPart),
                adapter: GpuAdapter {
                    name: String::from_utf16_lossy(&desc.Description)
                        .trim_end_matches('\0')
                        .trim()
                        .to_string(),
                    vendor_id: desc.VendorId,
                    device_id: desc.DeviceId,
                    dedicated_bytes,
                },
            });
        }
        best.ok_or_else(|| "No GPU adapter available".into())
    }
}

/// WDDM caps shared GPU memory at half of the installed physical RAM; this is
/// the limit Task Manager reports next to the shared GPU memory usage.
fn shared_limit() -> Result<f64, String> {
    unsafe {
        let mut info = MEMORYSTATUSEX {
            dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
            ..Default::default()
        };
        GlobalMemoryStatusEx(&mut info).map_err(|e| e.to_string())?;
        if info.ullTotalPhys == 0 {
            return Err("Invalid physical memory total".into());
        }
        Ok(info.ullTotalPhys as f64 / 2.)
    }
}

fn add(handle: PDH_HQUERY, path: &str) -> Result<PDH_HCOUNTER, String> {
    let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    let mut counter = PDH_HCOUNTER::default();
    let status = unsafe { PdhAddEnglishCounterW(handle, PCWSTR(wide.as_ptr()), 0, &mut counter) };
    if status == 0 {
        Ok(counter)
    } else {
        Err(format!("GPU PDH {path}: {status:#x}"))
    }
}

/// Wildcard instances change between samples, so each read asks for the whole
/// array instead of caching per-instance counters. PDH writes both the item
/// array and the instance-name strings it points at into one buffer, so the
/// buffer is `size` bytes rather than `count * size_of::<item>()`, and every
/// item is copied out before that buffer is released.
fn array(counter: PDH_HCOUNTER, format: PDH_FMT) -> Result<Vec<(String, u32, f64)>, String> {
    let mut size = 0u32;
    let mut count = 0u32;
    let status =
        unsafe { PdhGetFormattedCounterArrayW(counter, format, &mut size, &mut count, None) };
    if count == 0 || size == 0 {
        return if status == 0 || status == PDH_MORE_DATA {
            Ok(Vec::new())
        } else {
            Err(format!("GPU PDH array: {status:#x}"))
        };
    }
    if status != 0 && status != PDH_MORE_DATA {
        return Err(format!("GPU PDH array: {status:#x}"));
    }
    // Native structures require pointer alignment, unlike a byte Vec.
    let mut storage = vec![0u64; (size as usize).div_ceil(8)];
    let mut count = 0u32;
    let status = unsafe {
        PdhGetFormattedCounterArrayW(
            counter,
            format,
            &mut size,
            &mut count,
            Some(storage.as_mut_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>()),
        )
    };
    if status != 0 {
        return Err(format!("GPU PDH array: {status:#x}"));
    }
    let items = unsafe {
        std::slice::from_raw_parts(
            storage.as_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>(),
            count as usize,
        )
    };
    let mut owned = Vec::with_capacity(items.len());
    for item in items {
        let Ok(name) = (unsafe { item.szName.to_string() }) else {
            continue;
        };
        // Read only the member PDH filled for this format.
        let value = if format.0 & PDH_FMT_LARGE.0 != 0 {
            unsafe { item.FmtValue.Anonymous.largeValue as f64 }
        } else {
            unsafe { item.FmtValue.Anonymous.doubleValue }
        };
        owned.push((name, item.FmtValue.CStatus, value));
    }
    Ok(owned)
}

/// `luid_0xHIGH_0xLOW_phys_N` instance prefix.
fn instance_luid(name: &str) -> Option<Luid> {
    let rest = name.get(name.find("luid_")? + "luid_".len()..)?;
    let mut parts = rest.split('_');
    let high = u32::from_str_radix(parts.next()?.strip_prefix("0x")?, 16).ok()?;
    let low = u32::from_str_radix(parts.next()?.strip_prefix("0x")?, 16).ok()?;
    Some((high, low))
}
fn matches(instance: Luid, luid: Luid) -> bool {
    instance == luid || instance == (luid.1, luid.0)
}
fn engine_instance(name: &str) -> Option<(Luid, String)> {
    let luid = instance_luid(name)?;
    let engine = name.rsplit_once("engtype_")?.1;
    (!engine.is_empty()).then(|| (luid, engine.to_string()))
}

/// The adapter's utilisation, aggregated the way Task Manager reports it: sum
/// every process per engine type, then take the busiest engine.
fn engines(counter: &Result<PDH_HCOUNTER, String>, luid: Luid) -> Result<f64, String> {
    let counter = counter.as_ref().map_err(Clone::clone)?;
    let items = array(*counter, PDH_FMT(PDH_FMT_DOUBLE.0 | 0x8000))?;
    // An adapter with no engine instance at all is simply idle.
    if items.is_empty() {
        return Ok(0.);
    }
    let mut by_engine: BTreeMap<String, f64> = Default::default();
    let mut matched = false;
    for (name, status, value) in items {
        if status > 1 {
            continue;
        }
        let Some((instance, engine)) = engine_instance(&name) else {
            continue;
        };
        if !matches(instance, luid) || !value.is_finite() || value < 0. {
            continue;
        }
        matched = true;
        *by_engine.entry(engine).or_default() += value;
    }
    // Instances exist but none belongs to the selected adapter: never report
    // another GPU's utilisation as this one's.
    if !matched {
        return Err("GPU engine counters unavailable for the selected adapter".into());
    }
    Ok(by_engine
        .values()
        .copied()
        .fold(0., f64::max)
        .clamp(0., 100.))
}

fn bytes(counter: &Result<PDH_HCOUNTER, String>, luid: Luid) -> Result<f64, String> {
    let counter = counter.as_ref().map_err(Clone::clone)?;
    for (name, status, value) in array(*counter, PDH_FMT_LARGE)? {
        let Some(instance) = instance_luid(&name) else {
            continue;
        };
        if !matches(instance, luid) {
            continue;
        }
        if status > 1 {
            return Err(format!("GPU PDH memory: {status:#x}"));
        }
        if value < 0. {
            return Err("Negative GPU memory counter".into());
        }
        return Ok(value);
    }
    Err("GPU adapter memory instance unavailable".into())
}

struct Query {
    handle: PDH_HQUERY,
    engine: Result<PDH_HCOUNTER, String>,
    dedicated: Result<PDH_HCOUNTER, String>,
    shared: Result<PDH_HCOUNTER, String>,
}
impl Drop for Query {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.handle);
        }
    }
}
impl Query {
    fn open() -> Result<Self, String> {
        let mut handle = PDH_HQUERY::default();
        let status = unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut handle) };
        if status != 0 {
            return Err(format!("GPU PDH open: {status:#x}"));
        }
        Ok(Self {
            handle,
            engine: add(handle, r"\GPU Engine(*)\Utilization Percentage"),
            dedicated: add(handle, r"\GPU Adapter Memory(*)\Dedicated Usage"),
            shared: add(handle, r"\GPU Adapter Memory(*)\Shared Usage"),
        })
    }
    fn retry_failed(&mut self) {
        for (counter, path) in [
            (&mut self.engine, r"\GPU Engine(*)\Utilization Percentage"),
            (
                &mut self.dedicated,
                r"\GPU Adapter Memory(*)\Dedicated Usage",
            ),
            (&mut self.shared, r"\GPU Adapter Memory(*)\Shared Usage"),
        ] {
            if counter.is_ok() {
                continue;
            }
            *counter = add(self.handle, path);
        }
    }
    fn read(&self, luid: Luid) -> Result<Readings, String> {
        let status = unsafe { PdhCollectQueryData(self.handle) };
        if status != 0 {
            return Err(format!("GPU PDH collect: {status:#x}"));
        }
        Ok((
            engines(&self.engine, luid),
            bytes(&self.dedicated, luid),
            bytes(&self.shared, luid),
        ))
    }
}

pub struct WindowsGpuSource {
    query: Option<Query>,
    selected: Result<Selected, String>,
    last: Option<Instant>,
    refreshed: Option<Instant>,
}
impl Default for WindowsGpuSource {
    fn default() -> Self {
        Self {
            query: None,
            selected: Err("GPU adapter unavailable".into()),
            last: None,
            refreshed: None,
        }
    }
}
impl WindowsGpuSource {
    fn counters(&mut self, luid: Luid, retry: bool) -> Result<Readings, String> {
        if self.query.is_none() {
            self.query = Some(Query::open()?);
        }
        let query = self.query.as_mut().unwrap();
        if retry {
            query.retry_failed();
        }
        let result = query.read(luid);
        // A failed collection invalidates every counter in the query.
        if result.is_err() {
            self.query = None;
        }
        result
    }
}
impl GpuSource for WindowsGpuSource {
    fn read(&mut self) -> GpuReadings {
        let instant = Instant::now();
        let resumed = self
            .last
            .is_none_or(|at| instant.duration_since(at) > Duration::from_secs(4));
        let retry = self
            .refreshed
            .is_none_or(|at| instant.duration_since(at) > Duration::from_secs(60));
        if retry {
            self.refreshed = Some(instant);
        }
        if resumed {
            self.query = None;
        }
        if resumed || retry {
            let found = select();
            // Keep the adapter we already resolved unless a resume may have
            // changed the hardware underneath us.
            if found.is_ok() || resumed {
                self.selected = found;
            }
        }
        self.last = Some(instant);
        let adapter = self
            .selected
            .as_ref()
            .map(|selected| selected.adapter.clone())
            .map_err(Clone::clone);
        let counters = match self.selected.as_ref().ok().map(|selected| selected.luid) {
            Some(luid) => self.counters(luid, retry),
            None => Err(self
                .selected
                .as_ref()
                .err()
                .cloned()
                .unwrap_or_else(|| "GPU adapter unavailable".into())),
        };
        let (percent, dedicated, shared) =
            counters.unwrap_or_else(|error| (Err(error.clone()), Err(error.clone()), Err(error)));
        let memory_total = adapter
            .as_ref()
            .ok()
            .map(|adapter| adapter.dedicated_bytes)
            .ok_or_else(|| "GPU dedicated memory limit unavailable".to_string());
        GpuReadings {
            timestamp: crate::metrics::timestamp() as f64,
            instant,
            adapter,
            percent,
            memory_used: dedicated,
            memory_total,
            shared_used: shared,
            shared_total: shared_limit(),
            afterburner: crate::mahm_windows::snapshot(),
        }
    }
}
