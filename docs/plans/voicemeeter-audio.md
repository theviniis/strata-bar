# Voicemeeter audio routing (volume / microphone)

Status: implemented (native + studio-inert). Owner: `src-tauri/src/voicemeeter.rs`.

## Goal

The `volume` and `microphone` widgets can be configured to control Voicemeeter
strips/buses instead of the Windows default endpoints. Strata reads and writes the
Voicemeeter engine through the vendor remote DLL; it never mirrors Windows mute
(today) and never falls back to Windows or demo values.

## Configuration (schema version 2)

Audio is global, independent of widget instances and monitor layouts:

```json
{
  "version": 2,
  "audio": {
    "output": { "source": "voicemeeter", "targetIndex": 0 },
    "input": { "source": "windows", "targetIndex": 0 }
  }
}
```

- Each channel defaults to Windows and index 0. Output always targets a bus;
  input always targets a strip. The destination kind is derived, never editable.
- Settings → Áudio opens one page with output/input sections, each with a source selector and, for
  Voicemeeter, a live target selector. An unavailable saved target stays visible;
  without a live list, a bounded index field (0–7) remains available.
- Source changes retain the index. Windows ignores it; choosing Voicemeeter again
  reuses it. There are no per-widget labels, enable flags or monitor overrides.
- Version 1 documents migrate on read: all old widget/monitor audio blocks are
  removed and both channels reset to Windows/index 0. Other preferences survive.
  Loading never rewrites an existing file; the next explicit save writes version 2.
- Version 2 rejects legacy audio fields and per-widget audio blocks in both the
  frontend and native validator. Failed edits preserve the last good document.
- Banana x64 has strips 0–4 and buses 0–4; Basic has 3 strips / 2 buses, Potato 8/8.
  The worker validates indices against the running application as well.

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
- Routing is global per channel. Every bar sends the same output/input settings,
  including bars without audio widgets; widget order and monitor overrides cannot
  select a different target.
- When the DLL or the Voicemeeter application is absent, a routed channel publishes
  `unavailable` (fronted by `Voicemeeter não está em execução` / `não está instalado`
  in read/write errors). Recovering happens automatically on the next poll.
- `capabilities` exposes `voicemeeter: boolean` (DLL presence).
- The device popups (`audioOutputs` / `audioInputs`) keep listing and switching
  Windows endpoints; Voicemeeter routing only changes what the mute button and the
  slider act on.

## Engine discovery and consumers

The `voicemeeter` channel publishes `{ application, strips[], buses[] }` with
index, slot, physical flag, assigned device name, gain and mute. Names come from
`VBVMR_GetParameterStringA`, with the existing engine label fallback.

`src/settings/AudioSettings.tsx` edits the global channels in the shared draft.
`src/hooks/useAudioRouting.ts` derives bus/strip targets and pushes both routes
on startup and configuration events. Controllers read the global channel for
labels and tooltips (`Bus n` / `Strip n`); there is no custom label override.
Device popups retain daily Windows endpoint switching and volume/mute controls.

`--probe-vm` is a diagnostic that temporarily round-trips mute and gain on
Bus[0]/Strip[0], restoring them. It does not prove global configuration propagation
across multiple bars; that requires a separate native acceptance run.

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
