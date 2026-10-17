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

`subscribe(channel, listener, { intervalMs }) → Promise<dispose>`; disposal is idempotent and handles cancellation during asynchronous subscription setup. `capabilities() → Promise<Record<channel, boolean>>`; `setVolume({level, muted})`; `configureBar(config)`; later `mediaAction`, `launchApplication(id)` and `powerAction(action)`. Commands validate inputs again natively. Launch only configured application IDs, never arbitrary shell strings. Power actions need deliberate UI confirmation.

Current native event envelope: `{status:'ready'|'loading'|'error', data, timestamp, error?}`; the event name identifies the channel. Unsupported channels reject subscription. Subscribe returns `{token, initial}` after the listener is installed; a live event takes priority over the initial snapshot. Adapter hides transport. CPU/RAM collection pauses without subscribers and volume callbacks unregister after the final subscriber. One shared worker remains asleep between samples/commands until application exit. The broader proposed API and sequence numbers are future extensions.

## Windows capability map

CPU: GetSystemTimes deltas or PDH (benchmark and document semantics). RAM: GlobalMemoryStatusEx. Network: GetIfTable2 counter deltas with monotonic clock. GPU: DXGI/PDH, optional NVML/ADL temperature. Audio: Core Audio endpoint callbacks and setters. Media: Windows GSMTC WinRT sessions/events. Focus: WinEvent hook/GetWindowTextW. Desktop: documented IVirtualDesktopManager supports window membership, not full desktop enumeration/switching; defer unsupported private COM interfaces. Own tray: Shell_NotifyIcon/Tauri tray; foreign tray hosting is separate and deferred. Monitor: EnumDisplayMonitors/GetMonitorInfo and DPI awareness. Launcher: ShellExecuteEx allowlist. Power: restricted native commands with explicit action validation.

AppBar owner must register callback messages, negotiate rectangle, handle ABN_POSCHANGED, taskbar recreation, DPI and monitor removal, and always ABM_REMOVE on exit. Transparent borderless always-on-top windows alone are insufficient. Reserve workspace opt-in until validated. Popovers may require separate windows to avoid clipping to a 36px host. Mica/acrylic needs OS support checks and fallback CSS.

## Configuration and security

JSON schema version 1; unique widget IDs, known feature types, enabled state, update interval, display format, tooltip. Last-known-good config survives invalid edits. Browser persistence uses localStorage with visible errors and storage-event reload. Native target: app config directory, atomic write and debounced directory watch, validate before geometry change. Per-monitor overrides merge with validated defaults. CSP restricts content to bundled resources; no remote executable content or arbitrary user JS in MVP.
