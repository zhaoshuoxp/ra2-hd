# C8 Windows sustained-play results — 2026-10-09

C8 reduces scene-update cost in the matched automatic phases, but the user's later manual-play experience remains unchanged. Four valid Normal manual samples still average 23.27–29.61 game-loop FPS. This is a useful source-cost reduction, not acceptance of sustained smoothness or final deliverability. The next required evidence is one bounded late F9 trace from the existing C8 package; no new performance candidate or resource change is justified by these timing summaries alone.

## Validated return and comparison

The Desktop return `WINHD-20261008-D38F136-C8-RETURN-2026-10-10T06-28-34-289Z.zip` is copied before validation and preserved in the task's diagnostic artifacts. It contains 109,864,301 bytes, 14 members and one run. SHA-256 is `3803328bea16332c10f57d0a868a2228e00503a599ed46f9c104ab5383992e8d`. All member CRCs, declared hashes, frozen manifest, source identity, safe extraction and original launcher bytes pass. No returned code is executed.

Run `2026-10-10T06-22-54-530Z-stress-4x-none` is `CAPTURED` with zero errors. Target Verify-Kit checks all 8,133 catalog entries against C8 manifest `f480c99fd8e4a52a81b4f40d10f1a6a372d956fb58f96ee7e7aa62a46cc1bad0`, source `5721aa57d3785a8fbc9c8aad5adf9a4172bbe3af`. All eight phases are valid, uninstrumented and free of focus, visibility or resize events. The four automatic phases realize eight combatants/seven AI. Later elimination leaves seven combatants in the last two manual phases; the AI manager still records seven bots.

Hardware, runtime, power, configuration, output, resources and limits match the selected C7 M1 baseline run `2026-10-10T04-59-19-054Z-stress-4x-none`: AMD Ryzen 7 5800H, 16 GiB-class RAM, RTX 3070 Laptop GPU, ANGLE D3D11 driver `32.0.15.9597`, AC power, 165 Hz display at DPI 1.5, native 2560×1600, Electron 44.4.0/Chrome 152.0.7977.78. The baseline's two repeated-F9 rejections were already validated; its preceding Normal rows are retained. See `windows-hd-c7-manual-windows-results-20261009.md/json` for that provenance.

The existing safe verifier and generic analyzer are reused. `scripts/windows-hd/analyze-sustained-comparison.mjs` additionally rehashes both raw returns against their trusted manifests, checks target receipts, selects exact runs, matches settings and automatic camera routes, reports actual binding differences, and excludes post-profile samples from Normal manual timing. The raw comparison is `.artifacts/windows-hd-diagnostic/c7-c8-windows-sustained-comparison-v1.json`; the bounded receipt is `windows-hd-c8-windows-results-20261009.json`.

## Measured behavior

| Automatic phase | C7 mean loop FPS | C8 mean loop FPS | Change | C7 update median | C8 update median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fresh process | 65.71 | 70.95 | +8.0% | 5.265 ms | 4.325 ms |
| Warmed steady | 62.11 | 67.84 | +9.2% | 5.750 ms | 4.640 ms |
| Re-entry first use | 66.41 | 73.59 | +10.8% | 5.575 ms | 4.320 ms |
| Re-entry warmed | 61.20 | 70.28 | +14.8% | 6.055 ms | 4.580 ms |

Scene-update medians fall 17.9%–24.4%; drawing-submission medians remain approximately 6.74–7.44 ms. The wrapper repair has the expected direction in real Windows measurements. Independent native AI sessions have small tick, animation and endpoint content differences, so these are matched-protocol observations rather than frozen same-state controls. Initial actual HD binding counts match; later count differences are recorded, including a transient DOGJUMP binding absent at one re-entry endpoint. No broad family-loss or resolution-reduction explanation is observed. The user's unchanged subjective result takes precedence over calling this repair sufficient.

| Normal manual sample | Native tick range | Mean loop FPS | Update median | Submission median | Median update + submission in the same row | Draw-call median |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| manual-5 | 8,507–9,474 | 29.61 | 10.255 ms | 16.395 ms | 26.760 ms | 1,222 |
| manual-6 | 11,623–12,523 | 23.27 | 14.800 ms | 19.470 ms | 34.465 ms | 1,413 |
| manual-7 | 12,643–13,534 | 24.06 | 13.900 ms | 18.200 ms | 32.435 ms | 1,315 |
| manual-8 | 13,963–14,897 | 25.58 | 13.740 ms | 17.940 ms | 31.555 ms | 1,308 |

The first manual sample has the same start/end camera coordinates; the other three change camera position. This does not prove the first camera remained stationary throughout. The later samples still spend a median 31.6–34.5 ms on update plus submission before simulation and scheduling. A 165 Hz display interval is about 6.06 ms. The monitor rate alone cannot overcome this measured application work. Earlier C7 Normal manual FPS was 21.35, but its camera, ticks and actors differ; the manual rate difference is not a causal C8 percentage gain.

Manual frame p95 values are 48.485/54.575/54.575/54.545 ms, with 8/35/33/21 intervals over 50 ms and 0/0/2/0 over 100 ms. The result remains predominantly sustained low throughput rather than only isolated long stalls. All samples remain actual HD 4X at native output, with 8,953–9,416 endpoint nodes and 1,041–1,263 HD nodes. First-load/re-entry waits are 11.890/10.019 seconds; their user acceptability and new visual-defect status were not reported.

## Attribution boundary and next capture

This return intentionally contains Normal timings without `trace.json`, `cpu.cpuprofile` or `trace-status.json`. The earlier C7 trace showed renderer-main CPU work, matrix traversal, render-list projection, vertex-binding validation, uniforms and native draw submission, without shader compilation in its late window. Those remaining paths are investigation targets, not a verified C8 function ranking. Submission timing is not GPU execution; process VRAM and GPU budget remain unavailable. No new shader-warmup, memory-limit increase, quality reduction, broad batching rewrite or speculative source repair is made from this return.

Use the existing complete C8 package. Launch eight players/4X/Normal, let the automatic phases finish, and continue the same match until the reported low-rate condition occurs. Press F9 once while scrolling/playing and continue for the eight-second detailed sample. Wait until the title returns to `capture complete`, close the game and run Export-Reports.cmd. If the current unprofiled C8 process is still open after automatic completion, it can be used directly. The already validated eight Normal phases do not need another F8 baseline. Do not select automatic Trace mode, which profiles the earlier scene rather than the reported later manual condition.

The built-in C8 F9 path was already validated in the copied native package and is byte-pinned in the shipping manifest. It preserves manual camera input, captures CPU/multiprocess and GL-call data, labels instrumentation, restores its hooks/debugger and permits only one trace per process. The next analysis will exclude profiler-startup overhead, join CPU samples to actual game callbacks and distinguish recurring update/submission CPU from native waits before selecting one focused repair.

## Status and continuation

C8 Windows native execution, target integrity, configuration and data capture pass. The automatic scene-update reduction is observed. Sustained manual-play acceptance is not achieved; visual/loading acceptance and final deliverability remain pending. Existing Mac source/pixel validation remains valid because no application source changes in this follow-up. Main remains clean at `d38f136`; the M2.3 peer is independently dirty at `2bf54b1` and is read only. No merge, push, cleanup, resource change or replacement candidate is performed. Keep this same execution conversation for the bounded trace, subsequent repair and acceptance.
