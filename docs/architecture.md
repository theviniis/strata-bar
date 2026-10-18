# Architecture decision: Tauri 2, provisional

Implementation update: the native executable now opens actual per-monitor AppBars with CPU, physical RAM and Core Audio integration. Rust/MSVC are installed and native tests run. See `native-mvp-validation.md` for current evidence; earlier toolchain unavailability below describes the initial decision environment. The native MVP fixes sampling at 2000 ms; configurable interval scheduling remains future work.

| Criterion           | Tauri                                                | Electron                                         |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Renderer            | Windows WebView2                                     | Bundled Chromium                                 |
| Host                | Rust commands and events                             | Node main process and IPC/preload                |
| Distribution        | System runtime dependency; smaller potential payload | Bundles browser/runtime for consistency          |
| Windows integration | Rust windows crate / Win32 / COM                     | Native addon or helper for AppBar and metrics    |
| Operational cost    | Rust + MSVC toolchain, WebView2 servicing            | Chromium updates, addon ABI and process overhead |
| Memory/startup      | Candidate; must measure process tree                 | Candidate; must measure equivalent process tree  |

Choose Tauri for the MVP because a small native Windows host fits the requested integration boundary. This is an architectural inference, not a comparative benchmark result. The Windows production executable now compiles successfully with the installed Rust/MSVC toolchain.

Sources: [Tauri architecture](https://v2.tauri.app/concept/architecture/), [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model), [Microsoft AppBars](https://learn.microsoft.com/en-us/windows/win32/shell/application-desktop-toolbars).

## Layers

React feature components → feature hooks → plain JS system adapter → Tauri commands/events → Rust collectors and window host. Browser adapter supplies explicitly labelled demo values. Never fall back to demo values on native failure. Zustand holds latest channel snapshots and configuration, each widget selects only its channel. Local interaction state stays in React.

One native collector per channel across windows; activate only while subscribed. CPU/memory/network need bounded polling (default 2 seconds); volume, focus, media and monitor changes use events. Clock uses local time and a minute boundary. Emit timestamp, sequence, status and data/error. Never transmit COM pointers or HWNDs to UI. Channels have independent errors and unavailable states.

## Bridge contract

`subscribe(channel, listener, { intervalMs }) → Promise<dispose>`; disposal is idempotent and handles cancellation during asynchronous subscription setup. `capabilities() → Promise<Record<channel, boolean>>`; `setVolume({level, muted})`; `configureBar(config)`; `komorebiAction({action, monitor?, workspace?, direction?})`; `overlayShow(request)` / `overlayHide()` for the shared floating surface (see below); later `mediaAction`, `launchApplication(id)` and `powerAction(action)`. Commands validate inputs again natively. Launch only configured application IDs, never arbitrary shell strings. `komorebiAction` spawns only a resolved `komorebic.exe` with a fixed argument allowlist. Power actions need deliberate UI confirmation.

Current native event envelope: `{status:'ready'|'loading'|'error', data, timestamp, error?}`; the event name identifies the channel. Unsupported channels reject subscription. Subscribe returns `{token, initial}` after the listener is installed; a live event takes priority over the initial snapshot. Adapter hides transport. CPU/RAM collection pauses without subscribers and volume callbacks unregister after the final subscriber. One shared worker remains asleep between samples/commands until application exit. The broader proposed API and sequence numbers are future extensions.

## Windows capability map

CPU: GetSystemTimes deltas or PDH (benchmark and document semantics). RAM: GlobalMemoryStatusEx. Network: GetIfTable2 counter deltas with monotonic clock. GPU: DXGI/PDH, optional NVML/ADL temperature. Audio: Core Audio endpoint callbacks and setters. Media: Windows GSMTC WinRT sessions/events. Focus: WinEvent hook/GetWindowTextW. Desktop: documented IVirtualDesktopManager supports window membership, not full desktop enumeration/switching; defer unsupported private COM interfaces. Own tray: Shell_NotifyIcon/Tauri tray; foreign tray hosting is separate and deferred. Monitor: EnumDisplayMonitors/GetMonitorInfo and DPI awareness. Launcher: ShellExecuteEx allowlist. Power: restricted native commands with explicit action validation.

AppBar owner must register callback messages, negotiate rectangle, handle ABN_POSCHANGED, taskbar recreation, DPI and monitor removal, and always ABM_REMOVE on exit. Transparent borderless always-on-top windows alone are insufficient. Reserve workspace opt-in until validated. Popovers may require separate windows to avoid clipping to a 36px host. Mica/acrylic needs OS support checks and fallback CSS.

## Overlay surface (tooltips now, widget popups later)

The AppBar strip is exactly 36px tall, so any `Positioner` output is clipped by WebView2. `src-tauri/src/desktop.rs` therefore owns one shared floating window, labelled `overlay` and titled `Strata overlay`, created in `setup()` via `ensure_overlay` (hidden, 1x1, transparent, focused(false), skip_taskbar, always_on_top) and never destroyed. It is not an AppBar: it never calls `ABM_NEW`/`ABM_SETPOS` and `release_all` only removes reservations for `bar-*` labels.

Rust owns geometry. `overlay_show` accepts a versioned contract (`v`, optional `source`, `kind: tooltip|popover`, `text`, `anchor` in CSS px, measured `size` in CSS px, `side: top|bottom`), re-validates it natively (source must match the invoking `bar-*` window, kind/side are enums, text is bounded to 512 chars, geometry must be finite and at most 1024 CSS px), converts CSS to physical pixels with the reporting bar's scale factor, centers the surface on the anchor and clamps it to the anchor monitor's rectangle. The surface is sized with the arrow allowance included, so its anchored edge stays flush with the bar edge and one `SetWindowPos(HWND_TOPMOST, .., SWP_NOACTIVATE | SWP_SHOWWINDOW)` plus `ShowWindow(SW_SHOWNOACTIVATE)` is the whole show: no resize round trip, no activation, no focus steal, and never `WS_EX_NOACTIVATE` (stale WebView2 mouse capture). `overlay_hide` ignores the caller, is idempotent and emits `overlay:clear` so the next show cannot flash a stale pill. It runs on `pointerleave`/blur/Escape/pointer down, on window blur, on `ABN_FULLSCREENAPP`, on `WM_DPICHANGED`/`WM_DISPLAYCHANGE`, on `reconcile` and on exit.

komorebi exclusion is shared with the bar: `floating_frame_style` strips `WS_CAPTION`/`WS_EX_WINDOWEDGE` and adds `WS_EX_TOOLWINDOW | WS_EX_TOPMOST`, preserved `WS_EX_TRANSPARENT` keeps the surface click-through, and the guard is re-asserted before every show and on `WM_STYLECHANGED` because `tao` re-applies its own styles on visibility changes. `overlay_snapshot()` (in `diagnostics`, `--probe` and `scripts/test-live-geometry.ps1`) reports `present`, `rect`, `visible`, `toolWindow`, `topmost`, `clickThrough` and `komorebiEligible`; the live script fails if a present overlay ever reports `komorebiEligible`.

The frontend half is `?view=overlay`, routed in `src/main.tsx`, which loads `src/overlay/Overlay.tsx`: one `overlay:render` listener, one pill (`TooltipSurface`) sharing the exact pill/arrow classes with the studio tooltip (`src/components/ui/tooltip-classes.ts`), no timers and no subscriptions. `useOverlayTooltip` measures the real pill off-screen with the real classes before calling `overlay_show`, waits 150ms of hover or focus intent, and keeps its hidden `role="tooltip"` span plus `aria-describedby` inside the bar document, because cross-window ARIA association is impossible. The browser studio has no overlay window: `src/services/system/overlay.ts` selects a labelled no-op adapter there.

## komorebi workspace channel

The `komorebi` channel is event-driven, not polled: `src-tauri/src/komorebi.rs` creates a message-mode named pipe (`\\.\pipe\strata-bar-komorebi-<pid>`), spawns `komorebic subscribe-pipe <name>` with a fixed argument list and no shell, and streams newline/concatenated JSON notifications from komorebi. Each notification carries the full komorebi `State`; the watcher keeps the latest parsed copy and projects one payload per subscribed bar window, filtered to that window's monitor via `MonitorFromWindow`. The project step reduces each workspace to `{index, name, status: active|populated|empty, layer, windows}`; only changes are emitted (per-window summary dedup) to bound event volume. A broken pipe sets status `unavailable`, then reconnects after a delay; a missing `komorebic.exe` never rejects subscription and never falls back to demo data. Focus actions (`focus-monitor-workspace`, `cycle-workspace`) are bounds-checked against the cached state before spawning `komorebic`, so the UI can only reach monitors and workspaces komorebi currently reports.

## Configuration and security

JSON schema version 1; unique widget IDs, known feature types, enabled state, update interval, display format, tooltip. Last-known-good config survives invalid edits. Browser persistence uses localStorage with visible errors and storage-event reload. Native target: app config directory, atomic write and debounced directory watch, validate before geometry change. Per-monitor overrides merge with validated defaults. CSP restricts content to bundled resources; no remote executable content or arbitrary user JS in MVP.
