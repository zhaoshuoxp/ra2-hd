# C7 Windows result: fewer hitches, sustained manual-play rate still open

The C7 return contains one Normal eight-player/seven-AI 4X run and four valid, uninstrumented phases. The user reports improved hitches but a sustained low-rate feeling, primarily during manual play after the automatic test, resembling a change from 120 Hz to 60 Hz on a 165 Hz display. That later interval is absent from this return; neither visual nor loading acceptance was separately reported.

The archive passes CRC, full-file hashes, frozen C7 identity, returned-launcher comparison and safe read-only extraction. C6/C7 match the machine, display, native 2560×1600 framebuffer, driver/backend, configuration, seed, resources, limits and actual HD family sets. Three endpoint binding multisets are identical; the first warmed phase differs by one Cannon binding and three unnamed non-HD bindings in independently advancing matches. This is one matched pair, not a repeatability study. Exact identities, metrics and evidence paths are in `windows-hd-c7-windows-results-20261009.json`.

| Normal phase | C6 mean loop FPS | C7 mean loop FPS | C6 graphics median | C7 graphics median |
| --- | ---: | ---: | ---: | ---: |
| Fresh first use | 66.12 | 60.86 | 11.815 ms | 12.948 ms |
| Warmed steady | 63.31 | 59.11 | 12.830 ms | 14.050 ms |
| Re-entry first use | 69.55 | 65.08 | 12.165 ms | 13.022 ms |
| Re-entry warmed | 61.97 | 61.67 | 13.225 ms | 13.895 ms |

Mean loop FPS is interval count divided by the sum of rAF timestamp intervals, not the reciprocal of a median or a display-present counter. Graphics median is the median of each row's update plus submission durations. Submission measures main-thread elapsed time around WebGL work; it does not measure GPU execution and can include a wait.

Across the two warmed phases, intervals above 33 ms fall from 20 to 9 and those above 50 ms from 9 to 4. Their largest submission durations fall from 136.775/47.945 ms to 13.365/13.130 ms. This supports the user's hitch improvement and the intended retention of confirmed combat programs. It does not establish a sustained-rate improvement: the first warmed run has fewer frames, and normal graphics cost is higher in this pair. Fresh-load/re-entry spikes and a warmed 103 ms interval remain. Do not relabel C7 fully accepted or infer a new hot path from an older instrumented trace.

## Frame scheduling audit

`GameAnimationLoop` updates and renders once per foreground `requestAnimationFrame` callback, then requests another callback. No explicit 60 FPS render limit, `setFrameRate`, offscreen rendering or sync override is configured in the audited game loop and desktop window. The 8 ms catch-up budget in `GameScreen` limits simulation work before rendering; it is not a render-rate setting. Simulation ticks remain separate from render frames.

Electron reports 165 Hz. Over 99% of both C7 warmed samples lie within 0.2 ms of multiples of approximately 6.06 ms: most intervals consume two or three refresh slots, approximately 12.1 or 18.2 ms. The usual graphics work alone is about 14 ms, above the 6.06 ms budget for 165 FPS and the 8.33 ms budget for 120 FPS. This favors missed refresh opportunities over a proven application-side 60 FPS cap. The measured 59–62 mean loop FPS is consistent with the reported 60 Hz-like feeling. It does not exclude external driver limiting, compositor waits or a different bottleneck later in manual play.

Browser animation callbacks generally follow the display refresh cadence ([MDN requestAnimationFrame documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)). The audited foreground samples contain no blur, visibility change or resize; Electron's background throttling setting addresses background pages ([Electron BrowserWindow documentation](https://www.electronjs.org/docs/latest/api/browser-window)). A 165 Hz panel provides refresh opportunities, not a guarantee of 165 new game frames per second. Mac and Windows timing/backend evidence is platform-specific.

## Original-selection follow-up

The user subsequently confirms disabling the HD control and starting a new match, with no clear improvement in perceived smoothness and no measured FPS. This satisfies the new-match application boundary documented by `src/gui/screen/options/component/HdOptions.tsx`; partial application from a same-match selection is no longer the outstanding explanation. Prioritize shared rendering, simulation and Windows presentation in the next trace. This subjective control strengthens that direction but does not identify a specific engine defect or establish equal Original/HD performance. Actual binding and matched frame measurements must accompany any quantitative Original comparison. Capture the missing low-rate manual interval with the already delivered M1 tool before choosing another repair. The eight frozen Normal measurements and shipped game/tool bytes remain unchanged.

## Next bounded capture

The original C7 F8 and late F9 route the camera automatically, so they cannot faithfully capture the reported manual scrolling. C7 Manual Capture M1 keeps the four automatic phases and game/resource bytes, then preserves live camera input in the lightweight F8 sample and separate late F9 trace. It changes diagnostic behavior only, with a pinned companion manifest and provenance exported in `USER-NOTES.txt`; it is not C8 or a source performance repair. Independent native QA, complete export validation, Desktop copy and fresh member checks now pass; see `windows-hd-c7-manual-capture-delivery-20261009.md` for the delivered artifact and separate Windows execution boundary.

Let the existing automatic test finish, continue the same match until the slow feeling occurs, press F8 once and keep playing for 15 seconds. After completion, press F9 once while the same condition persists, keep playing for eight seconds and wait for completion. Close and use the original C7 exporter. Attribute later sustained cost from this new evidence before selecting a renderer or presentation control; do not change quality, sync, limits or drivers speculatively. Trace startup overhead and instrumented FPS are excluded from Normal conclusions.

Windows C7 Normal capture and user hitch improvement are recorded. Later manual-play sustained rate, overall performance acceptance, loading/visual acceptance and any focused follow-up repair remain open. Main integration, remote push and release have not occurred. Continue this execution conversation for the same investigation and acceptance.
