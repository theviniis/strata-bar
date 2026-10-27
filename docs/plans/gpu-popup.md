# GPU resource channel, widget and popup

> Sensor-source update: the LHM service supersedes the original PDH/MAHM source
> descriptions below. Those descriptions and recorded evidence describe the
> previous implementation. See [LHM migration](lhm-sensors.md) for the new architecture,
> installation requirements and outstanding native acceptance gates.

Status: delivered. The native `--check-popups` run (both monitors) and the startup
`--probe` are recorded under `docs/evidence/`. This is the tracking document for
the GPU delivery; every checkbox below is ticked as the work lands.
Decisions already taken:

- Full native delivery: real collector, `gpu` channel, `capabilities().gpu`
  true, widget, popup, tests and evidence.
- Sources: PDH + DXGI for usage and VRAM bytes (vendor neutral, Task
  Manager-like); the existing MAHM v2 read-only mapping for temperature, power
  draw and fan speed. No vendor DLL, no elevation.
- Native bar order: CPU | GPU | RAM.
- Denominators: dedicated total from the DXGI adapter, shared total as half of
  physical RAM (the documented WDDM/Task Manager convention).
- Units: binary, matching the RAM popup (`1.5 GiB / 8.0 GiB`,
  `322.0 MiB / 16.0 GiB`), so the DXGI dedicated total stays exact.
- The dedicated denominator is the live DXGI `DedicatedVideoMemory`, which on
  this driver excludes reserved VRAM (8413773824 bytes for an 8 GiB card, shown
  as `7.8 GiB`), unlike Task Manager's nominal `8.0 GB`. It is not rounded up.

## 1. Native contract and collector

- [x] Add `src-tauri/src/gpu_contract.rs` (`GpuMetricStatus`, `GpuMetric`,
      `GpuAdapter`, `GpuSensor`, `GpuPoint`, `GpuData`) following
      `cpu_contract.rs`.
- [x] Generate `src/services/system/gpu.generated.ts` from `build.rs` and add it
      to `.prettierignore`.
- [x] Move the `MAHMSharedMemory` read out of `cpu_windows.rs` into a shared
      `src-tauri/src/mahm_windows.rs`.
- [x] Generalise `afterburner.rs` into per-entry parsing that both the CPU
      package sensor (`0x80` / global) and the GPU sensors (per `dwGpu`:
      temperature `0x00`, fan `0x10`, absolute power `0x61`) reuse.
- [x] Match the Afterburner GPU entry to the selected DXGI adapter by
      `VEN_`/`DEV_`; never attribute another GPU's sensor. A single GPU entry may
      be used without an identity match.
- [x] Validate the monitored reading rather than assuming units: temperature
      `0..=200`, fan `0..=100`, power `0..=2000`.
- [x] Add `src-tauri/src/gpu.rs` (`GpuCollector<S: GpuSource>`) with the CPU
      merge semantics: per-metric `ready`/`error`/`unavailable`, sequence,
      61 points over 120 s, history cleared on clock regression, repeated
      producer timestamps yielding a null temperature observation.
- [x] Add `src-tauri/src/gpu_windows.rs`: DXGI adapter selection (skip software
      adapters, prefer the largest dedicated VRAM), PDH `GPU Engine` utilisation
      filtered by the selected LUID and aggregated per engine type, and
      `GPU Adapter Memory` dedicated/shared usage.
- [x] Enable the `Win32_Graphics_Dxgi` windows crate feature.
- [x] Rust tests: arithmetic, per-metric partial failure and recovery, counter
      warm-up, retention/resume, malformed and stale mappings, absent sensor.

## 2. Native transport

- [x] `metrics.rs`: accept `gpu`, collect it on the existing 2 s tick, publish it
      on the COM failure path, and include it in the probe.
- [x] Repoint `invalid_requests_do_not_create_resources` at a genuinely
      unsupported channel (`network`).
- [x] `main.rs`: report `"gpu": true` from `capabilities`.

## 3. Frontend

- [x] `src/services/system/gpu.ts`: Zod boundary (`parseGpuEvent`) with the CPU
      sequence/ordering guards.
- [x] `src/services/system/bridge.ts`: `ChannelData.gpu: GpuData`, route GPU
      events through the parser, and make the studio demo preview illustrative
      like CPU/RAM.
- [x] Widen `useResourceChannel` to `'cpu' | 'memory' | 'gpu'`.
- [x] `src/features/gpu/Gpu.tsx`: bar widget mirroring `Cpu.tsx`.
- [x] `src/features/gpu/presentation.ts`: staleness plus percent/bytes/
      temperature/watts/fan formatters, keeping a `0 %` fan reading valid.
- [x] `src/features/gpu/gpu.popup.tsx`: utilisation and temperature graphs plus
      the usage, memory, temperature, power, fan and shared-memory rows.
- [x] `src/features/gpu/gpu.popup-definition.ts`: lightweight popup registration.
- [x] `src/components/status-bar/NativeBar.tsx`: CPU | GPU | RAM.
- [x] Studio shell copy that still claims GPU is unavailable (`App.tsx`) and the
      `--check-popups` fixture (`PopupCheckBar.tsx`).

## 4. Tests

- [x] `gpu-bridge.test.ts` and `gpu-popup.test.tsx`.
- [x] Update `bridge.test.ts`, `native-bar.test.tsx` and the demo expectations.
- [x] Extend `popup_check.rs` to the GPU popup on real monitors (4 consumers per
      bar, `Detalhes da GPU`, six rows, two graphs).

## 5. Verification and documentation

- [x] `cargo test` (61 passing, 1 ignored).
- [x] `pnpm format:check`, `eslint .`, `tsc -b`.
- [x] `pnpm test`: 100 passing. Seven failures exist in
      `audio-outputs.test.tsx`, `widget-popup.test.tsx` and
      `resource-graph.test.tsx`; they were reproduced on a clean checkout of
      `HEAD` (stash plus rerun) and are unrelated to the GPU work.
- [x] Record a new native run under `docs/evidence/`
      (`docs/evidence/gpu-sources-non-elevated-2026-10-18.json`, from
      `strata-bar.exe --probe`).
- [x] Record the extended `--check-popups` run that covers the GPU popup on real
      monitors (`docs/evidence/popup-framework-gpu-2026-10-18.json`, 8/8 checks
      passed on both bars).
- [x] Record the MVP-gate exception in `docs/implementation-plan.md`,
      `docs/architecture.md`, `docs/native-mvp-validation.md` and the deferred
      lists in `AGENTS.md`/`README.md`.
