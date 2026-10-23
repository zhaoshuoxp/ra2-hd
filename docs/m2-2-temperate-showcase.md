# M2.2 temperate showcase

Status: **M2_2_ACCEPTED_AND_DELIVERED_MAC_LOCAL_MAIN_INTEGRATED**. The user accepts the remaining bridge seams as visually acceptable. The independent coverage audit finds no substantial visible production gap. Selected terrain v9 and environment v6 are integrated into local main, with inherited world/UI/prepared/dist payloads preserved. The exact accepted R7c runtime is delivered as a new verified Desktop Mac ZIP; fresh extracted 2X/4X map checks pass. See [final acceptance](m2-2-final-acceptance-20261007.json), [main integration](m2-2-main-integration-20261007.json) and [handoff](m2-2-final-handoff.md). Earlier review-ready entries below remain historical evidence.

Worktree: `/Users/Aone/RA2remaster/ra2-hd-m2-2-temperate`, branch `task/m2-2-temperate-showcase`. Work remains sequential in this conversation, without agents. The authorization and direction gate come from sections 3–8 of the user's 2026-10-07 request. Direction approval permits category expansion; final combined visual acceptance and technical checks precede the already-authorized M2.2 main promotion.

## Authoritative map identities

| Role | Edition/member | Archive | SHA-256 |
| --- | --- | --- | --- |
| Primary | YR `xmp03t4.map` | `multimd.mix` | `7a390de363f79743dd54897a49302869a795f839f3387ff03e8c0b70a519e17e` |
| Counterpart | RA2 `mp03t4.map` | `multi.mix` | `eab7d48cdb16a5317c17323e7b9c19c5e79146dfcf7a1df5a96b359b9fb45315` |
| Reuse control | YR `xmp19t4.map` | `multimd.mix` | `d8eaa221467ebe932c1508f60dfadb17b2660f51ec7527c7d53865a0151f5bad` |

The primary map has 573 terrain objects, 80 structures, 45 vehicles, two COW infantry, no aircraft, 659 overlays and no smudges. Its RA2 counterpart has the same counts except 660 overlays. Comparing parsed records independently of their order identifies three meaningful differences: YR uses `CATHOSP` instead of RA2 `CAHOSP` at `(58,104)`; RA2 has one extra overlay ID 102/value 0 at `(85,72)`; YR adds waypoint 699 at `(82,82)`. Tiles/heights, placed terrain, vehicles and infantry match. Hospital art resolves to the same native `cthosp.shp`, but the rule identities remain separate. Edition rules and the existing `YAYARD` override are retained.

The source snapshot contains exact retail map bytes and parsed objects. No map layout, passability, resource behavior, starts, AI, native production, geometry, camera or output scale is changed. The second map is a reuse control, not a second complete-map production scope.

## Coverage and production order

[Machine-readable coverage/state ledger](m2-2-map-coverage.json) records 258 accepted HD reuse identities, 375 missing HD identities, zero currently demonstrated existing-HD binding failures, one intentional native registry exception and 62 control-only rows. These are identity rows, not placed-instance counts or live binding measurements. The zero binding-failure count reflects no new demonstrated failure; it is not a claim that every runtime binding has passed.

| Missing kind | Identity rows | Planned batch |
| --- | ---: | --- |
| TMP | 177 | Thick grass/LAT, remaining pavement/roads, shore/water, crops, water bridges and waterfall contacts |
| Terrain animation | 2 | WB01X/WB04X native phase and contact closure |
| Terrain props | 32 | Trees, rocks/props, signs and native resource-spawning trees |
| Overlay | 102 | Ore/gem amount families, rocks/fences, concrete/wood bridge damage/repair families |
| Civilian/technology building | 48 | Normal/damaged/occupied/rubble and applicable native dependencies |
| Neutral VXL vehicle | 13 | Complete headings, native palette/owner behavior and relevant actions |
| Neutral infantry | 1 | COW native action/frame/shadow closure |

Aliases share source production where valid without collapsing rule identities: the 48 building identities currently resolve to 47 body source members, and overlay aliases also share native bytes. Native ore/gem amount and regrowth ranges and both 26-member low-bridge families are included even when a variant is reached only through normal play. `DUMMYOLD` is a non-renderable, unregistered range endpoint with no native rules/art and zero placements; it requires no invented pixels. No substantial object is exempted.

Accepted M2.1 material and native TMP evidence are reused; none of the accepted 305-member/742-image production is redrawn. M1 faction units/buildings remain accepted-resource reuse during normal play. Any observed Original binding must first be traced to edition/theater, source identity, preparation, allocation or fallback.

## Concrete direction review

Offline review: `/Users/Aone/RA2remaster/ra2-hd-m2-2-temperate/.artifacts/m2-2/direction-review-v1/index.html`. It embeds exact native reference boards, five generated representative direction sheets, representative Original/2X/4X density pilots and the actual copied M2.1 scene as baseline context. The baseline screenshot contains no composited new art. Density pilots are single-slot registration studies, not complete-family exports or in-game evidence. Larger building masters must be authored individually at adequate resolution during approved production.

Standalone offline delivery: `/Users/Aone/RA2remaster/deliveries/RA2-HD-M2.2-Directions-Offline-20261007/M2.2-Directions-Offline.html`. This single HTML file embeds all 38 images, CSS and comparison controls. It can be opened directly or moved elsewhere without a server, sibling resources or an installed game. The copied file is byte-identical to review 1, and all images/controls pass with browser networking disabled and zero network requests. See [offline delivery receipt](m2-2-offline-direction-delivery.json). This immutable delivery records the reviewed candidates. The later user direction decision is recorded separately below; whole-map acceptance remains pending.

The five directions are ground/shore/water, ore/gems/vegetation/rocks, civilian/technology buildings, concrete/wood bridges, and neutral vehicles/animals. This review selects material/style. Native contact geometry, silhouettes, occupied pixels, anchors, lighting, native shadows, frame order and state behavior remain implementation requirements even after a direction is approved. Fine alpha/color fringes on raw studies are not runtime-ready pixels; final registered outputs need geometry and visual verification.

New raster studies used the built-in `image_gen` tool with exact native guides, accepted M2.1 materials and M1 in-game style. Original tool outputs are retained and copied exactly into task-owned authoring storage. Prompts, reference/output hashes, rejected bridge study and selected revisions are recorded in the authoring provenance. The bridge v1 study was internally rejected for background haze and enlarged pixel-detail appearance; v2 is the review candidate. This internal correction does not substitute for user approval.

User decision, 2026-10-07: all other directions approved; the water is too blue and must match the Original effect. Ground, resources/props, civilian buildings, bridges and neutral actors may expand without another direction approval. Water correction is authorized toward the native subdued blue-gray/violet palette, brightness and foam contrast. Later feedback restores the original direction-v1 waterfall exactly and limits the color correction to the top-right shore/sea and bottom-left sea panels; top-left grass remains the original master. The altered waterfall in water-v2 is rejected and retained only as historical tool output. Per-panel master identities are pinned in `.artifacts/m2-2/authoring-water-v2/panel-selection.json`. Preserve the historical review and tool masters. This decision does not establish complete-family, runtime-state or whole-map acceptance.

The corrected standalone review is `/Users/Aone/RA2remaster/deliveries/RA2-HD-M2.2-Directions-Sea-Correction-20261007/M2.2-Directions-Sea-Correction-Offline.html`. Its 39 embedded images pass offline checks with zero network requests. The grass and original waterfall regions have zero changed pixels. The sea sprite's edge is included across the otherwise unused center gutter. The final per-panel selection is pinned in `panel-selection-v2.json`; [delivery receipt](m2-2-offline-sea-correction-delivery.json) retains the exact HTML and verification hashes. Earlier deliveries and failed launch/race observations remain intact.

## First production batch

[Batch receipt](m2-2-batch1-production.json) identifies the first complete exports: 38 thick-grass/LAT TMP members and six single-body tree families, each with independent 2X/4X sampling. The accepted three V13D groups and atlas files are reused byte-for-byte. Source identity and geometry, native alpha, TMP gutters/placeholders and family dependency closure pass verification. The SHP resolver validates actual PNGs, counts pooled GPU and retained CPU bytes, checks over-budget fallback before upload, and releases every texture. Tree totals are 555,416 bytes at 2X and 1,904,408 at 4X under the existing world allowance. The 23 focused tests, 536 assertions and entry type checking pass; scene-matrix regression checks also pass. These exports await actual map binding and native removal checks; they do not close the whole map.

Measured authoring checks rejected an invented sea cell in a grass board and three tree crops with insufficient actual 4X capacity. Isolated replacement masters retain the rejected tool outputs and their provenance. Export trials exposed a `remapable` field mismatch and nontransparent SHP gutter alpha; the corrected revision preserves transparent SHP padding and native owner indices. TMP uses its existing full RGBA extrusion convention. Failed receipts remain separate from successful reruns. Thirteen neutral vehicles now have 104 posed Original heading references from the copied M2.1 baseline; these are geometry/palette controls, not native action acceptance.

## Native input preparation and verification

`scripts/m2/showcase-inventory.ts` reads allowlisted retail archives, parses the exact maps with native map overrides and resolves art through the existing `ImageFinder` naming policy. It cross-checks accepted source hashes and catalogs before classifying production. `scripts/m2/prepare-showcase.ts` pins bytes before decoding, preserving TMP native metadata and SHP origin/size/order/empty slots/index masks. VXL body, HVA, VPL and palette provenance are retained. Building animation dependencies follow `BuildingAnimArtProps` and use the parent building palette as the existing runtime does; damaged-art parameters, offsets, reverse build/unbuild and shadow behavior are captured.

Immutable current inputs: `.artifacts/m2-2/source-v5` and `.artifacts/m2-2/prepared-native-v2`. The latter has 368 unique sources: 177 TMP, 178 SHP and 13 VXL, with 2,608 image/frame slots, including 582 empty SHP slots. `verify-showcase-inputs.py` checks source/dependency bytes, all RGBA/index hashes and sizes, index-to-alpha identity, empty slots and ledger pinning. Result: `PASS_PINNED_NATIVE_INPUTS`; source manifest SHA-256 `fa3d67c85575e6691c9a00757ae6d33ab4409b5922719683196b8df260d1a973`.

The accepted M2.1 transfer lacked the original inventory needed by its authoring helpers. The exact accepted `.artifacts/m2-1/inventory/inventory.json` was added exclusively to main, the integration worktree and this task, SHA-256 `89231e4132c30aaef29b0da988bc7017018f6bbb4ad01e07d76e2f98f6f00efd`. This is a separate authoring supplement; it does not change the accepted runtime resource pack or its original transfer receipt.

Raw failed inventory logs remain preserved: incorrect metadata helper use, the unregistered `DUMMYOLD` range endpoint and a syntax error were corrected before successful source-v5 parsing. Retail BLUELAMP/INBLULMP `LightGreenTint=0,01` parse warnings remain disclosed; native data is unchanged. Prepared v1 and earlier snapshots are retained rather than relabeled as the corrected v2.

## Final selected production

Terrain `temperate-m2-2-environment-v3`, manifest `45e02f8a17be81191dd716d9cb043601e43fd3ea03daf5b7b74bfeb9e3527d40`, adds 177 native TMP members / 724 images in five groups. The accepted three V13D groups, 305 members / 742 images, remain byte-identical. SHP `environment-m2-2-complete-v2`, manifest `629a5b392e423039e8a079ae16e2768f6428fc9497422d6a0bd3b605b645d809`, contains 98 complete canonical families, 178 source members and 978 body slots. Independent verification covers 1,956 density frames / 383 pages, 280 empty density slots and 76 shared declarations. All 33 earlier prop/waterfall members remain exact. Twelve new VXL families supply independent 2X/4X exports with eight bearings each; TRUCKA reuses the accepted source-identical DTRUCK body/HVA pair.

Production corrected 17 materially wrong SHP boards, two sparse-ore masters with insufficient actual capacity, reversed car bearings and two PTRUCK views. All 800 substantial SHP registrations pass measured 4X capacity. Retail masks, categorical owner indices, native shadows, body-local frame order, anchors and ISO-palette rubble remain the registration controls. TIBTRE02 and ore-name aliases reuse canonical pixels only after native source hash and metadata equality checks. No substantial placed object becomes an exception.

The first complete candidate passed its technical harness but failed internal full-scene visual inspection: water01/water05 sampled grass or shoreline instead of full water, and tree02/tree14/tree22 sampled a declared third row that did not exist in the actual two-row master. R4 reuses the approved full-water samples and correct actual second-row tree crops; no new artwork is generated. Ninety-five environment families and all earlier props/waterfalls are unchanged. Native deep-water material registration also prevents warm sand from being sampled inside native water portions of shore13/shore21/shore30. This is source/subtile material registration, with unchanged geometry and native edge control; it is not map-coordinate painting. Provenance, before/after selections and visual diagnostics remain in `.artifacts/m2-2/registration-correction-v1`.

A missing desktop terrain pin caused the intermediate R2 copied package to omit new terrain registration. Its raw failure remains intact. The final contract pins the selected v3 manifest, and packaging asserts all eight terrain groups and 98 environment families before signing. R3 was an intermediate registration candidate; R4 is the final selected runtime. Earlier technical passes do not establish their visual acceptance.

## Reusable rendering and resource limits

Map environment textures use the existing lossless categorical RG tile pool, preserving every owner/shade byte. Shared aliases are charged and disposed once. The primary map's environment charge is 74,856,308 bytes at 2X and 292,144,900 at 4X, including retained CPU and GPU texture bytes. Terrain charge is 130,080,012 / 507,796,748 bytes. All world baseline, eager and demand allocations are added to these charges; world limits remain 256 MiB / 1,280 MiB, prepared CPU 128 MiB, and independent UI 16 MiB.

The first candidate forced every HD tree/ore instance into individual meshes, introducing a measurable panning regression. Single-page HD families now use the existing native map-sprite batching path with bounded 128-sprite pages and shared borrowed textures. Multiple-page families retain their existing individual path. Native visibility, lighting, amounts, removal and original aggregate shadow frames remain independent of HD body-local frames. Regression tests compare every geometry vertex and pooled UV with the individual renderer and verify native overlay updates and texture lifetime. Fifteen focused tests / 10,342 assertions, five scene-matrix tests / 90 assertions and entry type checking pass. Earlier complete-family checks (22 tests / 17,937 assertions) are reused for unchanged mechanisms.

The 2X fixed world limit is a material residency limitation. The mixed six-actor performance fixture admits complete map environment and selected vehicles/buildings but atomically falls back to Original E1 and INIT; the admission receipt reports `combined-budget`. Several unplaced prewarmed Allied building requests also fall back. Their accepted artwork is unchanged. Both actors are HD at 4X. This is disclosed rather than hidden by raising limits or redrawing M1 assets. Native paid MTNK production, harvesting and combat select HD in the final 2X operation run. Use 4X for the complete-map HD visual review.

## Final copied native evidence

Frozen runtime source is `36686b7e81e915e3c7a7d6c502b5adcfc4233070`, built once in `build-complete-frozen-v6`, then packaged in `package-complete-frozen-v7`. A collector-only source edit after freezing appears in the packaging receipt; it does not alter the frozen runtime bundle. Final documentation/helper commits follow this immutable runtime identity.

| Evidence under `.artifacts/m2-2` | Result and scope |
| --- | --- |
| `copied-complete-actions-2x-v4` | PASS: 38 stages / six clips, selected bindings, native harvest/unload/depletion/regrowth, occupancy/evacuation, COW move/death, water phases, bridge passage/demolition/engineer repair, paid production/combat and damage/rubble |
| `copied-complete-states-4x-v4` | PASS: 29 stages / four clips, CAR/STANG/COP/CONA/TRUCKA native movement/turning/destruction, building damage/rubble and HD OFF/ON exit/re-entry/disposal |
| `copied-complete-ra2-2x-v4` | PASS: 21 native views on the independently resolved RA2 counterpart |
| `copied-complete-control-2x-v4` | PASS: 19 reuse views on XMP19T4.map, without claiming complete second-map production |
| `copied-missing-environment-2x-v4` | PASS: whole environment selection missing; native Original trees/buildings/COW remain coherent while terrain/VXL paths continue |
| `copied-corrupt-environment-2x-v1` | Reused PASS: corruption of unchanged CAGAS01 causes its whole body/rubble family to fall back; peer families remain HD |

The actual primary map publishes 97 encountered canonical environment families, with no unexpected Original selected environment identity. The unused complete family remains an exported dependency. Trees/ore/gems use actual HD batches (1,166 bindings in the 2X operation capture; the separate 4X snapshot records 1,139). Actual 42 LOBRDG27 bridge placeholders in both editions remain invisible through native `OverlayDrawable` policy, rather than missing visible HD art; the visible bridge family is complete. DUMMYOLD has no native rules/art and zero placements. VEINS is a zero-placement range member not reachable through this map's native ore/bridge behavior. These cases are recorded separately in the supplemental production/state resolution; the frozen inventory is not relabeled.

The 2X operation allocation totals 266,359,176 bytes under 268,435,456; the 4X state allocation totals 980,702,112 under 1,342,177,280. Native output remains 1489 × 1080 with logical viewport 1241.379 × 900 and zero GL errors. Fixtures use unchanged retail maps/rules/speed, a fixed seed, controlled legal actors, revealed shroud and suspended bot thinking. These representative native category checks do not claim every object's every action or an unconstrained natural match.

## Matched Mac performance

[Performance record](m2-2-performance.json) pins the raw final and integrated M2.1 observations. Same host, map, fixed seed, legal four-building/six-actor roster, camera sequence, framebuffer, viewport and speed; no concurrent build/compression runs during measurement. Each mixed/first-pan/sustained segment lasts eight seconds.

| Observation | M2.1 2X | R4 2X | M2.1 4X | R4 4X |
| --- | ---: | ---: | ---: | ---: |
| Map entry to fixture (ms) | 4,418 | 6,887 | 5,318 | 11,123 |
| Sustained mean / p95 (ms) | 16.67 / 17.19 | 16.67 / 17.15 | 16.67 / 18.12 | 16.67 / 17.57 |
| First-pan maximum (ms) | 18.63 | 18.67 | 18.58 | 18.65 |
| >50 ms intervals, all three segments | 0 | 0 | 0 | 0 |
| Maximum observed process resident sum (MiB) | 3,735 | 3,625 | 4,167 | 3,450 |
| Maximum sum of reported process peaks (MiB) | 4,571 | 4,889 | 5,065 | 5,433 |

The earlier unbatched candidate had sustained means 29.32 / 29.21 ms; final batching resolves that measured submission regression. Complete resource admission has a real entry-loading cost. The table reports display-paced RAF intervals on a 60 Hz Mac, not GPU/CPU frame cost or Windows FPS. Process memory is independent of contracted world bytes, and the sum of per-process reported peaks is not a simultaneously observed aggregate peak. This short route does not establish universal first-use or arbitrary battle-size performance.

## Review, delivery and acceptance

Final Mac app: `/Users/Aone/RA2remaster/deliveries/RA2-HD-M2.2-Temperate-Showcase-R4-20261007-macOS-arm64/RA2 HD M2.2 Temperate Showcase R4.app`. Launch its sibling `Launch-Isolated-Review.command` to use `M2.2-Review-Profile` and the complete sibling edition/UI resources. All 6,527 copied entries (6,513 regular files / 14 symlinks), hashes, modes, links and strict deep signature checks pass. Copies have independent inodes. All 4,995 shared accepted payload files match main exactly; two importer manifests retain their established semantic runtime projections. Main selectors and accepted prepared/UI bytes remain unchanged. A preliminary byte-equality check against the importer-only core manifest failed; the explicit expected packaging transformation is now verified rather than overwriting main metadata.

Single-file review: `/Users/Aone/RA2remaster/deliveries/RA2-HD-M2.2-Combined-Offline-R2-20261007/M2.2-Combined-Offline.html`. It embeds nine full-scene camera positions in Original / M2.1 / 2X / 4X, exact native center crops, 110 family export comparisons, nine state stills and ten native clips. No server, sibling media or network is required. PNG compression preserves every source pixel; export boards are distinguished from copied-runtime views. The 368,800,922-byte page discloses the 2X residency limit. Offline QA passes 377 image checks, exact current canvas crops, all 10 clip metadata/playback checks and zero network requests or page errors. Initial page QA encountered a startup navigation race; the failed receipt is retained, and the corrected check waits for initial loading before offline reload.

[Acceptance](m2-2-acceptance.json), [production/state resolution](m2-2-production-state-resolution.json) and [additive transfer](m2-2-resource-transfer.json) record source/build/resource identities, current checks, failures and pending decisions. Complete-map combined visual acceptance is pending; M2.2 remains on its local task branch and main stays at accepted M2.1. After acceptance, recheck main and integrate additively under the existing authorization. No push, publication, cleanup, adjacent theater or milestone occurred. Windows performance and physical input remain deferred. Continue review and fixes in this conversation; start a new execution conversation only after acceptance and a materially changed objective.
