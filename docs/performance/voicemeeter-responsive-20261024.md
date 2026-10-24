# Audio responsiveness — 2026-10-24

## Change and reproduction

The popup previously disabled mute and volume until each command settled. Mute
waited for a channel event; the slider discarded its draft when the command
returned. Voicemeeter setters were followed by an immediate read, which can still
contain the previous engine state. The normal maintenance deadline was up to 2 s.

Before the fix, `pnpm exec vitest run src/tests/audio-responsive.test.tsx` failed
because mute did not immediately change its accessible label. The Rust test
`accepted_writes_do_not_claim_a_stale_read_is_the_requested_value` failed with
`Ok((50, false))` instead of the accepted intent `Ok((85, true))` when the fake
engine deferred applying setters. Both regressions now pass.

The popups now retain immediate visual intentions, serialize/coalesce writes per
controller, and invalidate queued gestures on route changes or unmount. Pointer
drags still apply only on release. The worker confirms matching observations at
50 ms while writes are pending, polls at 100 ms with active consumers and retries
unavailable sessions at 2 s. Confirmation times out after 1 s. Worker diagnostics
retain a bounded history of queue/write/read/confirmation/publication timing.

## Live Voicemeeter measurement

Ran the rebuilt debug executable with `--probe-vm` against the running Voicemeeter
Banana x64. The probe performed ten cycles per destination, with a mute change and
a gain change in each cycle. Exact original raw gain and mute were restored and
verified after every cycle. Both destinations reported no errors.
All 40 immediate reads still returned the previous value for the changed field,
confirming that setter acceptance cannot be treated as synchronous read-back.

| Destination     | Samples | p95 confirmation |
| --------------- | ------: | ---------------: |
| Bus 0 (output)  |      20 |         50.62 ms |
| Strip 0 (input) |      20 |         50.55 ms |

These measurements include DLL writes and observation at a 50 ms cadence. They
meet the 100 ms goal for that path; they do **not** measure Tauri queue delay or
WebView rendering. The raw report preserves all samples and restoration results:
[live DLL report](../evidence/voicemeeter-responsive-20261024.raw.txt).

## Exploratory idle measurement

The running debug bar had output/input configured for Voicemeeter index 0. A
15-interval sample included its descendants and the installed sensor service:
mean CPU was **0.587% of machine capacity**, and mean private working set was
**320.55 MiB**. Development and tests ran concurrently, so this is not a controlled
before/after comparison or a release performance gate.

`scripts/measure-idle.ps1` could not read service CPU without elevation. The
replacement read-only capture used `Win32_PerfRawData_PerfProc_Process` counters,
matching process IDs from the bar descendant tree plus the sensor service. CPU
is the sum of per-process CPU-time deltas divided by counter timestamp deltas and
logical processor count. The unchanged raw capture is
[idle counters](idle-voicemeeter-responsive-20261024.raw.txt).

## Verification and limits

- Seven frontend suites covering audio controllers, controlled components,
  widget popups, native bridge and routing passed: **66 tests**.
- Targeted Rust Voicemeeter/confirmation tests passed: **12 tests**.
- The full Rust run had 196 passing tests, 25 ignored tests and three geometry
  failures in unchanged `desktop.rs` tests.
- Final `pnpm check` passed Prettier, ESLint and TypeScript, then finished with
  **450 passing / 30 failing tests** across 76 suites. All audio suites passed;
  remaining failures concern agents, settings and other widget presentation.
  There were no unhandled rejections in this final run. The full command log is
  available locally at `%TEMP%/strata-audio-responsive-check-20261024.log`.
- The Windows automation inventory did not expose Strata's AppBar/overlay windows.
  Native visual latency was therefore not measured. Component tests verify
  immediate mute feedback and slider continuity through delayed replies/events;
  live DLL measurements do not replace a native visual acceptance run.
- No historical evidence was changed. New raw reports use `.raw.txt` to preserve
  the original PowerShell serialization without formatter rewrites.
