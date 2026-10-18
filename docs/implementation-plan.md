# Incremental implementation plan

## MVP acceptance correction — 2026-10-17

The primary deliverable is a functioning Windows 11 status bar, not the browser studio. Gate further widget expansion on: real CPU/RAM/clock/volume, volume/mute control, one correctly reserved bar on each monitor, cleanup on exit, and recorded production resource measurements. Browser prototype completion is not MVP success. GPU, network and all Phase 2/3 widgets remain out of this gate; GPU later ships under the recorded exception below.

Provisional performance budget for the current two-monitor host: below 0.5% mean whole-machine CPU and below 250 MiB summed private bytes across the native host and WebView2 descendants after warmup. This is a project acceptance target, not a claim about YASB or all hardware. Record actual samples and investigate any failure before expansion. Longer controlled idle and startup baselines remain required.

| Milestone           | Dependencies                         | Acceptance gate                                                                                                                                       |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 research         | Public source, official runtime docs | Pinned source findings, uncertainties and runtime decision documented (done)                                                                          |
| M1 foundation       | Node/npm                             | Vite React JSX, Tailwind, Radix/shadcn-style primitives, Zustand/Zod, Vitest; browser build and lifecycle/config tests pass                           |
| M2 visual prototype | M1                                   | Three groups, top/bottom, dark/light, compact layout, loading/error/unavailable, keyboard popovers; visibly labelled demo adapter                     |
| M3 native CPU/RAM   | Rust/MSVC/WebView2                   | Tauri host compiles; real values compared with Windows tools; no mock fallback; repeated subscribe/dispose leaves no resources                        |
| M4 desktop host     | M3                                   | AppBar reservation and release, Explorer restart, fullscreen, mixed DPI, monitor hotplug, per-monitor configuration, clipped-popup solution validated |
| M5 remaining core   | M3/M4                                | Network reset/sleep tests, Core Audio device-change/control tests, focus hook cleanup; unavailable sensors stay visibly unavailable                   |
| M6 optimize         | All core                             | Equivalent YASB and candidate benchmarks, render profiles; tune only observed bottlenecks                                                             |
| M7 distribute       | M4–M6                                | Signed release policy, Windows installer smoke test, autostart opt-in, upgrade/uninstall removes reservations and startup entry                       |
| M8 desktop widgets  | Stable core                          | Media, desktops (capability limited), own tray, battery, weather and launcher incrementally                                                           |
| M9 advanced         | Stable M8                            | Taskbar, switcher, power, notifications, restricted custom widgets, full settings editor                                                              |

Current MVP: clock, CPU, RAM and volume with real native integration, reserved workspace and multiple monitors. Network, focus and the broader widget phases wait until the revised core acceptance gate passes; the GPU widget ships under the recorded exceptions below. Browser demo completion alone is not MVP completion. No full system tray cloning, private desktop switching, arbitrary scripts or weather credentials in MVP.

## komorebi workspace exception — 2026-10-17

The komorebi workspace widget is an explicit, approved exception to the core gate above: it ships before the CPU/RAM/clock/volume gate closes. Rationale: it is additive and read-mostly, it does not touch the AppBar reservation or the sampling paths, and it fails closed to `unavailable` when komorebi or `komorebic.exe` is absent, never to demo values. The exception is limited to the workspace viewer in `docs/plans/komorebi-workspaces.md`; app-icon extraction, layer toggles, scroll switching and automatic komorebi ignore rules stay out of scope, and GPU, network, tray, media and the remaining Phase 2/3 widgets remain behind the gate. Live native evidence (probe output, click-to-focus, offline/online transitions) must still be recorded under `docs/evidence/` before this exception is considered validated.

## GPU widget exception — 2026-10-18

The GPU widget, its `gpu` channel and its popup are a second explicit, approved exception, recorded in `docs/plans/gpu-popup.md`. Rationale: the readings come from documented, non-elevated Windows APIs (DXGI adapter enumeration and PDH `GPU Engine` / `GPU Adapter Memory` counters) plus the same read-only MSI Afterburner mapping the CPU temperature already uses, so the delivery adds no new external dependency, no vendor DLL and no driver install. It fails closed per metric: without a vendor-neutral reading the metric is `unavailable`, and a native failure is never replaced with demo values. Temperature, power draw and fan speed are the only Afterburner-backed fields and are independently unavailable without it. On the `M5 remaining core` row, GPU is therefore no longer "unavailable when unsupported" but "unavailable when the sensor, not the vendor capability, is missing". This exception is limited to the widget, channel, popup and its tests; GPU overclocking/tuning controls, per-process GPU attribution, vendor DLL sensors and NVML/ADL providers stay out of scope, and network, tray, media and the remaining Phase 2/3 widgets remain behind the gate. Live native evidence (the extended `--check-popups` run covering the GPU popup and the startup layout probe) must be recorded under `docs/evidence/` before this exception is considered validated.

## Measurement protocol

Record OS/build, CPU/GPU/driver, monitor topology/DPI, runtime versions and exact commits. Match enabled widgets, refresh rates, styles and monitor count for YASB/candidate. Run 5 cold launches and 5 warm launches; record launch-to-first-ready and first-valid-metrics. After 60s warmup capture 10 minutes idle and 5 minutes interaction: full process-tree private bytes/working set, CPU time per elapsed second, wakeups, native handles, event counts and React commit counts. Include WebView2 children and YASB workers. Report median/range, raw samples and unavailable features. No comparative result exists yet.

## Real Windows gates

CPU sustained load and idle; memory allocation/release; interface reset and VPN changes; default audio device removal and external mute; rapid focus/title changes; missing GPU vendor DLL; GPU with no integrated/virtual adapter and with MSI Afterburner stopped mid-run; malformed/partially written config; 100 subscription cycles; close during subscription setup; sleep/resume; unplug primary/secondary display; 100/150/200% scaling and negative coordinates; Explorer restart; top/bottom reservations beside taskbar; fullscreen; clean exit and crash recovery. Native tests cannot be replaced by mocks.

## Open risks

Minimum supported Windows version (proposed Windows 11 x64), WebView2 installation policy, desired foreign tray fidelity, private desktop API tolerance, multi-window memory cost, GPU sensor support, backdrop behavior and signing identity remain unresolved. Conservative defaults: documented APIs, no admin requirement, no foreign injection, unsupported sensors visibly unavailable.

## Authorized music exception — 2026-10-18

The music widget and extensible media API are explicitly authorized independently
of the remaining core MVP gates. See [the plan of record](plans/music-widget.md).
The implementation adds real Windows GSMTC playback, per-application Core Audio
volume and an independent Spotify PKCE connection. It does not widen the network
widget, tray, autostart or arbitrary-command scope. Studio interaction and native
read probes do not close the live authenticated Spotify or multi-monitor gates.
