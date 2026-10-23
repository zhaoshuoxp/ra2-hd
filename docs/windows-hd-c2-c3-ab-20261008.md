# C2/C3 matched Small 4X Windows result

C3 removes one later approximately 100 ms submission stall in each fresh/re-entry first-use window. Warmed behavior is broadly unchanged, and the user reports no obvious perceived difference. This validates a narrow tail improvement, not a perceptible steady improvement or complete Windows stutter closure. User visual acceptance is not separately confirmed.

The two new Desktop returns pass full CRC/hash, size, safe extraction, exact frozen manifest and run/launcher identity checks. Each has 13 members and one complete Small 4X Normal run. Launchers were read only as data. All eight phases are valid and uninstrumented; errors, focus/visibility/resize events are empty. No trace or target verification.json is present. Target verification remains a separate missing receipt; the locally sealed inventories do not replace it.

| Return | SHA256 | Bytes | Frozen source |
|---|---|---:|---|
| C2 2026-10-09T02-01-58-117Z | `b574cae3a068dd27a77ca047d6c979d743360e1ebfe197a75d9aa9b058c8791f` | 25,852,991 | `84d502e233382b9525d7c44820881bdf372d085f` |
| C3 2026-10-09T02-04-37-103Z | `366dce805da498c091421633d557518a27ed5e2a9e172d007c45d71777b83b26` | 25,875,705 | `c2bcc16dd5530e1c7031312317b104a270fe8cf2` |

The comparator pins these two exact runs, allows the requested 4X-only matrix and asserts that all compared phases are Normal. Machine/runtime/display/power, native setup/speed/seed/map, logical/framebuffer output, graphics/context, resources and caps match. The same RTX 3070 Laptop hardware ANGLE D3D11 target and high model/shadow settings are retained. Every phase has an identical actual HD family set and binding multiset/count. Native tick endpoints differ by 0-9 ticks across independently advancing AI sessions; actor positions/animation endpoints are not identical frames.

| Phase | Median C2 -> C3 | p95 C2 -> C3 | p99 C2 -> C3 | Max C2 -> C3 | >33 / >50 / >100 C2 -> C3 |
|---|---:|---:|---:|---:|---:|
| fresh-process-first-use | 12.130 -> 12.130 | 18.180 -> 18.205 | 18.410 -> 24.265 | 315.120 -> 303.020 | 8/4/4 -> 6/3/3 |
| warmed-steady | 12.130 -> 12.130 | 18.175 -> 18.175 | 18.190 -> 18.190 | 18.290 -> 18.390 | 0/0/0 -> 0/0/0 |
| same-process-reentry-first-use | 12.155 -> 12.135 | 18.195 -> 18.180 | 18.225 -> 18.200 | 200.010 -> 199.885 | 5/3/3 -> 5/2/2 |
| same-process-reentry-warmed | 12.150 -> 12.135 | 18.195 -> 18.180 | 18.215 -> 18.200 | 18.485 -> 24.265 | 0/0/0 -> 0/0/0 |

All times are milliseconds; each phase is approximately 15 seconds. Fresh >100 ms counts fall 4 to 3; re-entry 3 to 2. Warmed p95 remains exactly 18.175 ms and warmed >33 ms counts remain zero in both versions. Fresh p99 rises from 18.410 to 24.265 ms in this single pair, so C3 is not a uniform percentile improvement. Re-entry warmed p95 changes by only 0.015 ms. No statistical significance or broader scene claim is made.

C2 later first-use submissions at approximately 9.006 seconds and re-entry 8.930 seconds cost 97.565/96.630 ms and produce 103.070/103.065 ms following intervals. Corresponding later stalls are absent in C3. The result is consistent with the locally proven one-render program ownership handoff; the Normal Windows runs do not directly record material ownership or shader-call counts. C2's prior dedicated profile directly establishes its later 86.540 ms shader wait.

C3 still submits for 234.495 ms at approximately 8.040 seconds / tick 520, producing a 242.420 ms following interval. C2 costs 222.775 ms at the same approximate tick. C3 re-entry still submits for 98.860 ms at approximately 7.690 seconds / tick 521, producing 109.115 ms. These locate the remaining event in submission, not simulation/update. CPU submission and RAF interval are not GPU time, and an interval describes the preceding row's work. The first rendered frame and native first simulation call remain separate roughly 300/225 ms events.

The earlier returned C2 first-use profile began too late for the approximately 225 ms first acquisition. Windows attribution of that event remains unresolved; no speculative new rendering fix is introduced. First shader acquisition and upload are candidates to distinguish, not confirmed alternative causes. GPU execution time, actual process VRAM and budget remain UNAVAILABLE.

The existing C3 copied-payload workflow is now validated on Mac with F9 one second after the native loop starts. CPU profile and trace are CAPTURED, requestedDuringStage is first-use, four phases are valid and explicitly instrumented, errors are empty, and the window includes two program links/four shader compilations/two log calls. This confirms the early capture route, not Windows timing or cost attribution. The owned process closes after capture; no package/application bytes change.

Next is one dedicated existing-C3 Small 4X Normal launch with F9 once about one second after the live map appears, then final completion/export. All overlapping/subsequent phases are excluded from Normal A/B. Keep settings/output/power/focus fixed. No new density, stress or control matrix is requested. Record the Verify-Kit.cmd result separately because both new returns omit the receipt. Use windows-hd-c3-first-use-followup-20261008.txt.

The old sealed C3 delivery/merge records remain immutable and are superseded only for this target-result status. C2's earlier clear steady improvement stays accepted within Small; C3 is a bounded measured improvement without perceived gain. Main remains frozen at d38f136, M2.3 advances independently and is untouched, and no merge/push or production/resource update is performed. Continue the current execution conversation for the remaining first-use trace.
