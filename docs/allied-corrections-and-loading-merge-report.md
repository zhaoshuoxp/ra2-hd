# Allied corrections and skirmish loading: merge evaluation report

Date: 2026-10-01. Purpose: hand off the completed isolated fixes for the main planning conversation to evaluate integration. This report does not authorize or perform a main merge, push, rebuild, resource publication or cleanup.

The three Allied correction groups are user accepted. The subsequent loading optimization has passed focused technical and copied-Desktop-package validation; user loading acceptance remains pending. Both branches remain local and unmerged. The loading branch already contains the complete accepted Allied correction history, so integrating both requires accounting for that ancestry rather than applying the corrections twice.

## 1. Verified source and acceptance boundaries

| Item | Identity / status |
| --- | --- |
| Original correction baseline | `ee35fcf04de2d24c1bce2ee7497e4156483b21f1` |
| Accepted correction branch | `fix/allied-animation-sidebar`, tip `3b4202a8862ce637e3322dd0e31efaba87499149` |
| Accepted correction package runtime | `dae53b4df9651378375a3b96ab285ebfbfaa89eb` |
| Loading branch baseline / common ancestor with current main | `0370e9b41d4736a0b80bbe35d2552b3f3a39a4a4` |
| Accepted corrections merged into loading branch | `4c7992dbd144af79b08822d1b4637177360c2f47` |
| Loading implementation | `dafb444` plus cache correction `69d8e3c` |
| Tested and packaged loading runtime | `69d8e3c2b3c8bb9f37def39b05c9cafebad89e3e` |
| Loading closure before this report | `fix/skirmish-loading-isolated`, `4a95d8ddeda1c17980c89f0557c0f7dc7543823c` |
| Canonical main observed during this report | Clean `main`, `3bf42ee86e11b97202432bf33c8e421462c176b2` |
| Main contains either repair branch | No; verified by Git ancestry |
| Loading branch contains accepted correction tip | Yes; verified by Git ancestry |
| Runtime changes after the packaged loading commit | None under `src/` or `desktop/` at the report snapshot |

Original correction worktree: `/Users/Aone/RA2remaster/ra2-hd-allied-corrections`. Loading worktree: `/Users/Aone/RA2remaster/ra2-hd-skirmish-loading`. Main: `/Users/Aone/RA2remaster/ra2-hd`.

Main has advanced through Task C fixes and accepted Task E integration since the loading baseline. Its current documents record E accepted and integrated, with C technical regression passed and C final visual acceptance pending. Those later C/E changes are absent from the loading test ZIP. Its successful isolated tests do not establish compatibility with current main. The report audit only read main; it did not touch main resources, builds, profiles, ports or processes.

## 2. Bug corrections

The original prompt contains three groups: HQ/Prism functional animation, sidebar category publication, and GI deployed firing. The table separates HQ and Prism to make their different causes reviewable.

| Issue | Measured cause | Final correction | Acceptance |
| --- | --- | --- | --- |
| GAAIRC / AMRADR radar shifts while scanning | The authored radar was fitted to each native frame's changing moving bounds, changing mounting-ring scale and placement. Both rules share the GAAIRC image family. | Recompose only the radar member around a fixed ring anchor, retaining the three accepted scan views and native sequence. Select `animation-r5` in temperate and snow. Body, bib, lamps, beacon and construction remain unchanged. | User accepted; HQ was already reported basically fixed before the final feedback round. |
| ATESLA / GAPRIS top appears fragmented or ghosted; first correction still twists | The original helper clipped a stationary crown against changing silhouettes. The first repair's row deformation improved completeness but did not rotate a rigid structure and was rejected by the user. | Select `animation-r9`: accepted front/side/top materials projected onto a rigid eight-petal component with fixed geometry, axis and scale per health state. Fixed neck remains separate; native charging light is retained above the solid structure. Both theaters, health states and densities are supplied. | User accepted after the rigid-rotation correction. |
| Sidebar switches briefly publish Original cameos before HD | Old HD art was cleared before asynchronous decode; releasing the last lease destroyed decoded entries, so revisits decoded again. Stale preparation could race newer model identities. | `UiArtPage` prepares the requested visible page, retains at most three visited pages within 16 MiB, and publishes coherent cards/labels/actions only after preparation or bounded fallback. Generation and model-frame guards prevent stale publication; decoded layers can be acquired synchronously. Old leases are released before cold allocation. | Included in the user's final three-group acceptance. |
| E1 American GI fortress moves or flickers during deployed firing | Muzzle-dependent bounds changed horizontal registration, and authored bag surfaces differed between firing slots. The earlier flash-only repair left non-flash differences and old edges beneath transparent reference pixels; a broad flash mask also selected bag highlights. | Select `animation-r9`: use the corresponding accepted idle fortress for all 48 deployed firing slots, clear its shaped stationary region before composition, and confine muzzle restoration to the native footprint. Distinct upper-body/gun poses, embedded ground pixels and separate shadows remain. Other actions are byte-identical at both densities. | User accepted after reporting and correcting the residual base movement. |

Sidebar cold preparation has a 750 ms maximum deadline, not an intentional delay. Measured YR first-use publication was approximately 29–89 ms and retained-page switching 12–25 ms; RA2 samples were 42–65 ms and 27–35 ms. A fourth unique page may evict the oldest. Missing, corrupt, disabled or over-budget art intentionally uses Original. Existing absent HD cameos were not authored as part of this repair.

Prism reconstruction uses accepted raster materials and inferred 45-degree petal symmetry. The original 3D model and exact source yaw are unavailable. This limit is disclosed in the accepted correction record; the rejected deformation exports remain retained and unselected.

Important correction commits: `4ed0510` initial functional art/sidebar work; `6e74d63` stale-lease release; `d25947e` model-identity publication guard; `39d0aba` GI embedded-ground preservation; `52b5e98` rigid Prism and stable GI fortress; `dae53b4` snow neck refinement; `3b4202a` user acceptance closure. Earlier resources and packages are historical evidence, not current selections.

## 3. Loading slowdown and optimization

The user reported slow entry in every quality/version and on every skirmish entry within one app. Profiling the accepted correction package identified a large HD preparation cost in addition to the native map/scene cost: 312 HD PNG requests per timed 4X entry, repeated canvas decoding/validation/pooling, and 17 applicable Soviet building families prepared eagerly even for an Allied player. NAYARD alone had a 5.374 s 4X preparation interval. The unchanged Original path measured about 3.53 s on first entry; this work targets the extra HD overhead and does not claim to optimize native map construction.

| Change | Implementation and preservation |
| --- | --- |
| Prepare validated pixels offline | Serialize the existing resolver's exact Electron-decoded textures, derived 2X output, lossless pools and categorical owner masks. Across both edition contracts, 446 selected manifests produced 1,233 pages and 2,813,797,148 payload bytes, all byte-identical to validated runtime output. Accepted PNGs and native metadata remain unchanged. |
| Register optional prepared pages safely | `desktop/prepared-hd.mjs` registers an index pinned by `desktop/prepared-hd-contract.json`; each payload is hash-checked before cache use. Missing or corrupt optional data retains the independently validated PNG path and complete-family fallback. Native source/frame/manifest checks remain in place. |
| Reuse bounded CPU data between matches | `PreparedHdCache` retains at most 128 MiB including admitted pending reads, with LRU, pending-read deduplication, failure retry and a clear-generation guard. Each match creates fresh textures from cloned bytes, preserving ownership and normal disposal. This is an additional CPU cache, separate from existing world/UI texture budgets. |
| Prevent 4X eviction churn | The first cache attempt had a 128.33 MiB working set against a 128 MiB cap and missed every page on re-entry. A 16 MiB maximum retained entry keeps two large pages outside the cache while still using prepared pixels. The final repeat reuses 23 of 25 pages without an eviction loop. |
| Prepare needed buildings and native production | Initial buildings and construction yards of initial MCVs prepare before entry. Other Soviet families join the existing shared bounded demand queue. Native production observation prepares complete families during construction, transfers leases to real bindings, and releases cancellation/teardown. MCV, SMCV and PCV prepare their corresponding yards. Credits, production speed, orders and gameplay rules are unchanged. |

One initial Python image-decoding candidate was rejected because semi-transparent pixel rounding differed from Electron. The selected generation path uses the exact Electron decode. Yuri pages retain independent color/remap pools and their lookup textures; preparation is not a lossy re-export.

### Measured match entry

Measurement: normal start-game request to native world-scene registration, macOS Apple Silicon, Electron 44.4.0, 1080p rendering, temperate `xmp01t4.map`, isolated profiles. Second entries reuse the same process/map. Controlled production fixtures are installed after the timing gate. Values are representative measured runs, not distributions or guarantees for every map/machine.

| Case | Previous accepted app | Optimized app | Reduction |
| --- | ---: | ---: | ---: |
| YR 2X first entry | 11.80 s | 3.76 s | About 68% |
| YR 4X first entry | 23.41 s | 4.55 s | About 81% |
| YR 4X same-process repeat | 21.09 s | 4.73 s | About 78% |

| Optimized case | First entry | Same-process repeat |
| --- | ---: | ---: |
| YR Original | 3.66 s | 4.28 s |
| YR 2X | 3.76 s | 4.41 s |
| YR 4X | 4.55 s | 4.73 s |
| RA2 2X | 3.45 s | 3.69 s |
| RA2 4X | 3.89 s | 3.78 s |

YR 4X HD preparation fell from 19.419 s to 0.836 s on first entry and from 16.098 s to 0.381 s on repeat. Timed HD PNG requests fell from 312 to zero. Repeated 2X used all 15 cached pages and made zero binary requests; repeated 4X used 23 cached pages and read two large binaries. Measured CPU residency was 36.61 MiB at 2X and 78.33 MiB at 4X. Native VXL loading remains on its existing path.

## 4. Validation, preserved contracts and limits

| Evidence | Result and boundary |
| --- | --- |
| Allied pixel/resource checks | All 96 GI frame/density cases have zero differing sampled stationary fortress pixels outside the native muzzle footprint; other actions are unchanged. Eight Prism theater/density/health cycles have distinct moving phases and unchanged fixed collar pixels. Source, padding, remap and selection preservation pass. |
| Allied native actions | Both editions/densities and separately exported snow cases bind the actual selected resources. Prism complete cycles, damage, power and charge pass; final YR GI sweep observes all 48 native attack frames, with RA2 failing/opposite controls and idle/fire/end/undeploy. |
| Sidebar checks | Cold/warm/rapid categories, correct final identity and click target, model races, fallback, HD Off and teardown pass. Original repair: 19 focused tests / 324 assertions and entry typecheck; later art-only updates reuse unchanged sidebar evidence. |
| Loading focused tests | 46 tests, zero failures, 11,030 assertions across 11 files; entry typecheck passes. Coverage includes cache bounds/corruption, independent textures, family fallback/budgets, native production observation, lease transfer and Yuri remap/recycling. |
| Native production samples | AMRADR 4X, NAWEAP 4X, AMRADR snow 2X and YAPOWR 4X prepare in 133–380 ms during construction and first render as complete HD. NAYARD 4X prepares in 469 ms at 5.2% production, then cancels through the native action. Allocation checks pass; no page errors. |
| Actual copied Desktop ZIP | Archive bytes/CRC/modes, independent resources, deep strict signature, relocated real launcher, private profile and actual GI/HQ/Prism bindings pass in YR 4X and RA2 2X. |

Original/2X/4X selection, one-texel filtering, native geometry/input/camera, timing/rules/shadows, owner color/shade channels, complete-family fallback and prior accepted A/B artwork remain preserved. World caps remain 256 MiB at 2X and 1,280 MiB at 4X; UI remains 16 MiB. No trainer, terrain, campaign or roster expansion was selected.

Background long-task samples reached 101–135 ms in two production cases; zero microstutter is not claimed. Loading measurements cover a bounded temperate map, plus a snow production sample. Windows, exhaustive maps, organic campaign play and independent physical-input/display certification remain unverified. The full C resource suite was not rerun: an exploratory C contract run required an ignored C source inventory absent from the isolated copy. The successful focused suite and selected-resource preparation do not stand in for all C acceptance evidence.

## 5. Current main compatibility and resource obligations

Relative to common ancestor `0370e9b`, the only tracked file changed on both current main `3bf42ee` and the complete loading branch is `desktop/hd-profile.mjs`. This is a changed-path inventory, not a trial merge or combined runtime validation. Reconcile its prepared-world registration with E's `RA2_UI_RESOURCE_ROOT`, returned `uiRoot`, and current UI registration; retain E's propagation through `desktop/main.mjs` and `/local-ui/` containment in `desktop/protocol.mjs`.

Main's newer C catalog includes c3 Dominator and native bunker docking changes. E adds the accepted `yuri-cameos-e-main-v1` UI catalog: 474 entries, manifest SHA-256 `052c1ca0294344e21b3bb4fe881aece611232000e6efc3ec2ad1306efaf3a890`, Yuri loading background and separate UI resource root. Preserve these and C's complete dual-density turret/remap contracts. Do not replace current catalogs, UI selection or package modules with older whole-file snapshots from either correction package. C final visual acceptance remains a separate gate.

Production source changes to review:

- Allied: `UiArtPage.ts`, `UiArtSpriteBuilder.ts`, `SidebarCard.ts`; additive pins in `desktop/allied-building-coverage.json` and `desktop/allied-unit-contracts.json`.
- Loading: `PreparedHdCache.ts`, `preparedHdPage.ts`, `productionHdPrewarm.ts`, `resolveHdSprite.ts`, `UnitHdDemand.ts`, `alliedBuildingDemand.ts`, `loadConscriptHd.ts`, `loadPowerPlantHd.ts`, `loadSovietBuildingsHd.ts`, `loadSovietUnitsHd.ts`, `GameScreen.ts`, plus prepared desktop registration/contract.
- Tests, preparation, isolation, review and packaging tools are under `scripts/allied-corrections/`, `scripts/skirmish-loading/` and the affected `scripts/ui/` / `scripts/m1/` tests. They are not default-packager integration by themselves.

Git alone does not carry the ignored artwork or prepared binaries. The final Allied ledger identifies 42 selected correction files totaling 10,900,253 bytes: HQ `animation-r5`, Prism `animation-r9`, E1 `animation-r9`, their family/member manifests and both densities. Transfer only missing hash-pinned files; validate existing bytes and preserve older revisions. The loading package contains 3,586 selected source-resource files plus 1,233 binaries and their index, totaling 4,820 resource files.

Regenerate prepared data against the final combined C/E/Allied selection in a new isolated resource root using the selected Electron decode path. The current prepared index hash, `7e6f2f776f2eff2393da098697eedf4f3b221b345a832a425497056df4c29219`, certifies this branch's older catalog only. Reusing it for changed C members leaves safe PNG fallback but does not prove the promised loading improvement for the final catalog. Include the new compiled contract, `prepared-hd/index.json`, all referenced binaries, original PNG fallback and the latest desktop modules in the new package. The current default/main package recipe has not been integrated with this optional layer.

Both this isolation work and main commit `8062c92` encountered the same packaging trap: shared turret hashes may deduplicate registration routes, but every selected Yuri family still requires its own complete declared family-relative paths. Preserve main's fix and copy all selected base/data/lookup/turret dependencies at both densities, including equivalent YAGGUN/YAREFN paths. Route uniqueness is not sufficient package completeness. Keep resources as independent copies or verified copy-on-write clones, not hardlinks or writable links to another worktree.

## 6. Suggested evaluation and later integration sequence

This sequence describes later work if integration is authorized; it has not been executed here.

1. Reinspect the newest committed main and active C state read-only. Choose a stable committed baseline and create a fresh integration worktree with private resources, dependencies, builds and profiles; do not alter an active C checkout or process.
2. Choose the scope explicitly: accepted Allied corrections alone, or those corrections plus the technically validated loading optimization. The complete loading branch contains the Allied history. Preserve ancestry or reconcile once; avoid duplicate application.
3. Reconcile the shared desktop registration additively, retain current C/E files and selections, and add only the selected Allied pin changes. Review the demand/prewarm and resolver consumers for current C contracts.
4. Copy missing pinned correction resources without replacement, retain the accepted E UI root, generate exact prepared pages for the combined selection, and adapt the final package to ship both roots and all dependencies. Preserve existing artifacts and profiles.
5. Reuse accepted evidence for unchanged paths. Run affected sidebar/cache/demand/resolver tests, current C pool/family contracts and E UI-root/loading tests, then entry typecheck. Make one new isolated package for the reconciled source and resources.
6. Validate that package's own registration and actual bindings: a focused Allied animation/sidebar sample, a current Yuri turret/remap/C action sample, and E cameos/loading-background behavior with budget/fallback/HD-Off checks. Measure first and same-process repeat skirmish entries at both densities; verify native preparation, placement and cancellation. Inspect the real relocated launcher and archive if a ZIP is requested.
7. Report combined technical results separately from user loading acceptance and C final visual acceptance. Publish to main only under the later explicit authorization; do not infer it from this handoff.

## 7. Evidence and delivery references

- [Accepted Allied report](/Users/Aone/RA2remaster/ra2-hd-allied-corrections/docs/allied-animation-sidebar-corrections.md), [acceptance receipt](/Users/Aone/RA2remaster/ra2-hd-allied-corrections/docs/allied-animation-sidebar-acceptance.json), and [final resource/runtime ledger](/Users/Aone/RA2remaster/ra2-hd-allied-corrections/docs/allied-animation-sidebar-feedback-r2.json). The acceptance receipt supersedes historical pending labels in immutable older ledgers.
- [Accepted offline correction review](/Users/Aone/RA2remaster/ra2-hd-allied-corrections/.artifacts/allied-corrections/review-feedback-r2/Allied-Corrections-Review.html). The retained accepted ZIP is `/Users/Aone/RA2remaster/ra2-hd-allied-corrections/.artifacts/allied-corrections/desktop-zip-feedback-r2/RA2-HD-Allied-Corrections-dae53b4-macOS-arm64.zip`; its Desktop presence is not required by this report.
- [Loading report](skirmish-loading-optimization.md) and [machine-readable handoff](skirmish-loading-handoff.json), including the ten timing samples and allocations. Raw evidence: `/Users/Aone/RA2remaster/ra2-hd-skirmish-loading/.artifacts/skirmish-loading/`, including `preparation.json`, `tests-final-r3.log`, `typecheck-final.log`, `timing.json`, native timing/production reports and `desktop-zip-runtime-r1/result.json`.
- [Current C/E main integration report](/Users/Aone/RA2remaster/ra2-hd/docs/yuri-cameos-main-integration.md) and [C continuation contract](/Users/Aone/RA2remaster/ra2-hd/docs/yuri-cameos-task-c-handoff.md). Refresh their source snapshot before any later integration.
- [Desktop loading test ZIP](/Users/Aone/Desktop/RA2-HD-Loading-Optimized-69d8e3c-macOS-arm64.zip): 3,291,828,647 bytes; SHA-256 `ca84ba689b721e66d692043ebdd979fb35028a45b91f216eafff900be901cd62`. Present with the expected size at this report audit; the retained delivery receipt records full hash and extracted-runtime verification. Extract the whole folder and open `Launch Loading Optimized.command`.

Continue fixes and loading feedback for this outcome in the existing execution conversation. The main planning conversation can use this report to select integration scope; no new conversation or inter-task message was created automatically.
