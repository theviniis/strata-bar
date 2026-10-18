# CPU popup and resource contract

The native CPU widget and popup consume one Rust-owned CPU channel. The popup
contains utilization and CPU package temperature graphs, usage, current and
maximum nominal frequency, physical/logical core counts and current temperature.
The studio preview is labeled as illustrative and never supplies native failures.

## Definitions and sources

- Usage: aggregate `\Processor Information(_Total)\% Processor Time`, on a
  0-100 percent scale. This is time occupied, not Processor Utility. The installed
  Windows 26H2 build exposes both, with materially different values. Microsoft
  documents changes to Task Manager CPU accounting; exact visual parity remains
  an acceptance observation, not a guarantee for every Windows version.
- Frequency: arithmetic mean of `Actual Frequency` for every logical processor,
  across processor groups. Missing or invalid members invalidate the aggregate.
  Native units are Hz, displayed as GHz with two decimal places.
- Maximum nominal frequency: largest Win32_Processor.MaxClockSpeed reported
  across packages, converted from MHz to Hz. This is not advertised turbo. The
  observed current frequency can exceed this nominal number.
- Physical/logical cores: GetLogicalProcessorInformationEx core relationships
  and group affinity masks. P means physical, L means logical, not efficiency
  and performance core classes.
- Temperature: MSI Afterburner built-in CPU temperature source ID `0x80`, global
  instance `0xFFFFFFFF`, in Celsius. It is not the hottest individual core.
  Provider, source ID, instance and source name travel with the observation.

Windows counters use language-neutral English paths through PDH. Topology is
checked on collection; the nominal WMI result is cached until resume or topology
change, with bounded retries after failures. The worker already owns COM setup.
PDH warm-up produces an unavailable utilization observation, not a fabricated zero.

## MSI Afterburner setup and protocol

Run MSI Afterburner and enable CPU temperature in hardware monitoring. Neither
HWiNFO nor RTSS is required by Strata's reader. Strata does not start, configure,
redistribute or control Afterburner. It uses only read access to MAHMSharedMemory,
with no driver installation or elevation in Strata.

The reader supports MAHM layout v2. It bounds snapshot size to 16 MiB, validates
header and entry sizes and checks the header before/after a copied snapshot,
retrying once on a concurrent header change. Unknown versions, truncated data,
deallocation signatures, invalid values and ambiguous package sensors are errors.
Header comparison is a best-effort consistency check, not a producer-provided
atomic transaction. Sensor values outside 0-200 C are rejected, never clamped.

The producer timestamp is 32-bit Unix seconds in this SDK and is converted to
milliseconds. A stalled, regressed or future observation does not become a fresh
sample. Shared-memory connections are opened read-only per collection and closed
on every path, allowing automatic recovery after provider restarts.

Read-only probes on this machine verified Afterburner 4.6.6 by itself, with
HWiNFO and RTSS absent: 49, 46 and 47 C with advancing timestamps, without
administrator privileges. This is evidence for this hardware, not universal CPU
sensor coverage. Unsupported hardware leaves temperature explicitly unavailable.

## Transport, history and developer workflow

`cpu_contract.rs` owns CpuData, CpuMetric, CpuPoint and sensor identity. Cargo
generates `src/services/system/cpu.generated.ts`; do not hand-edit generated types.
The frontend validates incoming data at the public subscription boundary and
rejects duplicate/out-of-order snapshot sequences.

Each metric has ready/error/unavailable status, nullable value, nullable updatedAt
in Unix milliseconds and error text. Partial failures retain the last successful
value and original time independently; the UI marks errors immediately and
readings older than six seconds as stale. There is no nominal-for-current
frequency substitution or native-to-demo fallback.

One shared native worker collects every two seconds while CPU consumers exist.
History contains at most 31 actual observations covering 60 seconds. The bar keeps
it warm for popup opening and reopening across monitors. No consumers means no
collection. Missing samples, warm-up, suspension and provider stalls remain gaps.
Temperature points retain their producer timestamps; repeated provider times do
not invent new observations. Utilization and temperature can therefore have
different availability in the same channel observation.

The shared ResourceGraph also renders memory without changing its percentage
semantics. Temperature has a zero-based axis of at least 100 C, expanded in
10-degree steps to include observed higher values. The scale is not a thermal
limit or an alarm. Both graphs support keyboard and pointer sample inspection.

## Verification

Implementation uses the agreed seams: public collector with controlled sources
and time, public subscription, rendered popup/widget, existing native popup check.
Tests cover groups, averaging, missing frequency coverage, independent failures,
malformed mappings, source timestamp regression, stale sensors, recovery, clock
changes, retention, rendering and transport validation. Legacy GetSystemTimes
arithmetic was retired with its implementation-specific tests when the public
collector replaced that source.

Results on 2026-10-18:

- Rust: 45 passed, one existing audio-routing test intentionally ignored.
- Focused frontend: 18 passed across six suites, including memory regressions.
- Full frontend: 75 passed, six failures in existing audio output / widget popup
  tests (ResizeObserver and changed audio controls). No CPU test failed.
- TypeScript and production frontend build passed. The build retains existing
  Zod annotation and bundle-size warnings.
- The aggregate pnpm check stops on formatting in existing button-loading,
  card and empty components. Global ESLint also reports existing button-group
  classes and classes in the parallel user-added chart component. The files
  changed for this delivery pass focused formatting and ESLint.
- Native debug popup check passed for CPU, memory and audio on both monitors:
  focus, floating styles, resizing, Escape/outside dismissal and subscription
  cleanup. CPU history retained 30 samples over 58,322 ms and expired its old
  observations. Pausing all consumers stopped collection; resuming preserved an
  8,046 ms observed gap. The test exited and AppBar work areas were restored.

Evidence:

- [Non-elevated sources](evidence/cpu-sources-non-elevated-2026-10-18.json)
- [Native popup check](evidence/cpu-popup-native-2026-10-18.json)
- [Work areas after exit](evidence/cpu-popup-post-exit-2026-10-18.json)

The native popup fixture is gated by Vite's development mode. Run it with the
development server and a debug host built by cargo; a frontend packaged by
`tauri build --debug` uses the real bar instead and does not expose fixture
pause controls. Cold startup waits for actual subscriptions before interaction.
Pause measurements wait for asynchronous unsubscription before sampling idle.

Not claimed: live OS suspension, hardware outside this machine, an induced real
PDH counter failure/retry, or exact visual equality with Task Manager. The user
volunteered the visual comparison; its result is still pending. Controlled
collector tests cover source failures, but do not establish real PDH handle
lifecycle under an induced outage.

## Standards review

No documented-standard violations remain. The review identified duplicated CPU
and memory subscription hooks; useResourceChannel now owns both resources'
typed lifecycle directly, without changing other channels. Follow-up review
found no actionable standards issue.

## Spec review

No confirmed code findings remain. A P2 finding identified that frequency retry
could discard a healthy utilization baseline. Retry now removes/re-adds only
failed PDH counters and preserves healthy counters in the query; every frequency
member updates its own failure state. Topology failures no longer suppress an
existing utilization read. Follow-up review confirmed the fix. The visual
comparison and induced real PDH outage remain explicit validation limitations.

Both reviews used starting HEAD 3796de0 and excluded parallel local changes to
package dependencies, the chart component and memory presentation helpers.

## References

- [Plan](plans/cpu-popup.md)
- [Task Manager accounting update](https://support.microsoft.com/en-us/help/5053656)
- [Processor topology](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getlogicalprocessorinformationex)
- Installed SDK: `C:/Program Files (x86)/MSI Afterburner/SDK/Include/MAHMSharedMemory.h`
