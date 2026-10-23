# Task C Yuri buildings HD batch

Status: `TECHNICAL_REVIEW_READY_FINAL_VISUAL_ACCEPTANCE_PENDING`. All 16 applicable families have complete independent 2X and 4X selections. The approved representative directions and targeted proportion corrections are retained. Final user visual acceptance is the remaining gate; Task C is not declared accepted. The map repair has its own verified status and local commit in [map-selection-layout-fix.md](map-selection-layout-fix.md).

## Scope and baseline

Execution began on clean local `main` at `3e251383f7f59d2d0525e4c25987fb83f6715f82`. Map repair commit `ee35fcf04de2d24c1bce2ee7497e4156483b21f1` is independent. Current accepted desktop catalogs, rather than old coverage-ledger selections, determined retained resources. `accepted-preservation-v1.json` records predecessor pins; the Allied unit/building catalogs, Soviet building catalog and `HdDensity.ts` remain unchanged. Desktop profile registration is deliberately additive, so its predecessor hash is not an unchanged-source assertion.

Work is local and sequential. Accepted assets, masks, apps, profiles, normal `dist`, raw/rejected masters and archives are retained. No push, cleanup, Desktop ZIP, Windows package, installer, D/E production, new units/cameos/terrain/campaigns or trainer features are included. No rules, footprints, world/input geometry, native game timing, solo speed or density budgets changed. `final-preservation-v1.json` reconfirms four accepted source pins and 33 copied C family pins without hashing the archive. Shared sprite materials gained a lossless C atlas lookup, with focused affected-path checks. A measured missing Grinder animation event consumer was repaired without changing its native refund, intake order or timing.

## Inventory and eligibility

`source-v1/inventory.json` derives rule/image identities and archive/VFS/ImageFinder mappings from imported retail YR data. It records palettes, hashes, SHP canvas/trim/offsets, shadows, animation properties, components and absent declarations. There are 17 rules identities, 102 theater cells and 136 unique SHP sources. `source-audit-v1.json` checks 5,398 decoded source slots including shadows and 118 zero-extent slots, with no unresolved declarations. These counts differ from produced colored HD slots.

`eligibility-v1.json` exercises native Production for YuriCountry, trainer absent, with legal prerequisites. Sixteen identities are applicable at the native normal skirmish TechLevel limit 10: 96 cells in TEMPERATE, SNOW, URBAN, NEWURBAN, DESERT and LUNAR. There are 32 distinct member-hash/aggregate-offset groups and 33 selected theater entries. Tank Bunker has a separate NEWURBAN selection; Slave Miner has a genuinely shared all-theater identity. Controlled Lunar resource resolution is not retail-map gameplay. `YADEPT` remains in the original denominator, explicitly excluded because native TechLevel 15 is unavailable; rules were not edited to conceal missing coverage.

The authoritative selection is `desktop/yuri-building-coverage.json`. Each selected family document under `.local/hd-packs/yuri-coverage-*` pins all member manifests and, where present, both turret densities. Every listed row is complete at both densities; final visual acceptance remains pending for the batch.

| Identity | Native role | Selected immutable export evidence |
| --- | --- | --- |
| GAFWLL | Citadel wall, connection/damage variants | `full-exports-v2` |
| NACLON | Cloning Vats | `reuse-exports-v2` |
| NAPSIS | Psychic Sensor/radar | `full-exports-v36` |
| NATBNK | Tank Bunker, three distinct source groups | `full-exports-v31` |
| YABRCK | Barracks | `full-exports-v22` |
| YACNST | Construction Yard | `full-exports-v27` |
| YAGGUN | Gatling defense and eight-heading turret | `full-exports-v13`, `turret-exports-v3` |
| YAGNTC | Genetic Mutator with continuous open-state electricity | `mutator-arc-v1/exports-v4`, c2 |
| YAGRND | Grinder | `full-exports-v34` |
| YAPOWR | Bio Reactor | `full-exports-v14` |
| YAPPET | Psychic Dominator | `feedback-v1/dominator-exports-v3`, immutable `c3`; prior `full-exports-v40` retained |
| YAPSYT | Psychic Tower | `full-exports-v28` |
| YAREFN | Stationary Slave Miner/refinery and neutral turret | `full-exports-v17`, `turret-exports-v3` |
| YATECH | Battle Lab | `full-exports-v37` |
| YAWEAP | Ground/air factory | `full-exports-v43` |
| YAYARD | Naval production/docking | `full-exports-v42` |
| YADEPT | Unavailable native service-depot declaration | Explicit native exclusion, original denominator retained |

`production-ledger.json` is the resumable per-family record: source dependencies, source cells, full slots, both-density bindings, provenance, representative approval, native reports and final acceptance. Artwork, retail data and evidence are ignored artifacts, not committed assets.

## Authoring, states and components

The image-generation skill produced adequate high-resolution direction masters and complete mechanical parts. `generation-receipts-v2.json`, `art-v1/` and `production-art-v1/` retain copied originals, hashes, tool/reference scope and prompt briefs; the execution chat retains exact tool requests. Production uses deterministic native-coordinate composition, fixed foundations/sockets and complete local articulated parts. It does not fit the whole building independently to each changing frame envelope. Each density is independently derived from adequate masters, with provenance dimensions/crops/scales, rather than enlarged from a deficient 2X atlas.

The representative batch direction was approved in `representative-acceptance-v1.json`. The three flagged review samples used unequal axis fits, causing apparent vertical stretches of approximately 43%, 18% and 33%. Uniform scaling corrected YAGGUN-TURRET-0, YAPPET-OPEN and YAREFN-TURRET-0; production retains native pivots/canvases. Gatling peripheral haze was removed in the selected component export, retaining a narrow antialiased edge. The previous representative HTML remains preserved; the final full-state review is separate.

All native colored, empty and indexed control slots are retained, with density-scaled physical trims/offsets and unchanged logical canvas. Snow follows source neutral-material coverage and moving assemblies. Psychic Tower/factory additional snow damaged poses retain their own slots; they are compared with corresponding damaged geometry, not a dry shadow tail. Dominator ACTIVE includes sparse neutral control pixels, not a wholly empty frame. Battle Lab's fixed silver pipe, separate short fork/dark crescent, Shipyard's complete hook and Slave Miner's fixed tube collars retain explicit part ownership.

Accepted NAPSIS/NACLON direction art is reused with new immutable YR contracts. NAPSIS changes from RA2 canvas 264 × 208 to YR 262 × 210; NACLON has different trims, active coverage and indexed tails. Same-density accepted weighted red-mask edge coverage and shade categories are retained. New construction masks are independently scanned. Accepted RA2 bytes remain untouched.

`dependencies-v2.json` records original explosions/fire/particles and VXL/HVA hashes. Gatling `yaggun.vxl` has three sections; DUMMY02 contains 1,163 owner-index voxels. Slave `smintur.vxl` has one section with no owner-index voxels; optional `sminbarl.vxl/hva` are explicitly absent. The two native turrets have independently authored 2X/4X eight-heading contracts. Original units and shared death effects are reused, with no Task D production.

## Owner materials and structural checks

Every new selected frame and heading at both densities is scanned for intended owner-mask/shade coverage and fixed-material leaks. Per-family `*-export-audit-*.json` and `*-all-slot-audit-*.json` record actual slots. The selected Bio Reactor, Gatling, Slave, Barracks, Construction Yard, Tower, Bunker, Grinder, Sensor construction, Lab, Mutator, Dominator, Factory and Yard exports have strict new-mask checks. Accepted operating NAPSIS/NACLON weighted edge masks keep their original acceptance boundary rather than being rewritten as binary paint.

Legitimate exclusions are documented in `material_policy.py` and audit reports: fixed wall masonry, stationary Gatling base, neutral Slave turret, glass/brass, rust, hazard stripes, fixed violet architectural lights and Mutator buttons. Authored paint uses native categorical shade ramps with antialiased edge coverage; components retain native chroma-remap semantics. Static HTML controls illustrate these masks; actual native captures establish owner replacement.

Heavy members use serialized lossless 4-pixel tiles, validated byte-for-byte against their full virtual color/remap pages. Runtime reconstructs UVs, pools categorical remap tiles independently and charges lookup maps to the same allocation. Physical pages remain at most 2,048 pixels and eight pages/member. Newly selected families remain below 64 MiB. Grinder's selected temperate 4X native allocation is 56,128,496 bytes; the old accepted NAYARD 128 MiB/16-page exception remains scoped to that old family. Failed C pools were preserved, not made to pass by raising budgets or dropping slots.

## Actual native evidence

`consolidated-native-v1.json` consolidates four primary runs and targeted failed-case follow-ups from `package-v3`'s independently copied resource root. All 16 actual main/bib/animation bindings match the requested density in each primary run. Green and cyan are distinct non-red owners; Barracks native engineer capture changes blue to the local owner. Trainer is off. Fixtures use legal native placements; production/orders/controller transitions then run natively. Primary superweapon tests disclose a one-time charge preset followed by actual native activation, discharge and closure, rather than repeated full recharge waits.

| Primary scene | Requested/actual density | World HD residency | Shared world limit |
| --- | --- | --- | --- |
| Temperate, green | 2X | 153,954,840 bytes / 146.8 MiB | 256 MiB |
| Temperate, green | 4X | 817,223,896 bytes / 779.4 MiB | 1,280 MiB |
| Snow, cyan | 2X | 181,896,172 bytes / 173.5 MiB | 256 MiB |
| Snow, cyan | 4X | 884,247,536 bytes / 843.3 MiB | 1,280 MiB |

These are representative mixed scenes, not new hardware pressure certification. At 2X, completed fixture groups release references through controlled cleanup; live accepted Allied/Soviet building, infantry and vehicle peers retain HD. UI allocation remains separately accounted.

Native actions cover Construction Yard building/crane production; Bio Reactor occupants, evacuation and power; Tank Bunker occupant/range behavior; Grinder refund and complete normal/damaged crushing; Psychic Tower control; Gatling ground stages plus airborne target/rotation; Barracks and Cloning Vats duplicated infantry production; factory ground and air deployment; Slave Miner native production/deployment and five slaves; Boomer (`BSUB`) production and dock repair; Mutator conversion; Dominator damage/capture/closure; Sensor detection; and Battle Lab Force Shield, blackout and restoration. All families have native construction/damage/selling observations; native `Unsellable` YAREFN instead uses its legitimate undeploy/UNBUILD transition, and wall selling is immediate with no invented construction SHP. `native-destruction-v3` additionally verifies native destruction/events and selection cleanup for all families through a native warhead, with shared death effects retained.

`native-damaged-actions-v1` exercises distinct damaged Grinder/factory/superweapon material states and confirms 1080p versus 4K changes the physical drawing buffer while logical camera, viewport, UI root, building dimensions, scale and density remain equal. `native-sensor-focused-v2` observes a naturally cloaked native Boomer enter the powered Sensor's unchanged detection area: cloaked true becomes false. Controlled enemy-map reveal fixes legal shore placement; no sensor rule or gameplay patch was needed.

Failed reports remain unchanged. Early ship fixtures used the nonexistent BOOM rule or FactoryType 4 instead of ship QueueType 5. An infantry Dominator victim died before capture; a surviving native APOC resolved that case. The first peer assertion incorrectly expected demand status for eager accepted resources. Sensor attempts confused TNKD with a cloakable unit, selected an unreachable water destination or placed a legal Sensor far away because enemy shroud was unrevealed. `native-snow-4x-v1` has `snow=false` and is supplemental temperate evidence, never counted as snow. Direct HealthTrait damage notifications do not themselves perform a warhead's lethal destruction; the destruction fixture uses the native warhead path. The consolidated report points from each failed case to successful follow-up evidence without relabeling old failed sessions.

## Affected runtime and incremental validation

C registration, ImageFinder and the existing shared demand queue are additive and YR-scoped. RA2 retains its accepted NAPSIS/NACLON mappings. Whole-family registration requires all members and source contracts. Turret dependencies copy every family-relative file even when route hashes share immutable data. The final build also fixes a measured packaged map-reader guard that initially omitted `/map.png` and caused explicit 2X fallback for seven 4X families.

Grinder intake originally refunded natively but dispatched no receiving-building identity and had no renderable animation consumer. `UnitRecycleEvent` now optionally carries the recycler; WorldView notifies that renderable; Building selects the existing SPECIAL normal/damaged sequence and hides its ACTIVE pose during the crush. Refund/order/timing remain unchanged. Focused recycling tests cover event/disposal and all normal/damaged crush frames.

- `NEW_CONTENT`: source/eligibility/dependency audits; all selected native slot/offset/page/mask contracts; actual selected 2X/4X PNG decoding; component heading checks; 33-entry registration; four primary native scenes and targeted distinctive-state/destruction follow-ups.
- `AFFECTED_SHARED_PATH`: entry typecheck; lossless remap reconstruction/filter/clone tests; recycling event/animation tests; seven saved-density/shared-demand lifecycle tests; 17 shared material tests with 531 assertions. `native-lifecycle-v2` verifies actual options UI default 4X, saving 2X/4X/Original, unchanged current match, next-match application, teardown/disposal, recovery and relaunch persistence. Injecting one required Grinder 4X lookup-map failure explicitly publishes the complete 2X family while Bio Reactor and accepted infantry stay healthy at 4X. Original releases world HD; restored 4X recovers. No partial 4X family is claimed.
- `REUSED_ACCEPTED_EVIDENCE`: A/B/Soviet/UI/trainer/solo-speed and M2 pressure evidence retain original build boundaries. No closed complete matrix or whole-archive rehash was repeated. A small final RA2 startup/control check verifies accepted GAPOWR/NAPSIS/E1/MTNK, original RA2 Sensor geometry and no Yuri-only selection leak; focused RA2 contracts pass 96 assertions.

One isolated production build was reused for native verification. `build-v1` had the measured packaged map-reader defect; only that affected correction and the measured Grinder visual fix required `build-v2`. Final `package-v3` uses build-v2, verifies codesigning and independently copies 3,789 resource files across 4,265 routes. Older builds/packages are retained. Later evidence/viewer/document changes require no application rebuild. Build metadata records `ee35fcf` plus dirty C source at build time; the later C source/document commit is not misrepresented as an already compiled clean HEAD. The task-specific review receipt carries the final acceptance boundary rather than relying on the generic predecessor art label.

## Review and launch

The newest building-specific correction is [yagntc-building-electricity-fix.md](yagntc-building-electricity-fix.md): Mutator c2 restores continuous purple electricity during opening/release while retaining c3 Dominator and native bunker docking. Its complete independent world/UI package uses the combined-main accepted E/Allied and prepared loading baseline. The new focused review and Desktop ZIP supersede the Mutator conclusions and older runnable app below; unchanged accepted evidence remains preserved.

The subsequent three-item feedback correction is documented in [yuri-buildings-feedback.md](yuri-buildings-feedback.md). Current selection is Dominator c3 with complete articulated upper hinges; Tank Bunker entry now reaches its native dock; Mutator native electrical/target-mutation evidence is corrected. The latest runnable app and changed-item offline review are under `.artifacts/yuri-buildings/feedback-v1/package-v5/RA2-HD-Task-C-Feedback-Review/`. That package contains all complete C resources. The original full review/app below retain their earlier source/art boundary and are preserved references; they do not supersede the corrected three-item review. Other approved directions and the verified map fix require no new direction decision.

Open `.artifacts/yuri-buildings/package-v3/RA2-HD-Task-C-Yuri-Review/Yuri-Buildings-Final-Review.html` in a desktop browser. It is a single self-contained offline file containing selected complete 2X/4X atlases, native logical/full-buffer canvases, source state/slot playback, owner/mask controls, native action captures/clips and map before/after evidence. It decodes active pages lazily; full-buffer views retain actual pixel dimensions rather than playing a downsampled GIF. Art-rate playback is illustrative; native clips retain actual game timing. Component views are separate native canvases; actual assembled turret sockets, depth/shadows/controllers are shown in gameplay.

Run `Launch-Isolated-Review.command` beside the app. It registers the adjacent `RA2-HD-Editions-Resources` in the new task-owned `Review-Profile` and launches `Red Alert 2 HD Dual Edition R5.app` with discovery disabled. Keep that folder together. The launcher does not reuse the user's accepted profile. Choose Yuri's Revenge, Skirmish and the saved/default 4X setting; changing density applies fully next match. Native evidence used separately isolated profiles and the same app/resources.

Technical C coverage and the independently verified map fix are ready for consolidated review. Final visual acceptance is pending, and Windows/exhaustive physical-panel/input testing remain unclaimed. Continue acceptance or named C corrections in this execution chat. Start D/E only after acceptance and an explicit materially different request.

## Feedback R5 continuation

The current correction is [yuri-buildings-feedback-r5.md](yuri-buildings-feedback-r5.md), with [the incremental receipt](yuri-buildings-feedback-r5.json). Seven theater selections use complete independent 2X/4X revisions: Gatling `c5-feedback-r5-pivot-v2`, Tank Bunker `c5-feedback-r5-horizontal-v6`, Grinder `c5-feedback-r5-volume-v4`. This supersedes the provisional R4 alignment/guard and flat-cradle conclusions while preserving all unchanged accepted art, profiles, packages and earlier evidence. Copied-app native technical checks pass; final appearance remains pending user review. No D or new E work is started.

The R5 feedback continuation includes the user-authorized Desktop ZIP, superseding the initial batch packaging exclusion above. The horizontal-spike correction and latest accepted main results are included in a verified independent archive; [delivery evidence](yuri-buildings-feedback-r5-delivery.json) records extracted-file, signature, launcher and actual Desktop match checks. Final user visual acceptance remains pending. No D or new E work was started.

## Feedback R6 continuation (2026-10-02)

Accepted Gatling yaw registration is preserved while a neutral authored lower bearing raises the receiver nine logical pixels. Grinder projects solid spheres and 24 beveled cuboid teeth with axle spin, perspective and occlusion while retaining fixed architecture, native hinge sockets and material ownership. Four theater selections change; 29 stay selected. Independent 2X/4X exports, 668-slot/material and 312-retained-texture audits, actual Desktop green/cyan native checks and metadata-free ZIP/extraction/signature checks pass. Exact delivery is recorded in [the R6 report](yuri-buildings-feedback-r6.md) and [receipt](yuri-buildings-feedback-r6.json). User appearance acceptance remains pending. No D, new E or remote push.

## Feedback R7 continuation (2026-10-04)

Original-mode retail VXL/HVA/SHP recordings expose the heading-specific R6 Gatling translations and static central Grinder shaft. R7 restores native-reference registration for the opt-in Gatling views and adds a separate rotating vertical central cylinder with radial teeth and foreground occlusion. Complete independent 2X/4X temperate/snow resources change four selections; 29 remain selected. Export/pixel retention, focused contracts, copied-app construction cases, full yaw recordings, offline comparison, ZIP/extraction/signature/startup and actual Desktop native 4X-temperate/2X-snow checks pass. [The R7 report](yuri-buildings-feedback-r7.md) and [receipt](yuri-buildings-feedback-r7.json) record exact delivery. Eight discrete HD yaw views, unverified hidden Original shaft speed, user appearance acceptance and Windows remain explicit limits. R6 technical evidence is preserved; its appearance was rejected. No D/new E or remote push.

## Feedback R8 continuation (2026-10-04)

R7 appearance was rejected for the Gatling center and Grinder return-state paint. R8 registers the entire rounded receiver envelope independently from its offset side ornament, restores the Grinder's native looping idle rotor window and body-matching owner data, and displays mind-control arcs when either endpoint is selected. Complete independent 2X/4X temperate/snow resources change four C selections; 29 remain selected. Export/pixel preservation, focused tests, native yaw/actions, actual Desktop 4X-temperate and 2X-snow cases, launcher, offline playback and full ZIP/extraction/signature checks pass. [The R8 report](yuri-buildings-feedback-r8.md) and [receipt](yuri-buildings-feedback-r8.json) record the exact Desktop delivery. Eight discrete headings, native rotor phase restarts, user visual acceptance and Windows remain explicit limits. Accepted UI/loading/map evidence and older artifacts are preserved. No D/new E or remote push.
