# C8 late Windows trace — 2026-10-09

The new return captures the requested later manual-play condition with the built-in C8 F9 path. Sustained renderer-main CPU work remains the dominant captured cost. There is no shader compilation/linking or full texture creation in this window, and the named native command-buffer waits are small. This supports investigating recurring per-frame source work rather than adding another warmup. Instrumented trace throughput is not a new Normal FPS result; the preceding validated Normal manual samples remain the baseline.

## Provenance and preserved data

The Desktop ZIP `WINHD-20261008-D38F136-C8-RETURN-2026-10-10T06-45-58-773Z.zip` is preserved before inspection: 287,021,456 bytes, SHA-256 `61ae304c80b736164c625dcffc87c5845a4967fe0123d50445b367729c7c43cf`. All 24 members, hashes, frozen C8 identity, safe extraction and original launchers pass. Target verification checks 8,133 files against manifest `f480c99fd8e4a52a81b4f40d10f1a6a372d956fb58f96ee7e7aa62a46cc1bad0`, shipping source `5721aa57d3785a8fbc9c8aad5adf9a4172bbe3af`. No returned code is executed.

There are two runs. Every one of the seven files in the earlier Normal run `2026-10-10T06-22-54-530Z-stress-4x-none` is byte-identical to the preceding validated return. New run `2026-10-10T06-40-31-847Z-stress-4x-none` has four valid Normal automatic phases and one valid instrumented late manual phase. Hardware, runtime, AC power and display/backend match the retained C8 run: Ryzen 7 5800H, RTX 3070 Laptop GPU, ANGLE D3D11 driver `32.0.15.9597`, 165 Hz, DPI 1.5 and native 2560×1600.

The trace requests occur after automatic completion. The captured scene progresses from native tick 9,433 to 9,891, realizes eight combatants/seven AI, retains manual camera input, reports actual HD 4X, 10,326 endpoint nodes and 1,469 HD nodes, with 1,493 median draw calls. Every captured phase is valid with no focus, visibility or resize events. The instrumented eight-second phase averages 20.16 game-loop FPS, with update/submission medians of 15.970/23.220 ms. Do not compare that instrumented rate directly with the prior Normal 23.27–29.61 FPS samples.

The run is `CAPTURED_WITH_ERRORS`. Two additional F9 requests are rejected after its successful trace. A later renderer-console CSP message reports a blocked inline event handler, after both rejected requests. The trusted input lifecycle only admits those repeated requests after the first capture has settled, so this message is outside the captured window. Its triggering UI action is unconfirmed. All messages remain in raw and bounded receipts; scoped trace validity does not establish whole-app input or visual acceptance. No security policy changes are made.

## Callback-scoped attribution

The existing analyzer now supports the built-in manual-camera path while retaining the C7 M1 provenance branch. It verifies trusted diagnostic module bytes, rehashes all returned files and checks the target receipt. CPU samples join to actual renderer `doFrame` trace callbacks by timestamp. Repeated source locations aggregate once per inclusive sample; inclusive rows overlap. Profiler startup is excluded.

- Profiler startup: 1,613.129 ms wall / 1,610.002 ms thread CPU, excluded from game-stall attribution.
- Complete game callbacks after startup and within the profile: 179. Median wall/thread CPU: 47.078/46.137 ms; means: 49.793/48.693 ms. Mean thread CPU is about 97.8% of callback wall time, including ongoing instrumentation overhead.
- Callback-selected sample weight: 8,821.809 ms. These callbacks span the profile collection window, not an assumed exact match to the eight-second lightweight phase boundaries.
- Named native waits: 11 events. Merging nested/overlapping intervals yields 10.825 ms total; the longest individual wait is 4.218 ms. This does not measure GPU execution or prove there are no other native waits.
- GL calls: zero `compileShader`, `linkProgram`, `getProgramInfoLog` and `texImage2D`; 511 `texSubImage2D` calls take 34.440 ms total, maximum 4.655 ms. There are 116,248 program changes and 224,224 material changes over the detailed collection window; these counts include the capture lifecycle and are not divided into an exact Normal per-frame rate.

Mapped inclusive weights include drawing submission 4,266.896 ms, renderer update 2,961.821 ms and simulation 1,247.352 ms. Large normalized self weights include matrix multiplication 703.587 ms, vertex-binding validation 677.325 ms, render-list projection 495.761 ms, world-matrix traversal 441.481 ms, garbage collection 287.258 ms and uniform upload 227.009 ms. They identify several recurring CPU costs rather than a single residual loading stall. Submission includes CPU/native calls and possible waits; it is not measured GPU execution. Actual process VRAM and GPU budget remain unavailable.

## Focused source investigation

`VxlUnitRenderer.update()` contributes 1,041.965 ms inclusive. Its `componentPose()` contributes 389.685 ms inclusive, including 177.373 ms self time. Inspection shows the per-part loop computes the pose for every cached authored bearing before `FrameLayer.update(false, ...)` discards preparation for the undisplayed bearings. A normal eight-bearing part uses one displayed bearing; the other seven still allocate matrices, multiply and invert them. Detached-view preservation does not require preparing their current pose: the pose is rebuilt before a newly selected view becomes visible.

This is a bounded source candidate: move cached-bearing preparation behind the displayed-bearing decision while still hiding/detaching inactive views, retaining native joints, recoil, roll/pitch, shadows, clipping, rotor/disc/missile behavior, warmup owners and complete fallback. It does not by itself eliminate draw submission, simulation or all matrix work. A copied immutable C8 late-match control must confirm operation reduction and full-output/matrix parity before this becomes a shipped source repair. No Windows improvement is claimed from that Mac control.

Raw extraction is `.artifacts/windows-hd-diagnostic/returns/2026-10-10T06-45-58-773Z-c8-trace`. Reproducible attribution is `.artifacts/windows-hd-diagnostic/c8-trace-windows-attribution-v1.json`, produced with `analyze-manual-trace.mjs --builtin`. The bounded receipt is `windows-hd-c8-late-trace-20261009.json`. Preserve the earlier Normal timing and all historical failures. Continue this conversation for the focused control, repair and Windows acceptance; main, M2.3, resources and earlier packages remain independent.
