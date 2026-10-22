use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_autostart::ManagerExt;
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

fn show_error(message: &str) {
    let message = windows::core::HSTRING::from(message);
    unsafe {
        let _ = MessageBoxW(
            None,
            &message,
            windows::core::w!("Strata"),
            MB_OK | MB_ICONERROR,
        );
    }
}

pub fn setup(app: &tauri::AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "tray-settings", "Configurações", true, None::<&str>)?;
    let startup = app.autolaunch().is_enabled();
    let startup_available = !cfg!(debug_assertions) && startup.is_ok();
    if !cfg!(debug_assertions) {
        if let Err(error) = &startup {
            show_error(&format!(
                "Não foi possível consultar a inicialização com o Windows: {error}"
            ));
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
    let icon = app
        .default_window_icon()
        .ok_or_else(|| tauri::Error::AssetNotFound("application tray icon".into()))?;
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
                let previous = manager.is_enabled();
                let result = match previous {
                    Ok(previous) => {
                        let changed = if previous {
                            manager.disable()
                        } else {
                            manager.enable()
                        };
                        match changed.and_then(|()| manager.is_enabled()) {
                            Ok(actual) if actual != previous => autostart
                                .set_checked(actual)
                                .map_err(|error| error.to_string()),
                            result => {
                                let _ = autostart.set_checked(previous);
                                Err(match result {
                                    Err(error) => error.to_string(),
                                    Ok(_) => "O Windows não confirmou a alteração.".into(),
                                })
                            }
                        }
                    }
                    Err(error) => {
                        if let Ok(checked) = autostart.is_checked() {
                            let _ = autostart.set_checked(!checked);
                        }
                        Err(error.to_string())
                    }
                };
                if let Err(error) = result {
                    show_error(&format!(
                        "Não foi possível alterar a inicialização com o Windows: {error}"
                    ));
                }
            }
            "tray-restart" => app.request_restart(),
            "tray-settings" => {
                // One settings window: a second click focuses the open one.
                if let Err(error) = crate::desktop::open_settings(app) {
                    show_error(&format!("Não foi possível abrir as configurações: {error}"));
                }
            }
            "tray-quit" => crate::quit(app.clone()),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
