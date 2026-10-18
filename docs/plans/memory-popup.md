# Memory resource API and popup

Status: implemented after the user invoked implement. Native verification passed
on two monitors without elevation on 2026-10-18. See ../memory.md for validation
results and remaining live scenarios.

## Confirmed decisions

- Deliver an expanded memory API and a functional memory popup in native bars.
- Reuse the existing widget popup framework described in ../popups.md.
- Use Windows Task Manager concepts as the semantic reference, with explicit
  distinctions between total physical RAM, available RAM and committed memory.
- Show physical memory in use, total physical memory, cached memory, available
  memory, paging-file usage and utilization.
- Paging-file usage means aggregate actual paging-file usage, not commit charge.
  Committed memory is outside the popup scope for this delivery.
- Keep a bounded native history covering the latest 60 seconds at a 2-second
  sampling cadence, shared across monitor windows and available when opening the
  popup. Collect while there are memory consumers; pause without consumers.
- Closing a popup must not discard history while a memory widget remains active.
- Startup and resumed collection only expose observations actually collected;
  there is no invented pre-start history.
- Represent collection failures and suspension intervals as graph gaps. Preserve
  the last successful reading with an explicit stale indication and recover
  automatically.
- Improve memory developer experience through a typed, documented contract with
  explicit units, loading/error states and safe subscription lifetimes.
- Concentrate structural changes on memory; do not migrate CPU, audio or komorebi
  as part of this delivery.
- Preserve existing local UI changes.
- Cached memory must follow the Task Manager concept; a similar system-cache
  metric must not silently replace it. Verify the exact Windows source first.
- Cache and paging-file failures are independent: keep physical RAM readings and
  graph usable when only a supplementary metric fails. Errors are not zeros.
- Distinguish no configured paging files from a paging-file collection failure.
- The popup is informational, following existing popup styling, with a fixed
  60-second utilization graph on a 0–100 percent scale and indicators below.
- Display memory sizes in GiB and percentages with one decimal place. Pointing at
  a graph sample exposes its value and time. Period selection and configuration
  actions are outside this delivery.
- Expose the latest reading and history through a single memory subscription,
  with a consistent initial state and sample identity to prevent duplicates and
  regressions. Widget and popup use the same contract.
- Validate incoming memory data at the frontend boundary and derive consumer
  types from the contract rather than duplicating payload definitions per widget.
- Rust owns the memory contract; generate frontend types from it and retain
  runtime validation at the frontend boundary.
- Running without administrator privileges is a requirement. Use supported
  Windows sources and represent unavailable metrics explicitly with automatic
  recovery; do not request elevation to supply the popup.
- Refine physical memory in use to exclude modified pages: target total minus
  available minus modified, validating this composition against Windows 11 live.
  Utilization and graph must use the same definition, even when this changes the
  percentage shown by the existing widget. Cached memory is standby plus modified.
- If a required source for in-use accounting fails, do not silently substitute
  the old formula: keep independent readings usable and mark affected derived
  metrics unavailable/stale, with gaps in their history.
- Completion requires automated checks and a real native popup check without
  elevation. Verify reopen history, sharing across connected monitors, partial
  failures, gaps/recovery, subscription cleanup and Windows metric comparisons.
- Run pnpm check, pnpm build and cargo test --manifest-path src-tauri/Cargo.toml.
  Record new evidence and explicitly identify scenarios that cannot be exercised.

## Implementation verification

The design frontier is resolved. Exact source behavior and agreement with Windows
11 remain engineering verification tasks, not assumed facts. Use documented PDH
counters for standby/modified categories, language-neutral counter names, and
pagefile enumeration for actual usage where supported. Validate source failures
independently; missing modified data also affects derived in-use/utilization.

Use one coherent initial snapshot/history state with ordered sample identities.
Bound retention by elapsed time, expose timestamps in documented units, and
preserve gaps across suspension or failed collection. Startup has only observed
history. Keep memory-specific implementation out of the popup framework.

## Source notes

- Current native memory payload contains percent, usedBytes and totalBytes only;
  usedBytes is total physical minus available physical memory.
- PERFORMANCE_INFORMATION.SystemCache is standby plus the system working set;
  do not silently equate it with another definition of cached memory.
  Source: https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-performance_information
- ENUM_PAGE_FILE_INFORMATION.TotalInUse reports current pagefile usage in pages.
  Source: https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-enum_page_file_information
- The local read-only YASB reference computes physical used as total minus
  available. Its cache source queries memory lists, with a SystemCache fallback;
  these are different definitions. It also turns several failures into zeros.
  These are reference observations, not behavior to copy into Strata.
- Interactive users can view performance counters without administrator rights.
  Source: https://learn.microsoft.com/en-us/windows/win32/perfctrs/limited-user-access-support
