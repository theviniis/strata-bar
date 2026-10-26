# Plan: workspaces widget (komorebi integration)

Status: approved, not started. Owner: unassigned.
Scope decision recorded below; see [MVP gate exception](#mvp-gate-exception).

## Goal

Add a native workspaces widget to the Strata status bar: each
per-monitor AppBar shows that monitor's komorebi workspaces with
active/populated/empty states, clicking a workspace focuses it, and the widget
degrades clearly when komorebi is offline. The widget also appears in the
browser studio preview through the labelled demo adapter.

Reference widget: [YASB Komorebi Workspaces](<https://github.com/amnweb/yasb/wiki/(Widget)-Komorebi-Workspaces>).
Read-only upstream checkout: `research/yasb`, implementation in
`src/core/widgets/komorebi/workspaces.py` and
`src/core/widgets/services/komorebi/{client,event_listener}.py`.

## Decisions

| Question          | Decision                                                             |
| ----------------- | -------------------------------------------------------------------- |
| Widget scope      | MVP without app icons                                                |
| State source      | Named-pipe event subscription (not polling)                          |
| MVP gate          | Approved exception (this phase proceeds before the core gate closes) |
| UI surface        | Native bar plus browser studio preview                               |
| Command transport | Spawn `komorebic.exe` with validated arguments                       |
| komorebi-client   | Not used (avoids the upstream non-commercial license in our build)   |

### MVP widget scope

Included: workspace buttons with `active`/`populated`/`empty` states, click to
focus a workspace, offline label, correct per-monitor filtering, zero-based
index labels. Deferred: per-window app icons (HICON extraction, DPI scaling,
image transport to the WebView), tiling/floating layer toggle, float-override
label, scroll switching, hide-empty/hide-if-offline fine-grained options.

## Upstream protocol grounding

Verified against current komorebi `master` source (July 2026):

- CLI: `komorebic.exe`. Focus: `komorebic focus-monitor-workspace <monitor> <workspace>`
  and `komorebic cycle-workspace next|previous`. Indices are zero-based.
- State: `komorebic state` prints the `State` struct as JSON.
- Events: the consumer creates a named pipe (`\\.\pipe\<name>`) and runs
  `komorebic subscribe-pipe <name>` (alias `subscribe`). komorebi pushes JSON
  lines `{"event":{"type","content"},"state":{...}}`. `Notification.state` is
  the full `State` (not optional) in current `master`.
- Monitor identity: `Monitor.id` is the `HMONITOR`; YASB matches it with
  `MonitorFromWindow` on the bar's own window. Strata can do the same because
  each `bar-*` window lives on one monitor.
- Populated workspace: any of `containers.elements[].windows.elements`,
  `floating_windows.elements`, `monocle_container`, or `maximized_window` is
  non-empty. Active workspace: `workspaces.focused`.
- Broken pipe: reconnect after a short delay (YASB waits ~3 s).

## MVP gate exception

`docs/implementation-plan.md` records that no new widget phase should start
before the core MVP gate (real CPU/RAM/clock/volume, per-monitor reservation,
clean exit, recorded resource measurements) closes. This plan is an explicitly
approved exception. The exception and its risks are recorded here and to be
mirrored into `docs/implementation-plan.md` during implementation.

## Data contract

New native channel `workspaces`, emitted per `bar-*` window and filtered to that
window's monitor:

```json
{
  "status": "ready|loading|unavailable|error",
  "timestamp": 0,
  "data": {
    "monitor": 0,
    "floatOverride": false,
    "workspaces": [
      {
        "index": 0,
        "name": null,
        "status": "active|populated|empty",
        "layer": "Tiling|Floating",
        "windows": 0
      }
    ]
  }
}
```

- `active` when the index equals `workspaces.focused`; otherwise `populated`
  when the workspace has windows; otherwise `empty`.
- `unavailable` when `komorebic.exe` is not resolvable or komorebi is offline
  (pipe down). The widget shows the offline label.
- `windows`, `layer`, and `floatOverride` are included now (cheap) for future
  use; the MVP UI may ignore them.

### Write command

`workspaces_action`, validated on the native side:

- `{ "action": "focusWorkspace", "monitor": <usize>, "workspace": <usize> }`
  → `komorebic focus-monitor-workspace <monitor> <workspace>`
- `{ "action": "cycleWorkspace", "direction": "next" | "previous" }`
  → `komorebic cycle-workspace <direction>`

Indices are validated against the cached `State` bounds; `direction` accepts
only the two literals; spawn uses `CREATE_NO_WINDOW`. Never a shell string or
arbitrary argument.

## Backend plan

### `src-tauri/src/workspaces.rs` (new)

Mirrors the shape of `metrics.rs` (`Arc<Mutex<Data>>` plus an `mpsc` request
channel and a dedicated thread).

- Tolerant parse types with `#[serde(default)]`: `Ring<T> { elements, focused }`,
  `Win { hwnd }`, `Container { windows }`,
  `Workspace { name, containers, monocle_container, maximized_window, floating_windows, layer }`,
  `MonitorState { id, workspaces }`, `State { monitors, float_override }`.
- Pure projection: `project(state, monitor_id) -> Option<Value>` returning the
  per-monitor payload, or `None` when no bar maps to that monitor.
- Watcher thread: create `\\.\pipe\strata-bar-workspaces`, run
  `komorebic subscribe-pipe <name>`, `ConnectNamedPipe` then a
  `ReadFile`/`PeekNamedPipe` loop; parse each notification; cache the latest
  `State`; reconnect on `ERROR_BROKEN_PIPE`; on disconnect emit `unavailable`
  to all subscribers.
- Per-monitor filtering: on `subscribe("workspaces", window)` resolve
  `MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)` from `window.hwnd()` and
  store it with the subscription.
- Dedup: compare the serialized per-window summary and only emit
  `system:workspaces` when it changes (komorebi notifies on every window event).
- `komorebic.exe` discovery: resolve on `PATH` + `PATHEXT` at start (small local
  resolver; alternative is the `which` crate).
- `probe()` for evidence: whether `komorebic` was resolved plus a state parse.

### `src-tauri/Cargo.toml`

Add `Win32_System_Pipes` and `Win32_Storage_FileSystem` features to the
`windows` crate. No new runtime dependencies.

### `src-tauri/src/main.rs`

- `mod workspaces;` and `app.manage(workspaces::Workspaces::start(handle))` in `setup`.
- `capabilities()` takes `State<Workspaces>` and reports
  `"workspaces": <resolved?>`.
- `subscribe`/`unsubscribe` route by channel; workspaces tokens use a prefix
  (`w<n>`) so they cannot collide with the numeric `metrics` tokens. The
  workspaces path ignores `interval_ms`.
- Register `workspaces_action` in `generate_handler!`.
- `on_window_event::Destroyed` also calls `workspaces.remove_window(label)`;
  `RunEvent::Exit` calls `workspaces.stop()`.
- `--probe` includes `workspaces::probe()`.

## Frontend plan

- `src/services/system/bridge.ts`: add `'workspaces'` to `Channel`; add
  `WorkspacesData` and `ChannelData.workspaces`; add a static
  `DemoChannelData.workspaces` for the studio preview (this is the first
  non-scalar demo payload, which is unavoidable for a workspace strip); add
  `workspacesAction(...)` to the native adapter and a no-op on the demo adapter.
- `src/features/workspaces/WorkspacesWidget.tsx`: consume `useSystemChannel('workspaces')`
  and render the workspace strip; clicking calls
  `bridge.workspacesAction({ action: 'focusWorkspace', monitor, workspace })`.
- Shared presentational component with a normalized view-model, reused by the
  native bar and the studio preview.
- `src/components/status-bar/Widget.tsx`: add the `meta` entry/icon and a
  dedicated render branch (like `Clock`), with a demo preview.
- `src/services/configuration/config.ts`: add `'workspaces'` to `types` and to the
  default config.
- States: `ready` renders buttons; `unavailable` renders the offline label;
  `loading` renders a placeholder.

## Tests

- Rust (pure, no komorebi installed): projection (active/populated/empty,
  monitor without a bar returns `None`), `workspaces_action` validation, token
  routing, rejection of an unsupported channel.
- Vitest: `workspacesAction` invokes `workspaces_action` with the expected args
  (extend `src/tests/native-bridge.test.ts`); component render and click test;
  `src/tests/config.test.ts` accepts the new widget type.
- Native validation (not replaceable by mocks, per repository rules): `--probe`
  workspaces section written to a new `docs/evidence/` file; live checks for
  click-to-focus, multi-monitor, komorebi restart while running
  (offline → online), and komorebic absent.

## Docs and AGENTS

- `docs/architecture.md`: document the workspaces channel, named-pipe
  subscription, and per-monitor filtering.
- `docs/implementation-plan.md`: record the approved exception.
- `AGENTS.md`: new channel and command, `capabilities`, security note
  (restricted `komorebic` spawn), and extensibility note.
- This file remains the working plan of record for the phase.

## Risks and mitigations

| Risk                                   | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| komorebi tiles the Strata bar itself   | **Realised and fixed.** `tao` always creates top-level windows with `WS_CAPTION \| WS_EX_WINDOWEDGE` even when `decorations(false)`, and komorebi's `window_is_eligible` manages exactly those windows; `skip_taskbar` only calls `ITaskbarList::DeleteTab`. `desktop.rs::bar_frame_style` now strips the frame styles and adds `WS_EX_TOOLWINDOW \| WS_EX_TOPMOST`, re-asserted in `position()` and on `WM_STYLECHANGED`. `WS_EX_NOACTIVATE` is deliberately avoided (WebView2 stale-capture/focus bug), `bar_snapshot` reports `komorebiEligible`, and `scripts/test-live-geometry.ps1` fails if it is ever true again. |
| `HMONITOR` comparison across processes | Same technique as YASB; validate on multi-monitor and mixed DPI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| High event volume from komorebi        | Per-window summary dedup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `komorebic` not on `PATH`              | Capability `false`, status `unavailable`; MVP supports `PATH` only, configurable override later                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| No komorebi in the dev environment     | Pure tests cover logic; live evidence depends on a machine running komorebi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Milestones and tasks

- [x] M1 Contract and scaffolding: `workspaces.rs` parse types, pure projection,
      unit tests.
- [x] M2 Transport: pipe watcher, reconnect, per-monitor filtering, dedup,
      routing in `main.rs`, `workspaces_action`, `capabilities`, `probe`.
- [x] M3 Frontend: bridge channel and adapter, feature component, `NativeBar`
      integration, studio preview, config type.
- [x] M4a Test, type and lint gates: native `cargo test` green (12 tests) and
      `eslint .`, `tsc -b`, `vitest run` green (17 tests).
- [ ] M4b `pnpm check` prettier gate: still fails on 30 pre-existing, tracked
      shadcn files under the literal `@/components/ui/` directory (a repository
      artifact, not introduced here). Every file touched in this phase passes
      `prettier --check`.
- [x] M5a Docs: `docs/architecture.md`, `docs/implementation-plan.md` and
      `AGENTS.md` updated.
- [ ] M5b Native evidence: `--probe` workspaces output, bar-style check with
      komorebi running (`komorebiEligible: false`, `toolWindow`, `topmost`), and
      live checks (click-to-focus, offline → online) under `docs/evidence/`,
      pending a machine running komorebi.

## Out of scope

- App icons per workspace.
- Tiling/floating layer toggle, float-override label, scroll switching.
- `komorebi-client` crate or any direct UDS socket usage.
- Automatic installation of komorebi ignore/workspace rules.
