//! MIDI device monitoring for Worlde Controller.
//!
//! Detects the presence of a "WORLDE easy control" MIDI input device via
//! the Windows MIDI API (winmm.dll) and provides a command to restart the
//! Voicemeeter audio engine via the existing Voicemeeter Remote API.

use libloading::Library;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::voicemeeter::{RemoteApi, RemoteDll};

/// Status of the Worlde MIDI device.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum MidiDeviceStatus {
    /// Device is connected and detected.
    Connected {
        device_name: String,
        last_check: u64,
    },
    /// Device is not found among MIDI inputs.
    Disconnected {
        device_name: String,
        last_check: u64,
        error: String,
    },
    /// An error occurred while querying the MIDI subsystem.
    Error { message: String },
}

impl MidiDeviceStatus {
    fn timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }

    pub fn connected(device_name: String) -> Self {
        Self::Connected {
            device_name,
            last_check: Self::timestamp(),
        }
    }

    pub fn disconnected(device_name: String, error: String) -> Self {
        Self::Disconnected {
            device_name,
            last_check: Self::timestamp(),
            error,
        }
    }

    pub fn error(message: String) -> Self {
        Self::Error { message }
    }
}

impl fmt::Display for MidiDeviceStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MidiDeviceStatus::Connected { device_name, .. } => {
                write!(f, "MIDI device connected: {device_name}")
            }
            MidiDeviceStatus::Disconnected {
                device_name, error, ..
            } => {
                write!(f, "MIDI device not found: {device_name} ({error})")
            }
            MidiDeviceStatus::Error { message } => {
                write!(f, "MIDI detection error: {message}")
            }
        }
    }
}

/// Target device name to search for (case-insensitive substring match).
const TARGET_DEVICE_NAME: &str = "WORLDE easy control";

/// winmm.dll function signatures.
type MidiInGetNumDevs = unsafe extern "system" fn() -> u32;
type MidiInGetDevCapsW = unsafe extern "system" fn(u32, *mut MidiInCapsW, u32) -> u32;

/// MIDIINCAPSW structure matching the Windows SDK definition.
#[repr(C)]
struct MidiInCapsW {
    w_mid: u16,
    w_pid: u16,
    v_driver_version: u32,
    sz_pname: [u16; 32], // MAXPNAMELEN = 32
    dw_support: u32,
}

impl MidiInCapsW {
    fn name(&self) -> String {
        let end = self
            .sz_pname
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(self.sz_pname.len());
        String::from_utf16_lossy(&self.sz_pname[..end])
    }
}

/// Loads winmm.dll and resolves MIDI input functions.
struct WinMm {
    // Library must be kept alive for the function pointers to remain valid.
    // We store it but don't use it directly after loading.
    _library: Library,
    get_num_devs: MidiInGetNumDevs,
    get_dev_caps_w: MidiInGetDevCapsW,
}

impl WinMm {
    fn load() -> Result<Self, String> {
        // winmm.dll is a system DLL, load by name
        let library = unsafe { Library::new("winmm.dll") }
            .map_err(|e| format!("Failed to load winmm.dll: {e}"))?;

        let get_num_devs: MidiInGetNumDevs = unsafe {
            *library
                .get::<MidiInGetNumDevs>(b"midiInGetNumDevs\0")
                .map_err(|e| format!("Failed to resolve midiInGetNumDevs: {e}"))?
        };

        let get_dev_caps_w: MidiInGetDevCapsW = unsafe {
            *library
                .get::<MidiInGetDevCapsW>(b"midiInGetDevCapsW\0")
                .map_err(|e| format!("Failed to resolve midiInGetDevCapsW: {e}"))?
        };

        Ok(Self {
            _library: library,
            get_num_devs,
            get_dev_caps_w,
        })
    }

    /// Checks if the target MIDI device is present.
    fn check_device(&self) -> MidiDeviceStatus {
        let num_devs = unsafe { (self.get_num_devs)() };
        if num_devs == 0 {
            return MidiDeviceStatus::disconnected(
                TARGET_DEVICE_NAME.to_string(),
                "No MIDI input devices present".to_string(),
            );
        }

        for device_id in 0..num_devs {
            let mut caps = MidiInCapsW {
                w_mid: 0,
                w_pid: 0,
                v_driver_version: 0,
                sz_pname: [0; 32],
                dw_support: 0,
            };

            let result = unsafe {
                (self.get_dev_caps_w)(
                    device_id,
                    &mut caps as *mut _,
                    std::mem::size_of::<MidiInCapsW>() as u32,
                )
            };

            if result != 0 {
                // MMSYSERR_NOERROR = 0, skip devices we can't query
                continue;
            }

            let device_name = caps.name();
            if device_name
                .to_lowercase()
                .contains(&TARGET_DEVICE_NAME.to_lowercase())
            {
                return MidiDeviceStatus::connected(device_name);
            }
        }

        MidiDeviceStatus::disconnected(
            TARGET_DEVICE_NAME.to_string(),
            format!("Device not found among {num_devs} MIDI input device(s)"),
        )
    }
}

/// Checks the MIDI input subsystem for the Worlde Controller device.
pub fn check_midi_device() -> MidiDeviceStatus {
    match WinMm::load() {
        Ok(winmm) => winmm.check_device(),
        Err(e) => MidiDeviceStatus::error(e),
    }
}

/// Restarts the Voicemeeter audio engine by setting the Command.Restart parameter.
///
/// Uses the existing Voicemeeter RemoteDll infrastructure. Returns Ok(()) on
/// success, or an error message if Voicemeeter is not installed, not running,
/// or the command fails.
pub fn restart_voicemeeter_engine() -> Result<(), String> {
    let dll = RemoteDll::open().ok_or_else(|| {
        "Voicemeeter Remote DLL not found. Ensure Voicemeeter is installed.".to_string()
    })?;

    // Login to establish a session
    if dll.login() < 0 {
        return Err("Voicemeeter is not running".to_string());
    }

    // Send restart command
    dll.set_float("Command.Restart", 1.0)
        .map_err(|code| format!("VBVMR_SetParameterFloat failed with code {code}"))?;

    // Logout to clean up
    let _ = dll.logout();

    Ok(())
}

/// Tauri command to check MIDI device status.
#[tauri::command]
pub async fn midi_device_status() -> Result<MidiDeviceStatus, String> {
    // Run the blocking MIDI check on a blocking thread
    let status = tauri::async_runtime::spawn_blocking(check_midi_device)
        .await
        .map_err(|e| e.to_string())?;
    Ok(status)
}

/// Tauri command to restart the Voicemeeter audio engine.
#[tauri::command]
pub async fn midi_restart_voicemeeter() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(restart_voicemeeter_engine)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mock state for testing WinMm interactions (unused placeholder for future mock tests).
    #[derive(Default)]
    #[allow(dead_code)]
    struct MockWinMmState {
        devices: std::sync::Mutex<Vec<(u32, String, u32)>>, // (device_id, name, error_code)
    }

    #[allow(dead_code)]
    impl MockWinMmState {
        fn with_devices(devices: Vec<(u32, String, u32)>) -> Self {
            Self {
                devices: std::sync::Mutex::new(devices),
            }
        }
    }

    /// Test the MidiInCapsW name extraction.
    #[test]
    fn midi_in_caps_name_extraction() {
        let mut caps = MidiInCapsW {
            w_mid: 0,
            w_pid: 0,
            v_driver_version: 0,
            sz_pname: [0; 32],
            dw_support: 0,
        };

        // Test ASCII name
        let name = "WORLDE easy control";
        for (i, ch) in name.encode_utf16().enumerate() {
            caps.sz_pname[i] = ch;
        }
        assert_eq!(caps.name(), "WORLDE easy control");

        // Test name with null terminator in middle
        caps.sz_pname[6] = 0;
        assert_eq!(caps.name(), "WORLDE");
    }

    /// Test MidiDeviceStatus constructors and display.
    #[test]
    fn midi_device_status_variants() {
        let connected = MidiDeviceStatus::connected("WORLDE easy control".to_string());
        assert!(matches!(connected, MidiDeviceStatus::Connected { .. }));
        assert!(connected.to_string().contains("WORLDE easy control"));

        let disconnected = MidiDeviceStatus::disconnected(
            "WORLDE easy control".to_string(),
            "Not found".to_string(),
        );
        assert!(matches!(
            disconnected,
            MidiDeviceStatus::Disconnected { .. }
        ));
        assert!(disconnected.to_string().contains("Not found"));

        let error = MidiDeviceStatus::error("DLL load failed".to_string());
        assert!(matches!(error, MidiDeviceStatus::Error { .. }));
        assert!(error.to_string().contains("DLL load failed"));
    }

    /// Test timestamp is recent.
    #[test]
    fn midi_device_status_timestamp() {
        let before = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let status = MidiDeviceStatus::connected("test".to_string());
        let after = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let timestamp = match status {
            MidiDeviceStatus::Connected { last_check, .. } => last_check,
            _ => panic!("Expected Connected"),
        };
        assert!(timestamp >= before && timestamp <= after);
    }

    /// Test TARGET_DEVICE_NAME constant.
    #[test]
    fn target_device_name_constant() {
        assert_eq!(TARGET_DEVICE_NAME, "WORLDE easy control");
    }
}
