# Music validation — 2026-10-18

Implemented in the isolated `codex/music-widget` worktree, preserving the copied
GPU/disk development baseline. The [feature record](plans/music-widget.md) contains
the contract, Spotify setup and remaining upstream limitations.

| Check                                                               | Result                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm lint`                                                         | Passed                                                  |
| `pnpm typecheck`                                                    | Passed                                                  |
| Formatting of music changes and edited frontend/docs                | Passed                                                  |
| Music, media bridge, Spotify settings, native bar and studio suites | 15 passed                                               |
| Full frontend suite                                                 | 117 passed, 7 existing failures                         |
| `cargo test --manifest-path src-tauri/Cargo.toml`                   | 80 passed, 1 audio-routing test ignored                 |
| `pnpm exec tauri build --no-bundle`                                 | Passed; standalone release executable produced          |
| `pnpm check`                                                        | Stops at pre-existing checkout formatting/CRLF failures |

The seven existing frontend failures are in `audio-outputs.test.tsx` (five),
`widget-popup.test.tsx` (one) and `resource-graph.test.tsx` (one), matching the
known failures documented before this work. The aggregate formatting gate also
includes CRLF files inherited from the checkout, including historical evidence.
Those historical records were not rewritten to make the gate pass.

## Native evidence

[The release probe](evidence/music-native-2026-10-18.json) read a real spotatui
session through Windows GSMTC, including title, artist, album, playback, artwork
and seekable timeline. The image is represented by its MIME type, byte count and
SHA-256 in the evidence file.

Core Audio reported one inactive and one active source-matched audio session.
The unique active application session was selected and its volume/mute state was
read successfully. The probe opens no bars and changes neither playback nor
application/master volume. Spotify enrichment is deliberately separate from this
native sensor probe.

## Visual evidence and acceptance limits

[The studio capture](evidence/music-studio-2026-10-18.png) records the compact
widget directly before audio output. Browser interaction verified play/pause and
next track in the explicitly labelled demo. The narrow layout truncates the music
text while keeping audio output visible.

Authenticated Spotify login/favorite round-trips, real playback/seek/volume
mutations, and multi-monitor interaction/Win32 geometry checks against the new
binary remain manual acceptance checks. No real account was connected and no
user playback or audio routing was changed during validation. These results do
not claim that the original native MVP geometry or performance gates are closed.

## Integration with main

Integrated on top of `cd99a09`, retaining GPU and disk changes, including volume kinds and the disk popup. Rust: 82 passed, one hardware routing test ignored. TypeScript and ESLint passed; the 14 focused media/bridge/settings/native-bar tests passed. Full frontend testing retains the seven previously recorded failures in audio outputs, widget popup and resource graph. `pnpm check` stops on existing checkout formatting (159 files). Live Spotify authentication and multi-monitor acceptance limits above remain unchanged.
