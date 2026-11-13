# M4.2 Windows performance handoff

Date: 2026-11-12/13 (local Windows clock). The fixed 4X/native/high-shadow **stable 60 FPS gate is NOT PASSED on Windows**; every formal run fails the callback/simulation gate. This milestone delivers a native Windows baseline, measured bottleneck attribution, four byte- or pixel-preserving optimizations, Windows support for the M4 regression tooling and a compact return. Mac results are not Windows results, and this Windows pass cannot certify the Mac: M4.3 must check the integrated commit on both machines.

## Identity

| Item | Value |
| --- | --- |
| Transfer base (`sourceHead`) | `61a4bbbe75cb12bfbb4cd605b09dbbf39ae9f6bd` |
| Baseline payload (frozen M4.1 runtime) | `32c0f11b4118a0f0dac091afff909cc3ec17afaa` (kept as `resources/baseline-app`) |
| Final tested runtime (portable payload) | `8db5523e5b387a816ad50170a0a2cfa1e6ed72ad` |
| Later commits | Documentation and evidence only, no `src`/`desktop`/`public` change; `packagedMatchesHead` is therefore false in the return, as expected |
| Resources | 16,444 files / 17,689,836,587 bytes; final full SHA256 check against `manifests/resources.json` has zero mismatches; no resource modified |
| Package snapshot | `Verify-Package` before changes: 25,701 files, only `source/.git/index` differed (Git stat-cache refresh) |

Intermediate measured payloads `05421e8` (first three changes) and `a196e40` (plus batch indices) remain in the evidence.

## Hardware and settings

Lenovo 82JQ, AMD Ryzen 7 5800H (8C/16T), NVIDIA GeForce RTX 3070 Laptop GPU, driver 32.0.16.1742, 16 GiB RAM, Windows 11 Pro 10.0.26300. The integrated Radeon is not enumerated (discrete-only mode). AC power, Lenovo high-performance power scheme (GUID 52521609-efc9-4268-b9ba-67dea73f18b2). Electron 44.4.0 / Chromium 152.0.7977.78, WebGL2 through `ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)`.

Output is the internal panel: 1707x1067 DIP at scale 1.5, a **2560x1600 framebuffer at 165 Hz**. Two installed virtual display adapters are not enumerated as Electron displays. Settings: HD, density 4, native resolution (effective 2560x1600, no caps), shadows 3 (8192 map), zoom 1, seven Brutal AI, original simulation. Thermal state, GPU time, actual VRAM and presented-frame counts are **unavailable** here.

At 165 Hz the rAF sampler can exceed 60 callbacks/s in light phases. The unchanged gate still requires 99% of elapsed interval time within 17.0167 ms, no two consecutive complete bins below 59.5 callbacks/s and at least 99% simulation throughput, so a mean above 60 (RA2 dense) does not pass.

## Results

All formal runs use the actual portable executable (`resources/app`, `packageSourceHead` recorded) and 120-second windows. Maps, seed and placement match M4.1 (YR `xmp27t8.map` `75b4de16…`, placement `631ab2bb…`).

The three first-launch baselines are retained but excluded from A/B: later identical baseline processes ran YR sustained about 28% faster (29.49 vs 37.75-38.72), consistent with a cold NVIDIA shader cache on first use (OS/driver caches are not flushed by contract). One later baseline RA2 dense run failed: the page reloaded at window start with no renderer-gone record (black failure screenshot); it is retained and was repeated.

| Formal run | Payload | FPS | 1% low | p50 / p95 / p99 ms | Max ms | Over budget | Stalls >=50 ms | Simulation | CPU upd / submit / sim ms |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |
| YR sustained, first launch | baseline | 29.49 | 5.11 | 28.62 / 61.81 / 87.54 | 1474.6 | 96.84% | 467 | 73.44% | 9.62 / 12.16 / 9.23 |
| RA2 dense, first launch | baseline | 47.80 | 8.20 | 15.84 / 45.73 / 62.37 | 1254.0 | 64.87% | 183 | 87.55% | 6.36 / 9.21 / 4.48 |
| YR overload, first launch | baseline | 22.64 | 3.36 | 41.76 / 77.10 / 111.73 | 2095.6 | 97.50% | 1011 | 53.75% | 13.00 / 19.04 / 9.87 |
| YR sustained | baseline | 37.86 | 7.00 | 22.20 / 46.74 / 63.61 | 1290.6 | 86.69% | 168 | 85.16% | 7.84 / 9.21 / 7.25 |
| YR sustained | `a196e40` | 38.02 | 7.76 | 22.31 / 46.27 / 64.97 | 1116.3 | 89.30% | 132 | 85.73% | 7.67 / 9.31 / 7.16 |
| YR sustained | `a196e40` | 39.54 | 7.95 | 21.40 / 45.39 / 63.21 | 1100.6 | 84.71% | 127 | 86.78% | 7.43 / 8.94 / 6.85 |
| YR sustained | baseline | 37.75 | 6.95 | 22.44 / 46.72 / 65.83 | 1289.3 | 87.42% | 162 | 85.08% | 7.94 / 9.29 / 7.12 |
| YR sustained | **final** | 39.62 | 8.17 | 21.47 / 44.85 / 62.56 | 1088.7 | 85.22% | 124 | 87.07% | 7.40 / 8.80 / 6.95 |
| YR sustained | baseline | 38.72 | 7.29 | 21.64 / 46.13 / 64.49 | 1284.7 | 85.54% | 154 | 85.83% | 7.77 / 9.06 / 6.90 |
| YR sustained | **final** | 39.08 | 7.95 | 21.63 / 45.26 / 60.81 | 1092.0 | 86.28% | 138 | 86.54% | 7.64 / 8.90 / 6.92 |
| RA2 dense | baseline (repeat) | 63.60 | 10.18 | 11.64 / 39.38 / 54.47 | 1193.2 | 43.68% | 116 | 90.61% | 5.08 / 6.89 / 3.10 |
| RA2 dense | `a196e40` | 64.44 | 10.85 | 11.64 / 38.44 / 52.63 | 1201.2 | 42.44% | 102 | 91.36% | 4.94 / 6.78 / 3.12 |
| RA2 dense | **final** | 68.49 | 11.89 | 11.07 / 36.30 / 49.37 | 1023.9 | 39.99% | 78 | 92.90% | 4.79 / 6.41 / 2.77 |
| YR overload | baseline | 26.73 | 4.17 | 28.81 / 70.98 / 96.25 | 1648.1 | 93.10% | 846 | 61.18% | 11.22 / 15.82 / 8.48 |
| YR overload | `a196e40` | 29.62 | 4.97 | 25.42 / 65.17 / 87.71 | 1399.7 | 89.33% | 731 | 65.25% | 9.83 / 14.41 / 7.85 |
| YR overload | **final** | 31.14 | 5.23 | 23.50 / 63.37 / 80.75 | 1302.6 | 87.00% | 699 | 67.11% | 9.53 / 13.55 / 7.43 |

Warm YR sustained: three baselines average 38.11 callbacks/s, the two final runs 39.35 (+3.3%); 1% low 7.08 -> 8.06, worst frame about 1288 -> 1090 ms, long stalls 161 -> 131, simulation 85.4% -> 86.8%. RA2 dense and YR overload are single matched runs (final vs warm baseline +7.7% and +16.5%); they show the same direction but are not repeated. Object counts: sustained 392/44 -> 236-247/124-128; dense attrition 392 -> 71-79 units, so its mean exceeds 60 while the first 30-45 seconds remain near 20 callbacks/s; overload 776 -> 101-107 units.

**Density controls (diagnostic, not acceptance).** Same final payload and YR sustained workload: 2X density 40.59 callbacks/s with 23.24 ms CPU work per callback (4X final: 39.62 / 39.08 with 23.15 / 23.47 ms), and Original (no HD) 87.46 with 11.13 ms (simulation 95.72%). Texture density barely matters; the HD pipeline's per-object layers and draws do. Lowering density is not a remedy and remains outside acceptance.

**Why the hardware looks idle.** All simulation, scene update and WebGL submission run serially on one renderer main thread. One of 16 logical CPUs saturates while total CPU and GPU load stay low, so the laptop's fans barely respond. More throughput needs less main-thread work per frame or moving eligible work off that thread.

**Gap to the target.** In the heavy opening this CPU spends about 14-21 ms update, 19-23 ms submission and 12-18 ms simulation per callback, roughly twice the M2 cost. Passing needs well over a 2x reduction of main-thread work; the retained changes are a few percent.

## Bottleneck attribution (25-second CPU profile, heavy opening)

Render submission 34%, scene update 29%, simulation 26% of 25.2 s sampled main-thread time. A heavy frame submitted about 1,200 draws over a 12,000-node scene graph (about 2,950 visible). Largest named costs: Three binding-state comparison per draw (1.09 s self), uniform uploads/refresh (~1.4 s), four full scene traversals per frame (matrix update, render-list projection, mesh-batch collection, shadow pass; ~2.5 s), first-use sound decoding (1.2 s), synchronous native VXL builds (0.68 s), synchronous shader link queries (0.43 s), material version bumps from double-sided transparent two-pass draws and particle emitters (getProgram ~0.46 s), and simulation targeting (AttackTask/CheerTask scanning ~3 s inclusive).

## Retained changes

1. **Shadow-only native VXL sections** (`0d593e2`, `8db5523`). HD vehicles (VxlUnitRenderer and the Rhino renderer) keep native sections as shadow casters with a material writing neither colour nor depth, yet those sections still submitted empty colour-pass draws (131-145 per heavy frame). The materials are hidden from projection and visible only inside `renderer.shadowMap.render`, so shadows and the colour framebuffer are unchanged. Final draw diagnostic: zero such submissions.
2. **Fast mono IMA ADPCM decode** (`550551d`). A direct port of the wavefile block decoder and PCM writer is byte-identical for all 1,153 RA2 and 2,285 YR bag sounds and malformed/boundary blocks; stereo or extra-chunk files keep the library. Host catalog decode 6.7 -> 1.85 s; in-game `decodeData` 688 -> 131 ms over the heavy 25 s.
3. **Integer-tuple VXL weld** (`05421e8`). Same truncated int32 keys in an open-addressed table. All 268 builds of 134 retail VXL sections match the generic merger byte for byte. Complete host builder time: generic 11.2 s, M4.1 7.0 s, new 2.9 s; in-game VXL build 685 -> 333 ms over the heavy 25 s.
4. **Direct merged-batch indices** (`9b655e8`). Same layout without per-instance temporaries; in-game `createMergedGeometry` 149 -> 41 ms.

Tooling: Windows portable launch in native regression sessions, a diagnostic-only draw/material classifier (`--draws=1`, refused in measure phase), static pixel comparison, resource-wide WAV/VXL equivalence scripts and a Windows evidence collector.

## M4.1 Mac optimization audit

`mergeNativeVxlVertices` (M4.1) was independently re-checked: hash precision 10000, attribute order, signed zero, wrapped int32 truncation, first-index order, `userData` sharing and all fallbacks match the generic merger, and on all 134 retail sections it yields the generic output digest (`b9813e4f…`). It is correct and is superseded by the faster equivalent above. HD edge sharing remains withdrawn; reverted AI/C10 work stays reverted.

## Investigated, not adopted

- **Instancing**: `Renderer.supportsInstancing()` queries WebGL1 `ANGLE_instanced_arrays`, which WebGL2 contexts do not expose, so native VXL and sprite batching always take per-object/merged paths (about 200 per-mesh shadow draws in a heavy frame). Enabling it changes broad render paths and needs its own visual/lifecycle proof. Highest-value next experiment.
- **Single-pass double-sided transparency** would remove per-frame program re-evaluation but can change blending order.
- **Shader warmup / `checkShaderErrors`**: uniform-location queries would still block; warmup of battle programs not attempted.
- **Mesh-batch hysteresis** against batch disposal churn: not attempted (lifetime risk).
- **Simulation targeting**: unchanged; would need full-state checkpoint equivalence.
- Indexed resource containers remain not adopted (M4.1).

## Correctness and regressions

- **Static pixel controls** (tick zero, fixed visual random/clock, four views with exit/re-entry): final `8db5523` matches baseline RGBA exactly in all four 4X and four 2X views (16,384,000 bytes each, 177-215 active HD vehicles); `05421e8` also matched exactly. Two intermediate `a196e40` captures differed only by a pointer-hover health bar/tooltip that moved between repeats (real cursor position); unit and scene pixels were identical. Those records are retained.
- **Byte equivalence**: all 3,438 retail bag sounds (fast vs library decode), all 268 retail VXL builds (new weld, M4.1 weld and generic merger), merged-batch indices, shadow-only visibility scoping including exceptions (host tests).
- **Simulation**: no simulation code changed. Sound decoding returns identical bytes and sound choice still uses its non-simulation random source; VXL meshes are byte-identical; render visibility changes do not reach game state. Formal runs keep identical map/placement hashes and native workload.
- **Native Windows regressions on the final portable executable**: edition menu/logo/radar fallback/exports/v0.5 lifecycle PASS; RA2 source Allied03 ending -> score -> public Continue into Allied04 PASS; RA2 and YR HD opening, radar, captions, named save, full process restart, Original/codec fallback and release PASS. The two intentional missing-movie probes return 404 by design. The first media runs failed on both the baseline and candidate payloads at a strict full-screen check because `innerWidth/innerHeight` round 1707.33x1067.33 CSS px at 150% scale; the harness now compares against `visualViewport` with the same strict equality (`d03b239`), and both cases pass. The YR Soviet06 victory case needs a historical checkpoint absent from the transfer and was not run.
- **Typecheck and tests**: `bun run typecheck:entry` passes; M4 host tests (13) pass. The full host suite on Windows with the transferred resources runs 328 executions: 1,642 cases pass, 294 fail and 31 files have load errors (`NOT_PASSING`). All 75 failing files were re-run against an exported baseline tree (`61a4bbb`): 74 have identical counts and `castle-collapse` fails with the same load error on both trees when run alone. Causes are omitted historical HD/authoring packs (for example `hd-packs/yuri-disk-vxl/r1-2x`, `soviet-apoc-vxl/owner-r3`) and real-directory checks that reject the Windows `.local` junction. This is unavailable coverage on this transfer, not a regression and not a pass.
- Bridge/slope/cloak/turret/deploy paths are not specifically exercised beyond the native scenes; the changes do not touch their logic, and M4.3 should include them in the integrated check.

## Next experiments

1. Correct the WebGL2 instancing capability behind a switch; measure instanced native VXL shadow casters first with static 4X/2X controls and bridge/slope/cloak/turret/deploy coverage.
2. Reduce Three per-draw work: fewer distinct material clones per HD layer, or a pinned, reviewed patch of binding-state comparison; measure by draw count and profile.
3. Warm programs still linked during battle (record program keys created after load).
4. Simulation targeting cost with deterministic full-state comparison at matching ticks.
5. Structural: pipeline simulation in a worker (tick N+1 while rendering tick N, one frame of latency). Renderables currently read live game objects directly, so this first needs a per-tick render snapshot interface and a deterministic full-state checkpoint harness for save/replay/lockstep. Alone it cannot pass: simulation is 26-30% of the heavy main thread, leaving about 16-17 ms of update and submission on this CPU; combine it with instancing and per-draw reductions.

No push, publication or cross-machine message is part of this handoff. The user copies `returns/M4.2-Windows-Return-*.tar.gz` and its SHA256 file to the Mac.
