# AGENTS.md — Strata

## Project

Strata (`strata-bar`) is a Windows 11 status bar built with Tauri 2, Rust, React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Zod and shadcn/ui.

The native application manages per-monitor Win32 AppBar windows, system metrics, audio controls, workspaces and floating overlays. The React frontend also provides a browser studio with explicitly simulated data.

**The native Windows bar is the primary product. Browser preview improvements do not substitute native validation.**

Follow the global Codex agent instructions for orchestration, delegation and collaboration. This document defines project-specific requirements.

## Repository

- `src/app/` — Application shell and global Tailwind theme.
- `src/components/` — Status bar, widget infrastructure and shadcn UI.
- `src/features/` — Independent widgets, controllers, popups and stories.
- `src/hooks/` — Shared React hooks.
- `src/overlay/` — Shared floating overlay and tooltip rendering.
- `src/services/` — Native/demo bridge and configuration contracts.
- `src/stores/` — Zustand state.
- `src/tests/` — Vitest and React Testing Library.
- `src-tauri/` — Rust/Tauri, Win32 AppBar, Core Audio, IPC and native commands.
- `sensor-service/` — .NET 10 sensor service using LibreHardwareMonitorLib.
- `scripts/` — PowerShell validation utilities.
- `docs/` — Architecture, plans, ADRs and validation evidence.
- `research/` — Read-only, gitignored upstream reference.

## Commands

| Command                                                 | Purpose                           |
| ------------------------------------------------------- | --------------------------------- |
| `pnpm install`                                          | Install dependencies              |
| `pnpm dev`                                              | Browser studio                    |
| `pnpm desktop`                                          | Native development                |
| `pnpm build`                                            | Frontend production build         |
| `pnpm check`                                            | Formatting, lint, types and tests |
| `pnpm test`                                             | Vitest                            |
| `pnpm lint`                                             | ESLint                            |
| `pnpm typecheck`                                        | TypeScript                        |
| `pnpm format`                                           | Prettier                          |
| `pnpm format:check`                                     | Formatting validation             |
| `pnpm package:windows`                                  | NSIS installer                    |
| `cargo test --manifest-path src-tauri/Cargo.toml`       | Rust tests                        |
| `dotnet test sensor-service/Strata.SensorService.Tests` | Sensor service tests              |

Requirements: Node 22.12+, pnpm 11–12, Rust/MSVC/WebView2 for native development and .NET 10 for sensor tests.

Native validation includes `--probe`, `scripts/measure-idle.ps1` and `scripts/test-live-geometry.ps1`.

## Code Conventions

- TypeScript strict mode; prefer explicit, derived types.
- Prettier: 2 spaces, 80 columns, single quotes, no semicolons or trailing commas.
- Use lowercase/kebab-case for files and directories; PascalCase for React components.
- Prefer named exports, `import type` and the `@/` alias.
- Tailwind utilities in `className`; avoid component-specific stylesheets.
- Preserve `src/app/styles.css` as the global theme and Tailwind entry point.
- Use existing shadcn/ui and Radix primitives before creating new ones.
- Theme variants use `group-data-[theme=light]:`.
- Keep presentation separate from controllers, subscriptions and native adapters.
- Feature internals belong in `src/features/<feature>/src/`; follow existing widget, popup and controller conventions.
- Derive configuration types from Zod and channel payloads from bridge contracts.
- Rust follows `rustfmt` and existing module boundaries.
- Prefer focused changes over unrelated refactoring.

## Architecture Invariants

### Native Bridge

- `src/services/system/bridge.ts` selects native or demo transport.
- Demo data is restricted to the browser studio.
- **Never fall back to demo values when native operations fail.**
- Preserve asynchronous subscription lifecycle and idempotent disposal.
- Native commands must validate inputs independently.
- Channel events use `ready`, `loading` and `error` states.
- Unsupported hardware and unavailable integrations must report unavailability explicitly.

### AppBar and Overlays

- Preserve one AppBar per monitor and correct desktop workspace reservation.
- Always release AppBar registrations using `ABM_REMOVE`.
- Validate geometry using actual Win32 window rectangles.
- Preserve Explorer restart, DPI and monitor reconciliation.
- All floating windows must use `floating_frame_style` to avoid komorebi management.
- Never add `WS_EX_NOACTIVATE` to WebView2 windows.
- Keep overlay hiding idempotent.
- Rust owns overlay positioning, monitor bounds and coordinate conversion.
- Preserve the shared overlay architecture and existing accessibility behavior.

### Sensors and Audio

- Hardware measurements come from the installed .NET sensor service.
- Never replace missing native measurements with demo or alternative collectors.
- Preserve sensor cache freshness, IPC isolation and independent failure handling.
- Keep the sensor service pipe read-only and the bar unelevated.
- Preserve Core Audio event-driven behavior.
- Voicemeeter routing must report unavailable when its configured backend is missing; never silently switch backends.
- Preserve strict allowlists for external executables and native actions.

### State and Configuration

- Zustand stores shared channel snapshots and configuration.
- Widgets subscribe selectively to avoid unnecessary global rerenders.
- Keep local interaction state in React.
- Preserve Zod validation, unique widget IDs, per-monitor overrides and configuration versioning.
- Do not break existing configuration persistence or last-known-good behavior.

## Testing and Quality

- Frontend: Vitest, React Testing Library and jsdom.
- Native: Rust unit tests and real Windows validation.
- Sensor service: .NET tests and named-pipe lifecycle validation.
- UI: Storybook where available; use Playwright only when a suitable environment exists.
- Run targeted tests during implementation and `pnpm check` before completion when feasible.
- Native acceptance criteria require native evidence; browser mocks are insufficient.
- Distinguish existing failures from regressions introduced by the task.
- Never modify tests merely to conceal incorrect behavior.
- Report commands executed, results, skipped checks and unresolved risks.

## Security and Repository Guardrails

- Preserve Tauri CSP and capability restrictions.
- Never execute arbitrary shell strings from UI inputs.
- Keep native argument validation and executable allowlists.
- Do not expose secrets, credentials or private configuration.
- Never modify generated or vendored directories: `dist/`, `node_modules/`, `src-tauri/target/`, `.rea-tools/`, `research/`, or generated .NET output.
- Update dependency manifests rather than manually editing lockfiles.
- Never overwrite historical evidence in `docs/evidence/` or `docs/performance/`; add new evidence.
- Do not commit, push, merge, publish, deploy or perform destructive Git operations without explicit user authorization.

## Issue Tracking

GitHub Issues is the default source of truth for `theviniis/strata-bar`, accessed through `gh`.

Follow:

- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`

Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.

If the user explicitly requests Linear, use the configured Linear MCP integration and the specified project/issue.

Do not automatically create duplicate issues across GitHub and Linear.

## Communication

- User-facing communication: Brazilian Portuguese.
- Code, identifiers and technical naming: English.
- Keep responses concise, objective and technically precise.
- Prefer documented evidence over assumptions.

## References

- `docs/architecture.md`
- `docs/implementation-plan.md`
- `docs/native-mvp-validation.md`
- `docs/plans/overlay-window.md`
- `docs/plans/gpu-popup.md`
- `docs/plans/voicemeeter-audio.md`
- `docs/plans/lhm-sensors.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`
- `GLOSSARY.md`
- `docs/adr/`
- `README.md`
