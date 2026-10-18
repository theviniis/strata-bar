# Native MVP — Windows 11

This supersedes the foundation-only status in `validation.md`. Success is the native bar, not the browser studio.

## Implemented

- One undecorated, non-resizable, taskbar-hidden native bar per detected monitor; default 36 logical pixels at the top.
- AppBar NEW / QUERYPOS / SETPOS / REMOVE with per-window subclass ownership; position-change, Explorer-restart and display/DPI messages handled. A named per-session instance guard prevents duplicate bars.
- A single shared native worker reads CPU time deltas and physical RAM every 2 seconds, regardless of monitor count. No CPU/RAM calls without active subscribers.
- Core Audio endpoint volume/mute reads and writes; endpoint-volume callbacks push changes to both monitors. Default-device notifications rebind the endpoint. No volume polling.
- Local clock aligned to minute boundaries. Independent feature state avoids rerendering the entire bar on CPU updates.
- Subscription tokens belong to the subscribing window; destroying one monitor window removes its subscriptions without removing the other monitor's listeners. Callback registrations released when no longer used / on shutdown.
- Native failures display errors; native mode never substitutes demo metrics.

## Verified in this session

Correction to the original geometry check: startup `outer_position()` values were cached by the window runtime and did not prove the final HWND location. A later direct GetWindowRect read found DISPLAY2 at Y=-1044 rather than its monitor top Y=-1080. The reservation was correct but the visible window had drifted into rcWork. See `evidence/secondary-position-before.json`. Geometry checks now use direct Win32 window rectangles; the fix also reapplies placement after ShowWindow and constrains later position changes to the accepted AppBar rectangle.

- Windows exposed DISPLAY1 (3440×1440 at 0,0) and DISPLAY2 (1920×1080 at 724,-1080). Actual bars were inspected on both screens with live CPU/RAM/clock/audio.
- Original cached geometry: primary 3440×36 at 0,0; secondary 1920×36 at 724,-1080. Final live geometry must be checked using GetWindowRect (see correction above).
- AppBar reservations observed through GetMonitorInfoW: primary work-area top 36; secondary work-area top -1044 (36 pixels below -1080). Evidence: `evidence/two-monitor-layout.json`.
- UI mute command confirmed with an independent Core Audio read, then unmuted. Slider changed master volume from 100 to 50; keyboard End restored 100. Original unmuted/100 state restored.
- Eight Rust tests pass: CPU idle accounting/reset, real Windows physical RAM, channel/interval validation, window ownership, per-monitor subscriber cleanup and physical top-strip coordinates for negative/scaled monitor layouts.
- Twelve frontend tests pass: configuration/last-good behavior, mock cleanup, native setup/unmount/failure, initial-event race, actual-bar rendering and volume/exit commands.

## Overlay surface (tooltips)

Implemented (see [architecture.md](architecture.md#overlay-surface-tooltips-now-widget-popups-later)):

- One shared, transparent, always-on-top `overlay` window created in `setup()` and reused for every tooltip; it is click-through, never focused, never in Alt+Tab and never an AppBar.
- Rust owns placement: `overlay_show` validates the versioned contract, converts CSS anchors to physical pixels with the reporting bar's scale factor, clamps to the anchor monitor and shows with one `SetWindowPos` + `ShowWindow(SW_SHOWNOACTIVATE)`. `overlay_hide` is idempotent and also runs on fullscreen apps, DPI/monitor changes, reconcile and exit.
- komorebi exclusion is shared with the bar through `floating_frame_style` and re-asserted on every show and on `WM_STYLECHANGED`; `WS_EX_TRANSPARENT` (click-through) survives the guard.
- The five bar widgets plus the exit button no longer set `title`: they use `useOverlayTooltip` (150 ms hover/focus intent) and keep a hidden `role="tooltip"` span with `aria-describedby` in the bar document. The studio keeps the in-window Base UI tooltip and its OS `title` on workspace dots.
- `diagnostics`, `--probe` and `scripts/test-live-geometry.ps1` all report/verify the overlay surface.

Verified in this session (Windows 11, DISPLAY1 3440×1440 at 0,0 plus DISPLAY2 1920×1080 at 724,-1080, both at 100% scale, komorebic present and reporting two monitors):

- `--probe` reports the live overlay with `visible: false` between hovers, `rect [30,36,300,71]`, `toolWindow: true`, `topmost: true`, `clickThrough: true` and `komorebiEligible: false`. The rectangle is a real hovered tooltip: the window starts at 1×1, so 270×35 physical px with its top flush at the bar bottom (y=36) is a placed surface, and the style bits survived the hide. Evidence: `evidence/overlay-window-probe.json`.
- `scripts/test-live-geometry.ps1` passes for both bars and for the overlay surface. Evidence: `evidence/overlay-geometry-check.json`.
- 20 Rust tests pass (`cargo test --manifest-path src-tauri/Cargo.toml`), including the new frame-style/click-through, request-validation and placement tests for negative origins, clamping, both sides and 125% scaling.
- 28 frontend tests pass (`pnpm test`), including the tooltip intent/cancel/escape behaviour, the overlay renderer's text-only rendering and the native/demo overlay adapters.

Not yet exercised for the overlay: mixed-DPI anchoring (both attached displays currently run at 100% scale, so the scaled path is covered only by unit tests), 50 scripted show/hide cycles with a focus/Alt+Tab assertion, click-through by hand and an `ABN_FULLSCREENAPP` transition. These remain required before the widget-popup phase.

## Remaining acceptance limits

Physical monitor unplug/replug, mixed-DPI displays, sleep/resume, default audio device removal and Explorer restart are implemented handling paths but have not been exercised here. No claim that those scenarios pass yet. Native configuration editing, bottom placement, light theme, transparency/backdrops and autostart are not part of this functional-core increment. System-wide CPU on machines with more than 64 logical processors requires processor-group verification.

The benchmark is an exploratory local measurement, not a controlled comparison to YASB. Production resource results and normal-exit workspace restoration are recorded below after measurement. No new widget phase should start before remaining MVP acceptance concerns are resolved.
