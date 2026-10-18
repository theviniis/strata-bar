//! Shared physical-memory collector. No COM, shell, elevation or per-window workers.
use crate::memory_contract::{MemoryData, MemoryMetric, MemoryMetricStatus as Status, MemoryPoint};
use std::{collections::VecDeque, ffi::c_void, time::Instant};
use windows::{
    core::{BOOL, PCWSTR},
    Win32::System::{
        Performance::*,
        ProcessStatus::{EnumPageFilesW, ENUM_PAGE_FILE_INFORMATION},
        SystemInformation::{GetSystemInfo, GlobalMemoryStatusEx, MEMORYSTATUSEX, SYSTEM_INFO},
    },
};

const PATHS: [&str; 4] = [
    r"\Memory\Modified Page List Bytes",
    r"\Memory\Standby Cache Core Bytes",
    r"\Memory\Standby Cache Normal Priority Bytes",
    r"\Memory\Standby Cache Reserve Bytes",
];

struct Counters {
    query: PDH_HQUERY,
    counters: [Option<PDH_HCOUNTER>; 4],
}
impl Drop for Counters {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.query);
        }
    }
}
impl Counters {
    fn open() -> Result<Self, String> {
        let mut query = PDH_HQUERY::default();
        let code = unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut query) };
        if code != 0 {
            return Err(format!("PDH open: {code:#x}"));
        }
        Ok(Self {
            query,
            counters: [None; 4],
        })
    }
    fn read(&mut self) -> [Result<f64, String>; 4] {
        let mut errors: [Option<String>; 4] = Default::default();
        for (index, path) in PATHS.iter().enumerate() {
            if self.counters[index].is_none() {
                let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
                let mut counter = PDH_HCOUNTER::default();
                let code = unsafe {
                    PdhAddEnglishCounterW(self.query, PCWSTR(wide.as_ptr()), 0, &mut counter)
                };
                if code == 0 {
                    self.counters[index] = Some(counter);
                } else {
                    errors[index] = Some(format!("PDH {path}: {code:#x}"));
                }
            }
        }
        let collected = unsafe { PdhCollectQueryData(self.query) };
        std::array::from_fn(|index| {
            if collected != 0 {
                return Err(format!("PDH collect: {collected:#x}"));
            }
            let counter = self.counters[index].ok_or_else(|| {
                errors[index]
                    .clone()
                    .unwrap_or_else(|| "Counter unavailable".into())
            })?;
            let mut value = PDH_FMT_COUNTERVALUE::default();
            let code =
                unsafe { PdhGetFormattedCounterValue(counter, PDH_FMT_LARGE, None, &mut value) };
            if code != 0 || value.CStatus > 1 {
                return Err(format!(
                    "PDH {}: {code:#x}/{:#x}",
                    PATHS[index], value.CStatus
                ));
            }
            let bytes = unsafe { value.Anonymous.largeValue };
            if bytes < 0 {
                return Err("Negative memory counter".into());
            }
            Ok(bytes as f64)
        })
    }
}

#[derive(Default)]
struct PagingFiles {
    pages: u64,
    count: usize,
    overflow: bool,
}
unsafe extern "system" fn pagefile(
    context: *mut c_void,
    info: *mut ENUM_PAGE_FILE_INFORMATION,
    _: PCWSTR,
) -> BOOL {
    let sum = &mut *(context as *mut PagingFiles);
    let info = &*info;
    if let Some(pages) = sum.pages.checked_add(info.TotalInUse as u64) {
        sum.pages = pages;
    } else {
        sum.overflow = true;
    }
    sum.count += 1;
    BOOL(1)
}
fn paging_files() -> Result<Option<f64>, String> {
    unsafe {
        let mut info = SYSTEM_INFO::default();
        GetSystemInfo(&mut info);
        if info.dwPageSize == 0 {
            return Err("Invalid system page size".into());
        }
        let mut sum = PagingFiles::default();
        EnumPageFilesW(Some(pagefile), &mut sum as *mut _ as *mut c_void)
            .map_err(|e| e.to_string())?;
        let bytes = sum
            .pages
            .checked_mul(info.dwPageSize as u64)
            .filter(|_| !sum.overflow)
            .ok_or("Pagefile usage overflow")?;
        Ok((sum.count > 0).then_some(bytes as f64))
    }
}

fn metric(result: Result<f64, String>, old: Option<&MemoryMetric>, at: f64) -> MemoryMetric {
    match result {
        Ok(value) => MemoryMetric {
            status: Status::Ready,
            value: Some(value),
            updated_at: Some(at),
            error: None,
        },
        Err(error) => MemoryMetric {
            status: if old.and_then(|v| v.value).is_some() {
                Status::Error
            } else {
                Status::Unavailable
            },
            value: old.and_then(|v| v.value),
            updated_at: old.and_then(|v| v.updated_at),
            error: Some(error),
        },
    }
}

#[derive(Default)]
pub struct MemoryCollector {
    counters: Option<Counters>,
    last: Option<MemoryData>,
    history: VecDeque<(Instant, MemoryPoint)>,
    sequence: u32,
}
impl MemoryCollector {
    pub fn collect(&mut self) -> MemoryData {
        let at = crate::metrics::timestamp() as f64;
        let instant = Instant::now();
        let physical = unsafe {
            let mut info = MEMORYSTATUSEX {
                dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
                ..Default::default()
            };
            GlobalMemoryStatusEx(&mut info)
                .map_err(|e| e.to_string())
                .and_then(|_| {
                    if info.ullTotalPhys == 0 || info.ullAvailPhys > info.ullTotalPhys {
                        Err("Invalid physical memory bounds".into())
                    } else {
                        Ok((info.ullTotalPhys as f64, info.ullAvailPhys as f64))
                    }
                })
        };
        let counters = (|| {
            if self.counters.is_none() {
                self.counters = Some(Counters::open()?);
            }
            Ok::<_, String>(self.counters.as_mut().unwrap().read())
        })();
        let lists = counters.unwrap_or_else(|error| std::array::from_fn(|_| Err(error.clone())));
        // Reopen failed queries on the next sample; never make a failure permanent.
        if lists.iter().any(Result::is_err) {
            self.counters = None;
        }
        let modified = lists[0].clone();
        let cached = lists
            .iter()
            .try_fold(0., |sum, value| value.clone().map(|value| sum + value));
        let used = physical.clone().and_then(|(total, available)| {
            modified.and_then(|modified| {
                let used = total - available - modified;
                if used >= 0. {
                    Ok(used)
                } else {
                    Err("Inconsistent physical memory observations".into())
                }
            })
        });
        let percent = used
            .clone()
            .and_then(|used| physical.clone().map(|(total, _)| 100. * used / total));
        self.sequence = self.sequence.wrapping_add(1);
        if self
            .history
            .back()
            .is_some_and(|(_, point)| point.timestamp >= at)
        {
            self.history.clear();
        }
        self.history.push_back((
            instant,
            MemoryPoint {
                sequence: self.sequence,
                timestamp: at,
                percent: percent.clone().ok(),
            },
        ));
        while self
            .history
            .front()
            .is_some_and(|(time, _)| instant.duration_since(*time).as_millis() > 60_000)
            || self.history.len() > 31
        {
            self.history.pop_front();
        }
        let old = self.last.as_ref();
        let paging = match paging_files() {
            Ok(None) => MemoryMetric {
                status: Status::NotConfigured,
                value: None,
                updated_at: Some(at),
                error: None,
            },
            result => metric(
                result.map(|value| value.unwrap()),
                old.map(|v| &v.paging_file_bytes),
                at,
            ),
        };
        let data = MemoryData {
            sequence: self.sequence,
            sampled_at: at,
            total_bytes: metric(
                physical.clone().map(|v| v.0),
                old.map(|v| &v.total_bytes),
                at,
            ),
            available_bytes: metric(physical.map(|v| v.1), old.map(|v| &v.available_bytes), at),
            used_bytes: metric(used, old.map(|v| &v.used_bytes), at),
            cached_bytes: metric(cached, old.map(|v| &v.cached_bytes), at),
            paging_file_bytes: paging,
            percent: metric(percent, old.map(|v| &v.percent), at),
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
