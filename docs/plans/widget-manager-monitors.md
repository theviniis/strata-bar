# Widget manager by monitor

Follow-up to issue #13 and PR #17, based on the approved monitor manager and
preview catalog specification. The existing widget previews, three columns,
configuration Popovers and Apply persistence flow remain the UI foundations.

## Editing scopes

- Open on **Todos**. Individual tabs use Windows monitor device-interface IDs;
  numbers, resolution and primary status are display labels.
- **Todos** aggregates connected monitors. Edits also update the default for new
  monitors. Explicit settings of disconnected monitors are retained; inherited
  fields continue following the default.
- Selecting a scope never changes the draft. A disconnected selected monitor
  returns the UI to Todos with a notice. Saved disconnected monitors remain
  deliberately selectable.
- A monitor's bar activation, widget membership/order, widget visibility and
  widget settings are separate. Disabling a bar preserves the other three.
- Mixed fields have no arbitrarily selected value. An edit patches only that
  field, including individual audio properties.
- Individual Popovers offer Monitor atual / Todos os monitores. The Todos tab
  offers only Todos os monitores. Concluir keeps the draft; Aplicar persists.

## Catalog and layout

- Reuse `WidgetPreview` for available registered types; do not add new widget
  implementations. Search ignores case and accents.
- The right catalog has independent scrolling and moves below the layout on
  narrow windows. `+` chooses Esquerda / Centro / Direita. Pointer and keyboard
  dragging choose a position; cancellation does not commit.
- Types already in the selected layout are absent from its catalog. Hidden
  widgets stay in the layout for reactivation. Todos shows the connected union
  in default order, appending members present only in individual layouts.
- Adding reuses the first existing definition of that type in global order;
  otherwise it creates a globally unique ID. Existing duplicate instances are
  retained, but the catalog creates no additional duplicates.
- Removing individually removes membership and preserves settings. Global
  permanent deletion removes the definition and all references.
- A global drag explicitly applies the resulting complete organization to the
  connected monitors and default. Visibility and settings are preserved.

## Configuration and native host

Schema version 1 gains `bar.enabled` (default true), optional root `layout`, and
optional monitor `enabled` / `layout`. A layout contains left/center/right ID
arrays. Absence inherits the default; an empty layout intentionally has no
members. Definitions remain in `widgets`; missing/repeated references are
rejected in Zod and Rust. Projected bar snapshots contain only their render
document, without catalog layout or other monitors' references.

`settings_monitors` returns the Rust-derived monitor contract. Legacy DISPLAY
keys migrate only on a unique current match without an existing persistent-ID
destination. Unresolved/conflicting entries are retained. Device-interface IDs
are Windows identities, not a guarantee across hardware/driver identity changes.

Reconciliation is serialized. Dynamic WebViews are built off the UI thread;
Win32 subclass installation, AppBar registration and placement run on their
owner thread. Bars use `SW_SHOWNOACTIVATE`, floating frame enforcement and direct
rectangle reads. Removal and exit retain `ABM_REMOVE`. A shutdown guard prevents
late worker activation. A hidden display observer detects changes even with all
bars disabled; the existing tray Settings entry keeps configuration accessible.

Native failures never fabricate monitors. Browser settings explicitly identify
their demonstration monitor.

## Validation

Run `pnpm check`, `pnpm build` and the native Rust suite. With the development
server running and the normal Strata instance closed, run the debug binary with
`--check-monitor-manager`. It uses a unique temporary configuration and writes
`%TEMP%\strata-monitor-manager-check.json`. It exercises rendered settings
controls, actual native subscriptions, physical rectangles and persistence.
See the dated evidence note for results and remaining physical-device checks.
