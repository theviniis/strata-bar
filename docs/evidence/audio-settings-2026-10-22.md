# Audio settings validation — 2026-10-22

Scope: issue #23, Centralizar Entrada e Saída de áudio. Final validation includes
the integration with main’s Agentes settings (#27).

## Automated checks

- Full frontend suite: 349 tests passed, 0 failed; JSON reporter returned
  `success: true` and the command exited with code 0. Command:
  `pnpm exec vitest run --maxWorkers=2 --testTimeout=60000 --reporter=json`.

- Settings window and Voicemeeter suites: 47 tests passed. Coverage includes
  shared Draft/JSON, native save rejection, Revert/reopen, bounded targets,
  retained Windows targets, individual monitor/instance edits, popup daily
  controls, and existing global channel routing/no-fallback behavior.
- TypeScript and ESLint checks passed after rebasing onto `origin/main`.
- Prettier passed for `src/` and this evidence document. The repository-wide
  format check fails on five unchanged files inherited from main:
  `.scratch/widget-settings/issues/01.md` through `05.md`.
- Windows Rust suite: 207 passed, 0 failed, 21 opt-in tests ignored.
- Native debug build passed.
- The targeted run used one worker and a 60-second test timeout because concurrent
  builds on this host caused existing Settings tests to exceed 10 seconds.

## Real Windows probes

Executed the worktree's newly built debug executable:

- `strata-bar.exe --probe`: native config loaded with no error; Core Audio
  enumerated real input/output endpoints and returned volume/mute readings.
- `strata-bar.exe --probe-vm`: Voicemeeter Banana detected; five strips and five
  buses enumerated. Bus 0 and strip 0 gain/mute probes reported no errors and
  restored their original gain/mute values.

These probes exercise native Windows and Voicemeeter operations, not mocks.

## Remaining interactive validation

The existing production executable at
`D:/code/strata/src-tauri/target/release/strata-bar.exe` was running. It was left
running. The session mutex prevents starting a second full host, so the new
Settings WebView's Apply/reopen/config-event propagation to real bars was not
verified interactively. The Settings tests cover that editor workflow against
its native boundary; they do not replace this pending real-window check.

No endpoint was switched during the probes. Existing CSP, capabilities, native
validation and AppBar/overlay behavior were not changed.

## Standards

No documented-standard violations found. One optional maintainability finding:
the mixed-value comparison in AudioInspectorFields repeats the existing
WidgetInspector comparison; extracting a shared helper is possible but was not
required for this migration.

## Spec

No concrete missing or incorrect behavior found in the static review. The
real-window validation limitation above remains explicit.

Review totals: Standards — 0 violations, 1 optional suggestion; Spec — 0 code
findings, with interactive validation pending.
