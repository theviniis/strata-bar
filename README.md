# Strata

Windows 11 status bar MVP: native CPU and RAM readings, local clock, real Core Audio volume/mute controls, and a reserved top bar on every connected monitor. The native application opens actual bars; the browser route remains a separate demo studio.

## Develop

Node 22.12+ and pnpm: `pnpm ci`, `pnpm dev`. Browse http://127.0.0.1:1420. `pnpm test` and `pnpm build` validate the browser foundation. JSON editor validates before saving to localStorage; other tabs receive configuration updates. Native file persistence/watch is planned.

## Desktop prerequisites

Install Rust stable, MSVC C++ build tools with Windows SDK and WebView2 using the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Then `pnpm desktop` starts the native bars with development tooling. Close with the × at the right of either bar; this exits all bars and releases desktop reservations.

For a standalone production executable, run `npx tauri build --no-bundle`, then launch `src-tauri\target\release\strata-bar.exe`. It embeds the UI and requires no Vite server. `pnpm package:windows` targets an NSIS installer; installer testing and signing remain separate release gates.

Current native defaults: top, 36 logical pixels, dark theme, all monitors, CPU/RAM every 2 seconds, event-driven audio. The browser JSON editor does not yet configure the native host. CPU uses GetSystemTimes elapsed CPU time and can differ from Task Manager's frequency-adjusted utility. GPU, network, media, tray cloning, native settings/hot reload and autostart are deferred until the core MVP passes its acceptance gates.

## Validate on Windows

`cargo test --manifest-path src-tauri/Cargo.toml` includes native memory and subscription ownership tests. Running the executable with `--probe` writes real CPU/RAM/audio readings and monitor/work-area rectangles to `%TEMP%\strata-native-probe.json`, without opening another bar. Startup geometry is recorded in `%TEMP%\strata-layout.json`. With only the production instance running, `powershell -File scripts/measure-idle.ps1` records the full Strata/WebView2 process tree.

Read [research](docs/yasb-analysis.md), [architecture](docs/architecture.md), [milestones](docs/implementation-plan.md) and [current native validation](docs/native-mvp-validation.md). No comparative YASB performance claim is made.
