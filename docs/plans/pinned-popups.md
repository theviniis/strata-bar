# Pinned popups

Widget popups expose Pin and Close in a shared header. Every widget popup starts
in its own topmost native tool window. Pin changes its closing/movement policy.
Drag its header to move it;
clicking outside or opening another widget leaves it open. Escape closes only
the focused popup. Tooltips and reminder expiry alerts keep their existing policy.

Each configured widget has one pinned popup per source bar. Reopening its widget
focuses that window. Unpinning replaces the transient popup and returns to a fresh
measurement of the source widget. A removed widget closes its returning popup.
Pins and positions are not persisted across application restarts.

Render, close-animation and clear listeners are scoped to their own Tauri window.
Global listeners receive even events targeted at another window: clearing the
transient overlay must never erase the content of detached popups. Detached tools
have an empty native title and a stable, never-shown native owner, keeping them
out of shell application lists without tying their lifetime to a monitor's bar.
Diagnostics identify them through an HWND property rather than a visible title.

The native session module owns `preparing`, `transient`, `pinned` and `closing`
states, widget identity, window ownership and placement. The shared overlay is
reserved for tooltips and `reminderAlert`. One empty widget window is prepared at
startup; opening consumes it and queues replenishment outside IPC dispatch. Pin
never creates another WebView, hides the current HWND, reparents it, changes its
frame or resends content. The native owner and floating styles are installed before
first display. Both directions retain the HWND, React tree, subscriptions and local
input state. Unpin obtains the current anchor from the source bar and moves the
same window. Invalid anchors or timeout leave it pinned; a missing source closes
it. Closed sessions and the spare window are destroyed on exit. They use
`floating_frame_style`, never reserve AppBar space, and never use
`WS_EX_NOACTIVATE`. The existing bar fullscreen checks also update pinned window
visibility per monitor; restoration never activates the popup. Placement and
diagnostics use direct Win32 rectangles. The studio demonstrates independent
pins and header movement within the browser document, preserving its portal and
content when the mode changes.

`popup:mode` carries only session, revision, pin state and anchor presentation.
Listeners target their own window, and stale revisions cannot replace newer modes.
Anchor requests also carry a generation, validated together with their source bar.
The frontend keeps opening animation, size observation and pin state in separate
effects. Pin hides the arrow while preserving its allowance, does not remeasure
or refocus, and does not rerender feature content. Resolution, context inputs and
close callbacks remain stable so content effects do not resubscribe on mode changes.

Pinned windows filter both normal and extended frame styles during
`WM_STYLECHANGING`, before Windows applies tao's visibility/style resets. This
prevents a temporary caption/window edge from exposing the popup to komorebi
between a style reset and its subsequent repair. A native regression test observes
the proposed styles while repeatedly showing, hiding and resetting a real HWND.
Pinned hosts also suppress native non-client painting while forwarding activation
with `lParam=-1`, and restore transparent DWM composition after frame changes.
This keeps Windows from drawing a white caption/border when the popup gains focus.

## Validation

- `pnpm check` and `cargo test --manifest-path src-tauri/Cargo.toml`.
- With the development Vite server running, build the debug host and launch
  `src-tauri/target/debug/strata-bar.exe --check-pinned`. This explicit check uses
  a hidden native source, isolated config and its own mutex, without adding a
  second AppBar reservation. It writes `%TEMP%/strata-pinned-check.json` and exits.
- The check exercises two real WebView2 popup windows, topmost/tool-window styles,
  session ownership, Win32 movement/resize, fullscreen visibility policy,
  return while a transient popup is open, rejection of stale/wrong-source anchors,
  invalid-anchor recovery, and cleanup. Thirty button-driven mode changes check
  HWND identity, native hide messages, frame opacity, retained dialog/input identity
  and draft text, with a warmed p95 acknowledgment target below 100 ms. The report
  records click, native receive/commit, DOM confirmation and first-frame timestamps.
  It does not simulate mouse dragging or external fullscreen apps.
- The check uses an isolated WebView2 profile, so its memory measurement includes
  its own browser descendants rather than sharing the running application's
  browser. It compares three-second idle samples without/with the reserve using
  `scripts/measure-idle.ps1 -ProcessId <id> -ExcludeSensorService`. This is a short
  exploratory comparison; working-set totals can double count shared pages.
- `scripts/test-live-geometry.ps1` checks pinned styles alongside existing bars
  and overlay diagnostics. Save new runtime evidence rather than editing history.
- Manual acceptance remains necessary for pointer dragging across different DPI
  monitors, disconnecting a monitor, and entering/leaving an external fullscreen
  application. Confirm data keeps updating with multiple pins and that closing
  the application releases all AppBar reservations.

## Recorded run — 2026-10-28

[Native evidence](../evidence/pinned-popups-20261028.json) records a passing run
against real WebView2 windows at 96 DPI. The focused frontend suites passed all
41 tests; Rust passed 242 tests, with 31 explicit acceptance tests ignored.
Prettier, ESLint and TypeScript checks passed. The aggregate `pnpm check` run
reached Vitest: 632 tests passed and two unchanged tests failed because they
expect a metric and its unit as one text node (`cpu-temperature-sampling` and
`gpu-controlled`). The manual acceptance cases above remain unverified.

[Paint and isolation regression evidence](../evidence/pinned-popups-paint-20261028.json)
adds pin-button interaction, visible content with full opacity and matching
viewport dimensions, persistence while another popup opens/returns, empty native
titles, and owned tool windows without `WS_EX_APPWINDOW`. The previous HWND-only
check could not detect a cleared React document inside a visible native window.

[In-place pin evidence](../evidence/pinned-popups-in-place-20261028.json) verifies
that each pin retains its original window label and content. The local pin-button
check measured 232 ms for CPU and 173 ms for GPU, compared with 1387 ms in the
failing replacement-window run. These timings include the check's 100 ms polling
granularity. The activation/paint regression and all 244 Rust tests passed;
27 focused frontend tests, TypeScript and targeted ESLint checks also passed.

## Session-window architecture — 2026-10-28

[Session continuity evidence](../evidence/popup-sessions-20261028.json) supersedes
the promotion/transfer mechanism above. Thirty warmed pin/unpin button clicks
kept the same HWND, dialog and unsaved input, with full opacity on every sampled
frame and no native hide messages between samples. DOM mode confirmation p95 was
9.7 ms; the report includes click, native receive/commit and first-frame times.
Wrong-window and stale anchor replies were rejected; an invalid current anchor
left the original popup pinned and visible. Style, independent-close, geometry,
fullscreen-policy and cleanup checks passed. Actual mixed-DPI pointer movement,
monitor disconnection and external fullscreen acceptance remain manual.

The isolated-profile development measurement added approximately 82.45 MiB of
private memory for the prepared reserve. Three-second idle CPU samples were
within noise (a negative delta does not indicate CPU savings). This is exploratory
development evidence rather than a production resource-budget acceptance run.

Rust passed 245 tests, with 31 explicit acceptance tests ignored. The latest six
focused frontend suites passed 48 tests, including a regression that previously
restarted a content effect four times across mode changes, and a delayed initial
placement reply that must not restart opening after pin. The existing user host was left running:
Windows prevented copying the rebuilt executable over PID 33016. Native evidence
comes from the newly linked `target/debug/deps/strata_bar.exe --check-pinned`;
restart the normal host to apply the native changes to the user's bars.

The final aggregate `pnpm check --maxWorkers=4` passed formatting, ESLint and
TypeScript, then reported 640 passing tests: the two existing metric-text failures
and one timeout in the unchanged Settings integration-actions test. That Settings
test passed on its isolated rerun. The four popup-ownership fixtures were updated
to provide their native window identity for the newly scoped listeners, and all
48 focused popup tests passed after the final early-placement guard.

## Opening and exit regression — 2026-10-29

[Motion evidence](../evidence/popup-motion-20261029.json) records 67 actual opening
frames with no clip-path mask, plus visible exit contraction before the HWND is
destroyed. Opening keeps the original expansion/travel easing and the card's
normal rounded corners; the animated 160 px reveal mask was removed.

Transient dismissal from its trigger, outside focus, Escape or Close now enters
`closing`, sends the window-scoped exit event and holds the window/subscriptions
until `overlay_exit_complete`. The command validates both window/session and
closing state. A one-second watchdog prevents a stalled renderer from stranding
the window. Forced replacement and shutdown retain immediate cleanup. The source
receives docking completion after the animation, and focus is restored only if
the closing popup still owns foreground focus. Pinned windows fade in place
instead of contracting toward an obsolete widget anchor.

The previous native check failed because dismissal immediately destroyed the
session. The corrected run acknowledged and destroyed it after 426 ms, with
content inert and scale decreasing during exit. Thirty pin/unpin cycles still
retained their HWND/content without hiding; mode confirmation p95 was 13.6 ms.
The seven focused frontend suites passed 62 tests; Rust passed 245 tests with 31
explicit acceptance tests ignored. ESLint, TypeScript and formatting passed.

## Compositor execution — 2026-10-29

The motion check above only proved that opening and closing existed. Its recorded
opening trace still contained a 112.8 ms gap between JavaScript samples, jumping
from scale 0.23 to 0.77. Deferring reserve creation alone did not eliminate stalls.
Motion 14's accelerated-property list includes `transform` but excludes the
independent `scaleX`, `scaleY` and `y` values previously sent to its JS frame loop.

The surface now combines the existing scalar keyframes into CSS transform
keyframes, retaining their positions, scale values, durations, offsets and easing.
Opening, docking and pinned fade use browser-native Web Animations; a layer hint
prepares transform/opacity composition. All writes to the visual element use the
same transform property, including initial hiding and interrupting entry to pin.

The renderer also acknowledges `overlay_open_complete` after its actual opening
ends. The host validates the calling window/session and only then replenishes the
reserve. A pin that interrupts opening first paints its resting state; reduced
motion acknowledges after placement. Closing or destroying an unfinished session
also releases replenishment. Pending opening/closing sessions prevent background
reserve construction. A stale queued blur cannot dismiss a popup that has already
regained foreground focus.

The native check inspects actual `getAnimations()` effects for a running transform
on opening and exit. JavaScript requestAnimationFrame gaps remain diagnostics,
not measurements of compositor display FPS: a blocked JS observer cannot sample
compositor frames while it is blocked. The pin stress check waits for its previous
command to re-enable the button before issuing the next click.

[Compositor acceptance evidence](../evidence/popup-compositor-20261029.json)
verifies native transform effects on both opening and exit, opening completion
acknowledgment, deferred reserve creation, and 30 pin/unpin cycles without replacing
or hiding the window. Pin mode confirmation p95 was 9.1 ms; exit acknowledgment
arrived after 452 ms. All 48 focused frontend tests and 245 Rust tests passed,
alongside ESLint, TypeScript and formatting. The JS observer still saw a 111.2 ms
sampling gap: that value is explicitly retained as a main-thread diagnostic,
not represented as a measurement of compositor/display frame pacing.
