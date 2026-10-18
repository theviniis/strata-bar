# Memory channel and popup

The native memory widget and popup consume the same `memory` subscription. The
popup uses the existing widget popup framework; it creates no additional native
window. Browser studio content is explicitly illustrative and never replaces a
failed native reading.

## Contract and developer workflow

The Rust memory contract is canonical. Cargo generates the checked-in frontend
declarations during build/check/test; do not edit the generated declarations.
After changing a Rust contract, run `cargo check --manifest-path src-tauri/Cargo.toml`
and `pnpm typecheck`. Keeping the generated declarations in Git allows frontend
development on a clean checkout without compiling the Windows host first.

`ChannelData['memory']` identifies the payload. The frontend boundary validates
payloads at runtime, rejecting invalid readings as errors and ignoring duplicate
or older sequence numbers within a subscription. `useMemory` owns async cleanup,
retains the last successful payload across transport errors and supplies the time
used for freshness rendering. Feature components do not manage native windows.

The usual system event wraps a memory payload:

- `sequence`: process-local increasing observation identity, shared by windows.
- `sampledAt`: observation time in Unix milliseconds.
- `totalBytes`, `availableBytes`, `usedBytes`, `cachedBytes`, `pagingFileBytes`:
  metric records with values in bytes.
- `percent`: a metric record with utilization in the range 0–100.
- `history`: ordered observations containing `sequence`, `timestamp` (Unix
  milliseconds) and `percent` (0–100 or null when the observation failed).

Each metric record has `status`, `value`, `updatedAt` and `error`. `ready` means a
valid current reading. `error` preserves an earlier successful value and its
original timestamp; `unavailable` has no successful reading. `notConfigured` is
reserved for an enumeration confirming there are no paging files. Missing or
failed values are never fabricated zeros. A payload can be ready while individual
metrics have failed; consumers must inspect metric status and freshness.

## Windows definitions and sources

Total and available physical memory come from `GlobalMemoryStatusEx`. In-use RAM
is total minus available minus modified-page bytes. Utilization is that in-use
value divided by total usable physical memory, times 100. This refines the old
widget's total-minus-available definition.

Language-neutral PDH counters provide modified-page bytes and the core, normal
priority and reserve standby cache lists. Cached memory is the sum of standby and
modified bytes; it overlaps available memory. `SystemCache` is not substituted.
Queries persist across observations and are reopened after failures, allowing
automatic recovery. Sources are sampled serially, not as an atomic Windows memory
transaction, so inconsistent physical observations are errors rather than clamped
or reinterpreted measurements.

`EnumPageFilesW` supplies actual paging-file pages in use, aggregated and converted
using the Windows page size. This is not commit charge or commit limit. Collection
requires no administrator elevation in an ordinary interactive session.

## History and freshness

One native worker collects every two seconds while memory consumers exist. A
bounded history retains up to 31 observations over the latest 60 seconds, using
elapsed time for retention. Initial state and history travel together; reopening
a popup does not reset observations while a bar remains subscribed. Startup has
only actually observed history. With no consumers collection pauses.

Missing utilization values and intervals exceeding three seconds break the graph
line. No samples are synthesized across suspension, inactivity or source errors.
Readings older than six seconds are visibly stale even if no event arrives; a
transport error marks retained readings stale immediately. The graph drops expired
observations as time advances. A backward wall-clock adjustment resets history
rather than publishing unordered timestamps.

The popup uses GiB and one decimal place for percentages, a fixed 0–100 percent
scale, and pointer/keyboard sample inspection. It inherits shared popup focus,
placement, Escape and outside-pointer dismissal.

## Verification

Frontend checks cover presentation, partial failures, stale readings, malformed
payloads and subscription ordering through the public channel and rendered content.
The existing `--check-popups` native check exercises both memory and audio on each
connected monitor, including popup lifecycle and subscription cleanup. Memory
checks additionally cover real non-demo content, 60-second retention, reopens and
pausing/resuming all memory consumers. The fixture controls exist only in the
development check view.

Native source failure cases and actual OS sleep are distinct from a subscription
pause; report unexercised live scenarios explicitly. Published metric formulas
must be compared with Windows readings allowing collection-time and display
rounding differences, not claimed to be simultaneous snapshots of Task Manager.

### Validation record (2026-10-18)

- Native popup verification passed on both connected monitors without elevation:
  real content, focus, resizing, Escape/outside dismissal, reopen history and
  subscription cleanup. A 62-second observation confirmed old samples expire;
  all-consumer pause/resume preserved an approximately eight-second graph gap.
- Independent CIM readings confirmed usable physical capacity and supplied cache,
  modified-page and paging-file comparisons collected within 1.6 seconds of the
  Strata probe. See the new memory evidence records in docs/evidence.
- Rust tests: 34 passed, one existing audio-routing test intentionally ignored.
  After review, six deterministic tests were added through the public collector
  interface, bringing the result to 40 passed and one ignored. They control only
  Windows observations and time, covering composition, page conversion, invalid
  bounds, partial failures, stale timestamps, recovery, absence/overflow of paging
  files, retention, gaps and clock rollback.
- Final post-review native verification also passed on both monitors. The latest
  record is `memory-popup-native-reviewed-2026-10-18.json`. Retention is measured
  after closing the panels, independently of focus-sensitive interaction checks.
  A post-exit probe confirmed both work areas returned to their pre-check values.
- Production frontend build passed. Formatting, ESLint and TypeScript passed.
  The full frontend run had 69 passing tests and six failures in existing audio
  popup suites after the separate audio UI refactor. Failures involve absent
  ResizeObserver support in the test environment and changed slider/button
  behavior. Memory and native-bar suites passed; audio implementation is untouched.
- Actual OS sleep, genuine PDH outages and a machine with no configured paging
  files were not induced live. Their interface states are covered by controlled
  channel/rendering tests; pause/resume is not presented as an OS-sleep test.
- Editing or regenerating frontend modules during native smoke verification can
  reload WebViews and invalidate subscription baselines. The passing long run
  used stable sources; the development-reload lifecycle is a separate limitation.

## Review

### Standards

No documented-standard violations were found. Review identified two maintainability
issues: selecting units through translated labels and duplicating freshness rules.
Both were corrected with explicit unit descriptors and shared presentation logic.
Follow-up review found no remaining findings.

### Spec

Review identified missing deterministic native coverage for arithmetic and source
failures. The user confirmed the public collector as an additional testing seam;
six controlled tests now cover those behaviors. Follow-up review found no remaining
findings or scope regression.

Review totals: Standards 0 unresolved; Spec 0 unresolved.
