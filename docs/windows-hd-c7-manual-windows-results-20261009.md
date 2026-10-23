# C7 manual Windows result: sustained renderer-thread cost

The recovered M1 return captures the previously missing slow manual interval. Its uninstrumented F8 sample averages **21.35 loop FPS**, with 320/320 intervals above 33 ms. This is sustained low frame rate before profiling, not just an occasional hitch. The same process's automatic phases average 61–66 FPS, but the manual camera, match age and actors differ; these are not matched A/B phases.

The 267,183,811-byte archive has SHA-256 `01c855138057b95811b0ce0f590845f19d4714c534455866bf97195bc6e2bd67`. A workspace copy was saved immediately after recovery. CRC, all returned hashes, frozen C7 identity, original launchers, the M1 companion catalog, original/patched probe hashes and byte-identical Windows runtime staging pass. The older Normal run is preserved with all seven files byte-identical. Earlier absence receipts remain unchanged; the cause of that absence is unconfirmed. Exact evidence and reproducible analysis are in the companion JSON.

| Phase | Mean loop FPS | Frame p50 / p95 / p99 | Update median | Submission median | Draw-call median |
| --- | ---: | --- | ---: | ---: | ---: |
| New automatic warmed | 62.11 | 18.15 / 24.23 / 30.32 ms | 5.75 ms | 7.46 ms | 783 |
| New automatic re-entry warmed | 61.20 | 18.16 / 24.24 / 30.30 ms | 6.05 ms | 7.63 ms | 784 |
| Later manual F8, Normal | 21.35 | 42.45 / 60.63 / 78.79 ms | 17.53 ms | 19.35 ms | 1,420 |

Mean loop FPS is interval count divided by the sum of rAF timestamp intervals. It is not a presented-frame counter. Submission is main-thread elapsed WebGL work and may include waits; it is not GPU execution time. The manual row's combined update/submission median is 36.855 ms, simulation median is 4.680 ms and maximum interval is 109.065 ms. The 165 Hz output remains native 2560×1600 with no focus, visibility or resize events. All captured phases still use actual HD 4X; the user's separately confirmed HD Off/new-match observation has no quantitative Original sample in this archive.

## Trace attribution and limits

The separate late F9 trace validates with the manual camera preserved and eight combatants/seven AI at its endpoint. The 1,929.059 ms profiler-start task is excluded. Across 165 complete game callbacks after startup, wall-time median is 50.953 ms and thread-CPU median is 49.917 ms. This favors sustained renderer-thread computation in this trace over a dominant synchronization wait. The instrumented frame rate is not a Normal performance result.

The trace records zero shader compilation, linking or initial `texImage2D` calls. Further loading-screen precompilation does not address this particular sustained interval. CPU samples attribute approximately 3,854 ms to submission, 3,254 ms to scene update and 1,275 ms to simulation; these sampled inclusive totals overlap with their child functions. World-matrix traversal, vertex-attribute setup/binding and uniform submission are prominent. Matrix arithmetic/traversal samples attributed to the world update alone total about 919 ms. Generic library functions are mapped against the hash-verified C7 source maps; recursive locations are counted once per sample.

The two retained errors reject additional F9 requests after the first successful trace. They do not invalidate the preceding Normal sample or captured trace. Later F8 phases are conservatively labeled instrumented and excluded from Normal conclusions. Their combatant count decreases to seven and five during native play, so the analyzer permits elimination rather than falsely asserting eight throughout the entire session. GPU execution time, actual process VRAM and driver/compositor limiting remain unavailable.

## One-variable follow-up

`OctreeContainer` owns an identity wrapper for native map actors. Its local matrix is automatically recomposed on every explicit world traversal; Three consequently forces world-matrix updates through descendants even when their local transforms are unchanged. Repository callers do not move this wrapper. A copied immutable Mac control passes at tick 9,571 with 7,573 actor-subtree nodes: matrix products fall from about 11,800 to 4,750, stored world matrices remain identical and update time improves in repeated frozen controls. Descendant update policies and native progression are preserved. The focused C8 source candidate changes this wrapper only; see `windows-hd-candidate-c8-20261009.md`. Actual Windows improvement remains pending.

The measured shared renderer costs also explain why replacing HD textures alone need not restore high-refresh smoothness. The evidence does not establish a universal engine defect, equal Original/HD FPS or a configured 60 FPS cap. A focused source repair must first preserve current matrices, pixels and native actions, then pass actual Windows comparison of the late manual interval.

Windows manual capture is validated; overall performance acceptance and any follow-up candidate acceptance remain open. Main integration, remote push and release are not performed. Continue this execution conversation for the same repair and acceptance.
