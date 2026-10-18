//! Windows audio policy COM boundary. The private ABI requires live Windows validation.
use serde_json::{json, Value};
use windows::{
    core::{GUID, HRESULT, PCWSTR},
    Win32::{Media::Audio::*, System::Com::*},
};

unsafe fn device_id(device: &IMMDevice) -> windows::core::Result<String> {
    let raw = device.GetId()?;
    let result = raw.to_string();
    CoTaskMemFree(Some(raw.0.cast()));
    Ok(result?)
}

pub unsafe fn outputs(en: &IMMDeviceEnumerator) -> windows::core::Result<Value> {
    let collection = en.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
    let mut devices = Vec::new();
    for index in 0..collection.GetCount()? {
        let device = collection.Item(index)?;
        let id = device_id(&device)?;
        let name = (|| -> windows::core::Result<String> {
            let store = device.OpenPropertyStore(STGM_READ)?;
            let key = windows::Win32::Foundation::PROPERTYKEY {
                fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
                pid: 14,
            };
            let mut value = store.GetValue(&key)?;
            let raw = StructuredStorage::PropVariantToStringAlloc(&value);
            let _ = StructuredStorage::PropVariantClear(&mut value);
            let raw = raw?;
            let result = raw.to_string();
            CoTaskMemFree(Some(raw.0.cast()));
            Ok(result?)
        })()
        .unwrap_or_else(|_| id.clone());
        devices.push(json!({"id": id, "name": name}));
    }
    let default = en
        .GetDefaultAudioEndpoint(eRender, eMultimedia)
        .and_then(|d| device_id(&d))
        .ok();
    Ok(json!({"devices": devices, "defaultDeviceId": default}))
}

// IPolicyConfig has ten methods before SetDefaultEndpoint after IUnknown.
// Keep the complete slot offsets; never shorten the vtable to just the used method.
#[repr(C)]
struct PolicyVtable {
    query: unsafe extern "system" fn(
        *mut core::ffi::c_void,
        *const GUID,
        *mut *mut core::ffi::c_void,
    ) -> HRESULT,
    add_ref: unsafe extern "system" fn(*mut core::ffi::c_void) -> u32,
    release: unsafe extern "system" fn(*mut core::ffi::c_void) -> u32,
    unused: [usize; 10],
    set_default: unsafe extern "system" fn(*mut core::ffi::c_void, PCWSTR, ERole) -> HRESULT,
}
struct Policy(*mut core::ffi::c_void);
impl Drop for Policy {
    fn drop(&mut self) {
        unsafe {
            ((**(self.0 as *mut *const PolicyVtable)).release)(self.0);
        }
    }
}

impl Policy {
    unsafe fn create() -> Result<Self, String> {
        let mut raw = core::ptr::null_mut();
        // Use CoCreateInstance through the raw ABI because this private interface is
        // intentionally absent from the generated Windows SDK bindings.
        windows::core::link!("ole32.dll" "system" fn CoCreateInstance(rclsid: *const GUID, outer: *mut core::ffi::c_void, context: u32, iid: *const GUID, out: *mut *mut core::ffi::c_void) -> HRESULT);
        CoCreateInstance(
            &GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9),
            core::ptr::null_mut(),
            CLSCTX_ALL.0,
            &GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8),
            &mut raw,
        )
        .ok()
        .map_err(|e| e.to_string())?;
        Ok(Self(raw))
    }
    unsafe fn set(&self, id: &str, role: ERole) -> Result<(), String> {
        let table = &**(self.0 as *mut *const PolicyVtable);
        let wide: Vec<u16> = id.encode_utf16().chain(Some(0)).collect();
        (table.set_default)(self.0, PCWSTR(wide.as_ptr()), role)
            .ok()
            .map_err(|e| e.to_string())
    }
}

fn apply_roles(mut set: impl FnMut(ERole) -> Result<(), String>) -> Result<(), String> {
    for role in [eConsole, eMultimedia] {
        set(role)?;
    }
    Ok(())
}

pub unsafe fn select(en: &IMMDeviceEnumerator, id: &str) -> Result<Value, String> {
    let snapshot = outputs(en).map_err(|e| e.to_string())?;
    if !snapshot["devices"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["id"] == id)
    {
        return Err("A saída selecionada não está mais disponível".into());
    }
    let policy = Policy::create()?;
    apply_roles(|role| policy.set(id, role))?;
    let result = outputs(en).map_err(|e| e.to_string())?;
    if result["defaultDeviceId"] != id {
        return Err("O Windows não confirmou a nova saída".into());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn switching_never_changes_communications() {
        let mut roles = Vec::new();
        apply_roles(|role| {
            roles.push(role);
            Ok(())
        })
        .unwrap();
        assert_eq!(roles, vec![eConsole, eMultimedia]);
    }
    #[test]
    fn partial_failure_is_reported() {
        let result = apply_roles(|role| {
            if role == eMultimedia {
                Err("failure".into())
            } else {
                Ok(())
            }
        });
        assert_eq!(result, Err("failure".into()));
    }
    #[test]
    fn enumerates_real_active_windows_outputs_and_rejects_unknown_id() {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
            {
                let en: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap();
                let snapshot = outputs(&en).unwrap();
                assert!(snapshot["devices"].is_array());
                assert!(select(&en, "strata-invalid-endpoint").is_err());
            }
            CoUninitialize();
        }
    }
    #[test]
    #[ignore = "Changes real audio routing temporarily; run explicitly with two active outputs"]
    fn live_switch_round_trip_preserves_communications() {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
            {
                let en: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap();
                let snapshot = outputs(&en).unwrap();
                let multimedia =
                    device_id(&en.GetDefaultAudioEndpoint(eRender, eMultimedia).unwrap()).unwrap();
                let console =
                    device_id(&en.GetDefaultAudioEndpoint(eRender, eConsole).unwrap()).unwrap();
                let communications = en
                    .GetDefaultAudioEndpoint(eRender, eCommunications)
                    .and_then(|d| device_id(&d))
                    .ok();
                let alternate = snapshot["devices"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|d| d["id"] != multimedia)
                    .expect("Two active outputs required")["id"]
                    .as_str()
                    .unwrap();
                struct Restore {
                    policy: Policy,
                    console: String,
                    multimedia: String,
                }
                impl Drop for Restore {
                    fn drop(&mut self) {
                        unsafe {
                            self.policy
                                .set(&self.console, eConsole)
                                .expect("Restore console output");
                            self.policy
                                .set(&self.multimedia, eMultimedia)
                                .expect("Restore multimedia output");
                        }
                    }
                }
                let restore = Restore {
                    policy: Policy::create().unwrap(),
                    console,
                    multimedia: multimedia.clone(),
                };
                let changed = select(&en, alternate).unwrap();
                assert_eq!(changed["defaultDeviceId"], alternate);
                assert_eq!(
                    device_id(&en.GetDefaultAudioEndpoint(eRender, eConsole).unwrap()).unwrap(),
                    alternate
                );
                assert_eq!(
                    en.GetDefaultAudioEndpoint(eRender, eCommunications)
                        .and_then(|d| device_id(&d))
                        .ok(),
                    communications
                );
                let returned = select(&en, &multimedia).unwrap();
                assert_eq!(returned["defaultDeviceId"], multimedia);
                assert_eq!(
                    en.GetDefaultAudioEndpoint(eRender, eCommunications)
                        .and_then(|d| device_id(&d))
                        .ok(),
                    communications
                );
                drop(restore);
                let report = json!({"before": snapshot, "changed": changed, "returned": returned, "communicationsPreserved": true, "restored": true});
                std::fs::write(
                    std::env::temp_dir().join("strata-audio-output-check.json"),
                    serde_json::to_string_pretty(&report).unwrap(),
                )
                .unwrap();
                println!("{}", report);
            }
            CoUninitialize();
        }
    }
}
