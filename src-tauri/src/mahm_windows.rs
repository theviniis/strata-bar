//! Read-only copy of the MAHM v2 mapping, shared by the CPU and GPU sources.
use std::mem::size_of;
use windows::{
    core::w,
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::Memory::{
            MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, VirtualQuery, FILE_MAP_READ,
            MEMORY_BASIC_INFORMATION, MEMORY_MAPPED_VIEW_ADDRESS,
        },
    },
};

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

/// Copied snapshot, or an error describing why the producer is unusable.
pub fn snapshot() -> Result<Vec<u8>, String> {
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
