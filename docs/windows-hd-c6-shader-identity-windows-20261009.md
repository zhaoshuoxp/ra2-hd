# C6 S1 Windows shader identity return — 2026-10-09

The return `WINHD-20261008-D38F136-C6-RETURN-2026-10-10T03-41-03-540Z.zip` is validated against the preserved C6 manifest and shipped S1 companion. Archive SHA-256: `0d7e029da63ff27c336fc410817462ce44fa7de3afdd06efa8693922086cec34`; 376,192,706 bytes, 35 members, three runs. All previous run files remain byte-identical. Returned scripts were inspected as data, never executed.

The new run `2026-10-10T03-33-47-535Z-stress-4x-none` has four valid phases, zero errors, native 8-player/7-AI progress and a captured warmed trace. S1 identity matches source `3261469`, manifest `4f06f7fc...`, all five shipped files and the exact C6 base. Staged Windows x64 runtime reports 385,513,417 identical bytes and a complete 8,107-file kit verification. Installation and automatic F9 at 20 seconds are recorded. No capture entries were dropped; normal shader checks remain enabled.

| Captured program | Actual owner | Direct instrumented wait | Following frame interval |
| --- | --- | ---: | ---: |
| 1 | Damage smoke, SPE ShaderMaterial / Points | 64.560 ms | 103.015 ms |
| 2, 3 | Tiled HD building body and coverage; YACNST texture match | 17.365 / 19.980 ms | 84.820 ms |
| 4 | Nearest indexed infantry with embedded SHP shadow; SLAV texture match | 130.855 ms | 163.650 ms |

Each link, wait and first use shares the captured program ID. Both shader source hashes are recorded per program in the JSON; full source strings remain in the immutable raw return. All four programs are deleted during the same captured playing window. Family matches are texture-based hints at capture end; exact material, defines, object type and sources are directly observed during link/wait.

The two largest game tasks last 98.613 and 162.576 ms. Native `GetProgramiv` spans are 64.520 and 130.817 ms, with only 0.421 and 0.881 ms on the renderer thread; ANGLE workers consume 59.754 and 125.348 ms of CPU. This directly supports synchronous first-use driver compilation waits. These are CPU waits, not GPU draw timing or measured VRAM residency. The 1,096.049 ms profiler-start task is artificial instrumentation overhead and excluded from game-stall attribution.

A separate 80.927 ms between-frame task still includes PNG validation/readback work (`GetImageData` 16.468 ms); precompiling these shaders does not remove that path. Instrumented phases are not Normal A/B performance evidence. The old uninstrumented C6 stress return remains the baseline, and the user's C6-versus-C5 response remains “no noticeable difference” (translated). C4 Small acceptance is preserved; stress combat acceptance remains open.

The next focused source change prepares and retains only these four shader variants during HD map loading using existing loaded textures, detached geometry and the existing normal validation path. It does not preload asset families or change art, simulation, quality or budgets. Native proof must match the Windows source hashes, observe actual combat reuse without relinking, release owners exactly once and preserve complete output pixels before a C7 candidate is delivered.

Raw extraction: `.artifacts/windows-hd-diagnostic/returns/2026-10-10T03-41-03-540Z-c6-s1`. Bounded analysis: `docs/windows-hd-c6-shader-identity-windows-20261009.json`. Keep this execution conversation for repair and acceptance; no main merge, push, publication or M2.3 changes are authorized here.
