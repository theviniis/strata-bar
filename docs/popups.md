# Widget popups

`WidgetPopup` is the public trigger API. One shared host owns the native window,
sessions, focus, measurement, arrow and monitor placement. Feature
components own their content, data and actions. Volume is the reference feature.

## Add a popup

1. Create `*.popup.tsx` under its feature in its `popup/` directory with the actual visual component as a named export.
   Put state, subscriptions and native/demo adapters in `*.popup.controller.tsx`. Content can be any React
   layout; it does not need predefined header/body/footer slots.
2. Export `definePopup(...)` as default in that same file, with the imported
   controller as `Content`. The filename supplies the ID: `clock.popup.tsx` is
   `clock`.
3. Wrap the widget in `WidgetPopup.Root`, an optional `Anchor` and a `Trigger`.
   Continue using string IDs, for example `popup="clock"`.

There is no catalog or registry to edit. For a popup without parameters:

```tsx
// At the end of src/features/clock/popup/clock.popup.tsx, after its components.
// Import definePopup at the top of that same file.
import { definePopup } from '@/popups/definition'
import { ClockPopupController } from './clock.popup.controller'

export default definePopup({
  label: 'Calendário',
  Content: ClockPopupController
})
```

Only `label` and `Content` are required. An omitted schema accepts `{}` or omitted
params, rejecting extra fields. Add a Zod schema when the content needs parameters:

```tsx
// src/features/workspaces/popup/workspace-details.popup.tsx
import { z } from 'zod'
import { definePopup } from '@/popups/definition'
import { WorkspaceDetailsController } from './workspace-details.popup.controller'

export function WorkspaceDetails({
  workspace,
  demo,
  close
}: {
  workspace: number
  demo: boolean
  close: () => void
}) {
  return (
    <section>
      <h2>Workspace {workspace + 1}</h2>
      <p>{demo ? 'Example data' : 'Live data'}</p>
      <button onClick={close}>Close</button>
    </section>
  )
}

export default definePopup({
  label: 'Workspace details',
  schema: z.object({ workspace: z.number().int().nonnegative() }).strict(),
  Content: WorkspaceDetailsController
})
```

```tsx
// src/features/workspaces/popup/workspace-details.popup.controller.tsx
import { usePopupContext } from '@/popups/context'
import { WorkspaceDetails } from './workspace-details.popup'

export function WorkspaceDetailsController() {
  const { params, mode, close } = usePopupContext('workspaceDetails')
  // params.workspace is inferred from the schema's output.
  return (
    <WorkspaceDetails
      workspace={params.workspace}
      demo={mode === 'demo'}
      close={close}
    />
  )
}
```

```tsx
import { WidgetPopup } from '@/popups/WidgetPopup'

;<WidgetPopup.Root popup="workspaceDetails" params={{ workspace: index }}>
  <WidgetPopup.Anchor asChild>
    <div className="flex items-center">
      <WidgetPopup.Trigger asChild>
        <button aria-label="Workspace details">Workspace {index + 1}</button>
      </WidgetPopup.Trigger>
    </div>
  </WidgetPopup.Anchor>
</WidgetPopup.Root>
```

Required schema inputs produce required `params`. Schemas accepting `undefined`
can omit them. Params must be JSON, limited to 16 KiB; functions, refs and JSX
cannot cross the window boundary. Input validation runs before opening and in
the content host; schema transforms are applied independently to the original
input in each environment. `usePopupContext` exposes parsed output types.

`asChild` composes refs and handlers without inserting another button. Custom
children must pass received props/ref to their DOM element. A prevented child
click does not open the popup. Each Root has one trigger and, optionally, one
anchor; without an explicit anchor the trigger's rectangle is used.

## Content and adapters

Content receives `mode`, validated `params` and `close()` through context. Import
the hook directly from `popups/context`; transport and registration belong to
the framework. It is fine to use local state and feature hooks in the content.
No feature should import `overlay`, measure its own window or install Escape
listeners.

The audio feature renders a native data component or a demo data component. Both
feed the same controls. The native component uses real subscriptions/commands;
the demo keeps local output/volume state and never invokes Windows. Keep these
adapters separate for new features too: native errors must never select demo data.
Demo content is visibly labeled and resets when closed.

## Shared behavior

- Panel centered on the whole anchor, shifted only to remain within the monitor;
  the arrow still points to the anchor. The gap is always 12 CSS px.
- Rust derives top/bottom placement from the real bar/monitor rectangles, not
  the widget's vertical position within the bar. It validates the discovered ID,
  session, payload size and geometry. Adding or removing definitions rebuilds the
  host during `tauri dev`; no Rust feature conditional is needed.
- Native opening prepares a hidden window. The shared surface reports its first
  measured width and height, then the host reveals and focuses it. Subsequent resizes do
  not take focus. Tauri visibility state and Win32 visibility stay synchronized.
- The host replays prepared content after overlay listeners install, including
  after a development reload. Old event generations and stale sessions are ignored.
- One active popup replaces another. Tooltip intents are canceled/suppressed while
  a popup is open. Native arbitration also protects against other monitor windows.
- Escape restores the trigger; outside clicks do not steal focus. Trigger toggle,
  unmount, fullscreen, display/DPI changes and exit also dismiss. The window returns
  to click-through mode after hiding. Keyboard Tab navigation stays in the popup.
- Studio uses Radix positioning in a body portal, escaping preview clipping while
  preserving theme/typography, collision handling, gap, arrow and dynamic dimensions.
- Invalid parameters or content render errors produce an accessible error surface
  with a close action, never a demo fallback or a permanently blank window.

The surface has no fixed dimensions or scrolling. Content grows and shrinks in
both axes using intrinsic layout, independently of the current window viewport.
`overlay.resize(session, { width, height })` invokes `overlay_resize` in CSS pixels;
the native reply supplies the updated `arrowX`. Rust moves the full-size window
inside the monitor where possible. A popup larger than the monitor keeps its
size and aligns to that monitor's origin on the overflowing axis, allowing clipping.

## Automatic discovery

Popup implementations are discovered under `src/features/**/*.popup.tsx`. IDs
use lowercase/kebab-case filenames, normalized to camelCase: `audio-outputs`
registers `audioOutputs`. Legacy ASCII identifiers remain accepted. IDs must be
unique after normalization; errors identify invalid or conflicting paths.

Keep JSX, schema and default registration in `*.popup.tsx`; import its controller
from `*.popup.controller.tsx`. The generated map imports the complete module
directly. Dependencies load with the registry, while mounting and subscriptions
remain owned by the popup host. Controllers access visual exports during rendering.
Keep prop-driven visuals available as named exports for stories and tests.

Legacy `*.popup.ts` files are still
recognized, sharing the same ID namespace: `clock.popup.ts` and
`clock.popup.tsx` cannot coexist, even in different features.

`pnpm generate:popups` writes `src/popups/.generated/popups.ts`, with imports,
the internal map and the ID union. It is ignored by Git, ESLint and Prettier;
never edit it. Development, build, tests, lint, formatting, typecheck and check
commands generate it automatically, including on a clean checkout. Vite also
runs discovery at startup and watches added, removed and renamed definitions.
Ordinary definition/content edits continue through HMR. Use these pnpm commands
before expecting the editor's first typecheck on a fresh checkout.

Rust's build script independently discovers the same filenames and writes its
allowlist into Cargo's `OUT_DIR`; direct `cargo` commands need no Node generation
step. Both scanners reject duplicate/invalid IDs. Components and Zod schemas
remain frontend code; Rust continues validating session ownership and transport
geometry/payload bounds. Definition schemas do not enable arbitrary native commands.

## Validate

Run `pnpm check`, `pnpm build` and
`cargo test --manifest-path src-tauri/Cargo.toml`. Tests cover composition, strict
params, native actions, simulation, sessions, measurement and monitor geometry.

For an explicit Windows smoke check, close other native Strata instances, run
`pnpm dev`, then in another terminal:

```sh
cargo run --manifest-path src-tauri/Cargo.toml -- --check-popups
```

This debug-only check opens real per-monitor AppBars containing the real volume
widget plus the CPU, memory and GPU resource fixtures and overlay, temporarily changes focus, checks
opening/resizing/Escape/outside-pointer dismissal and subscription cleanup, then exits normally and
releases AppBar reservations. It does not change audio routing or volume. It
writes `%TEMP%/strata-popup-framework-check.json`; require `passed: true` and save
new evidence files rather than overwriting historical ones. Avoid interacting
with other windows while the focus checks run. Release builds ignore the flag.
