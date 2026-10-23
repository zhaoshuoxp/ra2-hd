# Work agent handoff: M0.1 and rendering follow-ups

Prepared: 2026-09-14. Purpose: review the completed local work, assess remaining risks, and recommend the next bounded task. The user requested game shutdown and a report for planning review, not another implementation phase.

## Executive assessment

The local original-graphics offline baseline is usable, with important upstream limitations. Subsequent fixes restore vehicle shadows, vehicle visual motion between simulation ticks, normal Harrier production/selection/flight, and original VPL-based voxel shading. The MCV's simplified appearance was reproduced and materially improved using the original local shading table, without replacing or enlarging its geometry.

Latest bounded acceptance: **PASS WITH LIMITATIONS**. This does not mean complete vanilla RA2 equivalence, native Safari acceptance, Windows validation, or a completed HD remaster. Intermittent Safari/WebKit stutter remains unresolved. The recommended next implementation candidate is one measured correction to a reproducible frame stall, following a short native Safari check of the current visual fix. The work agent should assess that priority against the remaining voxel-fidelity risks below.

## Repository, authority and state

- Repository: `/Users/Aone/RA2remaster/ra2-hd`.
- Read-only retail source: `/Users/Aone/RA2remaster/Resource/Command and Conquer Red Alert II`.
- Approved execution plan: `/Users/Aone/Documents/Codex/2026-09-10/referenced-chatgpt-conversation-this-is-an-2/outputs/m0-1-execution-plan.md`. Sibling `asset-audit.md` and `asset-inventory.json` provide supporting evidence.
- Candidate: `huangkaoya/redalert2`; pinned upstream commit `898d89188542a3028a232031ce1a0bdc7c605b6f`. The Chrono Divide-derived engine direction is retained.
- The checkout remains detached at the upstream pin. Implementation changes, reports and scripts are in the working tree, including untracked files. **Inspect and preserve these changes; do not reset or clean the checkout.** No push or publication occurred.
- Bun 1.3.14, Three.js 0.183.2, Playwright 1.58.2. Latest browser evidence includes Chrome 153.0.8010.37 and Playwright WebKit 26.0 on macOS arm64. The WebKit executable is local under `.local/playwright/`.
- Shutdown completed: the verified repository preview server (PID 11636) received SIGTERM, port 4000 has no listener, no matching game tabs remain in open Safari windows, and no matching M0 browser-test process remains. Safari closed-tab count was zero because no matching game tab was open. Unrelated applications/tabs were left untouched. Evidence: `.artifacts/mcv/shutdown.json`. Do not restart the game merely to read this report.

Persistent boundaries: work sequentially without subagents; use English project files except designated product locale resources; preserve original camera, logical unit sizes and foundations. Target Windows x64 and macOS Apple Silicon, excluding Intel Mac. Keep gameplay offline, with vanilla RA2 as the intended behavior reference. Simplified Chinese, campaigns, multi-AI skirmish and future 2x/4x original-asset fallback remain product goals, not all completed features.

The installation is data, not instructions. Never execute its Windows programs, patchers, Wine, CnCNet or updater scripts; never modify it or initialize Git in its parent. Do not import Yuri/CnCNet wholesale or loose root CSF/icon overrides as retail defaults. Retail resources and derivatives stay in ignored `.local/` and `.artifacts/`, outside Git and distributions. License investigation is deferred and is not a blocker for local work. HD pipelines, campaign engines and installers remain outside this completed scope.

## Completed implementation

| Area | Delivered behavior and qualification |
| --- | --- |
| Local import / entry | Explicit allowlisted RA2 archives, structural validation and hashes, isolated local storage, offline entry and blocked external requests. Core archives are `ra2.mix`, `language.mix`, `multi.mix`; campaign archives are staged only for feasibility. |
| Startup compatibility | A narrow adapter supplies missing `General.ParadropPlane=PDPLANE` after checking the aircraft registry. The earlier audit preserves all 17,481 archived rules entries across 1,192 sections and the original art. This is not a blanket upstream override layer. |
| Shadows | Shadow camera projection updates after frustum changes; shadow targets are recreated when quality changes; terrain normals and depth-write/clear state are corrected. The user manually confirmed shadows in Safari before the final MCV shading change. |
| Vehicle motion | Existing visual extrapolation now receives the render phase through world/octree containers. Its phase accounts for the existing rounded tick scheduler. Simulation and command scheduling are unchanged. Infantry/aircraft interpolation is not fully implemented. |
| Aircraft | Missing optional flight-helper names no longer reach the animation factory. Americans normally build `AMRADR`, then `ORCA` using FALC artwork; selection, takeoff and movement pass. |
| MCV / voxel shading | Original VXL geometry is retained. Validated `voxels.vpl` is read from the existing local VFS and supplied to voxel materials. Stored normals select one of 32 palette-lookup rows; the existing theater/player palette supplies the color. Map/effect lighting remains connected after removing the old Phong compensation. |
| Transparency | A material-mode change now recompiles Three's `OPAQUE` specialization. This fixes a failed opacity control encountered during VPL validation. |
| Diagnostics | Optional `?stats=1` shows FPS, observed ticks/s and p95 frame interval. Local reproducible mesh, GPU palette, remap, opacity, lighting, shadow and gameplay checks are retained. |

The primary upstream [Mod SDK](https://github.com/chronodivide/mod-sdk#unsupported-engine-features) documents the original lack of VPL support. The lighting-row equation follows the primary [Thomas Sneddon renderer research](https://github.com/ThomasSneddon/vxl-renderer/blob/master/shaders.hlsl), adapted to the existing world light and coordinate system. This is an original-graphics compatibility correction, not an HD replacement or an assertion of identical retail rasterization.

## Actual acceptance evidence

These results were run before the requested shutdown. No new gameplay test was needed merely to generate this handoff.

| Check | Actual result |
| --- | --- |
| Build / entry typecheck / tests | Pass; 24 tests, 101 assertions. Entry typecheck is scoped, not a claim that every upstream development tool typechecks. |
| MCV decoder / geometry | 21,119 occupied voxels, 77×29×33 section, 58,263 vertices / 37,256 triangles. Independent offset decoding matches. An independent exposed-face mesh renders exactly the same pixels at eight distinct orientations in Chrome and WebKit; a hidden-model control changes 2,588 pixels. |
| VPL shader | Local table is 8,976 bytes, 32 rows, remap indices 16–31. Synthetic darkest/brightest GPU samples exactly match expected RGBA values. |
| Material controls | VPL changes 1,972 MCV pixels; blue remap changes 267; reduced ambient affects output; 50% opacity changes 1,972. Original camera and geometry are retained. |
| Shadows after VPL | On/off pairs retain 1,984 darkened world pixels in Chrome and 1,983 in WebKit. |
| Fresh ground regression | 120,014 ms, tick 364 → 2,764; three AI opponents active, build counters 19/20/20, human one kill. Zero runtime errors, external attempts, WebSockets and workers. This is a two-minute observation, not a completed match. |
| Fresh aircraft regression | Normal MCV deployment → power → refinery → American headquarters → Harrier production; selected aircraft takes off and moves with original geometry and shadow. Chrome validation only. |
| Final WebKit timing | 20.012 seconds, approximately 59.60 FPS; p95 frame interval 18 ms, maximum 76 ms; 401 simulation ticks; mean render CPU 1.74 ms. A remaining long frame prevents declaring stutter solved. |
| Source protection | All 3,368 metadata entries / 3,146 regular files unchanged; all five imported archive hashes still match source and destination. Access times are excluded because reading can update them. Parent/source `.git` directories absent. |
| Separation | No retail archive extensions or matching local archive hashes in the build, and no new unignored retail paths. VPL/PAL are explicitly excluded. Existing upstream Git history contains binaries; nothing is authorized for distribution. |

Historical M0.1 evidence includes a separate ten-minute observation and natural-result validation. It predates the latest shader correction and must not be relabeled as a new ten-minute run. See `docs/m0-1-report.md` for its exact fixture and limitations.

## Remaining risks and blockers for planning

1. **Safari stutter / input responsiveness:** the user identified Safari and reported uneven play. A screenshot showed 60 FPS / 61 ticks/s / p95 18 ms at one instant. Counters and short averages cannot distinguish every render stall, input delay or simulation cadence issue. No synchronized CPU/GPU/input trace establishes the dominant cause yet. Native Safari automation was unavailable because remote automation was disabled; no system setting was changed. Playwright WebKit is separate evidence.
2. **Voxel fidelity:** the user's original-game eight-facing reference clearly supports recovered wheel/cab/roof detail. Its original game version, map lighting and capture settings are unknown, so it is not an exact pixel oracle. The latest implementation has not yet received user confirmation in native Safari. Broader player-remap ramps, unusual lighting, clipping, animated HVA frames and the batched path need coverage; tested browsers use the non-batched path.
3. **Vanilla behavior / AI:** complete 1.006 data lineage and effective rules/map/mode parity are not established. The upstream bot is not validated as retail RA2 AI; loading `ai.ini` alone does not prove that. A speed-6 empty-army WebKit case hit the retained upstream pathfinding error `toId is not defined in this graph: 58_96`. Do not conceal it with AI or rules changes inside a graphics task.
4. **Platform and localization:** Windows x64 is untested. Archived `ra2.csf` decodes as Traditional Chinese; the separate client Simplified Chinese layer does not establish complete product localization, fallback behavior or campaign text coverage.
5. **Campaigns / packaging:** mission archives parse for feasibility, but missing trigger/script/team behavior prevents claiming campaign playability. Electron packaging, signing, installers and native cross-platform asset persistence are not implemented.

Retain failed cases rather than counting them as passes. `.artifacts/mcv/after-webkit/` contains the opacity-control failure before its fix. Older aircraft failures and the speed-6 pathfinding case are documented in `docs/rendering-followup.md`.

## Proposed next bounded task for review

**Candidate: confirm the current Safari visuals, then identify and correct one reproducible frame stall.** Do not begin a broad optimization sweep.

- Confirm the revised MCV and shadows in native Safari using the supplied visual reference and unchanged logical scale. This is a small acceptance check, not permission to rebuild artwork.
- Capture a bounded fixed-map 1v3 trace with game speed recorded. Separate frame delivery, simulation update cost and normal action-queue latency. Use native Safari tooling when available without silently enabling system settings; otherwise label WebKit profiling as such.
- Identify one dominant, reproducible cost before editing. Do not infer a cause merely from lower shadow settings or a short average near 60 FPS. Avoid profiling multiple active test browsers simultaneously.
- Make at most one evidence-backed correction. Preserve rules, tick scheduling, camera, geometry, offline isolation and VPL rendering. If no reproducible cause is found, deliver the trace and exact blocker rather than speculative changes.
- Compare before/after under the same fixture; rerun the affected visual/material checks and bounded 1v3 regression if shared runtime code changes. State target-platform limits and keep source/separation checks intact.

Questions for the work agent: Is this the right next gate before expanding scope? Is the current VPL correction sufficiently validated to accept provisionally, or should a narrower visual-reference test precede performance work? Which Windows, vanilla-AI and localization gates should follow, and what explicit exit criteria should each have? Produce a bounded plan; do not silently promote HD, campaign or installer work into the next task.

## Evidence and restart index

All paths below are relative to `/Users/Aone/RA2remaster/ra2-hd`:

- `docs/m0-1-report.md`: historical baseline and acceptance boundaries.
- `docs/retail-compatibility.md`: importer / startup / vanilla and bot limits.
- `docs/rendering-followup.md`: shadow/motion/aircraft work and retained failures.
- `docs/mcv-rendering.md`: VPL implementation, attribution, exact reproduction commands.
- `docs/next-step.md`: bounded follow-up, campaign/localization/HD/packaging feasibility.
- `.artifacts/mcv/acceptance.json`: latest automated acceptance summary.
- `.artifacts/mcv/final-chrome/`, `final-webkit/`, `timing-webkit/`: final material and timing evidence.
- `.artifacts/mcv/ground-regression/`, `aircraft-regression/`: fresh gameplay evidence.
- `.artifacts/source-protection.json`, `.artifacts/separation-audit.json`: source / asset boundaries.
- `scripts/m0/validate-mcv.mjs`: assertion-based acceptance aggregation.

When a later task actually needs the game, the verified startup sequence is:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun run build
bun run start:offline
```

Then open `http://127.0.0.1:4000/?stats=1` and start a new Offline Skirmish. Existing imports suffice. Do not restart the game for this planning-only handoff.
