//! Windows sources, owned exclusively by the shared metrics worker.
use crate::cpu::{CpuReadings, CpuSource, CpuTopology};
use std::{
    mem::{offset_of, size_of},
    time::{Duration, Instant},
};
use windows::{
    core::{w, BSTR, PCWSTR},
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::{Com::*, Memory::*, Performance::*, SystemInformation::*, Variant::*, Wmi::*},
    },
};

fn topology() -> Result<CpuTopology, String> {
    unsafe {
        let mut length = 0;
        let _ = GetLogicalProcessorInformationEx(RelationProcessorCore, None, &mut length);
        if length == 0 || length > 16 * 1024 * 1024 {
            return Err("CPU topology size unavailable".into());
        }
        // Native structures require pointer alignment, unlike a byte Vec.
        let mut storage = vec![0u64; (length as usize).div_ceil(8)];
        GetLogicalProcessorInformationEx(
            RelationProcessorCore,
            Some(storage.as_mut_ptr().cast()),
            &mut length,
        )
        .map_err(|e| e.to_string())?;
        let mut offset = 0;
        let mut processors = Vec::new();
        let mut cores = 0;
        while offset + 8 <= length as usize {
            let ptr = storage.as_ptr().cast::<u8>().add(offset);
            let record_size = std::ptr::read_unaligned(ptr.add(4).cast::<u32>()) as usize;
            let masks = 8 + offset_of!(PROCESSOR_RELATIONSHIP, GroupMask);
            if record_size < masks || offset + record_size > length as usize {
                return Err("Invalid CPU topology record".into());
            }
            let groups = std::ptr::read_unaligned(
                ptr.add(8 + offset_of!(PROCESSOR_RELATIONSHIP, GroupCount))
                    .cast::<u16>(),
            ) as usize;
            if masks + groups * size_of::<GROUP_AFFINITY>() > record_size {
                return Err("Invalid CPU group masks".into());
            }
            cores += 1;
            for group in 0..groups {
                let affinity = std::ptr::read_unaligned(
                    ptr.add(masks + group * size_of::<GROUP_AFFINITY>())
                        .cast::<GROUP_AFFINITY>(),
                );
                for bit in 0..usize::BITS {
                    if affinity.Mask & (1usize << bit) != 0 {
                        processors.push((affinity.Group, bit as u8));
                    }
                }
            }
            offset += record_size;
        }
        if offset != length as usize || cores == 0 {
            return Err("Incomplete CPU topology".into());
        }
        processors.sort_unstable();
        Ok(CpuTopology {
            physical_cores: cores,
            processors,
        })
    }
}

fn nominal_frequency() -> Result<f64, String> {
    let query = || -> windows::core::Result<f64> {
        unsafe {
            let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER)?;
            let empty = BSTR::new();
            let services = locator.ConnectServer(
                &BSTR::from("ROOT\\CIMV2"),
                &empty,
                &empty,
                &empty,
                0,
                &empty,
                None,
            )?;
            CoSetProxyBlanket(
                &services,
                10,
                0,
                None,
                RPC_C_AUTHN_LEVEL_CALL,
                RPC_C_IMP_LEVEL_IMPERSONATE,
                None,
                EOAC_NONE,
            )?;
            let objects = services.ExecQuery(
                &BSTR::from("WQL"),
                &BSTR::from("SELECT MaxClockSpeed FROM Win32_Processor"),
                WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                None,
            )?;
            let mut maximum = 0;
            loop {
                let mut object = [None];
                let mut returned = 0;
                let result = objects.Next(2000, &mut object, &mut returned);
                result.ok()?;
                if returned == 0 {
                    if result.0 == WBEM_S_TIMEDOUT.0 {
                        return Err(windows::core::Error::from_hresult(result));
                    }
                    break;
                }
                let mut value = VARIANT::default();
                let result =
                    object[0]
                        .as_ref()
                        .unwrap()
                        .Get(w!("MaxClockSpeed"), 0, &mut value, None, None);
                let speed = result.and_then(|_| VariantToUInt32(&value));
                let _ = VariantClear(&mut value);
                maximum = maximum.max(speed?);
            }
            Ok(maximum as f64 * 1_000_000.)
        }
    };
    query().map_err(|e| format!("CPU nominal frequency: {e}"))
}

struct Query {
    handle: PDH_HQUERY,
    usage: Result<PDH_HCOUNTER, String>,
    frequencies: Vec<(u16, u8, Result<PDH_HCOUNTER, String>)>,
    usage_failed: bool,
    frequency_failures: Vec<bool>,
}
impl Drop for Query {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.handle);
        }
    }
}
impl Query {
    fn open(processors: &[(u16, u8)]) -> Result<Self, String> {
        let mut handle = PDH_HQUERY::default();
        let status = unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut handle) };
        if status != 0 {
            return Err(format!("CPU PDH open: {status:#x}"));
        }
        let add = |path: String| {
            let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
            let mut counter = PDH_HCOUNTER::default();
            let status =
                unsafe { PdhAddEnglishCounterW(handle, PCWSTR(wide.as_ptr()), 0, &mut counter) };
            if status == 0 {
                Ok(counter)
            } else {
                Err(format!("CPU PDH {path}: {status:#x}"))
            }
        };
        Ok(Self {
            handle,
            usage: add(r"\Processor Information(_Total)\% Processor Time".into()),
            frequencies: processors
                .iter()
                .map(|(g, p)| {
                    (
                        *g,
                        *p,
                        add(format!(r"\Processor Information({g},{p})\Actual Frequency")),
                    )
                })
                .collect(),
            usage_failed: false,
            frequency_failures: vec![false; processors.len()],
        })
    }
    fn retry_failed(&mut self) {
        let replace = |counter: &mut Result<PDH_HCOUNTER, String>, path: String| {
            if let Ok(handle) = counter {
                unsafe {
                    PdhRemoveCounter(*handle);
                }
            }
            let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
            let mut handle = PDH_HCOUNTER::default();
            let status = unsafe {
                PdhAddEnglishCounterW(self.handle, PCWSTR(wide.as_ptr()), 0, &mut handle)
            };
            *counter = if status == 0 {
                Ok(handle)
            } else {
                Err(format!("CPU PDH retry {path}: {status:#x}"))
            };
        };
        if self.usage_failed {
            replace(
                &mut self.usage,
                r"\Processor Information(_Total)\% Processor Time".into(),
            );
        }
        for (index, (group, processor, counter)) in self.frequencies.iter_mut().enumerate() {
            if self.frequency_failures[index] {
                replace(
                    counter,
                    format!(r"\Processor Information({group},{processor})\Actual Frequency"),
                );
            }
        }
    }
    fn value(counter: &Result<PDH_HCOUNTER, String>) -> Result<f64, String> {
        let counter = counter.as_ref().map_err(Clone::clone)?;
        let mut value = PDH_FMT_COUNTERVALUE::default();
        // PDH_FMT_NOCAP100 is absent from this windows crate's generated constants.
        let status = unsafe {
            PdhGetFormattedCounterValue(
                *counter,
                PDH_FMT(PDH_FMT_DOUBLE.0 | 0x8000),
                None,
                &mut value,
            )
        };
        if status != 0 || value.CStatus > 1 {
            return Err(format!("CPU PDH reading: {status:#x}/{:#x}", value.CStatus));
        }
        Ok(unsafe { value.Anonymous.doubleValue })
    }
}

struct Mapping {
    handle: HANDLE,
    view: MEMORY_MAPPED_VIEW_ADDRESS,
}
impl Drop for Mapping {
    fn drop(&mut self) {
        unsafe {
            let _ = UnmapViewOfFile(self.view);
            let _ = CloseHandle(self.handle);
        }
    }
}
fn afterburner() -> Result<Vec<u8>, String> {
    unsafe {
        let handle = OpenFileMappingW(FILE_MAP_READ.0, false, w!("MAHMSharedMemory"))
            .map_err(|e| format!("Afterburner not available: {e}"))?;
        let mapping = Mapping {
            handle,
            view: MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0),
        };
        if mapping.view.Value.is_null() {
            return Err("Cannot map Afterburner observations".into());
        }
        let mut info = MEMORY_BASIC_INFORMATION::default();
        if VirtualQuery(
            Some(mapping.view.Value),
            &mut info,
            size_of::<MEMORY_BASIC_INFORMATION>(),
        ) == 0
            || info.RegionSize < 32
        {
            return Err("Cannot inspect Afterburner mapping".into());
        }
        let ptr = mapping.view.Value.cast::<u8>();
        let copy = |length| {
            (0..length)
                .map(|i| std::ptr::read_volatile(ptr.add(i)))
                .collect::<Vec<u8>>()
        };
        for _ in 0..2 {
            let header = copy(32);
            let size = crate::afterburner::snapshot_size(&header)?;
            if size > info.RegionSize {
                return Err("Afterburner mapping is truncated".into());
            }
            let bytes = copy(size);
            if bytes[..32] == header && copy(32) == header {
                return Ok(bytes);
            }
        }
        Err("Afterburner changed while reading".into())
    }
}

#[derive(Default)]
pub struct WindowsCpuSource {
    query: Option<Query>,
    processors: Vec<(u16, u8)>,
    last: Option<Instant>,
    refreshed: Option<Instant>,
    nominal: Option<Result<f64, String>>,
}
impl CpuSource for WindowsCpuSource {
    fn read(&mut self) -> CpuReadings {
        let instant = Instant::now();
        let topology = topology();
        let resumed = self
            .last
            .is_none_or(|at| instant.duration_since(at) > Duration::from_secs(4));
        let changed = topology
            .as_ref()
            .is_ok_and(|t| t.processors != self.processors);
        let retry = self
            .refreshed
            .is_none_or(|at| instant.duration_since(at) > Duration::from_secs(60));
        if resumed || changed {
            self.query = None;
        }
        if resumed || changed || (retry && self.nominal.as_ref().is_none_or(Result::is_err)) {
            self.nominal = Some(nominal_frequency());
        }
        if retry {
            if let Some(query) = self.query.as_mut() {
                query.retry_failed();
            }
            self.refreshed = Some(instant);
        }
        self.last = Some(instant);
        let counters = (|| {
            if self.query.is_none() {
                let processors = topology
                    .as_ref()
                    .map(|t| t.processors.clone())
                    .unwrap_or_default();
                self.query = Some(Query::open(&processors)?);
                self.processors = processors;
            }
            let query = self.query.as_mut().unwrap();
            let status = unsafe { PdhCollectQueryData(query.handle) };
            if status != 0 {
                self.query = None;
                return Err(format!("CPU PDH collect: {status:#x}"));
            }
            let percent = Query::value(&query.usage);
            query.usage_failed = percent.is_err();
            let frequencies = query
                .frequencies
                .iter()
                .enumerate()
                .map(|(index, (g, p, c))| {
                    let value = Query::value(c);
                    query.frequency_failures[index] = value.is_err();
                    value.map(|v| (*g, *p, v * 1_000_000.))
                })
                .collect::<Vec<_>>()
                .into_iter()
                .collect::<Result<Vec<_>, String>>();
            Ok((percent, frequencies))
        })();
        let (percent, frequencies) = counters.unwrap_or_else(|e| (Err(e.clone()), Err(e)));
        CpuReadings {
            timestamp: crate::metrics::timestamp() as f64,
            instant,
            percent,
            frequencies,
            topology,
            max_frequency_hz: self
                .nominal
                .clone()
                .unwrap_or_else(|| Err("Nominal frequency unavailable".into())),
            afterburner: afterburner(),
        }
    }
}
