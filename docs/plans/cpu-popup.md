# CPU resource API and popup

Status: implemented on 2026-10-18. Native popup verification passed on both
monitors without elevation; see ../cpu.md for evidence and explicit validation
limits. The requested visual Task Manager comparison awaits user observation.
This extends the existing CPU channel and reuses the memory popup's behavior
and the shared native popup infrastructure.

## Result

- Open CPU details from the native CPU widget, with utilization and temperature
  graphs covering the latest 60 seconds and sample value/time inspection.
- Show usage with one decimal place, current frequency and maximum nominal
  frequency in GHz with two decimals, physical/logical cores, and current CPU
  package temperature in degrees Celsius with one decimal and sensor identity.
- Keep utilization on a fixed 0-100 percent axis. Temperature uses a zero-based
  axis with an upper bound of at least 100 C, extended to the next multiple of
  10 C when observed values exceed it; label the axis explicitly. Do not clamp
  temperatures to 100 C or infer thermal warnings from the chart scale.
- Match existing popup styling, focus, resizing, dismissal and accessibility.
  Browser preview uses explicitly labeled illustrative data.
- GPU inspection, per-core charts, alerts, tuning controls, provider selection
  UI and installing or launching Afterburner are outside this delivery.

## Collection and sources

- Use one native CPU collector with a two-second cadence while consumers exist.
  Retain at most 31 actual observations over 60 seconds, shared across monitors.
  Reopening preserves history while bar consumers remain subscribed. Pause with
  no consumers; represent warm-up, outages and suspension as gaps.
- Usage targets the installed Windows Task Manager Performance > CPU display.
  Start with aggregate PDH Processor Information / % Processor Time. Validate
  against Task Manager before acceptance; do not silently substitute Processor
  Utility, which has different semantics. Keep the final definition documented
  and identical across the widget, current indicator and utilization graph.
- Current frequency is the arithmetic mean of valid Actual Frequency readings
  for individual logical processors across all processor groups, excluding
  aggregate instances. Require complete coverage rather than averaging a
  partial subset. Read PDH counters with English names and valid status checks.
  Do not use CurrentClockSpeed or Processor Frequency as dynamic frequency.
- Read maximum nominal MHz from Win32_Processor.MaxClockSpeed during topology
  discovery, taking the maximum across processor packages. This is the Windows
  reported nominal maximum, not advertised turbo and not an observed peak.
- Discover physical cores and logical processors with
  GetLogicalProcessorInformationEx, across all groups. Refresh topology and
  nominal data after resume or topology changes; do not query WMI every sample.
- MSI Afterburner is the sole external sensor provider. Open MAHMSharedMemory
  read-only; no RTSS API, HWiNFO integration, control memory or elevated Strata.
  Select the built-in CPU temperature source ID 0x80 and global instance
  0xFFFFFFFF. Never replace it with a core maximum or motherboard sensor.
- Validate signature, supported layout version, sizes, counts, offsets and
  arithmetic before parsing. Respect advertised entry strides. Reject FLT_MAX,
  non-finite values and invalid readings. Copy a bounded snapshot and verify
  header stability, retrying once when the producer changes during the read.
- Preserve the producer's Unix-seconds timestamp, converted to milliseconds,
  separately from the local collection time. Repeated producer timestamps must
  not create new temperature observations or refresh freshness. Detect marked
  deallocation, missing mappings and stalled updates; reconnect automatically.
- Preserve metric identity as provider, source ID, instance and source name.
  A newly discovered GPU sensor must not be mistaken for a CPU sensor. Keep
  parsing separate from CPU projection so a future GPU feature can reuse it.

## Contract and frontend

- Rust owns CpuData and generated TypeScript declarations, following the memory
  build workflow. Replace ChannelData.cpu's current percent-only payload; update
  all CPU consumers and fixtures together. Preserve percent as a metric name.
- CpuData contains sequence, sampledAt, percent, frequencyHz, maxFrequencyHz,
  physicalCores, logicalProcessors, temperatureCelsius, temperatureSensor and
  history. Metrics contain ready/error/unavailable status, nullable value,
  updatedAt in Unix milliseconds and nullable error. Sensor identity is nullable.
- History entries contain sequence, local timestamp, nullable percent, nullable
  temperatureCelsius and nullable temperatureUpdatedAt. A repeated producer
  timestamp yields a null temperature observation, not a duplicated measurement.
- Validate finite numbers, units, metric states, positive integral core counts,
  ordered sequences and bounded history at the frontend transport boundary.
  Ignore duplicate/out-of-order snapshots without regressing live data.
- Preserve last successful values and their timestamps independently per metric.
  Mark readings stale after six seconds, immediately flag source errors and
  avoid zero/demo substitutions. Initial unavailable sources do not blank the
  independent indicators. Reset elapsed-time baselines after collection resumes.
- Add a CPU subscription hook and popup definition using existing lifecycle
  conventions. Extract the memory graph into a shared resource graph component
  for both features, preserving memory behavior and supplying labels/units/scale
  explicitly. Do not migrate other channels into a new generic framework.

## Delivery and verification

1. Finish source acceptance: compare Processor Time and Processor Utility with
   the installed Task Manager during idle and ordinary activity, allowing
   sampling/rounding differences. Confirm temperature keeps advancing with
   HWiNFO and RTSS closed. These are gates before finalizing source selection;
   if they fail, report the evidence and revise the source decision explicitly.
2. Implement the native contract, collector, Afterburner parser and generated
   types. Test through the public collector with controlled sources and clock:
   arithmetic, counter warm-up/reset, processor groups, partial failures,
   retention, resume, malformed mapping, unavailable sensor, stalled producer,
   deallocation and recovery. Confirm test seams under the TDD workflow first.
3. Implement transport validation, widget, popup and shared graph. Test public
   subscriptions and rendered behavior: loading, both graphs, units, independent
   errors, stale retained values, gaps, inspection, ordering and safe teardown.
   Include memory regression coverage for the shared graph extraction.
4. Extend the existing native popup check to CPU on connected monitors: real
   readings, reopening/history, focus/dismissal/resize, floating-window exclusion,
   pause/resume, consumer cleanup and restored AppBar work areas. Keep native
   failures separate from browser demonstrations.
5. Run formatting, ESLint, TypeScript, frontend tests/build and Rust tests;
   record current baseline failures separately. Review standards and plan
   compliance against the implementation's starting HEAD, preserving user edits.
   Record new evidence and document definitions, Afterburner setup and limits.

## Existing feasibility evidence and limits

Read-only probes on 2026-10-18 confirmed non-elevated MAHM v2 access to
Afterburner 4.6.6 on an Intel i5-10400F. After HWiNFO closed, CPU temperature
advanced through 39, 36 and 42 C with advancing timestamps. RTSS remained open.
The bundled SDK identifies the global CPU temperature entry as package data.
No application settings or processes were changed by the probes.

Windows 26H2 build 26300.9711 exposes English PDH counters successfully:
Processor Time 15.56%, Processor Utility 24.34%, Actual Frequency 3985.09 MHz
and Processor Frequency 2904 MHz in one observation. WMI reports 6 physical
cores, 12 logical processors and nominal maximum 2904 MHz. These observations
prove source availability, not exact Task Manager parity or hardware coverage
beyond this machine. Per-logical Actual Frequency coverage remains to verify.

Microsoft documents recent Task Manager calculation changes:
https://support.microsoft.com/en-us/help/5053656

Local protocol reference:
C:/Program Files (x86)/MSI Afterburner/SDK/Include/MAHMSharedMemory.h
