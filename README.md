# Strata

A Windows 11 status bar: native CPU and RAM readings, a local clock, real Core Audio volume/mute controls,
and a reserved top bar on every connected monitor. The native application opens actual bars; the browser
route remains a separate demo studio.

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

Browse <http://127.0.0.1:1420>. The JSON editor validates before saving to localStorage, and other tabs
receive configuration updates. Native file persistence/watch is planned. `pnpm check` validates formatting,
lint, types and tests; `pnpm build` validates the browser bundle.

### Native desktop bars

Requires the desktop prerequisites above.

```sh
pnpm desktop
```

This starts the native bars with development tooling. Close with the × at the right of either bar; this
exits all bars and releases desktop reservations.

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
| `pnpm package:windows` | Build the NSIS installer (`tauri build`).          |
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

# Native tests (CPU accounting, physical RAM, subscription ownership, window geometry)
cargo test --manifest-path src-tauri/Cargo.toml
```

Validate the native bar on Windows:

1. Run the executable with `--probe` to write real CPU/RAM/audio readings and monitor/work-area rectangles
   to `%TEMP%\strata-native-probe.json`, without opening another bar.
2. Startup geometry is recorded in `%TEMP%\strata-layout.json`.
3. With only the production instance running, `powershell -File scripts/measure-idle.ps1` records the full
   Strata/WebView2 process tree.

## Native defaults & current limits

Current native defaults: top, 36 logical pixels, dark theme, all monitors, CPU/RAM every 2 seconds,
event-driven audio.

- The browser JSON editor does not yet configure the native host; native configuration editing, bottom
  placement, light theme, transparency/backdrops and autostart are not part of this increment.
- CPU uses `GetSystemTimes` elapsed CPU time and can differ from Task Manager's frequency-adjusted utility.
- GPU, network, media, tray cloning, native settings/hot reload and autostart are deferred until the core
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
- [milestones](docs/implementation-plan.md) — phased plan and acceptance gates.
- [current native validation](docs/native-mvp-validation.md) — evidence and remaining limits.

No comparative YASB performance claim is made.
