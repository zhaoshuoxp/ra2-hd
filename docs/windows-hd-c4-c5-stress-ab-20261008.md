# C4/C5 Windows stress comparison: broad residual gate remains open

The C5 target return passes the exact frozen manifest/source, full CRC/hash/safe-path checks, four identical launchers inspected only as data and target verification of 8,096 files with zero failures. It contains one complete eight-player/seven-AI 4X Normal run; all four phases are valid, uninstrumented and have native progress/empty errors. The prior C4 stress Normal baseline has matching machine/backend/power, fixed map/setup, output/shadows, configuration, resources and limits. No heavy profile was returned for C5. User C5 experience feedback is pending.

Target: Ryzen 7 5800H / RTX 3070 Laptop / ANGLE D3D11, AC power, native fullscreen 2560x1600, xmp27t8, YR, four 15-second phases. One paired run is not a repeatability study. Actual HD family/binding differences from independently advancing AI endpoints are preserved in the adjacent JSON.

| Phase | C4 median / p95 / p99 / max | C5 median / p95 / p99 / max | C4 >33/50/100 | C5 >33/50/100 |
|---|---:|---:|---:|---:|
| fresh-process-first-use | 12.135 / 24.215 / 30.300 / 406.085 | 12.135 / 24.220 / 30.310 / 387.850 | 7/4/4 | 7/4/3 |
| warmed-steady | 18.155 / 24.260 / 42.425 / 187.825 | 18.150 / 24.240 / 42.395 / 187.875 | 17/7/4 | 15/6/3 |
| same-process-reentry-first-use | 12.140 / 24.225 / 30.350 / 272.720 | 12.145 / 24.195 / 30.275 / 260.615 | 9/3/2 | 5/3/2 |
| same-process-reentry-warmed | 18.160 / 24.250 / 42.415 / 193.965 | 18.160 / 24.245 / 36.340 / 199.995 | 12/5/1 | 11/4/1 |

Timings are milliseconds. Typical warm timing stays near 18.15 ms median / 24.24 ms p95. Warm re-entry p99 changes from 42.415 to 36.340 ms, while its maximum changes from 193.965 to 199.995 ms. First-warm >100 ms counts change from four to three; re-entry retains one. This does not establish an overall speedup or hitch removal. Fresh/re-entry loading changes from 10.244/8.674 to 10.456/8.876 seconds without cache flushing; no general loading-cost claim follows.

C5 warm submission still has 134.950/74.560/51.960 ms rows, compared with 150.180/87.065/51.540 ms in C4. The largest first-warm interval lasts 187.875 ms after only 17.195 ms of recorded simulation/update/submission; re-entry has 199.995 ms after 23.345 ms. The remaining gaps are 170.680/176.650 ms. Prior C4 tracing confirms 84.106/189.468 ms main-thread SHP preparation tasks dominated by poolHdPixels; that source path is unchanged in C5. Its recurrence is a supported lead, not direct attribution of each untraced C5 interval. Other shader variants remain separate.

C5 local source proof removes repeated indexed combat-program relinking, but this Windows Normal return contains no shader-call ledger to confirm its exact contribution. CPU submission is not GPU time, and actual process VRAM/GPU execution remain unavailable. C4 Small acceptance remains intact; broad stress smoothness and C5 visual/loading/user acceptance remain open. No main merge or peer M2.3 change follows from these measurements.

The next focused source change moves the unchanged lossless SHP tile-pooling calculation to a bounded background worker. PNG validation, complete-family admission/fallback, texture creation/upload, source art, caps and shader repairs remain intact. Worker unavailability/failure must preserve the existing same-data CPU path; cloned inputs remain owned for safe fallback. Compare exact output bytes and copied native binding/lifecycle/visual controls before Windows delivery. Input cloning adds a bounded temporary CPU copy per active page; it is not prepared-cache residency or VRAM. Do not claim the confirmed decode/validation or remaining shader costs also disappear. Continue this execution conversation.
