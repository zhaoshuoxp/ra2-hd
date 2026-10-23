# C3/C4 matched Small 4X Windows acceptance

C4 removes the later first-use submission stall in both the fresh and same-process re-entry samples. The user accepts current scrolling and gameplay smoothness, reports little perceived difference from 2X and a slight deficit against Original low resolution. This closes the tested Small 4X smoothness gate. Initial scene/simulation stalls remain, and C4 does not show a uniform steady-throughput improvement. The retained Windows eight-player case and target kit verification remain pending; main integration is not authorized.

Both new Desktop returns pass full CRC, size, hash, safe extraction, frozen manifest and run identity checks. All four returned launchers match their trusted kits and were inspected only as data. Each archive contains 13 members and one complete Normal run; all eight phases are valid, uninstrumented and free of errors, focus, visibility and resize events. Neither return includes `verification.json` or a shader-call trace. See `windows-hd-c3-c4-ab-20261008.json` for exact identities, machine/configuration, complete metrics, raw row correlation and acceptance boundaries.

| Return | Bytes | SHA-256 | Frozen source |
|---|---:|---|---|
| C3 2026-10-09T03-24-34-562Z | 25,854,685 | `bb5fc61b493b1ddf853b10e38679bf474d5331370a255a402aca555052cc2ccb` | `c2bcc16dd5530e1c7031312317b104a270fe8cf2` |
| C4 2026-10-09T03-27-32-251Z | 25,804,512 | `6749c97bff24612aa22cdc95b06bf6c1028141b04ecc9a74748962edc61dbd0e` | `f850b5cb44b0f6a8a415ff0636705bd5566901ec` |

The comparator pins exactly `2026-10-09T03-22-29-814Z-small-4x-none` and `2026-10-09T03-25-25-085Z-small-4x-none`. Machine, runtime, AC power, display/DPI, native setup/map/seed/speed, camera endpoint, context, graphics and realized 1921x1203 output match. The target remains Ryzen 7 5800H / RTX 3070 Laptop / ANGLE D3D11. Every phase has the same actual HD family set and binding multiset: 56 VXL and 1,242/1,244 SHP bindings. Independently advancing AI sessions can differ slightly in native tick, node and animation endpoints. The complete 6,033-resource inventory and 512/1280/128/16 MiB allocation limits remain exact.

| Phase | Median C3 -> C4 | p95 C3 -> C4 | p99 C3 -> C4 | Max C3 -> C4 | >33 / >50 / >100 C3 -> C4 |
|---|---:|---:|---:|---:|---:|
| fresh-process-first-use | 12.140 -> 18.150 | 18.190 -> 18.210 | 24.230 -> 24.275 | 296.965 -> 315.165 | 7/3/3 -> 6/2/2 |
| warmed-steady | 12.135 -> 18.125 | 18.190 -> 18.205 | 18.210 -> 24.230 | 30.280 -> 36.325 | 0/0/0 -> 1/0/0 |
| same-process-reentry-first-use | 12.135 -> 18.155 | 18.190 -> 18.210 | 18.230 -> 24.255 | 206.065 -> 206.040 | 5/2/2 -> 3/1/1 |
| same-process-reentry-warmed | 12.135 -> 12.140 | 18.190 -> 18.200 | 18.215 -> 18.340 | 24.240 -> 42.435 | 0/0/0 -> 2/0/0 |

All timings are milliseconds; each phase covers approximately 15 seconds. Whole-phase statistics retain startup rows. Fresh >100 ms counts fall from three to two; re-entry falls from two to one. Both C4 warmed windows contain no >50 ms intervals. C4 warmed median/p99 and several CPU medians are higher in this single pair, so neither a general FPS increase nor a ruled-out sustained regression is claimed. Clock/thermal/background-load effects are not measured; this pair cannot assign those differences to a cause. User acceptance is separately recorded rather than inferred from percentiles.

| Later first-use event | C3 submission | C3 following interval | C4 maximum submission after first second | C4 maximum interval after first second |
|---|---:|---:|---:|---:|
| Fresh, about 8.032 seconds | 226.055 | 242.480 | 18.965 | 30.305 |
| Re-entry, about 7.728 seconds | 98.760 | 103.065 | 13.555 | 24.400 |

The later event is absent in C4. The after-first-second slice is descriptive and does not replace the whole-phase table. RAF intervals describe the preceding row's work; CPU submission is not GPU time. Earlier C3 Windows profiling directly attributed 212.735 ms to two first-use program waits, while the frozen copied Mac proof establishes exact shader identity, preparation before play and retained program reuse. The new Normal returns are consistent with that repair but do not directly measure Windows shader-call counts or owner lifetimes.

C4 still has a first displayed-frame submission of 244.955 ms plus 55.220 ms of scene update, followed by a 315.165 ms interval. Its first native simulation call takes 224.640 ms, followed by a 266.650 ms interval. Re-entry begins with a 153.335 ms submission and a 206.040 ms following interval. Attribution of the remaining initial submission is unresolved; the confirmed later shader wait does not identify every startup stall. Actual GPU execution time, process VRAM and GPU budget remain UNAVAILABLE.

| Loading to first game frame | C3 seconds | C4 seconds |
|---|---:|---:|
| Fresh process | 14.848 | 14.822 |
| Same-process re-entry | 12.900 | 12.601 |

This pair shows no increase in total loading time. Fresh profiles do not flush OS disk or driver caches, and C4 ran after C3, so the differences cannot establish warmup overhead or a general loading-time guarantee. App-accounted pool values match in every phase, including the remaining unit-pool allowance of 450,914,004 bytes and prepared CPU peak of 79,847,452 bytes. These figures do not measure actual VRAM. The C4 helper borrows existing textures and retains two program owners; it loads no extra asset family and submits no draw.

Shader preparation is already performed behind match loading in `Renderer.prepareScene`, called by `GameScreen` before attaching the live world. `HdSpriteProgramWarmup` prepares and validates the measured non-tiled, unclipped opaque/coverage pair and retains its owners through the scene lifetime. It does not create a persistent cross-process driver cache. Preparing against the actual map/material/camera context is more reliable than assuming one first-launch pass covers all later scenes. Three documents precompilation before first rendering and requires configured target lighting/environment; Khronos provides nonblocking completion queries to avoid waiting on normal compilation-status queries. See [Three WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) and [KHR_parallel_shader_compile](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/).

Resource preparation already covers map terrain/environment and actual starting unit/building identities in `GameScreen`. `productionHdPrewarm` observes all native production queues and prepares queued identities, free units and MCV construction yards before completion. Leases bridge the handoff to real renderers without changing native credits/ticks. These paths preserve fixed shared budgets and complete-family Original fallback. Loading an entire catalog would increase loading and memory pressure without evidence of a remaining resource-upload bottleneck. Freeze C4 for closure; expand preparation only for a newly measured variant, upload or preparation stall, with loading, allocations, actual bindings and output checked together.

Reuse the sealed C4 tests, source/type checks, copied Mac lifecycle proof, nine full-buffer zero-difference comparisons and sixteen valid native phases; no source or package bytes changed in this acceptance turn. New evidence supersedes only the earlier Windows-pending status, preserving old reports and failures. One current-C4 eight-player/seven-AI 4X Normal capture, experience feedback and a C4 `Verify-Kit.cmd` PASS receipt complete the next bounded gate; see `windows-hd-c4-final-check-20261008.txt`. An acceptable broader result supports delivery within tested scope, without claiming all-map, physical-input or zero-startup-stall acceptance. Main/M2.3 remain independent and untouched. Continue this execution conversation for this final check; integration coordination belongs in the existing planning conversation after closure.
