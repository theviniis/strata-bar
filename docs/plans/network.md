# Network widget

The network widget is an explicit extension to the original MVP scope. It is
available in the widget catalogue without changing existing saved layouts.

## Native ownership

One unelevated Rust owner serves every monitor. IP Helper supplies interface
identity, addresses, gateways, negotiated link rates and byte counters. Native
Wi-Fi supplies SSID and signal when the Windows location permission permits it;
permission failures are reported without hiding Ethernet or traffic readings.
There is no dependency on the sensor service and no native-to-demo fallback.

Traffic and ICMP have independent workers. They pause without subscribers and
establish new baselines after resuming. Traffic is sampled every two seconds;
rates use counter deltas and actual monotonic elapsed time. Counter resets,
interface changes, disconnection and gaps over six seconds never generate spikes.
Session totals count only successfully observed intervals for that interface.
They exclude time while the widget is disabled or Windows routes traffic through another interface.

The global optional `network` configuration preserves schema version 2:

```json
{
  "network": {
    "unit": "bytes",
    "probesEnabled": true,
    "probeTarget": "1.1.1.1"
  }
}
```

The monitored interface always follows the system default route. There is no
interface selector in the popup, settings or command interface. Legacy
`interfaceId` preferences are ignored and removed on normalization/save, so old
configurations cannot pin monitoring. Interface GUIDs survive interface-index
changes. Settings provide bytes/bits units and ICMP controls. Destination input
is an IPv4/IPv6 literal, validated in both Zod and Rust.

ICMP uses an explicit source address from a route constrained to the selected
interface, never an unrelated adapter. RTT, adjacent successful RTT differences
(jitter), timeout ratio and sample counts cover the last 120 seconds. Local API
errors are separate from lost responses. Blocking ICMP is not proof that the
Internet connection is down. The graph preserves gaps and overlays both traffic
directions on one common scale over two minutes.

## Native test

The manual test is an estimate implemented in Rust using the download GET and
upload POST endpoints documented by the
[Cloudflare measurement engine](https://github.com/cloudflare/speedtest).
It does not use the browser engine, remote scripts, TURN, result logging or
arbitrary URLs. The UI identifies Cloudflare, the route used and the data budget.
The test follows the system default route, as does traffic monitoring. A
default-route change cancels an active test.

There is one test per application. Its stages are preparing, download and upload,
followed by complete, cancelled or error. Up to four connections share a 250 MB
payload allowance per direction. Each stage has at most 15 seconds within the
30-second total deadline. Requests grow from 64 KB to at most 16 MB and stream
through bounded buffers. HTTP redirects and proxy auto-routing are disabled.
Payload supplied to the HTTP transport counts against the upload budget even if
the request subsequently fails; protocol overhead is outside the 500 MB payload
budget. Cancellation is checked between chunks and requests; an in-flight request
has a maximum three-second timeout. The last result is retained only in memory.
Closing the popup does not cancel the native test. The popup separates the
network summary and speed-test controls into the application's animated `Tabs`,
opening on Resumo. Switching tabs keeps the native test running; returning to
Teste de velocidade displays its current progress or last result.

Measurements use actual payload/time, including request overhead. Budget caps,
short samples and partial transfer failures mark an estimate as limited. This is
not a replacement for the official Ookla client or an implementation of the
Cloudflare browser engine's full methodology. No automatic scheduled speed tests
or public-IP lookup are included. Studio stories and popups use labelled fixtures
and a simulated test without sending network traffic.

## Validation

- `pnpm check`: formatting, lint, types and frontend regression tests.
- `cargo test --manifest-path src-tauri/Cargo.toml`: counters, reset/resume,
  quality math, configuration, bounded bodies and local HTTP failure/budget tests.
- `cargo run --manifest-path src-tauri/Cargo.toml -- --probe-network`: native
  interface inventory, two counter observations and source-constrained ICMP;
  creates no windows and changes no configuration.
- Explicit provider run (up to 500 MB): `cargo test --manifest-path
src-tauri/Cargo.toml live_cloudflare_acceptance -- --ignored --nocapture`.
  Writes a new timestamped temporary JSON file with observed stages and budgets.
- Hardware acceptance must separately cover Ethernet, Wi-Fi permissions,
  disconnect/reconnect, VPN, IPv6, multiple monitors, popup geometry and idle cost
  on a native build containing this change. Evidence from an older installed bar
  does not validate the new widget.

## Recorded runs (28 October 2026)

The two native interface probes and two provider runs are recorded under
`docs/evidence/network-*-20261028-*.json`. The latest provider run measured about
77.6 Mbps down and 42.1 Mbps up, transferred 158.1 MB of payload and finished in
16.8 seconds. Both directions were marked limited because some transfers did not
complete; these are path-specific estimates, not a claim about the ISP plan.
The source-constrained IPv4 ICMP probe succeeded. These checks create no windows
and do not change the installed bar or the saved user configuration.

The frontend production build succeeded. Native unit suites and the explicit
interface/provider acceptance tests passed. Visual inspection was attempted via
the integrated browser and Chrome, but their automation navigation timed out.
Wi-Fi permissions, IPv6 reachability, physical disconnect/reconnect, VPN changes,
multiple-monitor presentation, geometry and idle measurements of the new native
bar remain acceptance work; the installed bar was not replaced for these runs.

The real-worker lifecycle run (`network-lifecycle-20261028-1793159214068.json`)
verified identical snapshots for two subscription labels, token ownership, pause
without subscribers and a fresh baseline after resubscription. It exercises real
IP Helper/ICMP workers with an in-memory event sink; it does not claim visual
acceptance on two physical monitors.

The full frontend gate passed formatting, ESLint and TypeScript, then reported
589 passing tests and 15 failures in the heavy settings/layout suites. The first
failures were ten-second timeouts, followed by overlapping async renders in the
settings suite. Rerunning the separator drag alone passed; rerunning the entire
settings suite alone passed all 51 tests without changing its timeout. The eight
network frontend tests passed independently, including both rendered SVG curves.
The full native unit run passed 231 tests (30 opt-in checks skipped); the explicit
network collectors, provider and worker lifecycle checks also passed.

## Widget presentation preferences

Each network widget supports `networkDirection: "both" | "download" | "upload"`
(default: both when omitted), including per-monitor widget overrides. The widget
inspector exposes Download, Upload and Ambos and the existing Compacto / Com
rótulo format controls. Compact format hides unit labels, retaining arrows and
readings; labelled format keeps the muted unit labels. These preferences affect
the bar only: the popup graph continues to show both transfer directions.

## Speed-test presentation

The collapsible test uses the application's theme and components with a Motion
arc, needle and numeric readout. Download and upload results reuse NetworkRate's
speed-test appearance: two decimal places, Mbps in the header, large values and
separate phase colours. The gauge scale expands above gigabit rates. Its progress
bar sits directly below the dial while measuring. Completion animates the gauge
away and leaves a compact pair of results with the current ICMP quality summary,
metadata and a retry action. ICMP is explicitly labelled as current connection
quality, not a provider measurement of idle/download/upload latency. Reduced
motion and a collapsed panel disable visual interpolation; missing values remain
unavailable, including pending upload results. No synthetic usage ratings or
connectivity scores are displayed.

Stage progress is emitted by the native speed-test worker as `stageProgress`
(0–1), using the maximum of the actual stage elapsed-time fraction and payload
budget fraction. The time budget uses the stage deadline capped by the global
deadline. The popup displays one bar at a time: download followed by upload.
Opening or remounting the popup uses the current native snapshot without creating
a new local timing baseline. Studio progress is explicitly simulated.

The network progress indicator renders native percentages immediately, without
spring interpolation that can trail fast budget consumption. Studio simulation
runs for 15 seconds per stage (30 seconds total); native transfers still stop at
the time or payload cap. The popup labels the 15 s / 250 MB per-stage limits.

A transport failure that ends a stage before either budget is consumed now emits
an error with partial measurements retained, rather than reporting a completed
test. Deadline-limited samples remain explicitly limited results.

Cloudflare 403 investigation (2026-10-28): bounded live probes against GRU
accepted download requests of 64 KB, 1 MB, 4 MB, 8 MB and 10 MB, but a 16 MB
request returned HTTP 403 with body `0`. Four concurrent 64 KB requests succeeded.
Cap progressive request payloads at 8 MB (previously 16 MB), retaining the shared
30-second / 500 MB budgets. This is an observed compatibility bound, not a claimed
published Cloudflare limit. Display one representative failure with the number
of failed connections, rather than repeating four complete error strings.

Successful completion at a byte/time cap no longer automatically sets `limited`.
The warning is reserved for a stage with less than two seconds of observation,
no valid rate, or an early transport failure. Expected deadline termination is
not itself an insufficient sample; the final completion preserves stage quality.
