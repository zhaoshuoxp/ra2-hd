# Isolated Allied animation and sidebar corrections

| Classification | Scope |
| --- | --- |
| NEW_CONTENT | Immutable functional-layer revisions for GAAIRC/AMRADR and ATESLA in temperate/snow, GI deployed firing correction, bounded sidebar page preparation, isolated offline review and Mac app |
| AFFECTED_SHARED_PATH | UiArtSpriteBuilder immediate decoded acquisition; SidebarCard coherent publication/click routing; additive Allied building/unit catalog pins |
| REUSED_ACCEPTED_EVIDENCE | Task A/B roster, construction, superweapons, owner colors, native shadows, R2–R6 UI/startup, trainer, world density/filtering/camera contracts; unchanged controls retain acceptance |

Base: `ee35fcf04de2d24c1bce2ee7497e4156483b21f1`. Branch: `fix/allied-animation-sidebar`. Worktree: `/Users/Aone/RA2remaster/ra2-hd-allied-corrections`. Status: `READY_FOR_REVIEW / NOT_MERGED`. Only the three user-reported problems are selected. Task C's canonical checkout, resources, processes and ports are excluded. No subagents, push, main integration or publication. A Desktop ZIP was subsequently authorized explicitly and is recorded below.

The committed catalogs were read from this branch; 2,540 selected files were independently copied and hash/inode checked. The first copy omitted family metadata and the UI manifest; both omissions were repaired exclusively in this worktree and complete registration equality passed. Original imported data is copied, not linked. Resources, build output and test profiles are under this worktree. The read-only process audit made no process changes.

## Measured causes and corrections

GAAIRC and AMRADR use the same GAAIRC image family: body, bib, two lamp layers, radar/beacon and construction. Native radar frames 0–7 and damaged 8–15 retain their sequence/rate and depth. The accepted helper registered each authored scan view to that native frame's complete moving bounds. Changing dish/feed bounds therefore changed the mounting-ring scale and placement. Only the radar member is recomposed around a fixed ring anchor; its right-roof beacon, stationary body/bib, lamp layers and construction stay accepted. The three accepted radar views remain the source of the eight native-timed scan frames; this correction adds no independently authored view.

ATESLA resolves GAPRIS, including `ggpris_b.shp` ACTIVE (normal 0–8, damaged 9–17), `ggpris_a.shp` charge (0–9 / 10–19), native body starting at y=42, and construction. The prior helper clipped a stationary painted crown with each moving native silhouette. This produced incomplete fragments instead of a complete solid moving assembly. Complete normal/damaged authored crowns now occupy the functional member, using native silhouette changes for local horizontal structural deformation. The charge emission remains separate; stationary shaft/base and construction stay accepted. This is a bounded 2D composition correction, not new multi-view artwork.

GI is rule E1, `gi.shp`, rather than GGI. Native deployment uses idle 292–299, deployment 300–314 and deployed fire 315–362. The 48 firing slots cover eight directions × six phases. Selected atlas and authored-master inspection show body/sandbag width alternating on flash phases, especially 327–332 and 351–356. Connected-component body support excludes different native sandbag parts and muzzle bounds alter the full authored registration. The correction changes only 24 flash slots (315–361, stride 2), keeping vertical registration, native shadows, distinct upper-body/fire poses and unchanged no-flash controls. Horizontal compression is corrected against the corresponding no-flash sandbag support; the stationary bag surface is reused while emission stays above it. The final r6 GI export excludes embedded black ground pixels from that fit and retains the accepted slot's ground coordinates. Resampling corrects physical registration; it does not claim newly generated detail.

Sidebar switching cleared unrelated HD art immediately, displayed Original during asynchronous decode, then acquired the next frame. Releasing the last lease also destroyed the decoded entry, so revisits fetched/decoded again. `UiArtPage` prepares only the requested visible page and retains at most three visited pages under the existing 16 MiB UI budget. The previous cards, labels, tooltips and click actions remain coherent while a cold page prepares. Publication checks both request generation and current model frame identity, including a model change before the next UI frame. Old preparation leases are evicted before new allocation, avoiding a transient refusal of TANY/CLEG textures. The builder can acquire already-decoded base/rank layers synchronously. Different cameos still never reuse an unrelated item's overlay. Missing/corrupt/disabled/over-budget art keeps intentional Original fallback. A 750 ms ceiling bounds stalled cold preparation; it is a deadline, not an added delay. Actual normal local decode should finish earlier; measured cold/warm timing is recorded in runtime evidence.

## Changed files

Production source: `src/gui/hd/UiArtPage.ts`, `src/gui/hd/UiArtSpriteBuilder.ts`, `src/gui/screen/game/component/hud/SidebarCard.ts`. Selected pins: `desktop/allied-building-coverage.json`, `desktop/allied-unit-contracts.json`. Task-local copy/export/verification/runtime/review/package tools are under `scripts/allied-corrections/`. Focused regressions are `scripts/ui/sidebar-page.test.ts` and `sidebar-publication.test.ts`; the inherited Allied missing-atlas fixture is corrected in `scripts/m1/allied-units/contracts.test.ts`. The machine ledger lists every new selected resource path/hash.

## Selected resources and preservation

Selected revisions: `animation-r5` for four building families; `animation-r6` for E1. Both 2x/4x variants are complete in changed members; unchanged building members retain their accepted 4x resources and existing derived-2x path. Current pins are in `desktop/allied-building-coverage.json` and `desktop/allied-unit-contracts.json`. Exact hashes/files are recorded in `.artifacts/allied-corrections/building-selections.json`, `resource-validation.json` and the final package inventory.

Only `ggairc_c.shp` / `gaairc_c.shp`, prism ACTIVE/charge members, and GI's 24 flash slots change. The resource validator proves source/logical contracts, actual RGBA/data, transparent padding, native empty slots, every unchanged GI frame in both densities, unchanged member selections and all other Allied catalog entries. The owner control channel remains 0–15 with opacity/coverage validation. World budgets remain 256/1,280 MiB; UI has separate accounting. No rule, camera, geometry, input, timing, trainer, shared loader or ImageFinder change is selected.

## Failed attempts and validation boundary

- An initial full-height GI bag-based registration compressed the upper body. A helmet-based revision also misidentified a gun highlight. Both are retained as unselected r1/r2 evidence. The selected correction confines registration to the demonstrated horizontal defect and preserves native Y.
- r3/r4 native loading rejected 0–255 owner shades as `invalid-remap-data`; prism's 2x padding also failed validation. r5 fixes the 0–15 encoding and clears pixels outside native content. Registration availability alone was insufficient; these failures were found by actual native loading.
- The initial native fixture used the wrong power API and an invalid max-health field. It was repaired to `setTurnedOn` and native health percent, preserving failed evidence. Corrected baseline native orders/cycles pass.
- The inherited missing-atlas test deleted one density while another valid density survived. The fixture now corrupts every available density, testing complete-family fallback accurately.

Focused tests: 19 passed, 324 assertions across six sidebar/cache/clock and Allied contract files. The final GI resource-only change reran the affected building/unit contracts: five tests, 228 assertions. Entry typecheck passed after the final TypeScript change; subsequent changes are resource pins/export/evidence only. Final pixel/source preservation validation passes, including absence of newly expanded embedded GI ground pixels. `.artifacts/allied-corrections/before-native-v2/` preserves the baseline reproduction, native facing sweep, matched Original/HD screenshots and sidebar sequence.

The final art QA found that r5's GI horizontal fit also expanded the embedded black ground patch (1,407/1,571 extra near-black pixels at 4x in frames 327/351). Native shadow frames were unchanged, but the visible embedded patch needed preservation. r6 removes that patch from the fitted art, restores its original coordinates and changes no additional firing slots. Only GI native actions are repeated after this correction.

A telemetry-only fixture first attempted to change density during a running match and timed out waiting for a reload; the existing density contract applies at match initialization. Its valid 4x samples and failed receipt are retained. Corrected short telemetry sessions select density before each match and record actual source/action, opacity, shadow flags, depth and UVs.

The initial offline page put all media in executable JavaScript and failed to initialize. The final review separates inert media data, deduplicates frame images and assigns video sources only on expansion. A QA playback attempt initially raced the lazy assignment; waiting for the source resolved it. Original full screenshots, video bytes and failed review attempts remain preserved.

## Focused native results

| Issue | Primary evidence | Secondary / reused evidence | Result |
| --- | --- | --- | --- |
| HQ / Prism functional art | `packaged-yr-4x-final`: complete normal cycles, damaged state, power off/on, normal/damaged native Prism charge | `packaged-ra2-2x`, `packaged-yr-snow-4x`, `packaged-ra2-snow-2x`: both densities and distinct snow exports | TECHNICAL_PASS; visual acceptance pending |
| Sidebar publication | Final `packaged-yr-4x-gi-r8`: cold/warm/rapid actual pages, coherent visible frame/target, HD Off, teardown | Final `packaged-ra2-2x-gi-r8`; cache/corruption/budget/clock and pre-frame model-race tests | TECHNICAL_PASS; visual acceptance pending |
| E1 deployed firing | Final `packaged-yr-4x-gi-r8`: deployed idle/fire/end/undeploy, failing direction and control with actual r6 HD binding | Final `packaged-ra2-2x-gi-r8`; initial complete 48-slot native sweep retained | TECHNICAL_PASS; visual acceptance pending |

The final app is built from clean runtime source `39d0aba9886b6d4302ad868f7af9a86366b93742`. The later delivery commit updates evidence scripts/docs, not bundled production code. Unchanged building cycles are reused after the GI-only export; final-app sessions still verify all three renderer-visible building bindings. The primary native sweep has all 48 deployed firing frames; short repeat cases record the actual observed facing/frame IDs, not assumed geometric directions.

ATESLA renderer power changes false/true on off/on; GAAIRC/AMRADR renderer ACTIVE remains powered/visible under those native toggle calls. The HQ rules do not use Prism's powered-animation gating; the repair preserves that behavior. The charge trace observes the real SPECIAL/FireUp layer with r5 HD in both health states, not a manually toggled artwork comparison.

Measured world allocations: dry RA2 2x 178,626,684 / 268,435,456 bytes; snow RA2 2x 208,250,088 / 268,435,456; dry YR 4x 588,874,916 / 1,342,177,280; snow YR 4x 619,902,616 / 1,342,177,280. UI accounting is separate and remains below 16 MiB. Final YR first-use publication was about 29–89 ms and the last retained building/infantry alternation about 12–25 ms; the final RA2 sample was about 42–65 ms and 27–35 ms respectively. A fourth unique category can evict the oldest page and decode again. These samples are not hardware-wide latency guarantees.

YR `GGI`, `BFRT`, `GAROBO` and `ForceShieldSpecial` retain intentional Original cameo fallback because this selected accepted UI pack lacks those valid HD entries. They are not classified as avoidable flash or newly authored here. Available selected cameos are HD on coherent publication; the measured TANY/CLEG one-frame refusal is resolved. Actual HD Off and card destruction release all recorded UI reservation/decoded/GPU bytes to zero; stale rapid requests cannot replace the final infantry page.

## Review and isolated launch

- Offline review: `/Users/Aone/RA2remaster/ra2-hd-allied-corrections/.artifacts/allied-corrections/review-r4/Allied-Corrections-Review.html`.
- Launch: `/Users/Aone/RA2remaster/ra2-hd-allied-corrections/.artifacts/allied-corrections/mac-review-r8/Launch Allied Corrections.command`.
- App: the adjacent `RA2 HD Allied Corrections.app`; independently copied resource root: adjacent `RA2-HD-Editions-Resources`; portable profile: adjacent `Trainer-Review-Profile`.
- Exact selected new resource files/hashes and compact runtime results: `docs/allied-animation-sidebar-corrections.json`. Only 42 selected new files (11,118,437 bytes) require additive transfer later; no historical pack replacement is needed.

The offline page contains 30 synchronized Original/Before/After groups, including normal/damaged temperate/snow HQ/Prism/charge and GI failing/control directions in both densities. Embedded native clips preserve their captured 3840×2160 bytes/timing; screenshots are previews up to 1920×1080 with full captures retained separately. It uses no external requests. Offline QA passes: all 30 groups, synchronized stepping, actual 3840×2160 native video playback, no external requests/page errors, and no horizontal overflow. HQ, Prism and GI comparison views were visually inspected; the machine receipt records the result. The app is ad-hoc signed and signature-verified, with actual native loading from its copied resource root. Neither a signature nor registration metadata substitutes for those native bindings.

Remaining limits: human visual acceptance, Windows/physical-input/display certification, natural-match campaign coverage, and compatibility with C's uncommitted code are unverified. HQ still uses three accepted scan views; Prism uses bounded native-derived 2D deformation; GI registration resamples the accepted atlas rather than claiming newly generated detail. This is a scoped correction review, not reopening A/B acceptance or accepting the separate map-layout commit.

## Integration boundary

Known C overlap is additive edits to `desktop/allied-building-coverage.json` or registration consumers if C changes their contracts. This branch changes no C-authored helper or Yuri art. Do not replace C's complete newer registries with this branch's older file. At a separately authorized stable C checkpoint, reconcile only four building selections and the E1 pin additively, copy missing hash-pinned resources and revalidate overlapping contracts/selected runtime samples. Passing this branch does not establish compatibility with C's uncommitted work. Continue correction review in this chat; do not create another chat automatically.

## Subsequently authorized Desktop ZIP

Delivered `/Users/Aone/Desktop/RA2-HD-Allied-Corrections-39d0aba-macOS-arm64.zip`, 1,744,989,995 bytes; SHA-256 `c817d99ddb49427ed65089fb01c99cdea81829d361779caaef8fafd9cc8bae0b`. Existing Desktop files were preserved. The archive contains the unchanged signed r8 app, 2,552 independently copied resource files, README/build metadata and a relocatable launcher; no old settings/saves or test profiles are included.

Packaging exposed a launcher defect: the earlier script contained literal backslash-n separators instead of physical newlines. The launcher is corrected, syntax-checked and tested as the actual launched executable. It safely registers the adjacent resources into this folder's own profile on every launch, preserving other settings. The previously linked worktree launcher was also repaired; accepted app and resource bytes remain unchanged.

All 3,015 staged files/links were checked against ZIP entries, including hashes, executable bits and symlink targets. The copied Desktop ZIP matched the source hash. A fresh extraction from that actual ZIP passed signature verification, real relocated-launcher startup, and actual renderer-visible GI/HQ/Prism HD bindings in YR 4x and RA2 2x. Only package-sensitive checks were repeated. Machine receipt: `docs/allied-animation-sidebar-zip-delivery.json`. Main stays at `ee35fcf`; C's working tree/processes remain excluded. The repair is still `READY_FOR_REVIEW / NOT_MERGED`.
