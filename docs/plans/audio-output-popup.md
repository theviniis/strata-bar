# Audio output popup

The native volume icon opens the shared interactive overlay. The bar keeps its
volume slider; the popup also includes a volume slider, mute and the active output list. Selection changes
console and multimedia defaults, preserves communications and keeps the list open.
Applications with explicit output routing keep their own device selection.

## Contracts and lifecycle

- `audioOutputs`: `{ devices: [{ id, name }], defaultDeviceId }` in the standard
  channel envelope. Active render endpoints only; endpoint IDs identify devices.
- `set_audio_output({ deviceId })`: revalidates availability in the audio worker,
  applies console/multimedia defaults via the isolated private IPolicyConfig ABI,
  confirms multimedia by rereading Windows and returns the output snapshot.
- Device/default/property notifications refresh the list without polling. A popup
  subscribes only while mounted. Partial failures also publish the actual state.
- Overlay requests retain v1 geometry and add a session and `audioOutputs`
  component. Host session ownership blocks tooltip replacement/cleanup while a
  popup is active; monotonic render generations reject stale cross-window events.
- Popup mode enables pointer events and focus; tooltip/idle mode is click-through.
  Escape returns focus to the source bar. Outside activation, another popup,
  fullscreen, display/DPI changes and exit dismiss it. Moving between monitors
  during explicit placement is distinguished from an external DPI change.
- Popup height follows its measured content through session-scoped `overlay_resize`.
  Native placement reads the current window rectangles, preserves the anchored
  edge and limits height to the monitor's available space. Long lists scroll.
- No WS_EX_NOACTIVATE, AppBar reservations for overlays or demo fallback. The
  studio demo cannot change Windows devices.

## Validation, 2026-10-17

- Frontend gate: formatting, ESLint, TypeScript and 35 Vitest tests passed.
- Rust: 24 regular tests passed, including real endpoint enumeration and invalid
  endpoint rejection. The live routing test is ignored by default because it
  temporarily changes the system output.
- Explicit live test passed with five active outputs: Voicemeeter Windows output
  to USB Audio CODEC and back. Console/multimedia changed, communications stayed
  unchanged, and original console/multimedia preferences were restored.
  Evidence: `../evidence/audio-outputs-2026-10-17.json`.
- Production frontend and debug host built successfully. A live Win32 probe
  reported two reserved monitor bars and a hidden click-through overlay, all
  excluded from komorebi. Evidence: `../evidence/audio-popup-host-2026-10-17.json`.
- The Windows computer-use helper did not expose the tool windows as controllable
  targets. Visual click/focus checks, unplug/replug, fullscreen and mixed-DPI
  transitions remain manual acceptance checks; automated component tests cover
  popup toggling, Escape/outside dismissal, loading/error/empty states, concurrent
  selection blocking, confirmed selection, mute and stale render generations.

Run live routing explicitly with:

```sh
cargo test --manifest-path src-tauri/Cargo.toml live_switch_round_trip_preserves_communications -- --ignored --nocapture
```
