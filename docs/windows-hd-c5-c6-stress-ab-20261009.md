# C5/C6 Windows stress return: shorter tails, no perceived combat improvement

The C6 return passes CRC/hash/safe extraction, exact frozen source/manifest identity, four identical launchers inspected only as data and target verification of 8,107 files with zero failures. Its one eight-player/seven-AI 4X Normal run has four valid, uninstrumented 15-second phases with native progress and no errors. C5/C6 match machine, runtime, ANGLE/backend/driver, display/DPI, AC/power scheme, OS, fixed game/setup, output/shadows, resources and limits. All four actual HD family sets and endpoint binding multisets are identical. This is one matched pair, not a repeatability study; independently advancing simulation and scheduling still apply.

Target is Ryzen 7 5800H / RTX 3070 Laptop / ANGLE D3D11, native fullscreen 2560x1600, DPI 1.5, YR xmp27t8. C6 source is 4d3e41f5ffe2746ada9bc765a407f00638cb4705. The accepted source art, complete-family binding and fixed limits remain exact; improvement is not missing HD content or reduced quality.

| Phase | C5 median / p95 / p99 / max | C6 median / p95 / p99 / max | C5 >33/50/100 | C6 >33/50/100 |
|---|---:|---:|---:|---:|
| fresh-process-first-use | 12.135 / 24.220 / 30.310 / 387.850 | 12.130 / 18.450 / 30.300 / 381.860 | 7/4/3 | 7/5/3 |
| warmed-steady | 18.150 / 24.240 / 42.395 / 187.875 | 12.155 / 24.230 / 36.350 / 151.530 | 15/6/3 | 10/5/1 |
| same-process-reentry-first-use | 12.145 / 24.195 / 30.275 / 260.615 | 12.130 / 18.205 / 24.270 / 260.600 | 5/3/2 | 3/2/2 |
| same-process-reentry-warmed | 18.160 / 24.245 / 36.340 / 199.995 | 18.135 / 24.245 / 35.940 / 90.905 | 11/4/1 | 10/4/0 |

Timings are milliseconds. Across the two warm phases, >100 ms intervals change from four to one; maximum intervals change from 187.875/199.995 to 151.530/90.905 ms. First-warm median improves in this pair, while re-entry median/p95 remain similar. Fresh/re-entry loading changes from 10.456/8.876 to 11.329/9.628 seconds, increases of 0.872/0.752 seconds without cache flushing; this does not establish a universal loading cost. Startup still has a 381.860 ms interval, 293.105 ms submission and 281.595 ms first simulation work. No cold-start closure follows.

The user reports essentially no perceived difference from C5. Loading and visual observations were not separately described; do not infer their acceptance. C6 retains its validated focused source change, but the enemy/combat smoothness gate remains open. C4 Small acceptance is preserved. The counts above establish improvement in this recorded pair, not a complete or user-perceived fix.

C6 first-warm row 455 has simulation 2.255 ms, update 11.985 ms and submission 136.775 ms, totaling 151.015 ms before the 151.530 ms interval at +7.342 seconds. A separate 73.165 ms submission precedes a 90.920 ms interval at +4.112 seconds. These submissions remain close to C5's 134.950/74.560 ms rows. The largest unrecorded-between-frame gaps decrease from 170.680/176.650 ms to 68.440/72.135 ms, yet are unresolved in this untraced return. Prior C4 shader/pooling attribution and copied Mac mechanism proof do not directly identify these particular C6 tasks or Windows shader material/family. CPU submission is not GPU time; actual process VRAM/GPU execution/budgets remain unavailable.

Before another source repair, reuse the existing C6 kit for one warmed F9 trace around 20-28 seconds after first live map entry. Both recording and detailed renderer-call hooks are exact previously validated C4 bytes. The run is instrumented and must be excluded from Normal A/B; preserve this valid Normal report. Include raw CPU/multiprocess trace, WebGL call ledger, configuration and any failures in the export. The focused procedure is windows-hd-c6-stress-trace-followup-20261009.txt. No new candidate package, density/control matrix, quality/cap change, main integration, peer M2.3 change, push or publication is part of this step. Continue this execution conversation.
