# Project Overview

Strata (`strata-bar`) is a Windows 11 status bar MVP: a native, per-monitor AppBar that shows real CPU and
physical RAM readings, a local clock, and Core Audio volume/mute controls while reserving desktop workspace
on every connected monitor. The native host is a Tauri 2 (Rust) application that owns Win32 AppBar windows;
the same React codebase also serves a browser-based "studio" preview with an explicitly labelled demo
adapter. The MVP gate is the functioning Windows bar—browser-studio polish alone is not MVP success. GPU,
network, media, tray cloning and autostart are deferred until the core acceptance gates pass.

## Repository Structure

- `src/` — React 19 frontend: app shell, feature widgets, hooks, services, Zustand stores and tests.
  - `src/app/` — studio shell (`App.jsx`) and global styles (`styles.css`).
  - `src/components/` — status-bar components (`NativeBar.jsx`, `Widget.jsx`) and shadcn-style `ui/`.
  - `src/features/` — individual widgets: `clock/`, `cpu/`, `memory/`, `volume/`.
  - `src/hooks/` — React hooks such as `useSystemChannel.js`.
  - `src/services/` — transport and config adapters: `system/bridge.js`, `configuration/config.js`.
  - `src/stores/` — Zustand stores, e.g. `config.js`.
  - `src/tests/` — Vitest + Testing Library suites and `setup.js`.
- `src-tauri/` — Rust/Tauri host: `src/main.rs`, `src/desktop.rs` (AppBar host), `src/metrics.rs` (collectors).
- `scripts/` — PowerShell validation helpers: `measure-idle.ps1`, `test-live-geometry.ps1`.
- `docs/` — design notes, plan and recorded evidence (`docs/evidence/`, `docs/performance/`).
- `research/` — **gitignored, read-only** upstream YASB checkout used as reference; never port code from it.
- `.vscode/` — editor settings (Prettier default formatter, format/organise imports on save).
- Root files — `index.html`, `vite.config.js`, `package.json`, `components.json` (shadcn), `.prettierrc`.

## Build & Development Commands

```sh
# Install (README documents `pnpm ci`; verify before relying on it)
pnpm install
# > TODO: confirm the intended install command; `pnpm ci` is not a standard pnpm subcommand.

# Browser studio (http://127.0.0.1:1420)
pnpm dev

# Production frontend build
pnpm build

# Frontend tests (Vitest, run once)
pnpm test

# Native development host (opens real bars; requires Rust/MSVC/WebView2)
pnpm desktop

# NSIS installer
pnpm package:windows

# Standalone executable (no Vite server), then launch src-tauri\target\release\strata-bar.exe
npx tauri build --no-bundle

# Formatting
pnpm format
pnpm format:check

# Native tests (Rust, Windows)
cargo test --manifest-path src-tauri/Cargo.toml

# Native diagnostics
#   <exe> --probe  -> %TEMP%\strata-native-probe.json  (no bar opened)
#   startup geometry -> %TEMP%\strata-layout.json
powershell -File scripts/measure-idle.ps1
powershell -File scripts/test-live-geometry.ps1
```

- Node 22.12+ and pnpm `>=11 <13` are required (enforced via `devEngines`).
- There is no lint script and no type-check script; JSX only, no TypeScript.
  - `> TODO: add ESLint and/or `tsc --noEmit` if static analysis is expected.`
- There is no deploy script beyond the packaging commands above.

## Code Style & Conventions

- Formatting is enforced by Prettier (`.prettierrc`): 2 spaces, no tabs, `printWidth: 80`, single quotes,
  no semicolons, no trailing commas, `arrowParens: "always"`, LF endings. `src-tauri` is ignored.
- Run `pnpm format` before committing; `pnpm format:check` is the gate.
- React components are PascalCase files/functions (`NativeBar.jsx`); hooks are `useXxx` (`useSystemChannel`);
  services and stores use lower-case modules (`bridge.js`, `config.js`).
- Prefer named exports for components/hooks; the app shells use default exports.
- Rust follows `rustfmt` defaults (edition 2021); keep native code inside `src-tauri/src/` modules.
- Imports use the `@/` alias for `src/` where configured; local code uses relative paths.
- Tests are `*.test.js(x)` under `src/tests/`; Rust tests live inline in `src-tauri/src/*.rs` (`#[test]`).
- Commit messages observed in history: `chore: …` / `choreL …` prefixes.
  - `> TODO: add a documented commit-message template (no CONTRIBUTING or `.commitlintrc` exists).`

## Architecture Notes

```mermaid
flowchart TD
  UI[React widgets] --> Hooks[hooks / connect()]
  Hooks --> Bridge[services/system/bridge.js]
  Bridge -->|window.__TAURI_INTERNALS__| Native[Native bridge: invoke + listen]
  Bridge -->|browser| Mock[Demo adapter]
  Native --> Cmd[Tauri commands: subscribe / unsubscribe / set_volume / quit]
  Cmd --> Metrics[metrics.rs collectors: CPU, RAM, Core Audio]
  Cmd --> Desktop[desktop.rs AppBar host]
  Metrics -->|events system:channel| Native
  Desktop --> Bars[Per-monitor AppBar windows]
  Store[Zustand stores] --> UI
  Config[configuration/config.js + Zod] --> Store
```

- Data flow: React feature components render widgets; `connect()` in `bridge.js` wraps a subscription,
  owning async setup/teardown and unmount-before-resolve. The bridge selects the native or demo adapter at
  load based on `window.__TAURI_INTERNALS__`; **native failures must never fall back to demo values.**
- Transport contract: `subscribe(channel, listener, { intervalMs }) -> Promise<dispose>` (idempotent),
  `capabilities() -> Promise<Record<channel, boolean>>`, `setVolume({ level, muted })`, and native
  `configureBar` / future `mediaAction`, `launchApplication`, `powerAction`. Commands re-validate inputs
  natively; only configured application IDs may be launched—never arbitrary shell strings.
- Native event envelope: `{ status: 'ready'|'loading'|'error', data, timestamp, error? }`; the event name
  identifies the channel. Subscribe returns `{ token, initial }` after the listener installs; a live event
  beats the initial snapshot. CPU/RAM polling (fixed 2000 ms in the MVP) pauses with no subscribers; Core
  Audio uses endpoint callbacks and default-device notifications, not polling; the clock aligns to minute
  boundaries. One shared native worker serves all monitors.
- AppBar host (`desktop.rs`): one undecorated, taskbar-hidden window per monitor; `ABM_NEW`/`QUERYPOS`/
  `SETPOS`/`REMOVE` with callback handling, plus Explorer-restart and display/DPI messages. Geometry is
  verified with direct `GetWindowRect` reads. A named per-session mutex prevents duplicate bars. Always call
  `ABM_REMOVE` on exit to release reservations. Never pass COM pointers or HWNDs to the UI.
- State: Zustand holds latest channel snapshots and configuration; each widget selects only its channel so a
  CPU update does not rerender the whole bar. Local interaction state stays in React.

## Testing Strategy

- Unit / component (frontend): Vitest with `jsdom` and Testing Library (`@testing-library/react`,
  `@testing-library/jest-dom`); setup in `src/tests/setup.js`. Run with `pnpm test` (`vitest run`).
  Current suites: `app.test.jsx`, `bridge.test.js`, `config.test.js`, `native-bar.test.jsx`,
  `native-bridge.test.js` (12 tests as last recorded).
- Native unit tests: `cargo test --manifest-path src-tauri/Cargo.toml` (8 tests: CPU accounting, physical
  RAM, channel/interval validation, window ownership, per-monitor cleanup, negative/scaled monitor geometry).
- Integration / e2e: there is no automated e2e harness. Verify natively on Windows using `--probe`,
  `scripts/measure-idle.ps1`, `scripts/test-live-geometry.ps1` and the recorded JSON under `docs/evidence/`
  and `docs/performance/`. Native tests cannot be replaced by mocks.
- CI: no `.github/` workflows exist.
  - `> TODO: add CI to run `pnpm format:check`, `pnpm test` and `cargo test` on Windows runners.`

## Security & Compliance

- Content Security Policy is set in `src-tauri/tauri.conf.json` and restricts content to bundled resources
  (`default-src 'self'`; no remote executable content, no arbitrary user JS in the MVP).
- Capabilities (`src-tauri/capabilities/bars.json`) scope event listen/unlisten to `bar-*` windows only.
- Commands validate inputs again on the native side; power actions require deliberate UI confirmation.
- No secrets are stored in the repository; there is no credentials file or environment secret usage yet.
  - `> TODO: document secrets handling once cloud/weather credentials enter scope.`
- Dependency scanning: `npm audit` was used historically (`docs/validation.md`); no automated scan is wired.
  - `> TODO: add automated dependency scanning (e.g. `pnpm audit` / Dependabot) to CI.`
- Licensing: there is **no root `LICENSE` file** in this repository.
  - `> TODO: add a project license before distribution.`
- `research/yasb` is an MIT-licensed upstream reference (gitignored). Preserve attribution if any code is
  reused; this project currently reimplements patterns independently.

## Agent Guardrails

- Never edit generated or vendored trees: `dist/`, `src-tauri/target/`, `node_modules/`, `.rea-tools/`,
  and the read-only `research/` checkout.
- Do not hand-edit lockfiles (`pnpm-lock.yaml`, `src-tauri/Cargo.lock`); change manifests and regenerate.
- Do not edit the recorded evidence JSON under `docs/evidence/` or `docs/performance/` to make a check pass;
  they are historical measurements. Add new files instead.
- Preserve the invariants: no demo fallback on native failure, `ABM_REMOVE` on exit, CSP and capability
  scoping, and native input re-validation.
- Keep AppBar geometry changes behind direct Win32 rectangle reads; do not trust cached window positions.
- `> TODO: define required reviewer(s) and any per-path CODEOWNERS.`
- `> TODO: define agent rate limits / concurrency limits for this repository.`

## Extensibility Hooks

- Widget registration: add a type to `types` and the Zod schema in `src/services/configuration/config.js`,
  then register its icon/format in the `registry` in `src/components/status-bar/Widget.jsx`.
- Channels: native capability map is returned by the `capabilities` command in `src-tauri/src/main.rs`;
  frontend adapters live in `src/services/system/bridge.js`. Unsupported channels reject subscription.
- Tauri commands: `capabilities`, `subscribe`, `unsubscribe`, `set_volume`, `diagnostics`, `quit`
  (`src-tauri/src/main.rs`); the AppBar host is `desktop::reconcile` / `desktop::release_all`.
- Configuration: JSON schema version 1 with unique widget IDs, `enabled`, `intervalMs`, `format`, `tooltip`,
  plus per-monitor overrides (`monitors`); browser persistence uses localStorage key `strata.config.v1` with
  last-known-good retention. Native atomic write + directory watch is planned.
- Feature flags: the per-widget `enabled` flag and per-channel `capabilities()` booleans are the current
  toggle points (e.g. GPU is reported unavailable).
- Environment variables: none are documented.
  - `> TODO: document any build/dev environment variables (Vite `import.meta.env`, Tauri env) if added.`

## Further Reading

- [docs/architecture.md](docs/architecture.md) — layered design, bridge contract and Windows capability map.
- [docs/implementation-plan.md](docs/implementation-plan.md) — milestones, acceptance gates, measurement protocol.
- [docs/native-mvp-validation.md](docs/native-mvp-validation.md) — current native evidence and remaining limits.
- [docs/validation.md](docs/validation.md) — historical foundation checkpoint (superseded).
- [docs/yasb-analysis.md](docs/yasb-analysis.md) — read-only YASB source investigation and adaptations.
- [docs/evidence/](docs/evidence/) and [docs/performance/](docs/performance/) — recorded validation JSON.
- [README.md](README.md) — high-level develop/validate instructions.
- `> TODO: add ADRs and a docs/ARCH index if architecture decisions multiply.`
