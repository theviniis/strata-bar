# Issue #11 acceptance validation

Validated on Windows on 2026-10-22 for
[Config page 05: settings window and visual editor core](https://github.com/theviniis/strata-bar/issues/11).

## Acceptance matrix

| Criterion                                                                                                       | Result | Evidence                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tray opens one ordinary settings window; repeat opens focus it; closing leaves no AppBar or click-through state | Passed | User confirmed singleton/focus and closing while bars remain running. `desktop::open_settings` builds a decorated, resizable window without AppBar registration, floating-frame styling or no-activation flags. The post-close native probe reports no settings window and two valid bar reservations. |
| Drag within/across three sections, unique widget IDs and schema backstop                                        | Passed | `layout-editor.test.tsx` covers pointer and keyboard moves, cross-section insertion before drop, gaps, cancellation, outside drops, add/remove/enabled state and collision-free IDs. `draft.test.tsx` rejects duplicate IDs.                                                                           |
| Apply saves natively and updates both monitor bars without restart                                              | Passed | `settings-view.test.tsx` verifies the native save payload; `native-bar-config.test.tsx` exercises config events and per-window rendering. User confirmed visible updates on both real monitor bars without restart.                                                                                    |
| Revert, Restore defaults, field validation and native rejection                                                 | Passed | `settings-view.test.tsx` and `draft.test.tsx` verify reload, restore through save, disabled Apply for invalid fields, native rejection and recovery after editing.                                                                                                                                     |
| Frontend editor and native window tests are green                                                               | Passed | Full frontend gate and native test results are recorded below. Native tests include window ownership, floating-frame styles and monitor geometry.                                                                                                                                                      |

## Validation

- `pnpm check`: Prettier, ESLint, TypeScript and 323 frontend tests (53 files).
- `pnpm build`: production frontend build.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 198 passed, 21 ignored.
- `scripts/test-live-geometry.ps1` with the debug executable: passed for both
  monitors, including direct window rectangles, reserved work areas and
  komorebi exclusion.
- Standards and Spec reviews: no remaining findings in the application changes.

The native tray/focus/apply/close interactions above are **user-confirmed manual
acceptance**, not automated UI tests. The probe is independent, read-only native
geometry evidence; its results and that distinction are preserved in
[the native evidence JSON](issue-11-settings-native-2026-10-22.json).

The existing geometry helper writes fixed historical evidence paths. Those
files were restored unchanged after the run; this validation adds separate
evidence instead.

## Gate corrections

The initial aggregate check stopped on an unsupported, redundant legacy ESLint
extension string. Removing it preserves the existing React Hooks flat config.
The first unrestricted frontend run also timed out one settings interaction
under concurrent jsdom load. Vitest now uses two workers while retaining the
same 10-second per-test timeout.

## Visual evidence

[Settings appearance screenshot](issue-11-settings-appearance-2026-10-22.png)
shows the browser preview with sample data. It is not evidence of native
collector readings or of the two-monitor Apply interaction.
