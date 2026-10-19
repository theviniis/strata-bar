use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::ManagerExt;
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

fn show_error(message: &str) {
    let message = windows::core::HSTRING::from(message);
    unsafe {
        let _ = MessageBoxW(None, &message, windows::core::w!("Strata"), MB_OK | MB_ICONERROR);
    }
}

pub fn setup(app: &tauri::AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "tray-settings", "Configurações", false, None::<&str>)?;
    let startup = app.autolaunch().is_enabled();
    let startup_available = !cfg!(debug_assertions) && startup.is_ok();
    if !cfg!(debug_assertions) {
        if let Err(error) = &startup {
            show_error(&format!("Não foi possível consultar a inicialização com o Windows: {error}"));
        }
    }
    let autostart = CheckMenuItem::with_id(
        app,
        "tray-autostart",
        "Iniciar com o Windows",
        startup_available,
        startup.unwrap_or(false),
        None::<&str>,
    )?;
    let restart = MenuItem::with_id(app, "tray-restart", "Reiniciar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &autostart, &restart, &quit])?;
    let icon = app.default_window_icon().ok_or_else(|| {
        tauri::Error::AssetNotFound("application tray icon".into())
    })?;
    TrayIconBuilder::with_id("strata")
        .icon(icon.clone())
        .tooltip("Strata")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "tray-autostart" if startup_available => {
                // Native check items toggle before this callback. Read the actual
                // registration instead of using that optimistic UI state.
                let manager = app.autolaunch();
                let result = manager.is_enabled().and_then(|previous| {
                    let changed = if previous { manager.disable() } else { manager.enable() };
                    match changed.and_then(|()| manager.is_enabled()) {
                        Ok(actual) if actual != previous => {
                            let _ = autostart.set_checked(actual);
                            Ok(())
                        }
                        other => {
                            let _ = autostart.set_checked(previous);
                            match other {
                                Err(error) => Err(error),
                                Ok(_) => {
                                    show_error("O Windows não confirmou a alteração da inicialização automática.");
                                    Ok(())
                                }
                            }
                        }
                    }
                });
                if let Err(error) = result {
                    // If the initial read failed, undo the menu's automatic toggle.
                    if let Ok(actual) = manager.is_enabled() {
                        let _ = autostart.set_checked(actual);
                    } else if let Ok(checked) = autostart.is_checked() {
                        let _ = autostart.set_checked(!checked);
                    }
                    show_error(&format!("Não foi possível alterar a inicialização com o Windows: {error}"));
                }
            }
            "tray-restart" => app.request_restart(),
            "tray-quit" => crate::quit(app.clone()),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
