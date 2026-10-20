# Voicemeeter audio routing (volume / microphone)

Status: implemented (native + studio-inert). Owner: `src-tauri/src/voicemeeter.rs`.

## Goal

The `volume` and `microphone` widgets can be configured to control Voicemeeter
strips/buses instead of the Windows default endpoints. Strata reads and writes the
Voicemeeter engine through the vendor remote DLL; it never mirrors Windows mute
(today) and never falls back to Windows or demo values.

## Configuration (Zod schema v1, additive)

```json
{
  "id": "volume",
  "type": "volume",
  "audio": {
    "source": "voicemeeter",
    "target": { "kind": "bus", "index": 0 },
    "label": "A1 fones"
  }
}
```

- `source` defaults to `windows`; `target` is required when `source=voicemeeter`.
- `enabled` is optional (default `true`); `false` keeps the stored target/label
  while the widget drives the Windows endpoints again — this is what the
  popups' configuration checkbox writes.
- Guides for the reference variant Voicemeeter Banana x64: strips 0-4
  (3 physical + V1/V2), buses 0-4 (A1-A3 + B1/B2). Basic ships 3 strips / 2 buses,
  Potato 8/8; the worker bounds-checks indices against `VBVMR_GetVoicemeeterType`.
- `label` is optional; the pill shows `Strip n` / `Bus n` otherwise.
- Old configs stay untouched (`audio` is optional on every widget).

## Level semantics

- Slider percent maps linearly over the Voicemeeter gain slider: 0% = -60 dB,
  100% = +12 dB; out-of-range requests clamp.
- Mute is the independent `.Mute` bit.
- Read-back levels round to whole percents.

## Contract

- [`set_channel_source(channel, target | null)`](../../src-tauri/src/main.rs) — routes
  `volume`/`microphone` through Voicemeeter or restores the Windows endpoints. The
  native side re-validates the kind (`strip`/`bus`) and index (0-7).
- The shared metrics worker owns the remote session on its single thread:
  `VBVMR_Login/Logout`, `IsParametersDirty`, get/set float. Polling happens inside the
  existing 2000 ms wake cycle; snapshots are deduplicated like the WASAPI channel.
- Routing is global per channel with last-write-wins semantics. Two widgets sharing a
  channel but configured with different Voicemeeter targets cannot be served at the
  same time — this is an intentional MVP limitation (recorded here, noted in AGENTS.md).
- When the DLL or the Voicemeeter application is absent, a routed channel publishes
  `unavailable` (fronted by `Voicemeeter não está em execução` / `não está instalado`
  in read/write errors). Recovering happens automatically on the next poll.
- `capabilities` exposes `voicemeeter: boolean` (DLL presence).
- The device popups (`audioOutputs` / `audioInputs`) keep listing and switching
  Windows endpoints; Voicemeeter routing only changes what the mute button and the
  slider act on.

## Routing menu (audio popups)

- New native channel `voicemeeter`: publishes a `Snapshot` — `{ application,
strips[], buses[] }` with `index`, engine `slot` (`A1..A5`/`B1..` for buses,
  `Hardware n`/`Vn..` for strips), `physical` flag, device/label `name`
  (`Device.name` via `VBVMR_GetParameterStringA`), `gain`, `mute`. Published while
  the channel is subscribed **or** any routed audio channel is active; otherwise
  `unavailable` (never demo fallback).
- Names come from `VBVMR_GetParameterStringA("Strip[i].Device.name")` /
  `"Bus[i].Device.name"`, falling back to `Strip[i].Label` and then to an empty
  string (the UI shows only the slot). Validated live on a Banana install:
  strips read `Mic`, `CABLE Output (VB-Audio Virtual Cable)`, `Windows`,
  `Discord`; `Bus[0]` (A1) read its assigned device.
- Frontend: `src/hooks/useVoicemeeterCapability.ts` caches the
  `capabilities` command; both audio popups carry a gear button
  (`Configurações do Voicemeeter`, same Dialog-`Settings` pattern as the
  reminders popup) that opens a settings view — `src/features/audio/VoicemeeterSettings.tsx`.
  The view has a `Usar Voicemeeter` checkbox plus a radio list of every strip
  (microphone) or bus (volume); the engine list arrives on the dedicated
  `voicemeeter` channel. The checkbox writes the `audio.enabled` flag:
  `enabled: false` keeps the stored target while the widget drives the Windows
  endpoints again; re-enabling restores the previous target (or defaults to
  index 0 when nothing was stored). When the engine is not running the view
  keeps the Windows note plus a notice instead of the list.
- `--probe-vm`: one-shot diagnostic that logs the live snapshot and round-trips
  mute + gain (+1 dB, restored) on `Bus[0]`/`Strip[0]`. On the reference install
  (Banana) all round-trips pass, proving the native write path; the reported
  "sliders/mute do not control Voicemeeter" symptom was a misconfigured widget
  (wrong/absent `audio` block), which the menu now prevents.

## Files

- `src-tauri/src/voicemeeter.rs` — remote API binding behind a `RemoteApi` trait,
  parameter names, percent↔dB mapping, session client, strip/bus snapshot with
  device names, `--probe-vm`, tests with a fake API.
- `src-tauri/src/metrics.rs` — worker routing (`Request::Source`), VM poll/publish
  (routed channels + the `voicemeeter` menu channel), VM writes for routed
  channels.
- `src/services/configuration/config.ts` — `audio` widget settings and helpers.
- `src/hooks/useAudioSource.ts` — pushes the routing from the widgets on config change.
- `src/hooks/useVoicemeeterCapability.ts`, `src/features/audio/VoicemeeterSettings.tsx` —
  the capability cache and the gear settings view of both audio popups.
- `src/stores/config.ts` — `setWidgetAudio` persistence action.
- `src/services/system/bridge.ts` — `voicemeeter` channel types and the
  `capabilities` adapter call.
- `src/features/volume/` and `src/features/microphone/` — pill text/tooltip routing
  awareness.

## Validation

- `cargo test --manifest-path src-tauri/Cargo.toml` — session state machine tests
  (fake API), mapping/bounds/parameter-name tests.
- `pnpm test` — schema, widget routing, native bridge command tests
  (`voicemeeter.test.tsx`, `config.test.ts`, `native-bridge.test.ts`).
- Live gate (Voicemeeter Banana x64, to be recorded under `docs/evidence/`):
  slider/mute reflect the configured strip/bus, engine-side changes appear within
  2 s, closing Voicemeeter flips the widget to `unavailable` and back, and the bar
  releases the remote session on exit.

## Out of scope (recorded)

- Hotkeys (the AutoHotkey F24 toggle), macrobutton support, and two-way mute sync
  with Windows endpoints. The reference behavior lives in `D:\ahk\voicemeeter\mic_overlay.ahk`
  (external, never shipped or imported by Strata).
