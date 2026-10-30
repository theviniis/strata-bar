# Reusable Widget popup hosts — 2026-10-29

This replaces destruction/replenishment as the normal close/open lifecycle in
`desktop/sessions.rs`. Pinning still preserves the HWND, React tree and active
subscriptions; only the session mode changes.

## Ownership

A session owns one interaction and its widget/monitor identity. A host owns an
HWND, document, imported code and document-local caches. Closing ends the session
and pending interactions. Its content unmounts and native subscriptions are
removed immediately; frontend teardown remains idempotent. QueryClient lives for
the document rather than the currently rendered popup.

The native module keeps at most two idle hosts, preferring the most recently used.
Active/pinned hosts are exclusively leased and never evicted to meet that idle
budget. Replacement returns the previous transient host before selecting the next
host, so switching widgets reuses the document. An older idle host is evicted when
the budget is full. Exit destroys all leased and idle hosts.

`overlay_ready` records document readiness after fonts, React and event listeners
initialize. Selection prefers ready documents. The frontend separately prepares
the selected content and its snapshot before mounting. Cold startup or exhausting
the pool through additional pins can still require a new document.

## First content

`popups/prepare.ts` loads deferred content and obtains the authoritative initial
event through the validated native subscription path, disposing that temporary
interest before mounting. Resource and ordinary channel hooks start from retained
readings; mounted content owns live subscriptions. Workspace projections are
excluded from this unkeyed retention. No extra sensor/history authority or demo
fallback is introduced.

Retention expires five seconds after delivery and rejects clock rollback. Each
native opening refreshes its selected channels before mounting. Native errors,
unavailability and real loading remain truthful. Resource presentation still owns
sampled-value freshness; native memory history remains under ADR-0001.

Reminder and agent snapshots load before their editors mount. The shared
reminderAlert document retains its startup connection, while idle widget hosts do
not start reminder connections. Active reminder editors connect for their session.
The scheduler, sound and special shared overlay alert remain independent of any
editor being open.

## Authorization and late work

`desktop::content_window` shares the role decision across affected native modules:
bar, shared overlay, or registered active popup session. A popup label prefix alone
grants no content privileges. Domain-specific settings permissions remain
separate. Idle hosts cannot subscribe to channels or execute reminder commands.
Pin, resize, drag and exit still validate both window and session.

Preparation has an ordering ticket; clear/newer render invalidates old results.
Native queued blur captures session and generation at message receipt, so an old
lease cannot dismiss a successor on the same HWND. Closing completes its exit
animation before returning the host to the pool.

## Validation

Regression tests cover retained first readings, expiry/error, preparation before
mounting, canceled preparation, preserved query cache, session teardown and pin
continuity. Cold-GPU tests now explicitly seed loading, because readings survive
unmounting within one document.

The native check exercises CPU -> GPU -> reminders -> CPU on one HWND with no new
WebViews, observes early loading, rejects old-session resize and idle-host reminder
authorization, and retains geometry/fullscreen-signal/komorebi checks. DOM commit
observation is not physical display FPS. Window-visible timing has coarse polling.
The background harness establishes foreground eligibility to reproduce a real
trigger click; it does not disable production blur dismissal. Traces and URL
replies carry session IDs to reject old results in reused documents.

New evidence is recorded separately. Short development process-memory/CPU samples
are noisy: a negative delta is not a negative host cost or steady-state acceptance.
Actual pointer dragging across mixed DPI, monitor unplug and external fullscreen
still need manual acceptance.

## Recorded result

[Native evidence](../evidence/popup-host-reuse-20261029.json) records all four
openings on one reused host, no new WebViews during switches, no early loading,
idle resource subscriber cleanup and rejected idle-host reminder authorization.
Thirty in-place pin/unpin cycles preserve the same HWND and draft.

Production frontend build, formatting, ESLint and TypeScript passed. Rust passed
245 tests (31 explicit acceptance tests ignored). The complete frontend run
passed 650 tests and retained the two previously recorded metric-text failures
in CPU temperature and the GPU demo; 47 focused tests passed after the final
reminder-role adjustment. The aggregate gate is therefore not fully green.

## Reminder delivery recovery — 2026-10-29

The prior check opened the editor but did not exercise scheduler delivery. A new
isolated native timeout check reproduced a lost notification: the initial alert
appeared, then WM_DISPLAYCHANGE hid it and the scheduler never delivered it again.
Dispatch had already been recorded as presentation.

The scheduler now records presentation only from the owning visible renderer's
opening acknowledgment or an explicit close. Native system/geometry hides return
a non-closing reminder alert to the queue. Explicit close is kept distinct, so an
alert closed during entry does not immediately return. Sound delivery retains its
existing independent handling.

[Recovery evidence](../evidence/reminder-expiry-recovery-20261029.json) records the
failing path and the passing real-timeout, redisplay and explicit-close checks.
The fixture uses its own temporary reminder document. All 61 focused frontend and
245 Rust tests passed. The broad pinned-popup native check stopped at its existing
clip-path assertion: the current frontend animates a rounded inset, while that
assertion expects no clip path throughout opening. That animation was not changed
as part of reminder delivery recovery.
