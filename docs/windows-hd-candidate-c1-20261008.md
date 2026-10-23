# Windows HD return analysis and C1 candidate

C1 removes the redundant second submission of sorted HD sprite coverage. It is a focused source candidate for the user-confirmed Small reproducer, with Windows A/B and visual acceptance pending. Main remains frozen at `d38f1366942f586a1a9df2964a40f05cc9db4cdc`; no integration or remote push is authorized here.

## Returned evidence

The Desktop return `WINHD-20261008-D38F136-A1-RETURN-2026-10-08T21-48-23-017Z.zip` has SHA256 `dcdab1cbb6f77c60d7c5008443512bc84e7d3e25fa9de94879a22de2db4b1bbc`. All 32 archive members passed CRC, safe-path and declared SHA/size verification. The returned manifest matches immutable A1 (`da085faa5416de063f12aedf9bc2c0fc19ebee34`), SHA256 `02ed28acd60d9edcd204ca5b5230fdf03f91e4eb46e4a5e8ae8baa743399c95b`. All four launchers match A1 and were inspected as data. Target verification passed all 8060 cataloged files. Incoming reports are retained read-only under `.artifacts/windows-hd-diagnostic/returns/2026-10-08T21-48-23-017Z`.

The target is Windows x64, Ryzen 7 5800H, 16 logical processors, approximately 16 GiB RAM, RTX 3070 Laptop GPU, hardware-accelerated ANGLE D3D11, AC power, and a 165 Hz display at scale 1.5. All three modes realize the same 1281x802 DIP window, approximately 1437.53x900 logical view and 1921x1203 framebuffer. They use YR `xmp03t4.map`, two players/one AI, fixed start/seed, high models/shadows and the same speed. Native bindings confirm actual Original/2X/4X modes. CPU process memory is not VRAM; actual GPU time, process VRAM and GPU budget remain unavailable.

| Valid lightweight warmed phase | Median frame ms | p95 ms | p99 ms | Maximum ms | Frames >33 / >50 / >100 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original | 6.06 | 6.08 | 6.105 | 6.52 | 0 / 0 / 0 |
| 2X | 18.165 | 18.205 | 18.255 | 42.415 | 1 / 0 / 0 |
| 4X | 18.17 | 54.515 | 54.58 | 66.655 | 78 / 41 / 0 |
| Original re-entry warmed | 6.06 | 6.08 | 6.10 | 18.235 | 0 / 0 / 0 |
| 2X re-entry warmed | 12.145 | 18.205 | 18.26 | 30.34 | 0 / 0 / 0 |
| 4X re-entry warmed | 18.175 | 54.54 | 54.585 | 97.05 | 77 / 45 / 0 |

Fresh first-use loading is 4558 ms Original and 8719 ms 2X. The 4X first-use sample ended unfocused and is INVALID; its 14258 ms loading and frame rows remain raw observations, excluded from valid first-use acceptance. Valid 4X re-entry loading is 12639 ms. Scene progression and admitted content differ between densities and remain explicit comparison limits.

Warmed CPU medians (simulation / update / submission) are 0 / 2.56 / 1.97 ms Original, 0.565 / 5.375 / 9.005 ms 2X, and 0.63 / 5.155 / 9.205 ms 4X. Draw submissions increase from 237 to 856/911; 4X submission tails reach 47.89 ms in warmed play and 71.305 ms after re-entry. Simulation is a comparatively small measured contributor in these samples.

The 2X instrumented capture contains a complete multiprocess trace and CPU profile. The 4X capture retains its CPU profile but lacks `trace.json` and `trace-status.json`, with `quit-trace-stop: Failed to stop tracing`. Preserve this failure and request a new matched capture. The 4X CPU profile weights approximately 1366 ms of native waiting at `getProgramInfoLog` over 9.51 seconds, including collection boundaries. Matching byte-pinned source maps identify the shader first-use/program/render submission stack. These sampled waits are not GPU execution measurements and do not prove one exclusive root cause. Binding-state and uniform submission costs also remain substantial.

Reproduce the validated summary without executing returned scripts:

```sh
node scripts/windows-hd/analyze-return.mjs RETURN_DIRECTORY TRUSTED_A1_KIT NEW_ANALYSIS_DIRECTORY
```

The current derived report is `.artifacts/windows-hd-diagnostic/return-analysis-v1/analysis.json`. Raw evidence, invalid samples and the failed first Mac experiment remain preserved.

## Focused repair and boundaries

The sole game-source change is `src/engine/gfx/batch/HdSpriteEdges.ts`: set `forceSinglePass` on each sorted sprite coverage material. Installed Three 0.183.2 otherwise submits transparent DoubleSide materials as back/front passes, changing the material side and program state for each pass. Its [Material API](https://threejs.org/docs/pages/Material.html#forceSinglePass) supports one-pass rendering for flat transparent sprites. C1 retains DoubleSide visibility, coverage shader, filtering, geometry buffers, native bands/order, depth/blending and assets. Ordered bridge coverage remains nontransparent and does not enter Three's transparent double-pass branch. VXL volume materials and global renderer settings are untouched. Shader error checks stay enabled. This addresses an observed redundant rendering cost; matched Windows results must establish its effect on the 4X tail.

Before changing source, native Mac same-state experiments on immutable A1 compared baseline / single-pass / restored at three camera positions per density. All complete 2560x1600 RGBA buffers matched byte-for-byte, with zero restoration differences. 2X saved 113 submissions per frame (846->733 at the first position); 4X saved 140 (902->762). Native ticks were held only for pixel comparison, outside timed phases; framebuffer readbacks were absent from timing loops. These are bounded Mac functional/equivalence observations, not Windows performance acceptance or broad visual approval.

Diagnostic tooling separately serializes trace ownership and defers close/quit until the same capture, profile, trace status and report finalization finish. It prevents competing stopRecording calls and displays trace capture/saving state. Timing probe code and the fixed scene, viewport, controls and limits stay unchanged from A1. Resource caps remain 512/1280 MiB world 2X/4X, 128 MiB prepared CPU and 16 MiB UI. Complete-family fallback and all retained world/UI resource bytes are preserved.

## Current Windows handoff

Follow `START-HERE.txt`: A1 Small 2X Normal and 4X Trace, then C1 with the same choices, four fresh launches on the same machine/settings. Each trace launch captures four lightweight phases before its separate instrumented phase. Compare only matched valid lightweight phases; analyze each trace separately. Keep focus and wait for final completion before closing. Export both kits, retain failures and report perceived 2X/4X smoothness plus any edge, shadow, occlusion or color regression. The existing Original result remains the control reference; no stress or optional-control matrix is requested now.

Source implementation is a local candidate. Static checks, copied native Mac validation, Windows runtime/performance, physical input and user visual acceptance must remain separate. Windows A/B, main integration and remote push are pending/not performed. Continue this execution conversation for the next Windows returns and the same bounded repair/acceptance.
