# C1/C2 matched Windows validation and residual scrolling investigation

C2 removes the recurrent 4X shader rebuild bottleneck in the user-confirmed Small scene. The user reports clearly improved smoothness, with occasional random skips primarily while scrolling and no other observed anomalies. This validates the focused steady-state improvement, not complete Windows performance closure or all-map/input acceptance.

Both new Desktop RETURN ZIPs pass full CRC, declared size/hash, safe-path, exact frozen manifest and run-identity checks. Each contains 23 members and two complete runs. All four launcher bytes match the relevant frozen kit and were treated only as data. All 18 phases are valid bounded samples; errors are empty. Neither return contains verification.json, so target-side full-kit verification remains unrecorded. Immutable local sealed-kit verification is separate.

| Return | Archive SHA256 | Source |
|---|---|---|
| WINHD-20261008-D38F136-C1 / WINHD-20261008-D38F136-C1-RETURN-2026-10-08T23-31-47-896Z.zip | `dfc392282e8249e5ba0ed5c657962a5afd0702ff2d27d9e4f2dea9602e55ed58` | `ec50a8e41cac0ae8ecf14a3a42ae20b3e7db5b96` |
| WINHD-20261008-D38F136-C2 / WINHD-20261008-D38F136-C2-RETURN-2026-10-08T23-37-27-205Z.zip | `ef45cda77c2b6d3d909255d36392cc2f2e8fb61ca4702ee4369f75069fdc55ae` | `84d502e233382b9525d7c44820881bdf372d085f` |

The comparison rehashes incoming evidence and asserts the same machine/runtime/display/power, native game setup/seed/map/speed, graphics/context/output, resources and limits. All nine paired endpoints have identical actual HD family sets and binding multisets/counts. Native tick endpoints can differ by a few ticks because the AI advances independently; actor transforms/animation endpoints are not identical simulation frames. Actual high model/shadow settings, 1437.531x900 logical view and 1921x1203 output at 1.5 DPI are unchanged. RTX 3070 Laptop hardware ANGLE D3D11, Ryzen 7 5800H, Electron 44.4.0 and Chrome 152.0.7977.78 match the prior target.

| Mode / phase | Median C1 -> C2 | p95 C1 -> C2 | p99 C1 -> C2 | Max C1 -> C2 | >33 / >50 / >100 C1 -> C2 | Submit p95 C1 -> C2 |
|---|---:|---:|---:|---:|---:|---:|
| 2x / fresh-process-first-use | 12.130 -> 12.130 | 18.185 -> 18.195 | 24.230 -> 24.255 | 303.020 -> 296.985 | 7/4/4 -> 7/4/4 | 7.980 -> 8.235 |
| 2x / warmed-steady | 12.130 -> 12.130 | 18.180 -> 18.185 | 18.205 -> 18.205 | 24.310 -> 30.380 | 0/0/0 -> 0/0/0 | 7.855 -> 8.135 |
| 2x / same-process-reentry-first-use | 12.135 -> 12.130 | 18.190 -> 18.190 | 24.225 -> 24.220 | 212.090 -> 200.000 | 6/3/3 -> 6/3/3 | 7.830 -> 7.945 |
| 2x / same-process-reentry-warmed | 12.135 -> 12.130 | 18.185 -> 18.185 | 18.205 -> 18.205 | 36.385 -> 24.255 | 1/0/0 -> 0/0/0 | 7.960 -> 8.015 |
| 4x / fresh-process-first-use | 12.145 -> 12.130 | 48.510 -> 18.190 | 54.570 -> 24.245 | 296.955 -> 309.065 | 84/27/4 -> 8/4/4 | 42.895 -> 7.995 |
| 4x / warmed-steady | 12.135 -> 12.130 | 48.495 -> 18.180 | 54.565 -> 18.210 | 54.600 -> 30.305 | 81/19/0 -> 0/0/0 | 42.540 -> 7.995 |
| 4x / same-process-reentry-first-use | 12.145 -> 12.140 | 48.500 -> 18.190 | 54.570 -> 18.345 | 193.950 -> 206.040 | 85/20/3 -> 6/3/3 | 42.900 -> 8.105 |
| 4x / same-process-reentry-warmed | 12.140 -> 12.140 | 48.505 -> 18.195 | 54.560 -> 18.225 | 84.845 -> 24.285 | 80/24/0 -> 0/0/0 | 42.785 -> 8.140 |

Times are milliseconds; each normal phase is approximately 15 seconds. Warmed 4X p95 improves from 48.495 to 18.180 ms (62.5% lower); p99 from 54.565 to 18.210 ms. >33 ms events fall from 81 to 0, and warmed re-entry from 80 to 0. Median stays around 12.13 ms; the change removes the tail rather than improving every frame. 2X warmed behavior is broadly unchanged. High-output HD content is retained.

The separate eight-second warm traces link 86 programs / compile 172 shaders in C1 versus 2 / 4 in C2. getProgramInfoLog cumulative CPU waiting falls from 1381.210 to 13.825 ms (99.0% lower). C2 still has two legitimate or short-lived program acquisitions, so the target result must not be labeled zero compilation. texSubImage2D costs 12.080 / 11.410 ms in these warm windows. Trace timing is instrumented and excluded from normal A/B; CPU call waits are not GPU execution time.

First-use/re-entry >100 ms counts remain 4/3. At the first frame, update/submission are about 53/243 ms; the next first native simulation call costs about 227 ms. Separately, fresh C2 at approximately 8.03 seconds/tick 520 submits for 227.035 ms, producing a 236.420 ms interval. At approximately 9.02 seconds it submits for 99.020 ms, producing 109.115 ms. Re-entry has analogous approximately 100 ms submission stalls around ticks 521 and 591. Raw rows pair the interval with the preceding CPU row; neither frame interval nor submission time is GPU timing. These later isolated events occur while the camera route continues.

The corrected instrumented Mac early-live ownership probe starts at tick 0, after the debug renderer is exposed; loading and the first rendered frame may precede the hook. It records GAPOWR opaque HD body (hdPass=1) and coverage (hdPass=2) programs first acquired at tick 520. At tick 578, batch disposal releases both last program owners before identical replacements acquire those same byte-identical shader pairs in that frame. This is distinct from the discarded hdPass=0 body already removed by C2. All shader checks stay enabled. Texture/buffer call metrics are local CPU observations, not Windows costs or actual VRAM. The exact target cold-phase shader/upload attribution remains a hypothesis until the focused Windows trace returns.

The first local early-hook attempt incorrectly required pre-start installation; its FAIL receipt and raw output remain preserved. The accepted replacement explicitly permits the initial tick 0-2 boundary, states the excluded loading/first-frame limitation, and completes the remaining native diagnostic phases with instrumented labels. No raw failure is rewritten.

Next: keep the existing C2 package. Run Verify-Kit.cmd before the series, then one fresh Small 4X Normal launch. About five seconds after the live match appears, press F9 once and keep focus until final capture completion. This one eight-second trace should include the observed 8-9 second stalls. Export the C2 RETURN ZIP, including failures/verification. This is a profiling-only run; all overlapping/subsequent phases are marked instrumented and are excluded from the completed normal A/B. The exact five-second F9 workflow passes on the fresh copied native Mac payload: CPU profile/full trace are CAPTURED, requestedDuringStage is first-use, all four valid phases are instrumented, and errors are empty. This is tooling validation, not Windows timing. No density/stress/control matrix or speculative source change is requested.

The source-only C2 patch and a no-merge handoff are retained separately. The frozen package stays at 84d502e; current changes are analysis/tools/docs only. Main and M2.3 are preserved; no merge/push or production/resource update was performed. Actual VRAM, GPU budget and GPU execution time remain UNAVAILABLE. Continue this execution conversation for the remaining scrolling trace.
