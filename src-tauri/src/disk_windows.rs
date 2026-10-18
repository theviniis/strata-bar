//! Windows volume source, owned exclusively by the shared metrics worker.
//! It enumerates the drive letters Windows currently reports and reads each
//! one's raw capacity, so a volume without mounted storage is simply absent.
use crate::disk::{DiskReadings, DiskSource, VolumeReading};
use crate::disk_contract::DiskVolumeKind;
use windows::{
    core::PCWSTR,
    Win32::Storage::FileSystem::{
        GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
    },
    Win32::System::WindowsProgramming::{
        DRIVE_CDROM, DRIVE_FIXED, DRIVE_RAMDISK, DRIVE_REMOTE, DRIVE_REMOVABLE,
    },
};

/// Preserve Windows' classification in the payload instead of deciding here:
/// the UI distinguishes local devices from mapped network drives. `DRIVE_UNKNOWN`
/// and `DRIVE_NO_ROOT_DIR` fall through to `Unknown`.
fn volume_kind(drive_type: u32) -> DiskVolumeKind {
    match drive_type {
        DRIVE_FIXED => DiskVolumeKind::Fixed,
        DRIVE_REMOVABLE => DiskVolumeKind::Removable,
        DRIVE_CDROM => DiskVolumeKind::Optical,
        DRIVE_RAMDISK => DiskVolumeKind::Ramdisk,
        DRIVE_REMOTE => DiskVolumeKind::Remote,
        _ => DiskVolumeKind::Unknown,
    }
}

fn wide(path: &str) -> Vec<u16> {
    path.encode_utf16().chain(std::iter::once(0)).collect()
}

/// The volume label is optional metadata: an unreadable or unnamed volume must
/// not remove the drive itself from the bar.
fn label(root: &[u16]) -> Option<String> {
    let mut buffer = [0u16; 261];
    unsafe {
        GetVolumeInformationW(
            PCWSTR(root.as_ptr()),
            Some(&mut buffer),
            None,
            None,
            None,
            None,
        )
    }
    .ok()?;
    let name = String::from_utf16_lossy(&buffer);
    let name = name.trim_end_matches('\0').trim();
    (!name.is_empty()).then(|| name.to_string())
}

fn capacity(root: &[u16]) -> Option<(u64, u64)> {
    let mut total = 0u64;
    let mut free = 0u64;
    unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(root.as_ptr()),
            None,
            Some(&mut total),
            Some(&mut free),
        )
    }
    .ok()?;
    Some((total, free))
}

#[derive(Default)]
pub struct WindowsDiskSource;

impl DiskSource for WindowsDiskSource {
    fn read(&mut self) -> DiskReadings {
        let timestamp = crate::metrics::timestamp() as f64;
        let mask = unsafe { GetLogicalDrives() };
        if mask == 0 {
            return DiskReadings {
                timestamp,
                volumes: Err("No disk volumes reported".into()),
            };
        }
        let mut volumes = Vec::new();
        for index in 0..26u32 {
            if mask & (1 << index) == 0 {
                continue;
            }
            let mount = format!("{}:", (b'A' + index as u8) as char);
            let root = wide(&format!("{mount}\\"));
            let kind = volume_kind(unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) });
            // A letter with no readable storage (empty removable or optical
            // media, a disconnected share) is not a mounted volume.
            let Some((total_bytes, free_bytes)) = capacity(&root) else {
                continue;
            };
            volumes.push(VolumeReading {
                mount,
                label: label(&root),
                kind,
                total_bytes,
                free_bytes,
            });
        }
        DiskReadings {
            timestamp,
            volumes: Ok(volumes),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::System::WindowsProgramming::{DRIVE_NO_ROOT_DIR, DRIVE_UNKNOWN};

    #[test]
    fn preserves_each_windows_drive_type_including_network_mappings() {
        assert_eq!(volume_kind(DRIVE_FIXED), DiskVolumeKind::Fixed);
        assert_eq!(volume_kind(DRIVE_REMOVABLE), DiskVolumeKind::Removable);
        assert_eq!(volume_kind(DRIVE_CDROM), DiskVolumeKind::Optical);
        assert_eq!(volume_kind(DRIVE_RAMDISK), DiskVolumeKind::Ramdisk);
        // Network mappings stay in the payload so the UI can decide what to show.
        assert_eq!(volume_kind(DRIVE_REMOTE), DiskVolumeKind::Remote);
        assert_eq!(volume_kind(DRIVE_UNKNOWN), DiskVolumeKind::Unknown);
        assert_eq!(volume_kind(DRIVE_NO_ROOT_DIR), DiskVolumeKind::Unknown);
        assert_eq!(volume_kind(42), DiskVolumeKind::Unknown);
    }
}
