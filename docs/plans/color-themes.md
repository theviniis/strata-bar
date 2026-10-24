# Color themes

Appearance has two independent settings: `bar.theme` (`system`, `light`, `dark`)
and `bar.colorTheme` (`current`, `amoled`, `nord`, `dracula`, `catppuccin`). Version 1
documents without a palette use `current`; per-monitor documents can override
both fields. `current` is the stable saved ID of Illusion (Refined); its display
name does not require migrating existing documents. AMOLED uses pure black in
dark mode and pure white in light mode for the bar, cards, popups and sidebar.
The default installation appearance remains Illusion (Refined) / Dark.

The settings appearance section shows one static bar preview, popup sample and
color swatches per palette. System previews show both modes. Selection edits
the draft; Apply persists and publishes it. Revert reloads the saved document,
and restoring defaults only edits the draft. A failed save preserves the saved
appearance. Nord and Dracula light variants are adaptations; Catppuccin uses
Latte and Mocha, with darker accents in Latte for readable controls.

`src/services/theme/palettes.ts` owns the complete semantic token sets. Native
bars and previews apply explicit tokens locally, keeping nested previews
independent. The document theme also covers portals and measurement probes.
The host resolves overlay appearance from the invoking bar's projected config,
then includes it in `overlay:render` and its readiness snapshot. The overlay
applies that appearance before measuring popup content; System follows the OS.
Configuration reconciliation hides the overlay before subsequent shows.

## Verification

- Frontend coverage includes legacy defaults, invalid palette IDs, independent
  mode/palette selection, all ten token sets, isolated System previews,
  system preference changes, overlay monitor changes and stale-session rejection.
- Settings integration covers preview-only drafts, Apply, failed saves, Revert
  and restoring defaults without saving.
- Rust coverage checks legacy defaults, validation, normalized monitor projection
  and persistence across reopening the config store.
- Storybook `Settings/Color themes` includes an interactive selector and a gallery
  of all ten appearances using the actual bar and CPU popup presentation.
- Live Windows acceptance still requires the newly built native bar: inspect
  all ten appearances, popup and tooltip placement, and monitor overrides.
  Storybook is visual coverage, not native acceptance evidence.

### Implementation checks (2026-10-24)

- Production frontend build, TypeScript, ESLint and formatting passed.
- The focused config/theme/overlay run passed 30 tests; four settings scenarios
  passed for previews, System mode, Apply/failure/Revert and restoring defaults.
- The full frontend gate reported 431 passing tests and 34 failures. A separate
  checkout of the pre-change commit reported 420 passing tests and 37 failures;
  every remaining failing test name was present there too.
- Native tests reported 190 passing, 25 ignored and three geometry failures.
  The pre-change checkout reproduced the same three failures, with 189 passing.
- Visual inspection covered all eight Storybook appearances, plus selection
  with Enter and the four split previews in System mode. The installed native
  bar was already running; it was not replaced for this validation.
