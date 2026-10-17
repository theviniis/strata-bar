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

## Remaining acceptance limits

Physical monitor unplug/replug, mixed-DPI displays, sleep/resume, default audio device removal and Explorer restart are implemented handling paths but have not been exercised here. No claim that those scenarios pass yet. Native configuration editing, bottom placement, light theme, transparency/backdrops and autostart are not part of this functional-core increment. System-wide CPU on machines with more than 64 logical processors requires processor-group verification.

The benchmark is an exploratory local measurement, not a controlled comparison to YASB. Production resource results and normal-exit workspace restoration are recorded below after measurement. No new widget phase should start before remaining MVP acceptance concerns are resolved.
