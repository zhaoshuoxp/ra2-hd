# A1/C1 matched Windows return analysis

C1 reduces HD sprite submission overhead, but it does not close the reported stutter. The user reports no large noticeable difference by eye. Smoothness is not accepted; visual acceptance remains pending.

Both new ZIPs pass every CRC, declared size/hash, safe-path and exact trusted manifest check. Each contains 23 members and two complete runs; all launchers match their frozen kit bytes and were treated as data. All 18 phases are valid bounded samples with no recorded errors. The new returns omit verification.json; this is not evidence of a new on-target verification. Earlier A1 verification and local sealed-kit verification remain separate.

A1 return SHA256: `ca7a6b35cdb4e9eff0c8708884d4791eb2f1ddc50282cde6e447fb9a64ba9835`. C1 return SHA256: `32b49ece18ab9fbf014748ad2413d25b09fc88dd0da840ad0f24f3017e1ebac1`. Read-only extracted evidence, validation receipts and matching-source-map analysis are under `.artifacts/windows-hd-diagnostic/returns/`, `ab-a1-analysis-v1/` and `ab-c1-analysis-v1/`. No failures or earlier invalid samples were changed.

The comparison asserts the same CPU, RAM, display/DPI/frequency, runtime, GPU renderer/features, AC power, native game options/speed/seed/map, graphics/output/context and resource/cap identities. Target: Ryzen 7 5800H, RTX 3070 Laptop GPU via hardware ANGLE D3D11, Electron 44.4.0 / Chrome 152.0.7977.78, 165 Hz at 1.5 DPI. Actual window 1281x802 DIP, logical view 1437.531x900, framebuffer 1921x1203; YR Small, two players/one AI. GPU time, actual VRAM and GPU budget are unavailable.

| Mode / phase | Frame median A1 -> C1 | Frame p95 A1 -> C1 | Frame p99 A1 -> C1 | >33 ms count A1 -> C1 | Submit median A1 -> C1 | Draw median A1 -> C1 |
|---|---:|---:|---:|---:|---:|---:|
| 2x / fresh-process-first-use | 18.135 -> 12.130 | 18.210 -> 18.185 | 30.345 -> 18.400 | 9 -> 7 | 8.745 -> 7.365 | 845 -> 733 |
| 2x / warmed-steady | 12.365 -> 12.130 | 18.205 -> 18.185 | 24.240 -> 18.220 | 0 -> 0 | 8.825 -> 7.450 | 856 -> 741 |
| 2x / same-process-reentry-first-use | 18.140 -> 12.130 | 18.205 -> 18.185 | 24.255 -> 24.230 | 5 -> 6 | 8.845 -> 7.290 | 844 -> 733 |
| 2x / same-process-reentry-warmed | 18.165 -> 12.130 | 18.205 -> 18.180 | 24.230 -> 18.200 | 0 -> 0 | 8.960 -> 7.365 | 856 -> 741 |
| 4x / fresh-process-first-use | 18.170 -> 12.145 | 54.550 -> 48.510 | 66.675 -> 60.630 | 80 -> 85 | 9.070 -> 7.625 | 900 -> 761 |
| 4x / warmed-steady | 18.165 -> 12.140 | 48.525 -> 48.500 | 54.575 -> 54.570 | 79 -> 81 | 9.160 -> 7.735 | 911 -> 769 |
| 4x / same-process-reentry-first-use | 18.170 -> 12.150 | 54.560 -> 48.510 | 60.580 -> 54.575 | 80 -> 86 | 9.215 -> 7.615 | 900 -> 761 |
| 4x / same-process-reentry-warmed | 18.175 -> 12.155 | 54.555 -> 48.505 | 60.630 -> 54.560 | 75 -> 81 | 9.705 -> 7.765 | 912 -> 770 |

All times are milliseconds. Counts cover separate approximately 15-second phases and are not normalized FPS. Actual binding family sets, endpoint counts, multiset hashes and native ticks are recorded in the JSON. Advancing AI sessions and animation endpoints are a confound; do not imply identical simulation frames. No density, quality, fallback or capacity change explains the submission reduction.

The 4X warmed p95 barely moves (48.525 -> 48.500 ms); >33 ms events remain about 80 per phase. First-use/re-entry >100 ms counts remain 4/3. C1 lowers median submission by about 15-20%, but recurring long frames persist. Loading observations do not establish cold-cache speedups; OS/driver caches were not flushed.

Separate 8-second instrumented traces capture full CPU profiles and multiprocess events. Both have 168 compileShader calls, 84 linkProgram calls and 84 getProgramInfoLog calls. Log-query cumulative CPU waits are 1414.125 ms (A1) and 1363.390 ms (C1). This is CPU waiting, not GPU execution time. texSubImage2D costs only 11.265 / 12.180 ms; texture allocation/upload churn is not the leading observed trace cost. Trace timing is excluded from lightweight A/B.

A native Mac ownership probe reproduces C1 with 80 links/deletions per eight seconds. Every link belongs to the hidden MergedSpriteMesh HD body and alternates two byte-identical shader pairs. Animation page changes destroy unused batches, releasing their last program references; the next page rebuilds the same programs. The body uses hdPass=0 and discards all pixels while hdFiltering is enabled. Sorted full-coverage children still render the pixels. Skipping that body alone gives zero new links/queries over the same local probe while ticks advance. This supplies a specific mechanism for the Windows repeated waits; exact Windows material ownership is inferred from the matching source/call pattern and still requires the C2 intervention.

Three camera positions with filtering on/off give six full-buffer zero-difference comparisons on immutable C1 4X. Filtering-off retains the body fallback. These are bounded Mac equivalence observations, not Windows smoothness or broad visual acceptance. C2 tests the discarded-body intervention without changing shader checks, program caches, assets, quality or limits.

Reproduce: run verify-return.py against each immutable kit, then analyze-return.mjs with that kit, then compare-ab.mjs with the two extracted returns and analyses. See the adjacent JSON for exact metrics/provenance. Continue this conversation for C2 Windows validation; do not merge or push this pending repair.
