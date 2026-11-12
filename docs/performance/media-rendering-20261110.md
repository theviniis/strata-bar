# Media rendering on native Windows bars

The test used two visible AppBars, active playback and both media widgets
enabled. CPU is normalized to the whole machine. Private memory covers the
Strata and WebView2 process tree. The separate sensor service was excluded.

| Native debug build                                 | Machine CPU | Private MiB | Sample                              |
| -------------------------------------------------- | ----------: | ----------: | ----------------------------------- |
| Original rendering                                 |       8.21% |      750.13 | `idle-lhm-20261110-025333-988.json` |
| Music without the nested backdrop filters and mask |       5.81% |      712.23 | `idle-lhm-20261110-025404-561.json` |
| Also use CSS transitions for the spectrum bands    |       4.96% |      670.78 | `idle-lhm-20261110-025433-044.json` |
| Original rendering, repeated                       |       5.64% |      688.40 | `idle-lhm-20261110-025543-669.json` |
| Both changes reapplied                             |       4.66% |      680.80 | `idle-lhm-20261110-025604-806.json` |

The comparison reused the same native process with Vite serving the frontend.
Each sample followed a settling interval. The repeated pair showed a 17% CPU
reduction and only a small memory change. These short samples did not
reproduce the original 24% CPU state or establish a memory leak fix.

The Music widget keeps its cover, controls and popup. The artwork remains
tinted to keep labels readable. The spectrum keeps all six bands, the entry
and exit animations, the idle timeout and the reduced motion preference.

## First production build

`pnpm build:desktop` produced an optimized executable. `--probe` confirmed
two visible bars and a loaded configuration without errors. Two samples with
the normal motion preference measured 5.41% and 11.85% CPU, with means of
438 and 563 MiB private memory. The samples are
`idle-lhm-20261110-030011-541.json` and `idle-lhm-20261110-030042-967.json`.

A per-process sample attributed 4.00% CPU to the GPU process, 2.82% and 2.66%
to the two active renderers and 0.34% to the Rust host. Temporarily enabling
reduced motion with both widgets enabled yielded 2.88% CPU and 498 MiB private
memory (`idle-lhm-20261110-030147-363.json`). The original preference was restored.

The next revision updates the spectrum bands directly at the capture cadence
and only scrolls overflowing track text on hover or focus. It retains the
global motion preference for the remaining animations.

## Final production build

The normal motion preference and both media widgets were enabled. The native
probe confirmed two visible bars and a configuration without errors. The
separate sensor service was excluded in all samples.

| Sample     | Machine CPU | Mean private MiB | Peak private MiB | Evidence                            |
| ---------- | ----------: | ---------------: | ---------------: | ----------------------------------- |
| 20 seconds |       3.17% |           398.35 |           417.23 | `idle-lhm-20261110-030640-899.json` |
| 30 seconds |       3.08% |           377.26 |           391.66 | `idle-lhm-20261110-030714-751.json` |

Private memory moved from 375.47 to 369.11 MiB during the second sample. These
samples verify an improvement for the tested session. A longer session is
needed to assess whether the original memory growth recurs.

Both production builds used `pnpm build:desktop`. The final revision passed
32 targeted Vitest tests, TypeScript, and formatting and lint checks for the
changed frontend files. `pnpm check` stopped at formatting warnings in the
performance evidence. The validated executable was launched from a temporary
copy with the installed configuration. The installer was not replaced.
