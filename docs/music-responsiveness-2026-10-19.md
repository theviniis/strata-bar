# Music responsiveness investigation — 2026-10-19

Investigated against a real Windows GSMTC spotatui session and an already
connected Strata Spotify account. No credentials or track metadata are recorded
here. Favorite mutations were restored to their original state.

## Reproductions and changes

- A new track inherited the previous track's five-second refresh interval.
  `new_track_does_not_wait_for_previous_tracks_refresh_interval` failed before
  the fix and passed afterward. New tracks now bypass the normal refresh delay,
  while authentication, network and rate-limit backoff remain enforced.
- Repeated metadata notifications changed the track ID even when title, artist
  and album were unchanged. This remounted popup controls and invalidated Spotify
  correlation. The real-player test
  `live_duplicate_metadata_preserves_track_identity` failed with IDs
  `track-1-2` and `track-1-3` before the fix and passed afterward.
- Favorite mutations performed GET playback, PUT/DELETE library, and GET library
  contains in sequence. The local HTTP integration test failed with three
  requests before the fix and passed with one afterward. Writes use only the
  internally correlated URI; forged URIs and stale identities remain rejected.
  Successful write responses acknowledge the new value. A late response cannot
  update another track's cache.
- Playback actions previously read Windows metadata before dispatch and again
  inside the action. They now validate the native session, metadata revision,
  track identity and capabilities against the cached snapshot. Unread track
  changes are rejected. Favorite completion publishes through a cached tick.
- A missing session cleared the snapshot, but subsequent healthy ticks reused
  that empty snapshot indefinitely unless another Windows event arrived.
  `retries_a_temporarily_missing_session_without_another_windows_event` failed
  before the fix and passed afterward. Empty snapshots now trigger another read.

## Measurements

| Real-player check                          | Result                              |
| ------------------------------------------ | ----------------------------------- |
| Initial Windows read                       | 69–72 ms                            |
| Play/pause acknowledgement before / after  | 20 ms / 10 ms                       |
| Next acknowledgement before / after        | 20–22 ms / 10 ms                    |
| Favorite initial lookup                    | 786–1808 ms                         |
| Favorite write / restoration after changes | 279 ms / 267 ms                     |
| Five next-track transitions after changes  | 796–2875 ms; zero unavailable reads |

The remaining track-change time is the external player's delivery of new GSMTC
metadata: individual metadata reads took about 10 ms and artwork reads 21–25 ms.
An initial test asserting that the entire external track transition finished in
500 ms failed. The retained latency test distinguishes command acknowledgement
(under 500 ms) from external metadata delivery (bounded by an eight-second
deadline). This is not a claim that Spotify/spotatui track loading is instant.

The exact intermittent “Mídia indisponível” message did not reproduce during the
live runs. All 330 captured native updates passed the frontend parser. The
recovery fix covers a demonstrated worker state-machine failure, but these
results cannot prove every intermittent upstream failure is eliminated.

## Verification

- `pnpm test`: 203 passed across 36 files.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 110 passed, seven opt-in
  hardware/live tests ignored.
- Explicit live tests: duplicate metadata identity, play/pause latency, five
  next-track transitions, and authenticated favorite lookup/write/restoration
  passed.
- `pnpm exec tauri build --no-bundle`: passed. The release executable's
  `--probe-media` output also passed the frontend parser with ready media and
  artwork.
- `pnpm typecheck` remains blocked by existing `ButtonProps`/derived props errors
  in `button-loading.tsx` and `AudioOutputs.tsx`.
- `pnpm lint` remains blocked by four existing Tailwind canonical-class errors
  in `code-block.tsx`. Those frontend files were not modified.

Live tests change real playback or favorites and are deliberately opt-in. Run
them individually with `cargo test --manifest-path src-tauri/Cargo.toml <name>
-- --ignored --nocapture`; do not run all ignored hardware tests together.

The running bar at the end of validation was an executable from the separate
`startup-analyze` worktree. It was not terminated or replaced. The updated
standalone executable is `src-tauri/target/release/strata-bar.exe` in this checkout;
restart the bar using that executable to apply these changes.

## Follow-up: immediate lookup publication and nonblocking reads

Applied the two requested follow-up optimizations:

- Spotify lookup completion now sends a dedicated enrichment notification to the
  media worker. Its cached snapshot is enriched and published immediately. This
  removes the dependency on the next one-second tick. Refreshes skipped because
  of backoff/cache state do not trigger a notification loop.
- Metadata fetch, artwork stream opening and artwork byte loading retain their
  WinRT operations between passes. Pending operations return control to the
  request queue; a 20 ms timer advances them only while needed. Text/playback are
  published before artwork finishes. New metadata revisions supersede pending
  reads, native stale-track rejection remains enforced, and Core Audio dirty
  notifications remain intact while metadata is pending. Session teardown cancels
  pending operations. The settled/blocking read remains diagnostic-only.

The lookup regression used a local HTTP server and the actual Spotify worker:
the result was already cached, but notification failed before the change; it now
arrives before the test's 250 ms deadline without a media tick. A real WinRT async
operation held behind a channel gate previously blocked the read until the
one-second test dependency deadline; it now returns pending within 50 ms. Tests
also cover completion, timeout, enrichment/Windows-event coalescing and retaining
native refresh requirements.

Follow-up validation: 114 native tests passed (eight opt-in tests ignored),
203 frontend tests passed, and `pnpm exec tauri build --no-bundle` succeeded.
The updated release probe returned a valid `unavailable` event, consistent with
the absence of a player. The explicit live test
`live_controls_respond_while_artwork_is_pending` could not run to its assertions:
there was no running music player/current GSMTC session. The previous release's
probe independently also returned `unavailable`. No new real-player latency
measurement is claimed for this follow-up. The opt-in test covers gated metadata,
audio notifications and real playback controls while artwork is gated, restoring
the original playback state afterward.
