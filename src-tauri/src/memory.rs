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
    fn read(&mut self) -> [Result<u64, String>; 4] {
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
            Ok(bytes as u64)
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
#[derive(Clone)]
pub struct PagingFileUsage {
    pub pages: u64,
    pub page_size: u32,
}

fn paging_files() -> Result<Option<PagingFileUsage>, String> {
    unsafe {
        let mut info = SYSTEM_INFO::default();
        GetSystemInfo(&mut info);
        if info.dwPageSize == 0 {
            return Err("Invalid system page size".into());
        }
        let mut sum = PagingFiles::default();
        EnumPageFilesW(Some(pagefile), &mut sum as *mut _ as *mut c_void)
            .map_err(|e| e.to_string())?;
        if sum.overflow {
            return Err("Pagefile usage overflow".into());
        }
        Ok((sum.count > 0).then_some(PagingFileUsage {
            pages: sum.pages,
            page_size: info.dwPageSize,
        }))
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

pub struct MemoryReadings {
    pub timestamp: f64,
    pub instant: Instant,
    pub physical: Result<(u64, u64), String>,
    pub lists: [Result<u64, String>; 4],
    pub paging_files: Result<Option<PagingFileUsage>, String>,
}
pub trait MemorySource {
    fn read(&mut self) -> MemoryReadings;
}

#[derive(Default)]
pub struct WindowsMemorySource {
    counters: Option<Counters>,
}
impl MemorySource for WindowsMemorySource {
    fn read(&mut self) -> MemoryReadings {
        let timestamp = crate::metrics::timestamp() as f64;
        let instant = Instant::now();
        let physical = unsafe {
            let mut info = MEMORYSTATUSEX {
                dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
                ..Default::default()
            };
            GlobalMemoryStatusEx(&mut info)
                .map_err(|e| e.to_string())
                .map(|_| (info.ullTotalPhys, info.ullAvailPhys))
        };
        let counters = (|| {
            if self.counters.is_none() {
                self.counters = Some(Counters::open()?);
            }
            Ok::<_, String>(self.counters.as_mut().unwrap().read())
        })();
        let lists = counters.unwrap_or_else(|error| std::array::from_fn(|_| Err(error.clone())));
        if lists.iter().any(Result::is_err) {
            self.counters = None;
        }
        MemoryReadings {
            timestamp,
            instant,
            physical,
            lists,
            paging_files: paging_files(),
        }
    }
}

pub struct MemoryCollector<S = WindowsMemorySource> {
    source: S,
    last: Option<MemoryData>,
    history: VecDeque<(Instant, MemoryPoint)>,
    sequence: u32,
}
impl Default for MemoryCollector {
    fn default() -> Self {
        Self::new(WindowsMemorySource::default())
    }
}
impl<S: MemorySource> MemoryCollector<S> {
    pub fn new(source: S) -> Self {
        Self {
            source,
            last: None,
            history: VecDeque::new(),
            sequence: 0,
        }
    }
    pub fn collect(&mut self) -> MemoryData {
        let raw = self.source.read();
        let at = raw.timestamp;
        let instant = raw.instant;
        let physical = raw.physical.and_then(|(total, available)| {
            if total == 0 || available > total {
                Err("Invalid physical memory bounds".into())
            } else {
                Ok((total as f64, available as f64))
            }
        });
        let lists = raw.lists.map(|value| value.map(|bytes| bytes as f64));
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
        let paging = match raw.paging_files {
            Ok(None) => MemoryMetric {
                status: Status::NotConfigured,
                value: None,
                updated_at: Some(at),
                error: None,
            },
            result => metric(
                result.and_then(|value| {
                    let value = value.expect("No-pagefile state handled separately");
                    value
                        .pages
                        .checked_mul(value.page_size as u64)
                        .filter(|_| value.page_size > 0)
                        .map(|bytes| bytes as f64)
                        .ok_or_else(|| "Invalid pagefile size or usage overflow".into())
                }),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    impl MemorySource for VecDeque<MemoryReadings> {
        fn read(&mut self) -> MemoryReadings {
            self.pop_front().expect("Scripted Windows observation")
        }
    }

    fn reading(base: Instant, elapsed: u64) -> MemoryReadings {
        MemoryReadings {
            timestamp: 100000. + elapsed as f64,
            instant: base + Duration::from_millis(elapsed),
            physical: Ok((16384, 6144)),
            lists: [Ok(1024), Ok(2048), Ok(1024), Ok(0)],
            paging_files: Ok(Some(PagingFileUsage {
                pages: 3,
                page_size: 4096,
            })),
        }
    }

    #[test]
    fn composes_physical_cache_and_actual_paging_usage() {
        let mut collector = MemoryCollector::new(VecDeque::from([reading(Instant::now(), 0)]));
        let data = collector.collect();
        assert_eq!(data.used_bytes.value, Some(9216.));
        assert_eq!(data.cached_bytes.value, Some(4096.));
        assert_eq!(data.paging_file_bytes.value, Some(12288.));
        assert_eq!(data.percent.value, Some(56.25));
    }

    #[test]
    fn failed_modified_reading_preserves_independent_metrics_and_recovers() {
        let base = Instant::now();
        let mut failed = reading(base, 2000);
        failed.lists[0] = Err("Counter offline".into());
        let mut recovered = reading(base, 4000);
        recovered.physical = Ok((8192, 1024));
        recovered.lists[0] = Ok(512);
        let mut collector =
            MemoryCollector::new(VecDeque::from([reading(base, 0), failed, recovered]));
        collector.collect();
        let stale = collector.collect();
        assert_eq!(stale.total_bytes.status, Status::Ready);
        assert_eq!(stale.available_bytes.updated_at, Some(102000.));
        assert_eq!(stale.used_bytes.status, Status::Error);
        assert_eq!(stale.used_bytes.value, Some(9216.));
        assert_eq!(stale.used_bytes.updated_at, Some(100000.));
        assert_eq!(stale.percent.updated_at, Some(100000.));
        assert_eq!(stale.cached_bytes.status, Status::Error);
        assert_eq!(stale.history.last().unwrap().percent, None);
        let fresh = collector.collect();
        assert_eq!(fresh.used_bytes.status, Status::Ready);
        assert_eq!(fresh.used_bytes.value, Some(6656.));
        assert_eq!(fresh.percent.value, Some(81.25));
        assert_eq!(fresh.percent.updated_at, Some(104000.));
        assert_eq!(fresh.percent.error, None);
    }

    #[test]
    fn invalid_physical_bounds_do_not_fabricate_utilization() {
        let base = Instant::now();
        let mut zero = reading(base, 0);
        zero.physical = Ok((0, 0));
        let mut inconsistent = reading(base, 2000);
        inconsistent.physical = Ok((1024, 2048));
        let mut collector = MemoryCollector::new(VecDeque::from([zero, inconsistent]));
        for _ in 0..2 {
            let data = collector.collect();
            assert_eq!(data.percent.status, Status::Unavailable);
            assert_eq!(data.percent.value, None);
            assert_eq!(data.used_bytes.value, None);
            assert_eq!(data.cached_bytes.status, Status::Ready);
            assert_eq!(data.paging_file_bytes.value, Some(12288.));
        }
    }

    #[test]
    fn distinguishes_absent_paging_files_from_failed_or_overflowed_readings() {
        let base = Instant::now();
        let mut absent = reading(base, 0);
        absent.paging_files = Ok(None);
        let mut failed = reading(base, 2000);
        failed.paging_files = Err("Enumeration failed".into());
        let mut overflow = reading(base, 4000);
        overflow.paging_files = Ok(Some(PagingFileUsage {
            pages: u64::MAX,
            page_size: 4096,
        }));
        let mut collector = MemoryCollector::new(VecDeque::from([
            absent,
            failed,
            overflow,
            reading(base, 6000),
        ]));
        let missing = collector.collect();
        assert_eq!(missing.paging_file_bytes.status, Status::NotConfigured);
        assert_eq!(missing.paging_file_bytes.value, None);
        for _ in 0..2 {
            let bad = collector.collect();
            assert_eq!(bad.paging_file_bytes.status, Status::Unavailable);
            assert_eq!(bad.paging_file_bytes.value, None);
            assert_eq!(bad.percent.value, Some(56.25));
        }
        let recovered = collector.collect();
        assert_eq!(recovered.paging_file_bytes.status, Status::Ready);
        assert_eq!(recovered.paging_file_bytes.value, Some(12288.));
    }

    #[test]
    fn retains_only_observed_history_and_expires_by_elapsed_time() {
        let base = Instant::now();
        let mut failed = reading(base, 2000);
        failed.lists[0] = Err("Unavailable".into());
        let mut backwards = reading(base, 66000);
        backwards.timestamp = 90000.;
        let mut collector = MemoryCollector::new(VecDeque::from([
            reading(base, 0),
            failed,
            reading(base, 10000),
            reading(base, 62000),
            reading(base, 64000),
            backwards,
        ]));
        collector.collect();
        collector.collect();
        let after_gap = collector.collect();
        assert_eq!(after_gap.history.len(), 3);
        assert_eq!(after_gap.history[1].percent, None);
        assert_eq!(
            after_gap.history[2].timestamp - after_gap.history[1].timestamp,
            8000.
        );
        let expired = collector.collect();
        assert_eq!(
            expired
                .history
                .iter()
                .map(|point| point.sequence)
                .collect::<Vec<_>>(),
            vec![2, 3, 4]
        );
        assert_eq!(expired.history[0].percent, None);
        let next = collector.collect();
        assert_eq!(
            next.history
                .iter()
                .map(|point| point.sequence)
                .collect::<Vec<_>>(),
            vec![3, 4, 5]
        );
        let reset = collector.collect();
        assert_eq!(reset.history.len(), 1);
        assert_eq!(reset.history[0].sequence, 6);
        assert_eq!(reset.history[0].timestamp, 90000.);
    }

    #[test]
    fn supplementary_failures_do_not_invalidate_physical_usage() {
        let base = Instant::now();
        let mut failed = reading(base, 2000);
        failed.lists[1] = Err("Standby counter offline".into());
        failed.paging_files = Err("Pagefile enumeration failed".into());
        let mut collector = MemoryCollector::new(VecDeque::from([
            reading(base, 0),
            failed,
            reading(base, 4000),
        ]));
        collector.collect();
        let partial = collector.collect();
        assert_eq!(partial.used_bytes.status, Status::Ready);
        assert_eq!(partial.percent.value, Some(56.25));
        assert_eq!(partial.percent.updated_at, Some(102000.));
        assert_eq!(partial.cached_bytes.status, Status::Error);
        assert_eq!(partial.cached_bytes.value, Some(4096.));
        assert_eq!(partial.paging_file_bytes.status, Status::Error);
        assert_eq!(partial.paging_file_bytes.value, Some(12288.));
        assert_eq!(partial.paging_file_bytes.updated_at, Some(100000.));
        let recovered = collector.collect();
        assert_eq!(recovered.cached_bytes.status, Status::Ready);
        assert_eq!(recovered.paging_file_bytes.status, Status::Ready);
    }
}
