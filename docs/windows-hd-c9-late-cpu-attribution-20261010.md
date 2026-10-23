# C9 Windows late-play CPU attribution — 2026-10-10

The late C9 trace confirms that renderer-main CPU work dominates the captured slow scene. The untouched earlier manual samples remain the throughput evidence: 27.12 and 23.76 mean loop FPS. The user reports that performance worsens as units/buildings accumulate, and confirms that both M2 and M5 Macs feel smooth. This is not sufficient for sustained Windows acceptance or for assigning the platform difference solely to M5 hardware.

## Frozen return and capture boundaries

The Desktop return `WINHD-20261008-D38F136-C9-RETURN-2026-10-10T19-08-56-877Z.zip` is preserved read-only: 251,566,549 bytes, SHA-256 `88bd88f0c8cc6f378c9abfd31b928fa74e96375a1d8225b7669048d0f237a5af`. All 24 members, CRCs, hashes, safe paths, frozen C9 identity and unchanged launchers pass. Target verification checks 8,143 files against manifest `4b3914eaec2e053cd287c1d091e78803b3ccec7ca700cbf267013e3bf081e25e`, shipping source `69c132d385771dabd385635aa036c51b27014797`. Returned code is not executed. All seven files in the retained earlier Normal run are byte-identical to the independently validated prior return.

New run `2026-10-10T19-03-37-938Z-stress-4x-none` has four Normal automatic phases and one valid late manual F9 phase. All retain eight combatants/seven AI, native 2560×1600, HD 4X and no focus/visibility/resize events. Hardware/runtime/power/display/backend/driver match the prior Normal fingerprint; only GPU initialization duration changes in the full GPU metadata. The late native ticks advance from 11,467 to 11,928; the camera moves from (-852, 5058) to (-708, 5058). Endpoint nodes/HD nodes are 10,125/1,433 and draw-call median is 1,510.

The whole new run remains `CAPTURED_WITH_ERRORS`: one repeated F9 request at `2026-10-10T19:08:38.471Z` is rejected because the process has already captured its one trace. This preserved rejection does not invalidate the earlier bounded capture. No CSP error appears in this return. The analyzer's generic error interpretation permits such an error in other returns; it does not establish one here.

## Measured attribution

Exclude profiler startup (833.378 ms wall, 833.514 ms thread CPU). The subsequent 185 complete game callbacks have median wall/thread CPU durations of 45.828/44.957 ms and means of 47.627/46.768 ms. Mean thread CPU is 98.20% of mean callback wall duration. This is utilization of the measured renderer-main callback interval, including instrumentation overhead, not whole-machine CPU utilization. The trace interval has 20.61 instrumented mean loop FPS; never substitute it for the retained Normal FPS or compare it directly as a regression.

| Mapped function or group | Sampled weight | Interpretation |
| --- | ---: | --- |
| Renderer submission | 4,365.459 ms inclusive | CPU/native drawing preparation and submission, not GPU execution |
| Renderer update | 2,771.518 ms inclusive | Scene/object preparation and matrices |
| Simulation tick path | 1,435.135 ms inclusive | Native progressing gameplay |
| Three vertex-binding `needsUpdate` | 683.646 ms self | Largest individual self-cost; repeated attribute/data/index identity validation |
| Matrix multiplication | 583.574 ms self | World/object/camera transformations |
| Three render-list projection | 475.725 ms self | Traverse/select renderable objects |
| World-matrix update | 422.063 ms self | Explicit hierarchy transformation |

The sample weight inside complete callbacks totals 8,738.867 ms. Inclusive groups overlap and cannot be added as independent percentages. Source maps are verified against the frozen manifest. No new `compileShader`, `linkProgram`, `getProgramInfoLog` or `texImage2D` call occurs. The 682 subimage uploads total 32.015 ms CPU call time, maximum 0.490 ms. Six nested named command-buffer waits occupy a union of 8.162 ms, largest event 7.743 ms. These facts support CPU preparation/submission as the dominant captured problem; they do not measure GPU execution, prove GPU idleness or establish every possible wait. GPU execution/process VRAM/budget remain `UNAVAILABLE`.

C9 still preserves all accepted matrix and inactive-layer fixes. World and UI scenes already disable Three's automatic scene world-matrix pass, with explicit application traversal and post-batch refresh retained; disabling it again is not a new repair. C9's unused VXL bearing preparation has been removed and its automatic Windows improvement remains recorded separately. Earlier C8 and current C9 traces have different evolving scenes, so component/function weight differences are not a matched causal percentage.

## Hardware interpretation and next control

GPU hardware acceleration is active on the actual RTX 3070 Laptop through ANGLE D3D11, driver 32.0.15.9597. GPU shaders perform rasterization and texture/pixel work; CPU work still prepares transforms, visibility, materials, uniforms, vertex bindings and commands. This work runs primarily on one JavaScript/render thread and cannot simply use all 16 logical processors. A 165 Hz display has a 6.06 ms interval; the measured frame work cannot fit that interval. Automatic C9 throughput exceeds 60 FPS, so there is no demonstrated global 60 FPS application cap. Compositor pacing remains a separate influence.

AMD specifies the [5800H as Zen 3, eight cores/16 threads, up to 4.4 GHz and 45 W](https://ir.amd.com/news-events/press-releases/detail/986/amd-announces-worlds-best-mobile-processors-in-ces-2021-keynote). Comfortable play on the reported 5800H/RTX 3070 is a reasonable engineering target, not a measured guarantee of 4X at 120/165 FPS. Individual same-version Geekbench 6.7.1 results show single-core scores of [4,229 for a 15-core M5 Pro](https://browser.geekbench.com/v6/cpu/18709214) and [1,893 for a performance-mode 5800H](https://browser.geekbench.com/v6/cpu/17830923), about 2.23×. These are public samples on different machines/OS/power configurations, not this user's hardware, RA2 FPS, a matched platform test or a reason to prescribe a hardware upgrade.

The actual copied C9 Mac receipt identifies Apple M2 with ANGLE Metal, not M5 Pro. The user's confirmation that both M2 and M5 feel smooth prevents an M5-only explanation. Single-core differences and the Metal versus D3D11 submission paths may contribute, but their respective contributions require matched late-scene evidence. The user's restarted Original/HD Off observation remains subjective; it was not captured in this 4X trace.

A synthetic control using installed Three 0.183.2's exact binding-validation functions passes 14 attribute/interleaved-data/index/instance controls. Cached attribute records reduce that isolated loop's CPU time by 31.58–35.23% across three/eight/16 active attributes in official Electron's Node runtime. No application or dependency is patched. The target is only about 7.82% of current callback sampling, so this microbenchmark does not establish a meaningful whole-game gain or justify treating that cache as the principal remedy. The CLI host emits a retained `task_name_for_pid` diagnostic and exits successfully; no GUI or Windows execution occurs.

The direct follow-up examines native meshes retained for HD shadows that still enter a main color pass with color/depth/stencil writes all disabled. Three's shadow submission uses a separate depth material and null scene argument. Two temporary copied-Mac controls skip only these non-writing main submissions while retaining shadow calls. Across six paired 3840×2160 framebuffer comparisons (199,065,600 bytes total), all pixels and matrices remain exact, with no reported runtime error.

| Control | Native tick | Target view | Main callbacks | Shadow callbacks | Eligible non-writing main submissions |
| --- | ---: | --- | --- | --- | --- |
| v1 | 9,243 | Initial late view plus two offsets | 896 per view | 140 per view | 16 per view |
| v2 | 12,185 | Requested center (-780, 5058), plus two offsets | 847 / 841 / 866 | 119 per view | 4 / 7 / 17 |

Main/shadow callback counts remain identical before/after the wrapper; eligible main calls return before the underlying submission only in the experimental variant. Render-only ABBA timings are variable: the second control shows no stable useful improvement. These native scenes have substantially fewer draws than the captured Windows scene. Requested camera centers are not a matched-scene assertion; `WorldScene.update` culls children before updating the camera, so the first update after camera movement may retain prior visibility. Both sides of each pixel pair share that same state. A future candidate needs camera/visibility stabilization and representative workload verification, not a gain inferred from these sparse eligible draws.

The copied native kit records source `ee1fc27` and manifest `9f7db8a95037c85bec752b344401cac2ec7b4679c305e7743ac99c81318e3fa9`; shipping C9 records the later documentation checkpoint `69c132d` and its own manifest. The accepted C9 delivery receipt pins all 288 mapped build files, 205 executable app files and 6,033 resource files as byte-identical between those checkpoints. A failed attempt to assert identical commit metadata is preserved and superseded by explicit native/shipping identity and parity records. Do not relabel the native manifest as the shipping manifest.

Neither exploratory path is promoted into an application repair or new Windows ZIP. Continue investigating the cost of effective draws and their binding/material/geometry grouping using the captured CPU attribution. No additional Windows trace, shader preloading, quality reduction, budget increase, driver/sync change or third-party source rewrite is selected by this checkpoint.

Raw attribution, retained Normal parity and exploratory controls remain under `.artifacts/windows-hd-diagnostic/`; their pinned paths/hashes are in the sibling JSON receipt. Existing C9 deliveries and historical failures remain intact. Main remains at D38F136 and the advancing M2.3 worktree is observed read-only. Continue this execution conversation for the focused repair and Windows acceptance.
