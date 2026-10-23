# Agent settings validation — 2026-10-22

Scope: issue #22, with the shared Draft and testing decisions from #21.

## Behavior and review

- Configurações → Agentes owns visibility preferences and existing integration controls.
- Visibility uses the existing global `agents.visible` Draft, shared with JSON;
  Apply remains the only persistence path. Revert reloads the saved configuration.
- OpenCode connect/disconnect and Codex/Antigravity hooks are explicit immediate,
  global operations. Revert does not undo them.
- Agent popups consume saved visibility and retain sessions, creation, replies,
  permissions and alerts. Disabled integrations name Configurações → Agentes in
  plain text, without setup controls or links.
- Native snapshot/event access includes Settings. Integration configuration is
  restricted to Settings; daily actions remain restricted to bars and overlay.
- Independent Standards and Spec reviews against `main` found no actionable code
  defects. The Spec review identified the remaining live UI acceptance check below.

## Automated validation

- TypeScript: passed (`pnpm typecheck`).
- ESLint: passed (`pnpm lint`).
- Prettier: passed (`pnpm exec prettier --check .`).
- Frontend production build: passed (`pnpm build`); existing large-chunk warning.
- Windows Rust tests: 207 passed, 21 opt-in tests ignored
  (`cargo test -j 2 --manifest-path src-tauri/Cargo.toml`).
- Windows native debug build: passed
  (`cargo build -j 2 --manifest-path src-tauri/Cargo.toml`).
- Red/green: the new Settings visibility test first failed because Agentes was
  absent, then passed after migration. The immediate integration actions test
  also passed separately (1 passed, 33 skipped).
- Initial targeted run: 52 passed, eight tests exceeded the existing 10-second
  timeout during concurrent Windows builds. No assertion failures were reported.
  The full frontend run then passed: 55 files, 353 tests
  (`pnpm test --maxWorkers=1 --testTimeout=60000`). Repository timeout settings
  were not changed.

## Real Windows probes and limitations

Ran the newly built executable with `--probe-agents` and `--probe` on Windows.
Agent process discovery returned no error: ChatGPT, OpenCode and Codex were
present, Antigravity was absent. Probe connection snapshots are disabled defaults;
these probes do **not** validate connecting accounts or installing hooks.
The native config probe loaded the existing saved configuration without error.

A production `D:/code/strata/src-tauri/target/release/strata-bar.exe` was already
running. The application singleton mutex prevents a second normal instance.
The new Settings UI was not exercised in the live host, and production hooks,
connections and preferences were not changed by this validation. The full
save/reopen/propagate cycle and connection/hook operations through the actual
Settings WebView remain a manual acceptance check. Frontend mocks and native
unit tests are not a substitute for that check.
