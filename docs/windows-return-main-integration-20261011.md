# Verified Windows return integration — 2026-10-11

The returned Windows repair fixes ineffective view culling, the growing deferred octree list, animation-clock drift and HD publication during building construction. It is combined with the accepted M2.3 R16 main source without changing artwork, selected resources, budgets or game rules. Validation passes for this bounded integration; the full suite retains its existing failures. The user's instruction authorizes local main promotion after these checks.

## Source and evidence

- Main predecessor: `a5d7b86c3721511ec6c054a52dd3cdb0f7450c02`.
- Returned branch: `e57bfa414e249fb5a87cd27a4be97247f9b8f266`, based on C9 main `bc581b1`.
- Application commits: `ecd426e`, `fb353fd`, `f17e896`; the other returned commits document the work and Windows user verification.
- Reviewed combined runtime merge: `3bebe8b40b02603e2eae96e30c8745e80c5294ca`. Subsequent closure changes affect documentation only.
- All returned runtime/test changes are byte-identical to the returned branch. Later accepted M2.3 changes remain intact. Rejected C10 is excluded.
- All 97 returned files passed manifest size/SHA-256 validation and were independently retained, including raw results, profiles, screenshots and harnesses. The Git bundle verified against the local predecessor.
- Authoritative return retention: `/Users/Aone/RA2remaster/ra2-hd-windows-perf/.artifacts/windows-return-integration-20261011-v1`.
- Combined checks and copied package: `/Users/Aone/RA2remaster/ra2-hd-windows-return-20261011/.artifacts/windows-return-20261011`.

The companion JSON pins the source identities, platform boundaries, raw-evidence summaries and 22 evidence hashes. Returned analysis is preserved in `windows-return-report-20261011.md`, `windows-view-culling-20261011.md` and `windows-buildup-and-perf-round3-20261011.md`.

## Resulting behavior

The old culler changed internal octree-node flags without hiding renderables. The index was also never updated: movement scanned a growing pending list that retained destroyed objects. The repair replaces it with a flat padded camera-view table, prunes culled matrix subtrees without consuming dirty flags, and restores current transforms and HD poses when objects return. Game visibility remains independent of view visibility; aircraft and visible building range circles receive conservative exceptions. Native state updates continue while off-screen.

The shared animation clock now retains fractional frame time instead of dropping it on every step. A building family that finishes loading during BUILDUP or UNBUILD is applied at the next non-construction animation transition. Geometry and batch keys cache unchanged inputs without changing their values. No asset downscaling, shadow reduction, camera/rules change, FPS cap or simulation skipping was introduced.

Windows evidence is from the returned target-machine C9 A/B scene, rather than a new Windows run of combined M2.3 main. Recomputing all five alternating final A/B windows gives baseline mean **32.252 FPS** (28.44–34.60) and fixed mean **59.714 FPS** (55.51–63.91). The built v1 candidate and v2 animation candidate have separate returned results; the user verified v2 in actual Windows play without reported problems.

All 96 raw buildup samples are retained. HD duration median changes from **917.94 to 806.37 ms**, against a nominal 800 ms; mid-sequence art swaps change from **1 to 0**. Full raw ranges are 755.99–1062.69 ms before and 726.21–861.76 ms after, including initial construction-yard probes and outliers. The narrower ranges in the returned narrative should not be interpreted as bounds on all 96 samples. These measurements do not establish 90+ FPS or a hardware single-core performance ratio.

## Combined validation

- Repair/renderer tests: **60 PASS, 0 FAIL, 1,492 assertions** in 16 files.
- Protected terrain, environment, VXL, resolution, bunker, ring and factory-pose tests: **49 PASS, 0 FAIL, 2,288 assertions** in 16 files.
- Required `tsconfig.build.json` entry typecheck and isolated build: PASS.
- Full suite comparison: current main **551 PASS / 12 FAIL**, combined **559 PASS / the same 12 FAIL**. Two failures in each run are loading errors for retired historical environment/terrain fixtures; the other failure titles also match. There are no new failures. This is not a claim that the full suite is clean.
- Optional `tsconfig.node.json` check has the same pre-existing `vite.config.ts` errors on current main and combined source. That file is unchanged.
- Independently copied, signed normal Mac application: RA2 2X/4X, YR 2X/4X (including eight players/seven AI), and YR Original all start, bind the requested resources and advance native ticks.
- Actual native construction advances intermediate frames, completes normally and never changes HD binding mid-sequence in those five cases.
- Camera motion/jumps: **162,960 visible matrix checks, zero stale matrices**. Three same-time full-buffer views per case give **zero changed pixels** between culling enabled and disabled, including shadows at view edges.
- Existing native bunker boarding/evacuation, flying-target combat and cloak/detection cases: PASS. Separate native ORCA and building range-circle checks confirm the culling exceptions and restoration.
- No page, console or WebGL errors in these native cases. These are controlled regressions, not physical-input acceptance or a new Mac/Windows performance benchmark.
- Copied current-resource registration: 12 profile routes, 6,857 HD routes, 238 environment families, 23 terrain groups, 453 prepared members/1,205 pages, and accepted Yuri UI.
- Main `.local`, `public` and `dist`: **41,960 entries unchanged**, including paths, types, sizes, modification times, inodes and symlink targets. Existing packages, failures, recovery data and independent worktrees remain preserved.

The inherited smoke harness calls its package a Desktop copy, but this turn's tested app resides in the isolated workspace package named above. No new Desktop delivery is claimed. Its parity draw fields are Three's last-scene counters and are excluded from performance conclusions.

The first test bootstrap had a relative-path error, the sandbox initially prevented GUI launch, and an initial historical registration invocation used a missing UI receipt. Those attempts remain preserved; corrected checks supersede them without runtime source changes. The current-selector registration receipt is authoritative.

## Remaining three work items

1. **Artwork:** repair the affected native-index HD buildup sequences and YAWEAP frame-0 flicker in the authoring pipeline. The runtime cadence/publication repair does not correct construction order embedded in the artwork. Require complete same-phase contact sheets and native motion acceptance; preserve unaffected families.
2. **Construction-yard deployment:** investigate the returned approximately 86 ms passability-island flood-fill spike. Any lazy or incremental island repair must preserve path results and lockstep determinism, using matched replay/seed checks before promotion.
3. **90+ FPS:** freeze the repaired approximately 60 FPS Windows baseline first. The returned profile prioritizes HD coverage-pass consolidation, material/page sharing and presentation-only update reductions. Validate matched dense Windows timings and pixel/functional parity independently; do not revive rejected C10 or infer GPU time from CPU submission.

These items are recorded for subsequent consideration and have not been implemented in this integration. Continue this execution conversation for fixes or acceptance of this result; choose a bounded next objective before beginning the remaining work. No remote push, publication, cleanup or separate conversation creation was performed.
