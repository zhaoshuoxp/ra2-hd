# Allied corrections and skirmish loading: local-main integration

Date: 2026-10-01. Status: `LOCAL_MAIN_INTEGRATION_TECHNICALLY_VALIDATED`. Accepted Allied corrections and accepted Task E are integrated into local main with the technically validated loading optimization. C final visual acceptance and user loading-experience acceptance remain pending; Windows is not tested. Task D is not merged.

The current authorization superseded the historical isolated-only restrictions. Preparation, dependencies, generation, one production build and native checks used `/Users/Aone/RA2remaster/ra2-hd-allied-loading-integration`. Verified missing immutable resources were then published exclusively and canonical main was fast-forwarded. No push, cleanup, branch deletion, worktree deletion or automatic message to C was performed.

## Code checkpoint and ancestry

| Checkpoint | SHA / identity |
| --- | --- |
| Clean main before integration | `3bf42ee86e11b97202432bf33c8e421462c176b2` |
| Recoverable predecessor branch | `checkpoint/main-before-allied-loading-20261001` |
| Accepted Allied tip | `3b4202a8862ce637e3322dd0e31efaba87499149` |
| Loading tip, already containing Allied | `c8134d71da67e81b3146f110b652ede48c6e077d` |
| Reconciliation merge | `5236c23`; parents retain current main and loading history |
| Accepted E tip retained in ancestry | `cd6944def05dc4444f0e904c8eea29f6c381cdbe` |
| One production build / packaged runtime | `2cdeab64f63253c1ca5a9aa681c5b34f1bfc18ac` |
| Final package recipe used | `0b42dff866ca58c752e948cd9102a473a17b9b6a` |
| Promoted main code checkpoint | `78e6f17aee5f392f731bac069e697bfaf23b5069` |

Closure documentation follows the code promotion. The exact final main HEAD and clean-state audit are recorded in `/Users/Aone/RA2remaster/ra2-hd/.artifacts/allied-loading-main-integration-v1/final-checkpoint.json`. The source branches remain retained. `src/` and `desktop/` are byte-identical to the production-build checkpoint after the later packaging, generator and fixture-only corrections; that build was reused.

`desktop/hd-profile.mjs` differs from the previous main only by importing and invoking optional prepared registration. Its existing C registration, E independent `uiRoot` and returned root are preserved. E desktop propagation, `/local-ui/` containment, loading preparation/fallback/release, native bunker docking and the current C coverage catalog are byte-identical to pre-integration main. Current c3 Dominator hinges, Mutator effects, both turret densities, independent remap/lookup pools and the map-layout correction are retained. The reconciliation did not restore older whole files or apply Allied history twice.

## Accepted corrections and resources

| Issue | Correction retained in main | Selected revision |
| --- | --- | --- |
| HQ radar mount shifts during scanning | Fixed ring registration instead of fitting the radar to changing moving bounds; GAAIRC and AMRADR share the image family. | Temperate/snow `animation-r5` |
| Prism crown twists during rotation | Rigid eight-petal projection of accepted raster materials, fixed neck and native charge light. The earlier row deformation remains rejected and unselected. | Temperate/snow `animation-r9` |
| GI fortress shifts during deployed firing | Accepted idle fortress reused through all 48 fire slots with a cleared stationary footprint and native muzzle area; upper-body motion, embedded ground and separate shadows retained. | E1 `animation-r9` |
| Sidebar briefly publishes Original icons or stale targets | Prepare a coherent visible page before publication; retain at most three visited pages, release old leases before cold allocation, guard generation/current-model identities and click the published item. | Shared sidebar correction |

The sidebar deadline remains 750 ms and the separate UI cap remains 16 MiB. Missing, corrupt, disabled or over-budget artwork keeps the bounded Original fallback. Prism uses inferred petal symmetry because the original 3D model/source yaw is unavailable; the accepted correction's disclosed limit is unchanged. See the historical [correction report](allied-corrections-and-loading-merge-report.md) for accepted pixel/action evidence.

E selection remains `.local/ui-selection.json` -> `yuri-cameos-e-main-v1`, manifest SHA-256 `052c1ca0294344e21b3bb4fe881aece611232000e6efc3ec2ad1306efaf3a890`. All 474 accepted entries are retained: 430 baseline, 31 canonical additions, 12 rank aliases and one Yuri loading background. The UI pointer bytes are unchanged; no older `remaining-ui-v4` snapshot was selected.

The transfer checked the current accepted ledger and actual files. It added 42 missing correction files (10,900,253 bytes), 1,233 prepared binaries, one immutable index and one immutable proof: **1,277 files added, zero replacements**. Both densities, theater variants and declared family-relative dependencies resolve. All 21,256 original resource/dist file or link entries retain size, mode, nanosecond mtime and inode; recorded JSON selections also retain their SHA-256. Source paths, selected family hashes and every added-file hash are in the [machine-readable receipt](allied-corrections-loading-main-integration.json).

## Final prepared data and packaging

Generation uses the validated Electron 44.4.0 canvas decoder and the existing resolver. Both edition contracts were processed against the final combined selections, including C c3 and Allied r5/r9. Every output texture, remap pool and lookup map round-trips byte-identically with the validated representation. There are 446 distinct manifests, 1,233 pages and 2,816,966,724 payload bytes; 14 manifests differ from the previous isolated loading index. Old output was not relabeled with changed hashes.

- Compiled contract: `desktop/prepared-hd-contract.json`.
- Index SHA-256: `d8ce254898cbd362d97ed8aacda87ce35816e41e7c0d0b0c18a28d05facdf467`.
- Source index: `.local/prepared-hd/indexes/d8ce254898cbd362d97ed8aacda87ce35816e41e7c0d0b0c18a28d05facdf467.json`.
- Immutable generation proof: `.local/prepared-hd/proofs/d8ce254898cbd362d97ed8aacda87ce35816e41e7c0d0b0c18a28d05facdf467.json`.
- Payloads: `.local/prepared-hd/<manifest-sha>/<density>/<page-id>.bin`.

Actual canonical-main registration finds 459 member bindings, including aliases, and 1,233 distinct pages. Each payload is hash-checked before use. Missing/corrupt optional preparation retains the validated PNG path and atomic complete-family fallback. Original assets and fallback PNGs remain present.

The shared CPU cache retains at most 128 MiB including admitted pending data, with the established 16 MiB per-retained-page limit and independent match textures. World caps remain 256 MiB at 2X and 1280 MiB at 4X; UI remains separately capped at 16 MiB. Initial buildings/MCV yards prepare before entry; other applicable building families prepare through the existing bounded demand queue and native production observation. Cancellation, lease transfer and match teardown remain native. Rules, credits, production timing, camera/input geometry, shadows and owner color are unchanged.

The main delivery recipe `scripts/editions/package-mac-test.mjs` includes current desktop modules, the pinned immutable index, registered binaries, fallback PNGs, both turret densities and all family-relative dependencies even when hashes share routes. It packages the currently validated UI catalog into an independent sibling UI root. `--require-prepared` requires preparation to be available; an optional-layer omission cannot be reported as optimized. Historical unit-resource receipts no longer force obsolete superseded revisions into a current package. Copies are independent files or verified copy-on-write clones, never hardlinks or writable links to peer roots.

## Focused combined validation

| Evidence | Result and scope |
| --- | --- |
| Affected sidebar/cache/resolver/demand/pool/E loading/UI-root tests | 60 passed, zero failures, 11,132 assertions across 16 files |
| Current C family contracts/resources | Three passed, zero failures, 334 assertions; YAPPET/NATBNK/YAGNTC/YAGGUN at both densities/theaters |
| Entry type check | PASS |
| Combined production build | One isolated build; reused after packaging/generator/fixture-only fixes |
| Allied compact native 4X sample | Actual HQ/Prism/GI bindings; scan/charge/damage/power and GI fire/end/undeploy, cold/warm/rapid sidebar, HD Off/teardown passed |
| C temperate 2X and snow 4X | Composed focused passes for six family bindings, bunker enter/evacuate, Gatling native stages, Mutator and Dominator native phases, remap/turrets and logical geometry |
| E bounded combined sample | Normal YABRCK/YAPOWR/INIT/LTNK, two real rank aliases, four powers, Yuri loading background, HD/Original/HD, native queue/progress/disabled states and 16 rapid category samples passed |
| E UI budget/release | Peak 16,621,312 / 16,777,216 bytes; HD-Off metrics all zero |
| Native production | NAWEAP 4X ready in 742.2 ms; first HD frame 19.2 ms after placement. YAPOWR 2X ready in 216.86 ms; first HD frame 17.71 ms. Family preparation completed while native construction remained active. |
| Native cancellation/release | NAYARD 4X ready in 432.815 ms at 4.8% construction; native cancellation verified. Match demand GPU allocation becomes zero; lobby UI remains bounded and becomes zero after HD Off. CPU retention stays under its cap. |
| Actual copied launcher | No task `RA2_*` environment overrides; its own sibling world/UI resources and fresh private profile were discovered. All requested HD bindings and E 474 entries passed. Actual registered click handler queued visible INIT while the model had already switched to GAFWLL. |
| Delivery storage/signature | 5,332 file/link entries verified for hashes/link targets/modes and independent file inodes; deep strict ad-hoc signature passed |

The first C receipts remain marked FAIL: the temperate geometry fixture referenced an absent fixture variable; the snow Dominator victim was relocated into native friendly splash range, destroying the deliberately damaged building and invalidating its renderer poll. Only those fixtures were corrected, and geometry/Dominator were rerun narrowly. The first cancellation probe incorrectly demanded zero lobby artwork; the corrected boundary checks world release, bounded lobby UI, then HD-Off zero. Copied-click probes corrected a raw-container reference and waited for the native action tick. The raw failures and successful followups are retained, rather than rewriting earlier results. No gameplay damage or rendering behavior was changed to pass a fixture.

Agent inspection of selected native screenshots confirms the expected selected artwork and E sidebar presentation are present. It does not replace user visual acceptance. These samples do not claim a complete historical faction matrix, long battle, physical pointer/panel acceptance or Windows validation. Unchanged native VXL PNG loading remains on its existing path; timed SHP entry below has no PNG fallback.

## Newly measured combined application

Boundary: start-game request to world-scene registration, macOS arm64/Electron 44.4.0, 1080p, temperate `XMP01T4.map`. Each case starts with an independent profile; the second entry reuses the same process and map. Fixtures are installed after the timing gate. These are bounded samples, not latency distributions or guarantees.

| Current combined application | First entry | Same-process repeat |
| --- | ---: | ---: |
| YR Original | 3.513 s | 4.359 s |
| YR 2X | 3.484 s | 4.366 s |
| YR 4X | 6.302 s | 5.274 s |
| RA2 2X control | 3.160 s | 3.594 s |

All timed HD entries made zero HD PNG requests. 2X reads 15 prepared pages first and zero on repeat, with 15 cache hits and 36.61 MiB residency. 4X reads 25 first and two large uncached pages on repeat, with 23 hits and 78.33 MiB residency. Native map/scene cost and normal run variation still affect total time; a cache hit does not guarantee every repeated entry is faster. The previous isolated app's 4.55/4.73 seconds are historical results and are not promised for this newer combined C/E application. User loading experience remains `USER_REVIEW_PENDING`.

## Delivery and C continuation

Canonical evidence: `/Users/Aone/RA2remaster/ra2-hd/.artifacts/allied-loading-main-integration-v1/evidence/`; actual main registration and final checkpoint sit alongside it. Builds, original packages and test profiles remain preserved in the isolated worktree. The source immutable proof is also available in canonical `.local` for future regeneration.

Review folder: `/Users/Aone/RA2remaster/ra2-hd/.artifacts/allied-loading-main-integration-v1/delivery/RA2-HD-Main-Allied-Loading-Review-R1/`.

Launcher: `/Users/Aone/RA2remaster/ra2-hd/.artifacts/allied-loading-main-integration-v1/delivery/RA2-HD-Main-Allied-Loading-Review-R1/Launch-Isolated-Review.command`.

App: `Red Alert 2 HD Main Allied Loading Review R1.app`. Retain both sibling resource directories. `Review-Profile` is absent for a fresh user launch; only this task's test profiles were moved into retained evidence. Old deliveries, existing profiles and canonical `dist` remain untouched. A new ZIP was not requested for this integration.

Read [the unified C resume contract](task-c-resume-after-ui-and-loading-integration.md) before continuing C in its existing conversation. Future resource changes must preserve fallback and regenerate matching prepared data/contract before claiming optimized package loading. Continue integration/loading feedback in this execution conversation; no conversation or inter-task message is created automatically.
