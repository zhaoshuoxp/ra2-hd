# C9 Windows sustained-play results — 2026-10-10

C9 improves matched automatic throughput, but later manual play remains slow. The user reports limited improvement and otherwise normal behavior. This closes this run's integrity and data-capture checks, with no new visual/loading problem reported; sustained smoothness and final acceptance remain open. Reuse C9 for one late F9 trace before selecting another source repair.

The Desktop return `WINHD-20261008-D38F136-C9-RETURN-2026-10-10T18-53-37-820Z.zip` is preserved read-only before analysis: 83,056,383 bytes, SHA-256 `7272f6a2b1dca95a61a1fc1acd6428cd5ce3d445e9c4ade5b20e9021d103ff9c`. All 14 members, hashes, CRCs, frozen C9 identity and four original launchers pass. Target verification checks 8,143 files against manifest `4b3914eaec2e053cd287c1d091e78803b3ccec7ca700cbf267013e3bf081e25e`, shipping source `69c132d385771dabd385635aa036c51b27014797`. Returned code is not executed. Run `2026-10-10T18-48-34-361Z-stress-4x-none` is CAPTURED with empty errors and six valid Normal phases; no trace/profile was requested.

Hardware, runtime, AC power, display/output and frozen setup match the retained C8 Normal baseline: Ryzen 7 5800H, RTX 3070 Laptop GPU, ANGLE D3D11 driver 32.0.15.9597, 165 Hz, DPI 1.5, native 2560×1600, Electron 44.4.0/Chrome 152.0.7977.78, eight combatants/seven AI and actual HD 4X. All six phases have advancing native ticks and no focus, visibility or resize events. Resources and 512/1280/128/16 MiB limits are exact.

| Automatic phase | C8 mean loop FPS | C9 mean loop FPS | Observed change | Update median reduction |
| --- | ---: | ---: | ---: | ---: |
| First use | 70.95 | 78.20 | +10.23% | 16.65% |
| Warmed | 67.84 | 76.77 | +13.16% | 16.92% |
| Re-entry first use | 73.59 | 82.34 | +11.89% | 15.05% |
| Re-entry warmed | 70.28 | 76.73 | +9.19% | 12.55% |

Automatic update medians fall from 4.325–4.640 ms to 3.605–4.005 ms. Draw-call medians remain 755/784/755/784, with only one draw fewer in the last phase. First-use endpoint content is identical; other endpoint family counts differ slightly as independent native AI advances. The observations are consistent with removing unused bearing preparation, not evidence that all remaining costs are solved or that content disappeared. They do not establish a matched causal gain in later manual scenes.

| C9 Normal manual sample | Native ticks | Mean loop FPS | Update median | Submission median | Median same-row update + submission | Draw median |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| manual-5 | 9,220–10,165 | 27.12 | 11.825 ms | 18.250 ms | 30.220 ms | 1,388 |
| manual-6 | 11,004–11,914 | 23.76 | 13.765 ms | 20.495 ms | 34.195 ms | 1,566 |

Both manual samples retain eight combatants/seven AI and move the camera, with 10,067/10,278 endpoint nodes and 1,966/1,926 actual HD bindings. Frame p95 values are 48.495/54.610 ms; 14/34 intervals exceed 50 ms, and none exceed 100 ms. Simulation medians are 3.015/4.190 ms and p95 values 18.100/18.735 ms. The measured graphics work alone takes a same-row median 30.2–34.2 ms before simulation and scheduling. The 165 Hz display interval is about 6.06 ms. Rendering uses requestAnimationFrame independently of native simulation cadence; the measured automatic rate exceeds 60 FPS. These facts do not exclude compositor synchronization, frame pacing effects or unmeasured GPU work.

C8 manual samples measured 23.27–29.61 FPS, with different native ticks, cameras, actors and eliminated-player states. C9's heavier later endpoints also have more draws than several C8 samples. Do not turn the manual-rate differences into a causal C9 improvement/regression percentage. The user's limited subjective improvement remains the acceptance result. First-load/re-entry waits are 11.651/9.698 seconds; the user reports other behavior normal. No shader-compilation count or exact C9 function ranking can be inferred from this timing-only return. Submission is CPU/native timing, not GPU execution; process VRAM/budget remain unavailable.

Installed Three.js 0.183.2 and retained application source still perform render-list projection, geometry/program vertex-binding validation, uniform/native drawing and explicit scene/batch world matrices. Earlier C8 trace weights make these investigation targets, not measured-current C9 attribution. Native vertex validation and traversal cannot simply be bypassed. No application source, quality, resource, budget, sync setting or dependency is changed from this report.

Use `windows-hd-c9-late-trace-request-20261010.txt`: reuse C9, choose eight players/4X/Normal if a fresh process is needed, finish automatic capture, then reproduce later low throughput and press F9 once. Continue scrolling/playing for eight seconds, wait for capture complete, close and export. Retain the already validated Normal samples; no F8 repetition, automatic early Trace, new ZIP or old density matrix is requested. The byte-pinned built-in F9 path already passes copied C9 native QA, manual camera retention and debugger restoration.

Reproducible comparison is `.artifacts/windows-hd-diagnostic/c8-c9-windows-sustained-comparison-v2.json`; v1 remains preserved with stale C8-only explanatory labels. The version-neutral analyzer correction changes only two explanatory strings; all identity and numeric fields match exactly. The bounded JSON receipt is `windows-hd-c9-windows-results-20261010.json`. Existing native source/pixel validation and shipped ZIPs remain immutable. Main is clean at D38F136; the M2.3 peer is observed read-only at 94b2e85 with its current working changes preserved. No main merge, push, cleanup or new source candidate is performed. Continue this execution conversation for remaining attribution, repair and acceptance.
