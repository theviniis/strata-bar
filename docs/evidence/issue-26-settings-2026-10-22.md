# Single source of widget preferences — issue #26

Date: 2026-10-22 (America/Sao_Paulo). Scope: issue #26 and parent #21.

## Audit and changes

| Widgets or surface     | Preferences                                                               | Daily or operational state                                                              |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| CPU, RAM, GPU, disks   | Saved widget format, tooltip and interval via Layout/JSON                 | Collector snapshots, graph windows and stale readings remain in their existing services |
| Clock, komorebi        | Saved format, tooltip and interval via Layout/JSON                        | Clock ticks, calendar display and workspace focus remain local/service actions          |
| Network, active window | Saved composition and widget options via Layout/JSON                      | Honest unavailable placeholders; no new integration                                     |
| Agents                 | Dedicated Settings section; saved visibility                              | Discovery, sessions, replies, permissions and alerts remain in the widget               |
| Reminders              | Google Calendar setup in Settings                                         | Reminder creation, editing, snooze and completion remain operational records            |
| Music                  | Spotify setup in Settings                                                 | Playback, seek, volume and favorites remain daily actions                               |
| Audio input/output     | Dedicated Settings sections; saved per-instance/per-monitor audio options | Endpoint switching, level and mute remain daily actions                                 |

The audit found remaining competing paths in the editor and audio consumers:

- Restore defaults saved immediately. It now changes only the shared Draft;
  Apply is the persistence action. Revert reloads the saved document.
- A failed first load left default preferences editable. Editing, Restore
  defaults and Apply now remain disabled until a successful load; Revert can
  retry without replacing the user's document with defaults.
- The native config store's old local `apply` path could replace rendered
  preferences without native persistence. It now rejects local mutations in
  native windows; native configuration arrives through snapshots/events.
- Audio widgets read the first instance of their type instead of their own
  projected preferences. Each instance now receives its own saved audio options
  through the existing widget presentation context.
- Both the bar and individual widgets sent audio routes. The obsolete widget
  mutation hook was removed. The bar sends the last configured route once per
  present channel on configuration changes and reports native failures. A bar
  without a channel does not reconfigure that channel. Routing remains global
  per channel across bars; no independent monitor routing was introduced.

The remaining widgets have no independent persistent preference editor. Popup
state such as graph timestamps, selected sessions, pending volume drags and
reminder forms remains operational state. Account connections and hooks retain
their explicit immediate actions and their existing secure credential stores.
Revert does not call those actions or claim to undo them.

No schema, preference, integration, CSP, capability or AppBar policy was added.
Five pre-existing formatting failures under `.scratch/widget-settings/issues/`
were trailing blank lines; only those blank lines were removed to unblock the
repository formatting gate.

## Automated validation

- Red/green regressions at the existing boundaries reproduced immediate default
  persistence, failed-load editing, incorrect audio-instance presentation and
  local native config mutation before the fixes.
- Focused Settings, native bar, audio and preview run: 65 passed.
- Updated native isolation suite: 2 passed.
- Final audio/native bar focused run: 19 passed.
- `pnpm check`: 358 frontend tests passed, with formatting, ESLint and TypeScript
  passing. Confirmed again after the last audio-route refinement (55 suites,
  358 passed); the final repository formatting check also passed with this
  evidence included.
- `pnpm build`: passed (existing dependency annotation and chunk-size warnings).
- `cargo test --manifest-path src-tauri/Cargo.toml`: 210 passed, 0 failed,
  21 opt-in tests ignored. Includes native configuration validation, persistence,
  projection and caller restrictions.
- `rustfmt --edition 2021 --check src-tauri/src/monitor_check.rs`: passed.
  Repository-wide `cargo fmt --check` still reports inherited formatting in
  unchanged Rust files; those files were not reformatted as part of this issue.

## Real Windows evidence and pending gate

See [native probe summary](issue-26-native-2026-10-22.json).

- The native Settings WebView was inspected using Windows Computer Use.
- The current native probe observed two physical monitors, one enabled real
  AppBar, real Core Audio readings and the shared overlay. The saved user config
  intentionally disables the other bar; the one-bar observation does not claim
  a two-bar acceptance pass.
- `--probe-vm` detected Voicemeeter Banana, five strips and five buses. Bus 0 and
  strip 0 gain/mute operations returned no errors and restored their values.
- `--probe-media` read a playing Spotify session through Windows native media,
  with playback/seek/volume capabilities. Account enrichment was unavailable;
  no OAuth connection/disconnection or favorite mutation was performed.
- The personal configuration's SHA-256 remained
  `1799C4530FF56322E955D095EB6050A9A21AE2C2C2D28EA48A90144E9835EC58`.

The existing `--check-monitor-manager` verifier was extended to exercise the
actual Settings WebView with an isolated temporary configuration: shared
visual/JSON Draft, no pre-Apply propagation, Apply and real-bar spacing,
Restore defaults, Revert, reopening, invalid JSON and an actual Windows file
sharing lock that rejects atomic replacement while retaining the previous
file/config/bars. Its existing monitor projection and cleanup checks remain.

**This integrated check has not yet run.** The active native host retains the
session mutex. A normal close signal did not exit the host; forced termination
was not used. The user was asked to choose Sair from the Strata tray so the
isolated verifier can run. Unit/component tests and direct probes do not replace
this pending acceptance criterion. Do not mark issue #26 fully accepted yet.

Once the host is exited, keep Vite serving port 1420, build the debug executable
and run `src-tauri/target/debug/strata-bar.exe --check-monitor-manager`.
Inspect the newly written `%TEMP%/strata-monitor-manager-check.json`, require
`passed: true` including `settingsDraft`, then add a new evidence file. Do not
replace historical probe evidence.

## Standards

Parallel review of `main...HEAD`: 0 documented violations or actionable smells.

## Spec

Parallel review against #21/#26: 0 implementation findings. The integrated real
Windows gate remains pending as described above. Review totals: Standards 0;
Spec 0 implementation findings, 1 outstanding acceptance gate.
