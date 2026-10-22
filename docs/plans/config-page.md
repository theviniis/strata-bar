# Configuration page: settings window and the native content loop

Status: implemented; acceptance recorded on 2026-10-22 for issue #12.
The design below was fixed in a grilling session on 2026-10-20
and should be executed as written; every checkbox is ticked as the work lands.
Deferred follow-ups are tracked as issues #2 (export/import), #3 (native
geometry) and #4 (bar-level `activeMonitors`).

The desktop runtime is the definition of done and the native JSON file is the
sole source of truth. The browser studio stores and proves nothing content-wise:
its reflection alone is not an acceptance gate.

Decisions already taken:

- One config page, owned by the desktop runtime: a single-instance settings
  window at `?view=settings`, opened from the tray. It keeps its caption,
  resizing and taskbar entry, but is excluded from komorebi tiling with
  `WS_EX_DLGMODALFRAME` before showing it and on subsequent style changes.
  `WS_EX_WINDOWEDGE` is also cleared, but Windows may restore it for captioned,
  resizable windows; it is not a sufficient exclusion by itself.
  This supersedes the original tiler-managed decision (2026-10-22). It is never
  an AppBar or a topmost tool window; `floating_frame_style` and
  `WS_EX_NOACTIVATE` stay out of it.
- Storage: JSON schema v1 at the Tauri `app_config_dir()`, atomically written
  (temp + rename) and watched by a new native `config` module; no SQLite, no
  migration machinery. New commands `config_load` / `config_save` re-validate
  natively like every other command.
- Editor implementation: draft model on `react-hook-form` (already installed)
  - `zodResolver` over the existing Zod schema; explicit Apply (serialize +
    `config_save`, field-level errors block) and Revert; Restore defaults is the
    only danger-zone v1 action (#2 covers export/import).
- Widget layout editing with `@dnd-kit/core` + `@dnd-kit/sortable` (the only
  new dependencies): three sortable `left`/`center`/`right` columns, drag
  within and across sections, add via a Select, remove per widget; IDs are
  generated uniquely and the schema `superRefine` stays the backstop.
- Audio widgets: source Select (`windows`/`voicemeeter`); when
  `voicemeeter`, strip/bus pickers fed by the live `voicemeeter` snapshot,
  falling back to bounded numeric inputs (index 0–7) plus a note when the
  channel is `unavailable` — demo strips are never fabricated as devices.
  `label` and the Windows-endpoints `enabled` checkbox are included.
- Per-widget monitor overrides (the existing `monitors` record) editable per
  widget; bar-level `activeMonitors` is deferred (#4).
- `agents` visibility checkboxes live on the same page.
- `bar.height`, `bar.position` and `bar.alwaysOnTop` render read-only in v1
  ("applies natively in the geometry loop", linked to #3): the editor only
  exposes what this milestone applies. `bar.theme` and `bar.spacing` style
  content and are applied.
- Consolidation: the studio's inline Appearance/Position/Height section, the
  per-widget chips and the raw JSON textarea are deleted; the settings window
  hosts a Visual tab plus a validated JSON tab. In-context popup surfaces
  (`VoicemeeterSettings`, `AgentsPopup`, `SpotifySettings`) stay where they
  are; the browser studio becomes display-only (demo label).
- Persistence boundary: localStorage keeps its browser-demo role only and
  never feeds native; there is exactly one truth path.

## 1. Native config store (`src-tauri/`)

- [x] Add `src-tauri/src/config.rs`: Rust-side re-validation of the schema-v1
      payload (structure plus the paths that other commands already re-check,
      e.g. audio `Target::parse`), file at the Tauri `app_config_dir()`
      (final file name fixed at implementation), atomic write, directory watch
      → config event.
- [x] Register `config_load` / `config_save` in `main.rs`
      (`generate_handler!`); save failure leaves the previous file intact.
- [x] Deliver the config event to `bar-*`, `overlay` and settings windows in
      `setup()`; delivery failure never falls back to demo values — bars keep
      rendering their in-memory config and the error surfaces in the editor.
- [x] Rust unit tests: save/load round-trip, invalid payloads rejected,
      atomic write leaves no temp file behind, watch event observed, bounds
      re-validated against the documented ranges.

## 2. Settings surface

- [x] `?view=settings` view (lazy entry alongside `src/views.tsx`), a normal
      captioned window created on demand from the tray; a second request
      focuses the existing instance instead of creating a duplicate.
- [x] Tray entry wired in `tray.rs`; the window owns no AppBar reservation,
      no click-through styles and no `WS_EX_NOACTIVATE`.
- [x] Teardown on close is clean; no state references outlive the window.

## 3. Editor implementation

- [x] Shared editor component: Visual tab plus JSON tab; `useForm` +
      `zodResolver` over the existing schema; draft state only.
- [x] Apply serializes the draft and calls `config_save`; Revert reloads the
      saved config; Restore defaults flows through the same Apply path.
- [x] Native rejection is surfaced exactly like a field-invalid draft.
- [x] Three sortable columns (`@dnd-kit/core`/`@dnd-kit/sortable`), drag
      within and across `left`/`center`/`right`, add-widget Select, remove
      per widget, collision-checked `type`-derived IDs.
- [x] Widget inspector: `enabled`, `intervalMs` (1000–60000), `format`,
      `tooltip` and, for audio widgets, the source/target controls and
      `label`/`enabled` per recorded decision, with the numeric bounded
      fallback when `voicemeeter` is `unavailable`.
- [x] Per-widget monitor override editor (`monitors`).
- [x] `agents` visibility checkboxes.
- [x] Bar section: `theme`/`spacing` editable; `height`/`position`/
      `alwaysOnTop` rendered disabled with a pointer to #3.

## 4. Content loop (native bars obey config)

- [x] Rewrite `NativeBar.tsx` to render from config: widget presence and
      order per `left`/`center`/`right`, `enabled`, `intervalMs`,
      `format`, `tooltip`, `bar.theme`, `bar.spacing` and `agents`
      visibility.
- [x] Project per-widget `monitors` overrides per `bar-*` window following
      the komorebi one-payload-per-window pattern.
- [x] Audio routing follows config through the existing
      `set_channel_source` / `set_audio_input` / `set_audio_output`
      machinery, preserving last-write-wins semantics.
- [x] `bar.position`-derived popup placement (reminders and friends) reads
      the same config identity.
- [x] Re-subscription on config events relies on the existing `connect()`
      idempotent dispose paths (no widget remount storms).

## 5. Studio demotion and persistence boundaries

- [x] Delete `App.tsx` inline Appearance/Position/Height controls, widget
      chips and JSON textarea; the studio keeps hero + live demo preview,
      clearly labelled.
- [x] `loadConfig` / `watchConfig` keep serving the browser demo only;
      native never reads localStorage; document the boundary in
      `docs/architecture.md` and README.

## 6. Tests

- [x] Editor suite: render, draft/Apply/Revert/Restore-defaults, field-error
      blocking, dnd composition and add/remove, audio picker live and
      fallback paths, monitor overrides, JSON tab round-trip.
- [x] Views: settings window render/config event handling.
- [x] Native bar: config-driven rendering and per-monitor projection tests
      (replacing the hardcoded `NativeBar.tsx` expectations).
- [x] Store: extend `config.test.ts` patterns for the save command path.
- [x] The seven pre-existing failures documented in AGENTS.md were resolved
      separately in issue #8; the final suite must remain green.

## 7. Verification and documentation

- [x] `cargo test --manifest-path src-tauri/Cargo.toml`,
      `pnpm format:check`/`lint`/`typecheck`/`test` (`pnpm check`).
- [x] Record a native acceptance run under `docs/evidence/` (new file):
      settings apply visibly changes the real bars on both monitors, no demo
      fallback occurred, `scripts/test-live-geometry.ps1` behavior noted.
- [x] Close out with doc updates: `docs/architecture.md`, README, and
      GLOSSARY terms (draft, apply, content loop, settings window) as the
      code terms settle.

## Close-out evidence (issue #12)

The acceptance record is [config-acceptance-issue12-2026-10-22.json](../evidence/config-acceptance-issue12-2026-10-22.json).
It separates the two-monitor content Apply and automated checks from the legacy
geometry script result: that script failed its topmost assertion. It ran from a
temporary evidence directory so historical JSON was never overwritten.

Implementation tickets #6, #7, #9, #10, #11 and #13 are closed; #8 resolved
the test baseline. Spec #5 remains the parent. Its original tiler-managed
settings-window wording is superseded by the 2026-10-22 decision above.
The existing editor also exposes per-monitor hosting and layouts, overlapping
the still-open follow-up #4; closing that broader follow-up is outside #12.
