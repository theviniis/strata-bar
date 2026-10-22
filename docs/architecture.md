# Architecture decision: Tauri 2, provisional

Implementation update: the native executable now opens actual per-monitor AppBars with CPU, physical RAM, GPU and Core Audio integration. Rust/MSVC are installed and native tests run. See `native-mvp-validation.md` for current evidence; earlier toolchain unavailability below describes the initial decision environment. Polling channels use configured subscription intervals (default 2000 ms); event-driven channels retain their own scheduling.

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

One native collector per channel across windows; activate only while subscribed. CPU/memory/GPU/disk/network need bounded polling (default 2 seconds); volume, focus, media and monitor changes use events. Clock uses local time and a minute boundary. Emit timestamp, sequence, status and data/error. Never transmit COM pointers or HWNDs to UI. Channels have independent errors and unavailable states.

## Bridge contract

`subscribe(channel, listener, { intervalMs }) → Promise<dispose>`; disposal is idempotent and handles cancellation during asynchronous subscription setup. `capabilities() → Promise<Record<channel, boolean>>`; `setVolume({level, muted})`; `configureBar(config)`; `komorebiAction({action, monitor?, workspace?, direction?})`; `overlayShow(request)` / `overlayHide()` for the shared floating surface (see below); later `mediaAction`, `launchApplication(id)` and `powerAction(action)`. Commands validate inputs again natively. Launch only configured application IDs, never arbitrary shell strings. `komorebiAction` spawns only a resolved `komorebic.exe` with a fixed argument allowlist. Power actions need deliberate UI confirmation.

Current native event envelope: `{status:'ready'|'loading'|'error', data, timestamp, error?}`; the event name identifies the channel. Unsupported channels reject subscription. Subscribe returns `{token, initial}` after the listener is installed; a live event takes priority over the initial snapshot. Adapter hides transport. CPU/RAM collection pauses without subscribers and volume callbacks unregister after the final subscriber. One shared worker remains asleep between samples/commands until application exit. The broader proposed API and sequence numbers are future extensions.

## Windows capability map

CPU: GetSystemTimes deltas or PDH (benchmark and document semantics). RAM: GlobalMemoryStatusEx. Network: GetIfTable2 counter deltas with monotonic clock. GPU: DXGI adapter enumeration (skip software adapters, prefer the largest dedicated VRAM) plus PDH `GPU Engine`/`GPU Adapter Memory` counters keyed by the adapter LUID for utilisation and dedicated/shared bytes, with the shared denominator taken as half of physical RAM; temperature, power draw and fan speed come from the read-only MAHM mapping and stay independently unavailable without MSI Afterburner. NVML/ADL temperature providers remain out of scope. Disk: GetLogicalDrives, then GetDiskFreeSpaceExW and GetVolumeInformationW per mount, projecting only volumes with readable storage; each volume keeps GetDriveTypeW's classification so mapped network drives are reported rather than silently dropped. Audio: Core Audio endpoint callbacks and setters. Media: Windows GSMTC WinRT sessions/events. Focus: WinEvent hook/GetWindowTextW. Desktop: documented IVirtualDesktopManager supports window membership, not full desktop enumeration/switching; defer unsupported private COM interfaces. Own tray: Shell_NotifyIcon/Tauri tray; foreign tray hosting is separate and deferred. Monitor: EnumDisplayMonitors/GetMonitorInfo and DPI awareness. Launcher: ShellExecuteEx allowlist. Power: restricted native commands with explicit action validation.

AppBar owner must register callback messages, negotiate rectangle, handle ABN_POSCHANGED, taskbar recreation, DPI and monitor removal, and always ABM_REMOVE on exit. Transparent borderless always-on-top windows alone are insufficient. Reserve workspace opt-in until validated. Popovers may require separate windows to avoid clipping to a 36px host. Mica/acrylic needs OS support checks and fallback CSS.

## Overlay surface (tooltips now, widget popups later)

The AppBar strip is exactly 36px tall, so any `Positioner` output is clipped by WebView2. `src-tauri/src/desktop.rs` therefore owns one shared floating window, labelled `overlay` and titled `Strata overlay`, created in `setup()` via `ensure_overlay` (hidden, 1x1, transparent, focused(false), skip_taskbar, always_on_top) and never destroyed. It is not an AppBar: it never calls `ABM_NEW`/`ABM_SETPOS` and `release_all` only removes reservations for `bar-*` labels.

Rust owns geometry. `overlay_show` accepts a versioned contract (`v`, optional `source`, `kind: tooltip|popover`, `text`, `anchor` in CSS px, measured `size` in CSS px, `side: top|bottom`), re-validates it natively (source must match the invoking `bar-*` window, kind/side are enums, text is bounded to 512 chars, geometry must be finite and at most 1024 CSS px), converts CSS to physical pixels with the reporting bar's scale factor, centers the surface on the anchor and clamps it to the anchor monitor's rectangle. The surface is sized with the arrow allowance included, so its anchored edge stays flush with the bar edge and one `SetWindowPos(HWND_TOPMOST, .., SWP_NOACTIVATE | SWP_SHOWWINDOW)` plus `ShowWindow(SW_SHOWNOACTIVATE)` is the whole show: no resize round trip, no activation, no focus steal, and never `WS_EX_NOACTIVATE` (stale WebView2 mouse capture). `overlay_hide` ignores the caller, is idempotent and emits `overlay:clear` so the next show cannot flash a stale pill. It runs on `pointerleave`/blur/Escape/pointer down, on window blur, on `ABN_FULLSCREENAPP`, on `WM_DPICHANGED`/`WM_DISPLAYCHANGE`, on `reconcile` and on exit.

komorebi exclusion is shared with the bar: `floating_frame_style` strips `WS_CAPTION`/`WS_EX_WINDOWEDGE` and adds `WS_EX_TOOLWINDOW | WS_EX_TOPMOST`, preserved `WS_EX_TRANSPARENT` keeps the surface click-through, and the guard is re-asserted before every show and on `WM_STYLECHANGED` because `tao` re-applies its own styles on visibility changes. `overlay_snapshot()` (in `diagnostics`, `--probe` and `scripts/test-live-geometry.ps1`) reports `present`, `rect`, `visible`, `toolWindow`, `topmost`, `clickThrough` and `komorebiEligible`; the live script fails if a present overlay ever reports `komorebiEligible`.

The frontend half is `?view=overlay`, routed in `src/main.tsx`, which loads `src/overlay/Overlay.tsx`: one `overlay:render` listener, one pill (`TooltipSurface`) sharing the exact pill/arrow classes with the studio tooltip (`src/components/ui/tooltip-classes.ts`), no timers and no subscriptions. `useOverlayTooltip` measures the real pill off-screen with the real classes before calling `overlay_show`, waits 150ms of hover or focus intent, and keeps its hidden `role="tooltip"` span plus `aria-describedby` inside the bar document, because cross-window ARIA association is impossible. The browser studio has no overlay window: `src/services/system/overlay.ts` selects a labelled no-op adapter there.

## komorebi workspace channel

The `komorebi` channel is event-driven, not polled: `src-tauri/src/komorebi.rs` creates a message-mode named pipe (`\\.\pipe\strata-bar-komorebi-<pid>`), spawns `komorebic subscribe-pipe <name>` with a fixed argument list and no shell, and streams newline/concatenated JSON notifications from komorebi. Each notification carries the full komorebi `State`; the watcher keeps the latest parsed copy and projects one payload per subscribed bar window, filtered to that window's monitor via `MonitorFromWindow`. The project step reduces each workspace to `{index, name, status: active|populated|empty, layer, windows}`; only changes are emitted (per-window summary dedup) to bound event volume. A broken pipe sets status `unavailable`, then reconnects after a delay; a missing `komorebic.exe` never rejects subscription and never falls back to demo data. Focus actions (`focus-monitor-workspace`, `cycle-workspace`) are bounds-checked against the cached state before spawning `komorebic`, so the UI can only reach monitors and workspaces komorebi currently reports.

## GPU resource channel

`gpu` is polled on the same 2 s tick as CPU and RAM by one shared collector (`src-tauri/src/gpu.rs`). `src-tauri/src/gpu_windows.rs` enumerates DXGI adapters, skips `DXGI_ADAPTER_FLAG_SOFTWARE` and picks the largest `DedicatedVideoMemory`, then reads `\GPU Engine(*)\Utilization Percentage` and `\GPU Adapter Memory(*)\{Dedicated,Shared} Usage` through `PdhGetFormattedCounterArrayW`, matching instances by the adapter LUID embedded in the PDH instance name. Engine instances are summed per engine type and the busiest type is reported, clamped to `0..=100`; the shared denominator is half of physical RAM (`GlobalMemoryStatusEx`), matching the documented WDDM/Task Manager convention. Temperature, power draw and fan speed are read from the same read-only MAHM v2 mapping as the CPU package sensor, matched to the selected adapter by `VEN_`/`DEV_` (a sole GPU entry may be used without a match) and validated as temperature `0..=200`, fan `0..=100`, power `0..=2000`.

Per-metric status is independent: `ready`, `error` (previously known value, failed read) or `unavailable` (never read). A stopped fan reports a real `0 %`, not `unavailable`. Schema-validated readings are cached and reused so a single failed read does not zero a metric. The collector keeps 61 points over 120 s, clears history on clock regression and records a null temperature observation when the Afterburner producer timestamp has not moved, so the temperature line stays honest about repeated samples. A failed instrument (PDH counters unavailable) is retried after a delay, and counters resume after sleep/resume.

## Disk resource channel

`disk` is polled on the same 2 s tick as CPU, RAM and GPU. `src-tauri/src/disk_windows.rs` enumerates the drive letters `GetLogicalDrives` currently reports, reads each one's capacity with `GetDiskFreeSpaceExW` and its optional label with `GetVolumeInformationW`, and keeps `GetDriveTypeW`'s classification in the payload; a letter with no readable storage (empty removable or optical media, a disconnected share) is simply absent, so the bar never shows a placeless volume. `src-tauri/src/disk.rs` owns the projection: it derives `usedBytes` and `percent` from the raw total/free pair, drops a volume with zero capacity or a free figure above its total, and orders volumes by mount. The frontend contract (`src/services/system/disk.ts`) re-validates the same invariants — non-negative bounded bytes, `free ≤ total`, `used = total − free`, rounded percent consistent with the byte counts, a known `kind` and mounts strictly ascending — and rejects an internally inconsistent payload instead of substituting demo values. The widget (`src/features/disk/Disk.tsx`) renders one `Progress` bar per volume, shared by the native bar and the studio demo, and `src/features/disk/presentation.ts` filters out `remote`/`unknown` kinds so only the local devices Explorer lists under "Dispositivos e unidades" appear; the same list with used/free/total bytes is the `disk` popup (`src/features/disk/DiskPopup.tsx`).

## Configuration and security

JSON schema version 1; unique widget IDs, known feature types, enabled state, update interval, display format, tooltip. Last-known-good config survives invalid edits. The native Settings window, opened from the tray, is the single configuration page: visual controls and the JSON tab edit one draft, and Apply calls the native `config_save` command. The native store re-validates, atomically writes `config.json` in the Tauri app configuration directory and watches the directory for external edits. `config_load` and revision-ordered `config` events hydrate bars, overlay and settings; failed saves and invalid files retain the last good configuration. Content edits do not change AppBar geometry.

The settings window remains captioned, resizable and focusable, but its
`WS_EX_DLGMODALFRAME` style excludes it from komorebi tiling. This supersedes
the original tiler-managed wording in spec #5, as recorded in the
[configuration plan](plans/config-page.md). It has no AppBar reservation and
does not use `floating_frame_style` or `WS_EX_NOACTIVATE`.

The [2026-10-22 acceptance run](evidence/config-acceptance-issue12-2026-10-22.json)
records Apply on two real monitors with user-confirmed live readings, rejection
of an invalid JSON draft, unchanged persisted bytes after rejection and exact
restoration after the run. The unmodified legacy geometry script failed its
topmost assertion; that observation is retained separately from content-loop
acceptance and does not establish a full geometry pass.

The browser studio is a labelled, display-only demo with no inline appearance controls, widget chips, account settings or JSON editor. Its preview is inert, so widget popups cannot expose a second editing path. The settings view also refuses to mount the editor outside native mode, including direct browser requests to `?view=settings`; there is no demo settings persistence adapter. The retained `strata.config.v1` localStorage persistence and storage-event reload belong only to browser demo routes: `loadConfig` and `watchConfig` return without reading or installing listeners when Tauri internals are present, and native hydration never writes browser storage. The demo bridge has no native configuration load/save commands. Native windows connect to the native store through `connectConfig`; browser persistence cannot feed native bars. Per-monitor overrides merge with validated defaults. CSP restricts content to bundled resources; no remote executable content or arbitrary user JS in MVP.

## Media service

`media.rs` owns one native service for all monitor windows. `media_windows.rs`
uses GSMTC events and Core Audio session/device callbacks; a cached-snapshot tick
schedules independent Spotify enrichment without polling those native APIs.
`spotify.rs` owns fixed-host HTTP, PKCE and Windows Credential Manager storage.
Native `media_action` and Spotify account commands are scoped to bar/overlay
windows. The `media` channel contract is generated from Rust and validated before
frontend delivery. See [music API and account setup](plans/music-widget.md).
