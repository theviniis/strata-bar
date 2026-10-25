# Media spectrum

Implemented as the independently positionable `mediaSpectrum` widget. Add
**Espectro de mídia** through the layout editor; existing layouts are unchanged.

The selected GSMTC session identifies the player. The native resolver reuses
the existing AUMID/executable matching and requires one active audio-session PID.
Windows process loopback captures that process and its descendants, independently
of the physical output. Shared browser audio processes can include multiple tabs.
Ambiguous or missing matches are unavailable; there is no system-mix fallback.

The native worker holds internal media/output subscriptions, so the widget works
without Music or Volume in the layout. All monitors share one capture. Pausing,
losing the configured output or removing the last consumer releases capture.
Playback/session/process/output changes reset the analyzer. Missing sources retry
automatically. PCM stays in a bounded in-memory ring and is never sent over IPC.

`audio.output` retains its existing meaning: Windows endpoint or Voicemeeter bus.
The spectrum observes the routed volume channel for mute and availability. Mute
shows six resting bars; unavailable output hides the widget. Frequencies are
captured before final bus mixing/effects/gain, rather than from the bus mix.

Analysis uses 2048 samples at 48 kHz, Hann window, channel power averaging and
six logarithmic bands from 60 Hz to 16 kHz. Power is normalized over -60..0 dBFS.
Publication is capped below 30 Hz. Each payload has a session ID, capture
generation, sequence and exactly six normalized values; the bridge rejects
malformed or stale frames. Motion (`motion/react`) interpolates real band
heights; reduced motion uses immediate updates. Studio/Storybook fixtures are
explicitly labeled demonstrations.

## Validation on October 25, 2026

- Targeted frontend run: 29 tests passed across spectrum, native bar, config and
  media bridge suites. The seven spectrum tests also passed after guard changes.
- Targeted native run: five spectrum tests passed, covering FFT tones at
  32/44.1/48/96 kHz, stereo phase opposition, silence, playback gating,
  subscriber ownership and routed output state.
- Storybook rendered six centered bars in the theme color in Chromium; the
  demonstration was visually inspected.
- Native build and TypeScript passed; lint/format checks passed for changed
  frontend code. The aggregate check is blocked by existing issues in
  `src/components/popup-helpers.tsx` (formatting and four ESLint errors).
- Full frontend run: 454 passed, 48 failed. Full Rust run before the final added
  output-state test: 212 passed, three geometry tests failed, 26 ignored. These
  failures concern existing agents/settings/loading/geometry behavior; they
  remain outside this feature's acceptance claim.
- Real capture evidence:
  [native probe](../evidence/media-spectrum-native-20261025.json).
  Chrome PID 34536 yielded 259 audio packets and 88 six-band frames in 3030 ms.
  A simultaneous loopback of the silent probe process had peak zero while
  Chrome played, confirming exclusion of unrelated process audio.
- The probe used 0 CPU seconds in a one-second idle sample and 0.203125 CPU
  seconds during capture. This is a short native-only measurement with two
  captures, excluding WebView rendering and full-bar worker lifecycle.

`strata-bar.exe --probe-spectrum` repeats this read-only check and writes
`%TEMP%/strata-spectrum-probe.json`. It does not change playback or audio routing.
The probe validates raw capture, not the complete UI/output gating lifecycle.
Live acceptance still needs deliberate Windows/Voicemeeter route switches,
mute, player changes, Voicemeeter exit/recovery and multi-monitor removal while
the widget is enabled; these were not performed against the user's active setup.

API references: [Microsoft process loopback sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)
and [GSMTC source identity](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession.sourceappusermodelid).
