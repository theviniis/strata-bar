# Issue #13: settings editor validation

Validated on Windows on 2026-10-22 for `codex/issue_13`.

## Behavior covered

- Widget interval (1000–60000 ms), compact/label format and tooltip edits remain
  local until Apply and save through `config_save`.
- Live Voicemeeter options display engine slot and human name. Unavailable
  channels offer strip/bus selection and a bounded 0–7 manual index, without
  demo devices. The Windows-endpoints switch retains the routed target.
- Agent visibility uses checkboxes on the appearance page.
- `monitors.<Windows device name>.widgets.<widget ID>` holds partial behavior
  overrides (`enabled`, `intervalMs`, `format`, `tooltip`, `audio`). IDs and
  section order stay global. The native per-window projection merges overrides;
  removing a widget removes its monitor overrides. Unknown widget IDs and
  duplicate monitor aliases are rejected. Bar geometry remains out of scope.
- JSON edits use the same schema and Apply path. Invalid text stays visible,
  reports field paths, blocks Apply and does not replace the accepted draft.
  Restore defaults recovers through save; closing settings remains available.
- Bar-event coverage verifies interval changes preserve widget DOM identity,
  dispose exactly the changed subscription and leave unrelated channels intact.

## Review

Independent Standards and Spec reviews found one native validation bypass with
case/prefix aliases for one monitor. A native save regression failed before the
fix, then passed after duplicate normalized names were rejected in both layers.
Both reviewers confirmed the finding resolved with no further findings.

## Execution evidence

- `pnpm check`: formatting, ESLint, TypeScript and full frontend suite.
- `pnpm build`: production frontend bundle passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 200 passed, 21 ignored.
- Focused editor/bar/draft tests and case/prefix alias regressions passed.

## Acceptance limits

Automated tests cover native persistence/projection and rendered editor/bar
behavior. This run did not interact with the real settings window to Apply on
both monitors or capture Win32 focus/style measurements. Those live checks remain
pending; browser and mocked transport tests do not establish native MVP success.
Historical geometry/performance evidence was not changed.
