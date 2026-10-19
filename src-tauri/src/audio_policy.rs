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
    endpoints(en, eRender)
}

pub unsafe fn endpoints(en: &IMMDeviceEnumerator, flow: EDataFlow) -> windows::core::Result<Value> {
    let collection = en.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)?;
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
        .GetDefaultAudioEndpoint(flow, eMultimedia)
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

fn apply_roles(
    flow: EDataFlow,
    mut set: impl FnMut(ERole) -> Result<(), String>,
) -> Result<(), String> {
    for role in roles(flow) {
        set(role)?;
    }
    Ok(())
}

#[cfg(test)]
pub unsafe fn select(en: &IMMDeviceEnumerator, id: &str) -> Result<Value, String> {
    select_endpoint(en, id, eRender)
}

fn roles(flow: EDataFlow) -> Vec<ERole> {
    if flow == eCapture {
        vec![eConsole, eMultimedia, eCommunications]
    } else {
        vec![eConsole, eMultimedia]
    }
}

pub unsafe fn select_endpoint(
    en: &IMMDeviceEnumerator,
    id: &str,
    flow: EDataFlow,
) -> Result<Value, String> {
    if id.is_empty() || id.contains('\0') || id.len() > 4096 {
        return Err("Invalid endpoint ID".into());
    }
    let snapshot = endpoints(en, flow).map_err(|e| e.to_string())?;
    if !snapshot["devices"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["id"] == id)
    {
        return Err("O dispositivo selecionado não está mais disponível".into());
    }
    let policy = Policy::create()?;
    apply_roles(flow, |role| policy.set(id, role))?;
    for role in roles(flow) {
        let actual = device_id(
            &en.GetDefaultAudioEndpoint(flow, role)
                .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if actual != id {
            return Err("O Windows não confirmou o dispositivo padrão".into());
        }
    }
    endpoints(en, flow).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_roles_include_communications_and_render_preserves_it() {
        assert_eq!(
            roles(eCapture),
            vec![eConsole, eMultimedia, eCommunications]
        );
        assert_eq!(roles(eRender), vec![eConsole, eMultimedia]);
    }
    #[test]
    fn capture_enumeration_rejects_render_endpoints() {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
            {
                let en: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap();
                let capture = endpoints(&en, eCapture).unwrap();
                assert!(capture["devices"].is_array());
                let render = outputs(&en).unwrap();
                for device in render["devices"].as_array().unwrap() {
                    assert!(
                        select_endpoint(&en, device["id"].as_str().unwrap(), eCapture).is_err()
                    );
                }
                assert!(select_endpoint(&en, "invalid-capture-id", eCapture).is_err());
            }
            CoUninitialize();
        }
    }

    #[test]
    #[ignore = "Temporarily changes microphone defaults, volume and mute; restores original state"]
    fn live_microphone_round_trip() {
        unsafe {
            use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
            {
                let en: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap();
                let before = endpoints(&en, eCapture).unwrap();
                let original: Vec<_> = roles(eCapture)
                    .into_iter()
                    .map(|role| {
                        (
                            role,
                            device_id(&en.GetDefaultAudioEndpoint(eCapture, role).unwrap())
                                .unwrap(),
                        )
                    })
                    .collect();
                let render_before: Vec<_> = roles(eCapture)
                    .into_iter()
                    .map(|role| {
                        en.GetDefaultAudioEndpoint(eRender, role)
                            .and_then(|d| device_id(&d))
                            .ok()
                    })
                    .collect();
                let current = before["defaultDeviceId"]
                    .as_str()
                    .expect("Requires an active microphone");
                let target = before["devices"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|d| d["id"] != current)
                    .map(|d| d["id"].as_str().unwrap())
                    .unwrap_or(current);
                let wide: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
                let device = en.GetDevice(PCWSTR(wide.as_ptr())).unwrap();
                let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).unwrap();
                let level = volume.GetMasterVolumeLevelScalar().unwrap();
                let muted = volume.GetMute().unwrap().as_bool();
                struct Restore {
                    policy: Policy,
                    defaults: Vec<(ERole, String)>,
                    volume: IAudioEndpointVolume,
                    level: f32,
                    muted: bool,
                }
                impl Drop for Restore {
                    fn drop(&mut self) {
                        unsafe {
                            self.volume
                                .SetMasterVolumeLevelScalar(self.level, core::ptr::null())
                                .expect("restore microphone level");
                            self.volume
                                .SetMute(self.muted, core::ptr::null())
                                .expect("restore microphone mute");
                            for (role, id) in &self.defaults {
                                self.policy
                                    .set(id, *role)
                                    .expect("restore microphone default");
                            }
                        }
                    }
                }
                let restore = Restore {
                    policy: Policy::create().unwrap(),
                    defaults: original.clone(),
                    volume: volume.clone(),
                    level,
                    muted,
                };
                let selected = select_endpoint(&en, target, eCapture).unwrap();
                volume
                    .SetMasterVolumeLevelScalar(
                        if level > 0.5 { 0.4 } else { 0.6 },
                        core::ptr::null(),
                    )
                    .unwrap();
                volume.SetMute(!muted, core::ptr::null()).unwrap();
                let changed_volume = crate::metrics::audio_read(&volume).unwrap();
                assert_eq!(changed_volume["muted"], !muted);
                assert!((volume.GetMasterVolumeLevelScalar().unwrap() - level).abs() > 0.01);
                drop(restore);
                for (role, id) in original {
                    assert_eq!(
                        device_id(&en.GetDefaultAudioEndpoint(eCapture, role).unwrap()).unwrap(),
                        id
                    );
                }
                assert!((volume.GetMasterVolumeLevelScalar().unwrap() - level).abs() < 0.01);
                assert_eq!(volume.GetMute().unwrap().as_bool(), muted);
                let render_after: Vec<_> = roles(eCapture)
                    .into_iter()
                    .map(|role| {
                        en.GetDefaultAudioEndpoint(eRender, role)
                            .and_then(|d| device_id(&d))
                            .ok()
                    })
                    .collect();
                assert_eq!(render_before, render_after);
                let report = json!({"before":before,"selected":selected,"changedVolume":changed_volume,"restored":true,"outputPreserved":true,"alternateAvailable":target != current,"timestamp":crate::metrics::timestamp()});
                std::fs::write(
                    std::env::temp_dir().join("strata-microphone-check.json"),
                    serde_json::to_string_pretty(&report).unwrap(),
                )
                .unwrap();
            }
            CoUninitialize();
        }
    }
    #[test]
    fn switching_never_changes_communications() {
        let mut roles = Vec::new();
        apply_roles(eRender, |role| {
            roles.push(role);
            Ok(())
        })
        .unwrap();
        assert_eq!(roles, vec![eConsole, eMultimedia]);
    }
    #[test]
    fn partial_failure_is_reported() {
        let result = apply_roles(eRender, |role| {
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
