# Project Overview

Strata (`strata-bar`) is a Windows 11 status bar MVP: a native, per-monitor AppBar that shows real CPU and
physical RAM readings, a local clock, Core Audio volume/mute controls and a workspaces viewer while
reserving desktop workspace on every connected monitor. The native host is a Tauri 2 (Rust) application that
owns Win32 AppBar windows; the same React codebase also serves a browser-based "studio" preview with an
explicitly labelled demo adapter. The MVP gate is the functioning Windows bar—browser-studio polish alone is
not MVP success. Network, media, tray cloning and autostart are deferred until the core acceptance gates
pass; the workspaces and GPU widgets are recorded exceptions (`docs/plans/workspaces.md`,
`docs/plans/gpu-popup.md`).

## Repository Structure

- `src/` — React 19 frontend: app shell, feature widgets, hooks, services, Zustand stores and tests.
  - `src/app/` — studio shell (`App.tsx`) and global styles (`styles.css`).
  - `src/components/` — status-bar components (`NativeBar.tsx`, `Widget.tsx`) and shadcn-style `ui/`.
  - `src/features/` — individual widgets: `clock/`, `cpu/`, `disk/`, `gpu/`, `memory/`, `volume/`, `workspaces/`.
  - `src/hooks/` — React hooks such as `useSystemChannel.ts` and `useOverlayTooltip.ts`.
  - `src/overlay/` — the shared floating surface: `Overlay.tsx` (`?view=overlay`), `TooltipSurface.tsx`
    and the off-screen `measure.ts` probe.
  - `src/services/` — transport and config adapters: `system/bridge.ts`, `system/overlay.ts`,
    `configuration/config.ts`.
  - `src/stores/` — Zustand stores, e.g. `config.ts`.
  - `src/tests/` — Vitest + Testing Library suites and `setup.ts`.
- `src-tauri/` - Rust/Tauri host: AppBar windows, audio and bridge contracts.
  `src/sensors.rs` consumes the installed sensor service on a separate IPC thread.
- `sensor-service/` - C#/.NET 10 Windows service with pinned LibreHardwareMonitorLib;
  CPU/GPU/RAM readings and Windows complements for topology, cache, paging and volumes.
- `scripts/` — PowerShell validation helpers: `measure-idle.ps1`, `test-live-geometry.ps1`.
- `docs/` — design notes, plan and recorded evidence (`docs/evidence/`, `docs/performance/`).
- `research/` — **gitignored, read-only** upstream YASB checkout used as reference; never port code from it.
- `.vscode/` — editor settings (Prettier default formatter, format/organise imports on save).
- Root files — `index.html`, `vite.config.ts`, `tsconfig.json` (+ `tsconfig.app.json`, `tsconfig.node.json`),
  `eslint.config.js`, `package.json`, `components.json` (shadcn), `.prettierrc`.

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

# Static analysis (ESLint + TypeScript, no emit)
pnpm lint
pnpm typecheck

# Full gate: Prettier + ESLint + tsc + Vitest
pnpm check

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
- TypeScript is strict: `tsconfig.json` is a solution file referencing `tsconfig.app.json` (`src/`) and
  `tsconfig.node.json` (`vite.config.ts`). ESLint 10 + `typescript-eslint` covers `src/`; Prettier remains the
  only formatter and `eslint-config-prettier` disables every conflicting rule.
- `pnpm check` is the aggregate gate: `prettier --check .`, `eslint .`, `tsc -b` and `vitest run`.
- There is no deploy script beyond the packaging commands above.

## Code Style & Conventions

- Formatting is enforced by Prettier (`.prettierrc`): 2 spaces, no tabs, `printWidth: 80`, single quotes,
  no semicolons, no trailing commas, `arrowParens: "always"`, LF endings. `src-tauri/` and the generated
  `pnpm-lock.yaml` are listed in `.prettierignore`.
- Run `pnpm format` before committing; `pnpm format:check` is the gate.
- Styling is Tailwind utilities (v4, via `@tailwindcss/vite` and `@import 'tailwindcss'`).
  `src/app/styles.css` is the only stylesheet and holds Tailwind configuration only (`@theme` tokens) plus the
  `:has(.native-bar)` reset that lets the native AppBar own its window. Component and widget styling lives in
  `className` strings — do not add per-component `.css` files or shell selectors.
- Theme: `<main data-theme={dark|light}>` is the `group` root; light-mode overrides use
  `group-data-[theme=light]:` utilities.
- React components are PascalCase files/functions (`NativeBar.tsx`); hooks are `useXxx` (`useSystemChannel`);
  services and stores use lower-case modules (`bridge.ts`, `config.ts`).
- Types are derived, never duplicated by hand: the config model comes from `z.infer` on the Zod schema and
  channel payloads come from the bridge contract (`ChannelData`). Type-only imports use `import type`.
- Prefer named exports for components/hooks; the app shells use default exports.
- Rust follows `rustfmt` defaults (edition 2021); keep native code inside `src-tauri/src/` modules.
- Imports use the `@/` alias for `src/` (resolved by the Vite alias and `tsconfig` `paths`); local code uses
  relative paths without file extensions.
- Tests are `*.test.ts(x)` under `src/tests/` and are type-checked by the app project; Rust tests live inline
  in `src-tauri/src/*.rs` (`#[test]`).
- Commit messages observed in history: `chore: …` / `choreL …` prefixes.
  - `> TODO: add a documented commit-message template (no CONTRIBUTING or `.commitlintrc` exists).`

## Architecture Notes

```mermaid
flowchart TD
  UI[React widgets] --> Hooks[hooks / connect()]
  Hooks --> Bridge[services/system/bridge.ts]
  Hooks --> Tooltip[useOverlayTooltip -> services/system/overlay.ts]
  Bridge -->|window.__TAURI_INTERNALS__| Native[Native bridge: invoke + listen]
  Bridge -->|browser| Mock[Demo adapter]
  Tooltip -->|browser| Noop[Demo adapter: no-op]
  Native --> Cmd[Tauri commands: subscribe / unsubscribe / set_volume / workspaces_action / overlay_show / overlay_hide / quit]
  Cmd --> Metrics[metrics.rs transport and Core Audio]
  Metrics --> SensorClient[sensors.rs cache and IPC thread]
  SensorClient --> SensorService[C# service: LHM and Windows complements]
  Cmd --> Desktop[desktop.rs AppBar host]
  Cmd --> Surface[desktop.rs overlay surface]
  Metrics -->|events system:channel| Native
  Desktop --> Bars[Per-monitor AppBar windows]
  Surface -->|events overlay:render / overlay:clear| OverlayView["?view=overlay (src/overlay)"]
  Store[Zustand stores] --> UI
  Config[configuration/config.ts + Zod] --> Store
```

- Data flow: React feature components render widgets; `connect()` in `bridge.ts` wraps a subscription,
  owning async setup/teardown and unmount-before-resolve. The bridge selects the native or demo adapter at
  load based on `window.__TAURI_INTERNALS__`; **native failures must never fall back to demo values.**
- Transport contract: `subscribe(channel, listener, { intervalMs }) -> Promise<dispose>` (idempotent),
  `capabilities() -> Promise<Record<channel, boolean>>`, `setVolume({ level, muted })`,
  `workspacesAction({ action, monitor?, workspace?, direction? })`, `overlayShow(request)` /
  `overlayHide()` for the shared floating surface, and native `configureBar` / future
  `mediaAction`, `launchApplication`, `powerAction`. Commands re-validate inputs natively; only configured
  application IDs may be launched—never arbitrary shell strings—and `workspacesAction` spawns only a resolved
  `komorebic.exe` with a fixed argument allowlist. The native payload map (`ChannelData`) and the studio's
  demo scalars (`DemoChannelData`) are separate types: feature widgets read the native map, and only the
  browser studio reads the demo one (its `workspaces` entry is the one non-scalar preview value).
- Native event envelope: `{ status: 'ready'|'loading'|'error', data, timestamp, error? }`; the event name
  identifies the channel. Subscribe returns `{ token, initial }` after the listener installs; a live event
  beats the initial snapshot. CPU/GPU/RAM/disk snapshots come from the installed sensor service; its 2000 ms collection pauses with no subscribers; Core
  Audio uses endpoint callbacks and default-device notifications, not polling; the clock aligns to minute
  boundaries; komorebi streams named-pipe notifications (no polling, `intervalMs` ignored) and projects one
  payload per bar window filtered to that window's monitor. One audio/transport worker and a separate sensor-pipe client serve all monitors; one machine-wide sensor service serves all sessions.
- AppBar host (`desktop.rs`): one undecorated, taskbar-hidden window per monitor; `ABM_NEW`/`QUERYPOS`/
  `SETPOS`/`REMOVE` with callback handling, plus Explorer-restart and display/DPI messages. Geometry is
  verified with direct `GetWindowRect` reads. A named per-session mutex prevents duplicate bars. Always call
  `ABM_REMOVE` on exit to release reservations. Never pass COM pointers or HWNDs to the UI. `floating_frame_style`
  (shared by the bar and the overlay) strips `WS_CAPTION`/`WS_EX_WINDOWEDGE` and adds
  `WS_EX_TOOLWINDOW`/`WS_EX_TOPMOST` so tilers such as
  komorebi (whose `window_is_eligible` requires `WS_CAPTION && WS_EX_WINDOWEDGE`) never manage a floating
  window; it is re-asserted in `position()`, on every overlay show and on `WM_STYLECHANGED` because `tao`
  re-applies its own styles on visibility changes. Do **not** add `WS_EX_NOACTIVATE` to a WebView2 host
  (stale mouse capture / focus-state bugs).
- Overlay surface (`desktop.rs` + `src/overlay/`): a single transparent, click-through, topmost `overlay`
  window is created once in `setup()` and reused for tooltips (and future widget popups). It is never an
  AppBar, never focused, and every new floating window must go through `floating_frame_style`. Rust owns
  placement from the reporting `bar-*` rectangle (`overlay_show` re-validates the versioned request, converts
  CSS px to physical px with the bar's scale factor, clamps to the anchor monitor); the bar measures the pill
  off-screen first and the JS side just reports an anchor plus a size through `useOverlayTooltip`
  (150 ms intent, hidden `role="tooltip"` span for `aria-describedby`). The overlay view is `?view=overlay`
  and shares its pill classes with the studio tooltip via `src/components/ui/tooltip-classes.ts`. Only
  `bar-*` windows may show the overlay; `overlay_hide` is idempotent and also runs on window blur, Escape,
  `ABN_FULLSCREENAPP`, DPI/monitor changes, reconcile and exit.
- State: Zustand holds latest channel snapshots and configuration; each widget selects only its channel so a
  CPU update does not rerender the whole bar. Local interaction state stays in React.

## Testing Strategy

- Unit / component (frontend): Vitest with `jsdom` and Testing Library (`@testing-library/react`,
  `@testing-library/jest-dom`); setup in `src/tests/setup.ts`. Run with `pnpm test` (`vitest run`).
  Current suites: `app.test.tsx`, `bridge.test.ts`, `config.test.ts`, `cpu-bridge.test.ts`, `cpu-popup.test.tsx`,
  `cpu-temperature-sampling.test.tsx`, `disk-bridge.test.ts`, `disk-popup.test.tsx`, `disk-widget.test.tsx`,
  `gpu-bridge.test.ts`,
  `gpu-popup.test.tsx`, `workspaces.test.tsx`,
  `memory-bridge.test.ts`, `memory-popup.test.tsx`, `native-bar.test.tsx`, `native-bridge.test.ts`,
  `overlay.test.tsx`, `overlay-render.test.tsx`, `popup-animation.test.tsx`, `popup-definition.test.ts`,
  `popover.test.tsx`, `resource-graph.test.tsx`, `widget-hover.test.tsx`, `widget-popup.test.tsx`
  (117 tests; seven failures in `audio-outputs.test.tsx`, `widget-popup.test.tsx` and
  `resource-graph.test.tsx` pre-date the GPU work and must be fixed).
- Native unit tests: `cargo test --manifest-path src-tauri/Cargo.toml`; sensor cache tests cover
  bounded frames, atomic validation, freshness, independent failures and identity resets.
- Sensor service: `dotnet test sensor-service/Strata.SensorService.Tests`; requires the .NET 10 SDK.
  Tests include pinned LHM cache behavior and real local named-pipe lifecycle without elevation.
- Integration / e2e: there is no automated e2e harness. Verify natively on Windows using `--probe`,
  `scripts/measure-idle.ps1`, `scripts/test-live-geometry.ps1` (which also fails when a visible overlay ever
  reports `komorebiEligible`) and the recorded JSON under `docs/evidence/`
  and `docs/performance/`. Native tests cannot be replaced by mocks.
- CI: no `.github/` workflows exist.
  - `> TODO: add CI to run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` on Windows runners.`

## Security & Compliance

- Content Security Policy is set in `src-tauri/tauri.conf.json` and restricts content to bundled resources
  (`default-src 'self'`; no remote executable content, no arbitrary user JS in the MVP).
- Capabilities (`src-tauri/capabilities/bars.json`) scope event listen/unlisten to the `bar-*` and `overlay`
  windows only.
- Commands validate inputs again on the native side; power actions require deliberate UI confirmation.
  `workspaces_action` accepts only `focusWorkspace`/`cycleWorkspace`, bounds-checks monitor and workspace
  against the last komorebi state, and spawns a resolved `komorebic.exe` with a fixed argument allowlist (no shell,
  no arbitrary strings).
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
- Any new floating window must go through `floating_frame_style` (komorebi exclusion) and must never be shown
  with `WS_EX_NOACTIVATE`; `overlay_hide` stays idempotent so no policy can strand a ghost window.
- `> TODO: define required reviewer(s) and any per-path CODEOWNERS.`
- `> TODO: define agent rate limits / concurrency limits for this repository.`

## Extensibility Hooks

- Widget registration: add a type to `types` and the Zod schema in `src/services/configuration/config.ts`,
  then register its icon/label in `meta` and its formatter in `formatters` in
  `src/components/status-bar/Widget.tsx`. Widgets that need custom rendering (`clock`, `workspaces`, `disk`)
  branch before the formatter path in `Widget.tsx` and ship a feature component under `src/features/<name>/`.
- Channels: native capability map is returned by the `capabilities` command in `src-tauri/src/main.rs`;
  frontend adapters live in `src/services/system/bridge.ts`. Unsupported channels reject subscription;
  `workspaces` is reported by capability and, when komorebi or `komorebic.exe` is absent, subscribes to a
  streamed `unavailable` status instead of rejecting. Hardware channels consume the installed LHM service; unsupported sensors are independently
  `unavailable`, and an absent/stale service never falls back to demo or another collector.
  `volume`/`microphone` can be routed through Voicemeeter (Banana/Potato) instead of the Windows default
  endpoints: `set_channel_source` sends the configured strip/bus per widget, the shared worker owns the
  routing globally per channel (last write wins) and a routed channel publishes `unavailable` when the
  Voicemeeter DLL or the application is absent — it never falls back to Windows or demo values. Level is
  linear 0-100% over the -60..+12 dB slider range; the device popups keep switching Windows endpoints.
  See `docs/plans/voicemeeter-audio.md`.
- Tauri commands: `capabilities`, `subscribe`, `unsubscribe`, `set_volume`, `set_channel_source`,
  `workspaces_action`, `overlay_show`,
  `overlay_hide`, `diagnostics`, `quit` (`src-tauri/src/main.rs`); the AppBar host is `desktop::reconcile` /
  `desktop::release_all`, the shared floating surface is `desktop::ensure_overlay` / `desktop::overlay_show` /
  `desktop::overlay_hide` (probe via `desktop::overlay_snapshot`), the
  workspaces named-pipe watcher is `workspaces::Workspaces::start` (probe via `workspaces::probe`), and the
  Voicemeeter remote session is `voicemeeter::Client::native()` (owned by the metrics worker thread).
- Configuration: JSON schema version 1 with unique widget IDs, `enabled`, `intervalMs`, `format`, `tooltip`,
  per-widget `audio` routing (`source: windows|voicemeeter` with `target {kind,index}` — required when
  `source=voicemeeter`), plus per-monitor overrides (`monitors`); browser persistence uses localStorage key
  `strata.config.v1` with last-known-good retention. Native atomic write + directory watch is planned.
- Feature flags: the per-widget `enabled` flag and per-channel `capabilities()` booleans are the current
  toggle points (e.g. network is reported unavailable).
- Environment variables: none are documented.
  - `> TODO: document any build/dev environment variables (Vite `import.meta.env`, Tauri env) if added.`

## Further Reading

- [docs/architecture.md](docs/architecture.md) — layered design, bridge contract, overlay surface and Windows capability map.
- [docs/implementation-plan.md](docs/implementation-plan.md) — milestones, acceptance gates, measurement protocol.
- [docs/plans/overlay-window.md](docs/plans/overlay-window.md) — overlay window plan of record (tooltips now, widget popups later).
- [docs/plans/gpu-popup.md](docs/plans/gpu-popup.md) — GPU channel/widget/popup plan of record and its recorded gate exception.
- [docs/plans/voicemeeter-audio.md](docs/plans/voicemeeter-audio.md) — Voicemeeter routing for the volume/microphone widgets.
- [docs/native-mvp-validation.md](docs/native-mvp-validation.md) — current native evidence and remaining limits.
- [docs/validation.md](docs/validation.md) — historical foundation checkpoint (superseded).
- [docs/yasb-analysis.md](docs/yasb-analysis.md) — read-only YASB source investigation and adaptations.
- [docs/evidence/](docs/evidence/) and [docs/performance/](docs/performance/) — recorded validation JSON.
- [README.md](README.md) — high-level develop/validate instructions.
- `> TODO: add ADRs and a docs/ARCH index if architecture decisions multiply.`

## Sensor service changes

For sensor selection, IPC, driver packaging, installer lifecycle or hardware validation, read
`docs/plans/lhm-sensors.md`. Keep the bar unelevated, the pipe read-only and SCM-verified,
and the driver signed. Record runtime evidence separately from tests; installation/rollback
and unsupported hardware need their own acceptance runs. Build tools own
`sensor-service/**/bin`, `obj` and `artifacts`.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues (theviniis/strata-bar) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label triage vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
