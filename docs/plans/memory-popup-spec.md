# Memory resource API and native popup

## Problem Statement

Users can see a compact RAM reading but cannot inspect recent memory utilization
or distinguish physical memory in use, available memory, cached memory and actual
paging-file usage. Developers lack a complete memory contract and shared history
for building this popup reliably across native windows.

## Solution

Provide an informational memory popup in the real Windows status bar, showing a
60-second utilization graph and six clearly defined indicators. Evolve the memory
API to provide coherent observations and history, precise units, independent
metric failures and generated frontend types, without requiring administrator
privileges.

## User Stories

1. As a desktop user, I want to open memory details from the RAM widget, so that I
   can inspect resource usage without leaving the bar.
2. As a desktop user, I want to see physical memory in use, so that I understand
   current RAM consumption.
3. As a desktop user, I want to see total usable physical memory, so that I know
   the capacity available to Windows.
4. As a desktop user, I want to see available physical memory, so that I know how
   much RAM Windows can immediately reuse.
5. As a desktop user, I want to see cached memory, so that I can distinguish
   reclaimable caching from other memory categories.
6. As a desktop user, I want to see actual paging-file usage, so that I do not
   confuse it with committed memory.
7. As a desktop user, I want a utilization percentage, so that I can assess usage
   relative to usable RAM capacity.
8. As a desktop user, I want a graph of the last 60 seconds, so that I can see
   recent changes rather than only the current reading.
9. As a desktop user, I want a sample value and time when pointing at the graph,
   so that I can inspect an observation precisely.
10. As a desktop user, I want sizes in GiB and percentages with one decimal place,
    so that readings are consistent and easy to compare.
11. As a desktop user, I want collected history on the first popup opening, so
    that I do not need to wait for the graph to fill.
12. As a desktop user, I want history preserved when reopening the popup while
    the widget remains active, so that inspection does not reset observations.
13. As a user with multiple monitors, I want windows to share memory observations,
    so that they report the same system state.
14. As a desktop user, I want gaps during failures or suspension, so that the
    graph does not imply measurements that never happened.
15. As a desktop user, I want stale readings identified, so that I can distinguish
    the last successful value from current data.
16. As a desktop user, I want collection to recover automatically, so that a
    temporary source failure does not require restarting the bar.
17. As a desktop user, I want independent indicators to remain usable during a
    partial failure, so that one source does not blank all memory information.
18. As a desktop user, I want an absent paging file distinguished from a reading
    failure, so that zero usage does not conceal an error.
19. As a standard Windows user, I want the feature without elevation, so that I
    can use the bar under my normal account.
20. As a desktop user, I want collection paused without memory consumers, so that
    unused features do not keep collecting resources.
21. As a keyboard user, I want existing popup navigation and dismissal behavior,
    so that memory details remain accessible and predictable.
22. As a developer, I want one native-owned contract with generated frontend
    types, so that payload definitions do not drift between components.
23. As a developer, I want runtime validation and explicit units and states, so
    that malformed data and unavailable sources are handled deliberately.
24. As a developer, I want a coherent initial reading and history with ordered
    sample identities, so that subscription races cannot duplicate or regress data.
25. As a developer, I want safe subscription teardown, so that popup closure and
    unmounts do not leak consumers.
26. As a studio user, I want any illustrative popup data visibly labeled as demo,
    so that preview values cannot be mistaken for native observations.

## Implementation Decisions

- Extend the memory collector, subscription contract, consumer hook and widget;
  add memory content through the existing popup definition and trigger APIs.
- Reuse shared popup placement, focus, dismissal and window lifecycle behavior.
- Rust owns the memory contract and bounded history. Generate frontend types
  from that contract and validate incoming payloads at runtime.
- Provide current observations and history through one memory subscription with
  coherent initial state and ordered sample identities. Document timestamp units.
- Sample every two seconds while memory consumers exist. Retain observations
  covering the latest 60 seconds, shared across monitors; pause without consumers.
- Expose only actually collected history at startup and after collection resumes.
- Target physical memory in use as total minus available minus modified pages;
  validate the composition on Windows 11. Use this same definition for the widget,
  utilization percentage and graph.
- Define cached memory as standby plus modified pages. Do not substitute system
  cache working set or present overlapping categories as additive partitions.
- Obtain actual aggregate paging-file usage independently of commit accounting.
- Use supported Windows sources without elevation. Verify language-neutral
  performance counters and native pagefile enumeration as collection sources.
- Model loading, errors, unavailable sources and freshness explicitly. Independent
  source failures preserve unaffected readings; missing inputs invalidate their
  dependent metrics rather than silently changing formulas.
- Preserve last successful readings with a stale indication; represent missing
  observations as graph gaps and resume automatically after recovery.
- Distinguish no configured paging files from a failed paging-file query.
- Render a fixed 60-second graph on a 0–100 percent scale, indicators below,
  GiB sizes, one-decimal percentages and sample value/time inspection.
- Follow existing popup styling and native/demo separation. Native failures never
  fall back to demo values. Preserve existing local UI changes.

## Testing Decisions

- The proposed primary acceptance seam is the existing native popup check,
  extended to exercise the real memory widget, subscription and popup together
  under a non-elevated Windows session. The user confirmed this seam alongside
  the public memory subscription and rendered widget/popup content.
- Test external behavior: visible readings, graph observations, freshness,
  source failure recovery, popup interactions and released subscriptions. Avoid
  assertions tied to internal component structure or buffer implementation.
- Reuse existing popup checks for focus, resize, dismissal, floating-window
  exclusion and subscription cleanup rather than introducing another harness.
- Reuse frontend bridge and popup test conventions for malformed payloads,
  initialization races, duplicate/out-of-order observations, partial failures and
  rendering states that are difficult to induce safely in a live session.
- Add focused native tests for memory composition, page-to-byte conversion,
  denominator bounds, independent source failures, retention and observation gaps.
- Verify real reopen history, connected-monitor sharing and operation without
  elevation. Compare Windows source readings with temporal and display-rounding
  differences accounted for; do not claim exact simultaneous Task Manager parity.
- Run the aggregate frontend checks, production build and native Rust tests.
  Record new native evidence and state which scenarios could not be exercised.

## Out of Scope

- Migrating CPU, audio, komorebi or other resource channels to the new model.
- Committed-memory indicators, process rankings, memory cleanup or system tuning.
- Period selectors, persistent history, configurable sampling and popup actions.
- New popup window infrastructure or copying code from the reference checkout.
- Treating browser preview success as completion of the native feature.

## Further Notes

Product and architectural decisions were agreed during the design interview.
The user subsequently invoked implement and confirmed the testing seams and
review baseline. Implementation and validation are recorded in the memory guide.

Tracker publication is pending project tracker/triage configuration through
`/setup-matt-pocock-skills`. Once configured and the proposed testing seam is
confirmed, publish this specification with the `ready-for-agent` label.

Windows 11 metric composition remains subject to live engineering verification.
Any discovered mismatch must be explicit rather than hidden by an approximation.
