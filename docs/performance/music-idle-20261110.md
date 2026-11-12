# Installed music widget idle investigation

Native executable: `C:\Program Files\Strata\strata-bar.exe`, modified
2026-11-02. User reported approximately 24% total CPU while idle.

Measurements use `scripts/measure-idle.ps1 -Seconds 8 -ExcludeSensorService`
(initial sample: 15 seconds; reduced-motion and restart: 10 seconds).
The process tree includes WebView2. Sensor-service CPU could not be read from
this unelevated session, so the service was excluded explicitly. These are
short exploratory samples on an active desktop, not controlled benchmarks.

| Condition | Machine CPU | Private MiB | Evidence |
| --- | ---: | ---: | --- |
| Original configuration | 24.01% | 1821.49 | idle-lhm-20261110-023908-500.json |
| Reduced motion enabled temporarily | 20.89% | 1188.19 | idle-lhm-20261110-024208-253.json |
| Music, spectrum, agents, reminders, audio and clock hidden | 0.25% | 934.68 | idle-lhm-20261110-024253-525.json |
| Only music and spectrum hidden | 0.44% | 942.83 | idle-lhm-20261110-024321-104.json |
| Only spectrum hidden; music remains | 20.21% | 952.38 | idle-lhm-20261110-024348-986.json |
| Original configuration restored | 23.37% | 963.13 | idle-lhm-20261110-024404-671.json |
| Normal restart, original configuration | 9.28% | 486.16 | idle-lhm-20261110-024741-772.json |

An additional 10-second per-process sample attributed 10.14% and 9.99% CPU
to two renderers, 4.41% to the GPU process, and 0.45% to the Rust host.
The renderers used approximately 1031 and 447 MiB of private memory.

## Findings and limits

The installed music-widget path is necessary for the observed high CPU in
these configuration isolation tests. Disabling the spectrum alone does not
resolve it. Reduced motion alone does not resolve it. The underlying mechanism
has not been identified: rendering, compositor work and native event delivery
remain possible. The memory reduction after unmounting/restarting does not
by itself establish a leak or identify retained allocations.

A temporary Playwright harness mounted the current source's `MusicContent`
with a native media snapshot. During three idle seconds it recorded zero React
commits and about 4.5 ms of renderer task time. This did not reproduce the
installed application's failure and is not native acceptance evidence.
The harness and its Vite server were removed/stopped after the experiment.

All temporary configuration changes were restored using the exact original
file content, guarded against concurrent edits. The user exited the app and
the investigation restarted the same installed executable normally. A request
to launch it with a local WebView2 debugging port was rejected by automatic
policy review (`blocked by policy`, no detailed reason). No debug port was
opened. No source fix or installation was performed.

Next diagnostic requirement: obtain a supported native renderer/compositor
profile, including media-event frequency, before choosing a code change.
Frontend/Rust test suites were not run because no application code changed.

## Follow-up after restart

Three additional 8-second samples used the same native executable and excluded
the sensor service. The original configuration was restored after each edit.

| Condition | Machine CPU | Private MiB | Evidence |
| --- | ---: | ---: | --- |
| Both media widgets active | 6.09% | 499.65 | idle-lhm-20261110-025005-714.json |
| Only Music hidden | 5.03% | 501.23 | idle-lhm-20261110-025019-509.json |
| Music and spectrum hidden | 0.44% | 424.24 | idle-lhm-20261110-025044-639.json |

Hiding both widgets was the only tested mitigation that brought CPU below 1%
in both rounds. The difference between rounds warrants testing Music and the
spectrum independently with playback active and paused, and recording the
per-renderer activity and media-event rate before changing their implementation.
