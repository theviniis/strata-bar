# Strata

A Windows 11 status bar: native CPU, GPU and RAM readings, a local clock, real Core Audio volume/mute
controls, and a reserved top bar on every connected monitor. The native application opens actual bars; the
browser route remains a separate demo studio.

- **Native host** — Tauri 2 (Rust) app that owns per-monitor Win32 AppBar windows.
- **Frontend** — React 19 + TypeScript (strict) + Vite 7 + Tailwind 4, shared between the native bars and the
  browser studio.
- **Demo studio** — browser-only preview with an explicitly labelled demo adapter (no system access).

> New here, or an automated agent? Read [AGENTS.md](AGENTS.md) for architecture, conventions and guardrails.

## Requirements

| Tool           | Version / notes                                   |
| -------------- | ------------------------------------------------- |
| Node.js        | 22.12+                                            |
| pnpm           | `>=11 <13` (enforced via `devEngines`)            |
| Rust (desktop) | stable toolchain                                  |
| MSVC (desktop) | C++ build tools with the Windows SDK and WebView2 |

Desktop prerequisites follow the official
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust stable, MSVC C++ build tools with the
Windows SDK, and WebView2).

## Getting started

```sh
# Install dependencies
pnpm install
```

### Browser studio

```sh
pnpm dev
```

Browse <http://127.0.0.1:1420> for a labelled, display-only demo preview. The studio has no appearance, widget-layout or JSON editor. Any retained browser configuration in `localStorage` (`strata.config.v1`) belongs only to the browser demo and cannot configure native bars. `pnpm check` validates formatting, lint, types and tests; `pnpm build` validates the browser bundle.

### Native desktop bars

Requires the desktop prerequisites above.

```sh
pnpm desktop
```

This starts the native bars with development tooling. Close with the × at the right of either bar; this
exits all bars and releases desktop reservations.

Open **Settings** from the Windows tray to edit the native configuration. Its visual controls and JSON
tab share one draft; **Apply** validates and atomically saves `config.json` in the Tauri app configuration
directory. The native store publishes configuration snapshots to the bars, overlay and settings window.
Invalid edits or failed saves retain the last good configuration. Browser storage never enters this path.

The recorded [configuration acceptance run](docs/evidence/config-acceptance-issue12-2026-10-22.json)
includes a settings Apply observed on both real monitors, invalid-draft rejection and restoration of the
original configuration. The legacy geometry script failed its topmost check during this run; see the
record for the exact observation. It is not a claim that all native geometry gates passed.

## Scripts

| Command                | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `pnpm install`         | Install dependencies.                              |
| `pnpm dev`             | Run the browser studio at `http://127.0.0.1:1420`. |
| `pnpm build`           | Production frontend build (Vite).                  |
| `pnpm test`            | Run frontend tests once (Vitest).                  |
| `pnpm lint`            | Lint `src/` with ESLint.                           |
| `pnpm lint:fix`        | Apply ESLint fixes.                                |
| `pnpm typecheck`       | Type-check with `tsc -b` (no emit).                |
| `pnpm check`           | Full gate: format, lint, types and tests.          |
| `pnpm desktop`         | Run the native Tauri host with dev tooling.        |
| `pnpm package:windows` | Build the complete offline NSIS installer.         |
| `pnpm format`          | Format with Prettier.                              |
| `pnpm format:check`    | Check formatting without writing.                  |

## Building & packaging

Build a standalone production executable that embeds the UI and requires no Vite server:

```sh
npx tauri build --no-bundle
```

Then launch `src-tauri\target\release\strata-bar.exe`.

To target an NSIS installer instead, run `pnpm package:windows`. Installer testing and signing remain
separate release gates.

## Testing & validation

```sh
# Frontend tests (Vitest, jsdom + Testing Library)
pnpm test

# Native tests (CPU accounting, physical RAM, GPU collector, subscription ownership, window geometry)
cargo test --manifest-path src-tauri/Cargo.toml
```

Validate the native bar on Windows:

1. Run the executable with `--probe` to write real CPU/GPU/RAM/audio readings and monitor/work-area rectangles
   to `%TEMP%\strata-native-probe.json`, without opening another bar.
2. Startup geometry is recorded in `%TEMP%\strata-layout.json`.
3. With only the production instance running, `powershell -File scripts/measure-idle.ps1` records the full
   Strata/WebView2 process tree.

## Native defaults & current limits

Current native defaults: top, 36 logical pixels, dark theme, all monitors, CPU/GPU/RAM every 2 seconds,
event-driven audio.

- Native Settings edits content configuration, including theme and widget layout. Native geometry changes
  (height, position and always-on-top), transparency/backdrops and autostart remain separate follow-ups.
- CPU, GPU and RAM use the bundled LibreHardwareMonitorLib service; Windows APIs
  complement topology, cache, paging and mounted volumes. Missing sensors remain
  unavailable. MSI Afterburner and the Libre Hardware Monitor GUI are not required.
- The x64 NSIS installer includes .NET 10, the service and signed PawnIO driver,
  plus an offline WebView2 installer. Installation requires UAC; the bar stays
  unelevated. The standalone bar executable needs the installed service.
- Building the desktop package requires the **.NET 10 SDK** in addition to Rust,
  Node and pnpm. `pnpm package:windows` stages the self-contained service and
  verifies the pinned driver before packaging. Build-time downloads are required
  on the first build; installed sensors perform no downloads.
- Service tests: `dotnet test sensor-service/Strata.SensorService.Tests`.
  Build the service alone with `powershell -File scripts/build-sensors.ps1`.
  See [sensor architecture and validation](docs/plans/lhm-sensors.md) for
  development, diagnostics, upgrade/rollback and remaining acceptance gates.
- Music ships under the authorized [media exception](docs/plans/music-widget.md), with GSMTC playback, application volume and an independent Spotify account connection.
- Network, tray cloning and autostart are deferred until the core
  MVP passes its acceptance gates.

## Project layout

| Path         | Contents                                                              |
| ------------ | --------------------------------------------------------------------- |
| `src/`       | React frontend: app shell, widgets, hooks, services, stores, tests.   |
| `src-tauri/` | Rust/Tauri host: `main.rs`, `desktop.rs` (AppBar host), `metrics.rs`. |
| `scripts/`   | PowerShell validation helpers.                                        |
| `docs/`      | Design notes, plan and recorded evidence.                             |
| `research/`  | Gitignored, read-only upstream YASB reference checkout.               |

## Documentation

- [AGENTS.md](AGENTS.md) — architecture, conventions and agent guardrails.
- [research](docs/yasb-analysis.md) — read-only YASB source investigation.
- [architecture](docs/architecture.md) — layered design and bridge contract.
- [music widget and API](docs/plans/music-widget.md) — media contract, Spotify setup and validation limits.
- [widget popups](docs/popups.md) — reusable API, registration, studio simulation and native checks.
- [milestones](docs/implementation-plan.md) — phased plan and acceptance gates.
- [current native validation](docs/native-mvp-validation.md) — evidence and remaining limits.

No comparative YASB performance claim is made.

## Storybook

```sh
pnpm storybook        # isolated widget visuals at http://localhost:6006
pnpm build-storybook  # static output in storybook-static/ (ignored)
```

The Storybook Vite configuration is independent of the native application's
port and generation plugins. Its theme toolbar selects light or dark using the
same global Tailwind styles and Geist font as the application.

Add `*.stories.tsx` beside a feature. Import its props-driven visual, use typed,
deterministic fixtures and `fn` from `storybook/test` for callbacks. Stories must
not import controllers, connect stores or start native subscriptions. For
interactive controls, put state in a small story parent and pass values and
callbacks to the visual. Render popup visuals inside a themed `Card` of the
appropriate width without the native overlay host.

CPU is the first migrated reference: `Cpu` / `CpuPopup` are visuals;
`CpuController` / `CpuPopupController` own runtime integration. The remaining
migration is tracked in [.docs/plans/widgets-controlled-by-props.md](.docs/plans/widgets-controlled-by-props.md).
Storybook does not replace Windows AppBar, focus, audio or overlay validation.
