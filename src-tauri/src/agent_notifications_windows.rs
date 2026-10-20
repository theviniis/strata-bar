use crate::agents_contract::{AgentAlert, AgentAlertKind, AgentNotificationStatus, AgentType};
use windows::{
    core::{Interface, HSTRING, PCWSTR},
    Data::Xml::Dom::XmlDocument,
    Win32::{
        Storage::EnhancedStorage::PKEY_AppUserModel_ID,
        System::{
            Com::{
                CoCreateInstance, CoTaskMemFree, IPersistFile,
                StructuredStorage::PropVariantToString, CLSCTX_INPROC_SERVER, STGM_READ,
            },
            WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        },
        UI::Shell::{
            FOLDERID_CommonPrograms, FOLDERID_Programs, IShellLinkW,
            PropertiesSystem::IPropertyStore, SHGetKnownFolderPath, ShellLink, KF_FLAG_DEFAULT,
        },
    },
    UI::Notifications::{NotificationSetting, ToastNotification, ToastNotificationManager},
};

const APP_ID: &str = "dev.strata.bar";

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            RoUninitialize();
        }
    }
}

// The NSIS installer puts the configured AUMID on the Start menu shortcut.
// Never borrow PowerShell's identity or register an unrelated executable.
fn registered_identity() -> bool {
    for folder in [FOLDERID_Programs, FOLDERID_CommonPrograms] {
        let root = unsafe {
            let Ok(path) = SHGetKnownFolderPath(&folder, KF_FLAG_DEFAULT, None) else {
                continue;
            };
            let value = path.to_string();
            CoTaskMemFree(Some(path.0.cast()));
            let Ok(value) = value else { continue };
            std::path::PathBuf::from(value)
        };
        for relative in ["Strata.lnk", "Strata/Strata.lnk"] {
            let path = root.join(relative);
            if !path.is_file() {
                continue;
            }
            let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            let result = unsafe {
                (|| -> windows::core::Result<bool> {
                    let link: IShellLinkW =
                        CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
                    link.cast::<IPersistFile>()?
                        .Load(PCWSTR(path.as_ptr()), STGM_READ)?;
                    let property = link
                        .cast::<IPropertyStore>()?
                        .GetValue(&PKEY_AppUserModel_ID)?;
                    let mut value = [0u16; 128];
                    PropVariantToString(&property, &mut value)?;
                    let end = value.iter().position(|c| *c == 0).unwrap_or(value.len());
                    Ok(String::from_utf16_lossy(&value[..end]) == APP_ID)
                })()
            };
            if result == Ok(true) {
                return true;
            }
        }
    }
    false
}

use std::os::windows::ffi::OsStrExt;

fn payload(alert: &AgentAlert) -> String {
    let agent = match alert.agent {
        AgentType::Opencode => "OpenCode",
        AgentType::Antigravity => "Antigravity",
        AgentType::Chatgpt => "ChatGPT Desktop",
        AgentType::Codex => "Codex local",
    };
    let event = match alert.kind {
        AgentAlertKind::Attention => "Atenção necessária",
        AgentAlertKind::Completed => "Turno concluído",
    };
    // Only fixed labels reach XML and the OS notification history.
    format!("<toast><visual><binding template=\"ToastGeneric\"><text>Strata · {agent}</text><text>{event}. Consulte o controle de agentes na barra.</text></binding></visual><audio silent=\"true\"/></toast>")
}

pub fn submit(alert: Option<&AgentAlert>) -> AgentNotificationStatus {
    if unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_err() {
        return AgentNotificationStatus::Error;
    }
    let _apartment = Apartment;
    if !registered_identity() {
        return AgentNotificationStatus::Unavailable;
    }
    let result = (|| -> windows::core::Result<AgentNotificationStatus> {
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))?;
        if notifier.Setting()? != NotificationSetting::Enabled {
            return Ok(AgentNotificationStatus::Blocked);
        }
        if let Some(alert) = alert {
            let document = XmlDocument::new()?;
            document.LoadXml(&HSTRING::from(payload(alert)))?;
            let toast = ToastNotification::CreateToastNotification(&document)?;
            notifier.Show(&toast)?;
        }
        Ok(AgentNotificationStatus::Ready)
    })();
    result.unwrap_or(AgentNotificationStatus::Error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires installed identity; submits two generic synthetic toasts only if Windows notifications are enabled"]
    fn live_windows_installed_delivery_respects_user_policy() {
        let expected = submit(None);
        assert!(
            matches!(
                expected,
                AgentNotificationStatus::Ready | AgentNotificationStatus::Blocked
            ),
            "Install Strata before running this test"
        );
        let mut submitted = 0;
        for (index, kind) in [AgentAlertKind::Attention, AgentAlertKind::Completed]
            .into_iter()
            .enumerate()
        {
            let status = submit(Some(&AgentAlert {
                id: format!("agent-alert-{}", index + 1),
                agent: AgentType::Opencode,
                session_id: "synthetic-notification-acceptance".into(),
                session_title: "Synthetic title must remain private".into(),
                kind,
                created_at: 1000.0,
            }));
            assert_eq!(status, expected);
            if status == AgentNotificationStatus::Ready {
                submitted += 1;
            }
        }
        println!(
            "AGENT_NOTIFICATION_DELIVERY {}",
            serde_json::json!({"status": expected, "attemptedEvents": 2, "submittedToWindows": submitted, "syntheticEvents": true, "bannerVerified": false, "providerEventsVerified": false, "systemPreferencesChanged": false})
        );
    }

    #[test]
    #[ignore = "Read-only check of installed identity and Windows notification policy; does not show a toast"]
    fn live_windows_native_notification_availability() {
        let status = submit(None);
        let setting = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
            .ok()
            .and_then(|_| {
                let _apartment = Apartment;
                ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))
                    .and_then(|notifier| notifier.Setting())
                    .map(|setting| setting.0)
                    .ok()
            });
        assert!(matches!(
            status,
            AgentNotificationStatus::Ready
                | AgentNotificationStatus::Blocked
                | AgentNotificationStatus::Unavailable
        ));
        println!(
            "AGENT_NOTIFICATIONS {}",
            serde_json::json!({"status": status, "windowsSetting": setting, "toastSubmitted": false, "bannerVerified": false, "providerEventsVerified": false, "systemPreferencesChanged": false})
        );
    }
}
