# Microphone control validation

Implemented on 2026-10-19. The native bar includes the microphone after audio
output. New studio configurations include it by default; saved configurations
are preserved. The studio editor exposes the new widget type.

## Native contract

- `audioInputs`: active capture endpoints and the multimedia default ID.
- `microphone`: default capture endpoint volume (0–100) and mute state.
- `set_audio_input({ deviceId })`: validate an active capture ID, set console,
  multimedia and communications defaults, and verify every role. Partial failures
  are returned and the worker rereads actual Windows state.
- `set_microphone({ level?, muted? })`: validate the level and operate on the
  current multimedia capture endpoint. Output devices are independent.

Capture and playback share the COM worker and notification infrastructure but
retain separate endpoint callbacks. The existing overlay hosts the popup.
No recording, boost, signal metering or app-specific routing is included.

## Evidence and reproduction

`docs/evidence/microphone-core-audio-2026-10-19.json` records a real Windows
capture endpoint switch, volume/mute changes, restoration of all three defaults
and the target endpoint state, and preservation of playback defaults.

Run the hardware test explicitly:

```sh
cargo test --manifest-path src-tauri/Cargo.toml live_microphone_round_trip -- --ignored --nocapture
```

It temporarily changes real microphone settings and restores them. Normal Rust
tests also enumerate real capture devices and reject playback endpoint IDs.
The debug `--check-popups` harness includes `audioInputs` on every connected
monitor, checking floating styles, focus, resize, closing and subscription cleanup.

Physical unplug/replug remains a manual hardware check. Frontend tests cover
missing devices, external state events, concurrent commands, errors, unmount,
keyboard volume and local studio controls.

The aggregate check encounters existing formatting issues in five unrelated UI
and highlighting files. Repository ESLint also reports four existing canonical
Tailwind class errors in `src/components/ui/code-block.tsx`.

The native executable builds successfully. A fresh `--check-popups` launch was
prevented by the per-session instance guard because another Strata process was
already running; the existing process was preserved. Popup runtime verification
on multiple monitors and physical unplug/replug are not claimed by this evidence.
