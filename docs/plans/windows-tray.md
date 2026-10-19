# Windows tray

The native host creates one `strata` tray icon using the application icon. Both
mouse buttons open the Portuguese menu: Configurações (disabled), Iniciar com o
Windows (checked registration state), Reiniciar, Sair. Probe modes return before
Tauri setup and do not create a tray.

Autostart uses the official Tauri plugin from Rust, with no frontend permissions.
It registers the current executable for the current user's login only when
explicitly enabled. Debug builds disable this menu item. Failed registration
changes restore the previous check state and display a native error dialog.

Restart requests go through Tauri's Exit event, sharing cleanup with quit. The
instance guard closes only once, after AppBar reservations are released and the
services stop, before Tauri spawns the replacement process.

## Manual acceptance on Windows

- Use a standalone release executable, with other Strata instances closed.
- Check icon, tooltip, both mouse buttons, menu order and disabled settings.
- Enable autostart, reopen and verify the check; disable and reopen again.
- Verify login starts the bars when enabled and does not when disabled. Restore
  the user's original autostart choice afterward.
- Restart repeatedly: one process, one tray icon, one bar per monitor. Check that
  no overlay or desktop reservation remains after Sair.
- Launch a second instance and verify it exits without adding a tray or bars.
- Restart Explorer and verify the tray and AppBars recover.
- Run the existing live geometry checks while the release is running. The script
  writes historical evidence paths: execute a temporary copy with its two output
  paths redirected to new timestamped files; never overwrite recorded evidence.
- Run `--probe` and `--probe-media` and verify neither creates a tray icon.

Interactive tray, Explorer-restart and login checks require a desktop session;
unit tests and compilation do not replace them.

## Implementation validation — 2026-10-19

- Rust tests: 100 passed, 3 intentionally ignored, including the new real Win32
  mutex test for name release and repeated close.
- Frontend production build, release Rust build and Tauri standalone build
  (`pnpm exec tauri build --no-bundle`) passed.
- Release `--probe` exited successfully and reported two monitors and two bars.
- Documentation formatting and `git diff --check` passed.
- Interactive acceptance and live geometry for this build remain pending: a
  Strata instance from another checkout was already running and was preserved.
