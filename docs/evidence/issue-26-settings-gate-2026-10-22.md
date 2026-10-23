# Issue #26 — integrated Windows gate completed

This follow-up supersedes the pending integrated-gate status in
[the initial audit](issue-26-settings-2026-10-22.md) and the initial native probe.
Those historical records remain unchanged.

After the user exited Strata through the tray, the debug host was built and
`strata-bar.exe --check-monitor-manager` ran against the actual Settings WebView,
native configuration commands and both physical monitors. The existing checker
uses an isolated temporary file, not the personal configuration.

## Observed results

Two consecutive full runs returned `passed: true`:

- [First complete pass](issue-26-settings-integrated-2026-10-22.json)
- [Repeated complete pass](issue-26-settings-integrated-repeat-2026-10-22.json)

Both reports confirm:

- The visual and JSON editors share the same Draft. Editing leaves native
  configuration and both bars unchanged until Apply.
- Apply persists and propagates spacing to both real bars (8 → 13 px).
- Restore defaults changes only the Draft. Revert reloads the saved document;
  destroying and reopening Settings recovers that saved configuration.
- Invalid JSON blocks Apply and preserves the file.
- An actual Windows sharing lock rejects atomic replacement. Settings shows
  the native write error; the previous file bytes, native configuration and
  both bars retain their saved values. Revert recovers after releasing the lock.
- Per-monitor CPU presentation remains isolated. Applying the global interval
  updates the real native CPU subscription to 6000 ms.
- Disabling/re-enabling one monitor releases/restores its measured desktop work
  area while preserving preferences and Settings focus. Both AppBars remain
  visible, tool windows, excluded from komorebi, without `WS_EX_NOACTIVATE`.

The initial run timed out at the existing global CPU interval check, after the
new Settings Draft checks completed. A rerun with additional failure diagnostics
and an immediate partial-result file passed; a second full rerun also passed.
No functional change was made between the timeout and successful reruns. The
cause of that isolated timeout is not established; these results do not claim
the verifier is free from timing sensitivity.

## Cleanup and remaining limits

[The post-exit native probe](issue-26-settings-cleanup-2026-10-22.json) observed
zero bars, no overlay or Settings window, and fully released work areas on both
monitors. The personal configuration retained SHA-256
`1799C4530FF56322E955D095EB6050A9A21AE2C2C2D28EA48A90144E9835EC58`.

The frontend was unchanged during this follow-up: its final `pnpm check` result
remains 358 passed across 55 suites, including lint, types and formatting.
After adding native-check diagnostics, Rust again passed 210 tests with 21
opt-in tests ignored. The production frontend build had already passed.

The initial audit records real Core Audio, native Spotify media and Voicemeeter
probes. Account OAuth, Spotify account enrichment/favorites and installation or
removal of real provider hooks were not performed. Automated boundary tests
cover their immediate-action/Revert separation; no mock result is presented as
real account validation.
