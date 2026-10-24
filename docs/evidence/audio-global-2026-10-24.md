# Global audio configuration — 2026-10-24

## Implementation validation

- Configuration version 2 stores `audio.output` and `audio.input` globally.
  Each accepts only source and index; output derives bus, input derives strip.
- Version 1 migrates in memory to Windows/index 0 for both channels, retaining
  non-audio preferences. Native tests verify the existing file is unchanged on
  load and version 2 is written only on explicit save.
- 64 tests passed across configuration, hydration, audio settings, routing,
  native bar configuration, layout editor and separator suites.
- Four focused Settings tests passed: live names/retained index, unavailable
  list/bounded index, draft/revert/save failure/reopen, and no-widget editing.
- Production frontend build passed. Formatting, ESLint and TypeScript passed.
- Native suite: 193 passed, 25 ignored, three geometry failures. All 31 native
  configuration tests passed, including audio-only publication, migration,
  global projection, validation and restart persistence.
- The three native failures assume the default geometry is based on a 36 px
  bar. The existing installation preset is 33 px, unchanged by this work.
- The final aggregate frontend gate reported 436 passed and 34 failed (470 tests).
  All 34 failing test names were reproduced in a clean archive of HEAD with the
  same installed dependencies; no new failing test names remained. Examples
  include old volume percent text assertions, agent visibility defaults, CPU
  placeholder text and the curve-radius slider test.

## Native runtime observation

The existing debug Tauri host served the updated Settings page through Vite.
Computer Use inspected its output tab: only source and Voicemeeter target were
visible, with the global-settings description and a live `A1 · ASIO4ALL v2` name.
No preferences were applied during this inspection.

The native probe loaded the user's existing configuration without an error.
`test-live-geometry.ps1 -Executable src-tauri/target/debug/strata-bar.exe -Height 33`
passed for both connected monitors (3440×1440 and 1920×1080): both bars were
visible, reserved 33 px, remained tool windows/topmost and were excluded from
komorebi. The hidden shared overlay passed its exclusion/style checks too.

Raw script output is preserved byte-for-byte:

- [Bar geometry](audio-global-live-geometry-20261024.raw.txt)
- [Overlay geometry](audio-global-overlay-geometry-20261024.raw.txt)

## Remaining runtime acceptance

Live source switching across both bars and closing/reopening Voicemeeter were
not exercised. Automated routing/unavailable tests cover those transitions with
adapters and the native remote-API fake; they do not replace that hardware run.
