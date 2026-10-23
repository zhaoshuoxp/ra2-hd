# M1.6a Soviet Power Plant HD

Current status: `M1_6A_ACCEPTED_AND_DELIVERED / DESKTOP_GAMEPLAY_TECHNICAL_PASS / FINAL_VISUAL_ACCEPTED`. The user explicitly accepted the delivered final version. The bounded milestone is closed; delivery, preserved technical limits and the separate acceptance receipt are below.

## Historical representative checkpoint — 4c995c6

Status at that checkpoint: `REPRESENTATIVE_ART_REVIEW_PENDING`. The representative artwork and fixed-size actual-renderer review are ready. Stop for the user's art-direction decision before full-family expansion. Nothing is registered for normal-game NAPOWR loading yet.

[Self-contained native-size review](../.artifacts/m1-6a/review-v1/review.html) · [Direct overview](../.artifacts/m1-6a/review-v1/native-size-overview.png) · [Source/export/runtime trace](../.artifacts/m1-6a/review-v1/source-export-runtime.png).

## Baseline and authorization

The initial checkout was clean at `da3a782`, following runtime checkpoint `3e2eb26`. The current execution brief explicitly records the user's M1.5 R3 Mac acceptance in the planning conversation. Historical M1.5 reports still contain their earlier pending labels; they are preserved rather than rewritten. Windows R3 remains NOT RUN on actual Windows; iCloud transfer remains UNVERIFIED.

This task is bounded to temperate NAPOWR. Read the full instruction at `/Users/Aone/Documents/Codex/2026-09-10/referenced-chatgpt-conversation-this-is-an-2/outputs/m1-6a-soviet-power-plant-hd.md`. Ordinary post-approval authoring, export, integration, tests and a new local Mac review app are already authorized. Representative art approval and final visual/gameplay acceptance are separate user gates.

Changes are evidence tools, documentation and a dormant NAPOWR source-identity contract in `napowrHdFamily.ts`. It is not imported by the game entry and does not activate an override. Accepted artwork, existing resource packs, applications, normal `dist` and source installation remain unchanged; the preservation comparison detected three old-profile GPU-cache files changing during this session, as recorded below. No subagents, push, publication, new service, reimport or other asset production occurred. The review uses a task-owned loopback server and disposable Chrome context, not the normal profile.

## Verified resource family

`extract.ts` reads only staged `.local/assets/ra2/{ra2,language,multi}.mix` through `retailTree` and resolves archived rules/art. It uses current `ImageFinder`, `BuildingAnimArtProps`, `BuildingShpHelper`, `AnimProps` and `ShpAggregator`. The data is retained under `.artifacts/m1-6a/source-v1/`; every native frame includes its trim, indexed pixels, palette and empty flag. Native canvas is **210 × 140**, foundation **3 × 2**, art height **3**. Native even padding is `[width + width % 2, height + height % 2]`; density never changes that logical geometry.

| Member | Archive | Native frames | Planned authored slots | Retained native data | Aggregate offset |
| --- | --- | ---: | --- | --- | ---: |
| `ngpowr.shp` | `ra2.mix/generic.mix` | 6 | 0–2 | Shadows 3–5 | 0 |
| `ngpowr_a.shp` | `ra2.mix/generic.mix` | 76 | 0–37 | Shadow-shaped tail 38–75, unused by active loops | 3 |
| `ntpowrmk.shp` | `ra2.mix/isotemp.mix` | 52 | 0–25 | Construction/sale shadows 26–51 | 79 |

Hashes, in the same order:

- `7030206e7d9a740bb61852850449040b83c18a29888fb22926bf5e3304af9797`
- `6183c17408f0b81037b099b0619eff6d4afa914f3bea3b6d38c437d99bc914d1`
- `4eb96ebbb43abb1d8340850248e8e1bc5294da3b1f13fe81be5bc359c49a649d`

The aggregate has 210 slots: body 0–2, active 3–78, construction 79–104, body shadows 105–107, empty aggregate activity-shadow placeholders 108–183 and construction shadows 184–209. The activity art has no `Shadow=yes`, so all 76 source images enter its aggregate range, although its loops never play the tail.

The conservative full-family target is **67 authored slots** (3 + 38 + 26), not GAPOWR's 44. Current ordinary gameplay uses 64 of these slots: body 0/1, activity 0–17 or 19–36, and construction 0–25. Body 2 and activity 18/37 are additional native slots to cover explicitly without changing native sequencing. Body 2 is not a natural third damage stage: `Building.computeDamageType` collapses red condition to damaged frame 1 for this non-occupiable building. Early extraction labels `critical` in the retained reference board are diagnostic frame selections, not natural health-state evidence.

`NAPOWR_A` starts at 0 and the existing `AnimProps` interprets `LoopEnd=18` as inclusive runtime endpoint 17. Damaged `NAPOWR_AD` starts at 19 with runtime endpoint 36 (`LoopEnd=37`). Both use rate 300 / 60 = 5 times the native game-speed multiplier. Buildup runs 0–25; sale reverses 25–0. `Building.createAnimObject` replaces the generic construction rate with `26 / (60 × BuildupTime)`, where staged `BuildupTime=0.06`. No rate or loop correction is selected.

Body depth offset is 0; first activity and buildup layers use offset 1, damage fire offset 3. Activity X/Y offsets are zero. Archived `ActiveAnimZAdjust=-5` is recorded but this caller does not apply it; no new interpretation is introduced. Body and activity carry almost the same building architecture; the activity layer adds electrical changes. Final production decomposition must preserve that contract. No bib or turret is declared. Native base slabs belong to the building and remain artwork, not removable background.

Body/activity use the unit palette (`unittem.pal`) with owner shades 16–31; retained effects keep their native palette selection. Source hashes for rules, art and palettes are in `dependencies-v2.json`. Rules remain cost 600, strength 750 and power 150. Selection, collision, foundation, placement, production timing and camera remain unchanged.

## Retained shared dependencies and theaters

`dependencies-v2.json` records archive/member/hash, canvas, frame counts and declared sequences for 17 shared SHPs: six destruction effects (`TWLT070`, `S_BANG48`, `S_BRNL58`, `S_CLSN58`, `S_TUMU60`, `tstlexp`), six debris animations, three damage fires (`FIRE01/02/03`), and two declared smoke images (`SGRYSMK1`, `LGRYSMK1`). None is newly authored. `SparkSys` has a procedural color list rather than a SHP image. Native `DamageFireOffset0=-12,30` is retained. The current `DamageSmokePlugin` actually chooses `SGRYSMK1`; the other declared particle systems are inventory dependencies, not proof of their execution. Destruction and debris retain existing native behavior.

Snow resolves `napowr.shp`, `napowr_a.shp`, `napowrmk.shp` from snow/isosnow archives with different source hashes. A raw `napowr.shp` lookup is therefore a snow trap. Urban reuses the generic body/activity hashes, but resolves `nupowrmk.shp`; its construction bytes happen to hash identically to temperate. Both unsupported theaters must remain entirely Original. **Matching names or even bytes cannot substitute for the theater gate.** The dormant complete-source contract rejects actual staged snow resources and urban generic-hash reuse: PASS (11 assertions, including missing, duplicate, wrong-hash, wrong-canvas and incomplete-frame sources). Ordinary-game fallback with a complete authored candidate remains NOT RUN until post-approval integration.

## Artwork and transformations

Four sequential built-in `image_gen` calls authored normal, damaged, construction frame 12 and a local electrical variant. Exact prompts, untouched RGBA outputs and SHA-256 provenance are in `.artifacts/m1-6a/art-v1/`. Original architecture, state references and current runtime screenshots are retained in `references-v1/` and `runtime-original-v1/`. Accepted Conscript/GAPOWR/Rhino in-game views were inspected for secondary material/integration context. No CLI/API fallback, procedural replacement or enlarged-retail-pixel filling was used.

The 1387 × 1134 outputs preserve recognizable brick pylons, red top/front panels, central blue-white sphere, right pipes and native base arrangement. The construction sample follows the original open shaft before the reactor and pipes appear. Damage edits retain the chosen normal master as their reference. These remain unapproved representative art; assistant inspection is not user acceptance.

The electrical edit is composited over the normal master only inside a documented effect mask. Measured unchanged RGB outside that mask: **0 changed pixels**; unchanged alpha: **0 changed pixels**. This intentionally reuses the static structure instead of regenerating each active frame. Whole-loop authoring and motion acceptance remain pending.

`export-samples.py` uses uniform scale/translation and linear-light premultiplied area resampling into native trim/padding at 2x and 4x. Source crops support both densities without upsampling. No nonuniform warp is used to hide proportions. Source alpha remains real RGBA; no matte removal was necessary. The normal source outline touches its canvas bounds, which is disclosed; no missing extension was invented. Exports and per-image transforms are in `exports-v1/report.json`.

Owner masks intersect expanded original remap support with authored red regions, retaining a 16-level shade channel and excluding neutral masonry/blue emission. Every representative export has at least ten shade values. Two-owner-color visual acceptance is pending the complete-family stage; a red-owner preview does not close that gate.

## Current runtime evidence

The current source was built to `.artifacts/m1-6a/build-representative-v1/`. The final gate build at `build-final-gate-v1/` has all 152 files byte-identical, verifying the dormant contract does not affect the normal runtime payload. An ordinary Soviet MP01T4 match legally deploys its MCV, produces and places NAPOWR, then the review freezes the animation loop and selects render frames. `runtime-original-v1/` saves 67 native slot captures plus representative controls. These are forced render-state coverage, not natural execution of all gameplay states.

`runtime-candidate-v2/` contains 24 same-state captures: four states × two output modes × Original/2x/4x art. CSS and logical presentation are 1600 × 900, DPR 1, camera unchanged. Actual buffers are 1920 × 1080 and 3840 × 2160, with renderer ratios 1.2 and 2.4. This is browser framebuffer evidence, not physical-panel or Electron validation. Each review scene occupies exactly 400 × 260 CSS pixels; the building is about 115 × 94 logical pixels. Narrow screens scroll instead of scaling the comparison.

The explicit partial-family diagnostic puts the full authored master on the native activity layer and uses a transparent body texture while retaining the body's indexed shadow. Construction uses its native layer. This permits current production-C rendering and geometry checks without enabling an incomplete normal-game family. It does **not** certify powered-off body art, final body/activity decomposition, shared fire composition, full animation, normal-game integration or complete-family fallback. The neighboring Construction Yard, Rhino and terrain are Original controls; Conscripts use the accepted HD pack.

All 16 Original/candidate comparisons retain identical tick, camera, logical size and native model vertices. No changed pixels occur outside the bounded NAPOWR region. GL errors are zero. Uploaded review textures are independently allocated, use the existing sRGB/data texture conventions and production-C material, and all 24 texture objects release. These representative allocations are not measurements of the future full-family allocation.

The first diagnostic capture (`runtime-candidate-v1/`) **failed visual texture binding**: cloned textures shared the Conscript template's underlying Source, yielding the wrong atlas on NAPOWR geometry. Its original technical receipt is superseded by the adjacent `visual-failure.json`. Independent DataTexture construction fixes the review harness; v2 was visually inspected and checked. No accepted resource bytes or production renderer code were changed. Two restricted-sandbox loopback starts also failed; the task-owned server then ran with authorized escalation. All failed evidence remains retained.

## Validation and current gates

| Gate/check | Result |
| --- | --- |
| Source identities and animation inventory | PASS, including live staged snow/urban contract rejection; native/spare/tail distinctions above |
| Representative exports and geometry | PASS, 16 paired captures and no changes outside the building region |
| Activity structure invariance | PASS for this representative local effect sample only |
| Native-size self-contained review | PASS, 22 images, 1440/600-wide browser views, JavaScript disabled, no external requests |
| Relevant unchanged HD/R3 regressions | PASS: 13 tests, 205 assertions across four files |
| Entry typecheck / isolated current-source build | PASS / PASS; existing chunk advisory retained |
| `REPRESENTATIVE_ART_ACCEPTED` | PENDING explicit user decision |
| `COMPLETE_FAMILY_VALIDATED` | NOT RUN; expansion awaits representative approval |
| `DESKTOP_GAMEPLAY_TECHNICAL_PASS` | NOT RUN; new Mac app follows full-family integration |
| `FINAL_VISUAL_REVIEW_PENDING` | Final gate not reached; no delivery acceptance claimed |

Preservation uses `scripts/m1/napowr/preserve.py`, adapted from the existing desktop inventory to include M1.5 evidence/apps and both old profiles. The first snapshot was taken after creating the task's preservation script, so its Git receipt lists that new task directory; the initial shell independently confirmed a clean baseline. Source installation metadata and core archive hashes, all `.local` files, previous milestone directories, normal `dist` and old profiles are protected. The inherited snapshot lists existing top-level artifact files as roots without hashing their contents; no task command writes them.

Strict whole-tree preservation comparison: **FAIL**, limited to three `data_1` files in the old M1.5 profile's GPUCache, DawnGraphiteCache and DawnWebGPUCache. All other 48,911 inventoried entries and core source hashes match. An existing M1.5 app is still running as PID 84999 (parent 1), with its GPU helper pointing at that profile. This supports live-cache drift, although the exact writer was not traced. This task launched only isolated Chrome, did not launch Electron or write the old profile, and leaves these caches and the existing app untouched. `preservation-differences.json` records the exact changes; cache drift is not silently removed from the failed result or repaired by overwriting user data.

## Continue after the representative decision

Open the linked review at 100% zoom. Judge whether this direction is worthwhile at normal gameplay size, keeps NAPOWR recognizable and fits the accepted assets. If approved, continue in **this M1.6a task** with the already-authorized 67-slot family, final body/activity decomposition, source-aware remap checks, whole-family 4x → 2x → Original fallback, normal persisted graphics controls and bounded natural Soviet gameplay. Retain the native timing, shared effects and geometry. Add only narrowly necessary family machinery and assertions after the verified identities; no speculative framework is needed.

Then deliver a new versioned Mac review application and companion resources using a new review profile, built from the actual source, preserving all R3 apps/ZIPs and old resources. Precise app/resource launch instructions belong to that later handoff. No new application exists at this first art gate. Stop again for explicit final visual/gameplay acceptance; only that confirmation permits `M1_6A_ACCEPTED_AND_DELIVERED`.

If this representative direction is rejected, preserve all originals and await the user's specific revision direction. Do not automatically expand another building or start a new task.

## Representative decision and authorized continuation

The user explicitly accepted the representative direction and requested continuation. `.artifacts/m1-6a/representative-acceptance.json` pins the reviewed artifact and checkpoint. Status is `REPRESENTATIVE_ART_ACCEPTED / COMPLETE_FAMILY_IN_PROGRESS`; final visual/gameplay acceptance remains pending. The complete optional family, normal integration, tests and a separate Mac review app are now in progress under the existing authorization.

## Complete optional family

The user's explicit acceptance and request to continue accepts the representative direction, not final whole-family appearance. The separate receipt is `.artifacts/m1-6a/representative-acceptance.json`. All 67 authored slots now have 2x and 4x exports (134 images and their remap images). The full source inventory and 17 shared original SHPs above remain applicable; no shadow or shared-effect art was replaced.

Six generated masters contribute pixels: the four approved representative images, a local static-body chamber edit, and an early foundation. A seventh low-pylon generation is retained as an unused study. Exact prompts, references, raw copies and hashes are in `art-v1/` and `full-art-v1/provenance.json`. Production deliberately reuses stationary architecture. Activity composes the two authored local discharge patterns and intensity phases inside a fixed mask; it does not independently regenerate 38 buildings. Construction crops/translates authored brick courses, installs authored machinery and uniformly grows the authored sphere. Body slot 2 reuses damaged slot 1, matching identical native indexed pixels. No retail RGB fills or nonuniform geometric warps are used. The minimum source density is 11.93x; neither export requires upsampling.

`compose-family.py` produces `full-exports-v2/`; `candidate-review.json` records every output and transformation. Native silhouette support is used for early construction alpha cleanup and source-aware remap support. `check-exports.py` validates all 134 exports, stable activity alpha/architecture, 16-level remap semantics and unchanged non-remap pixels under blue/yellow colors. Actual registered game palettes are also captured through the production material. Retained failures: v1 construction had ramp remnants and premature orb pixels; v2 corrects them. The raw images and v1 exports remain intact.

The external family is `.local/hd-packs/soviet-power-plant-authored/2/family.json`, SHA-256 `3711cd6fbd74a68994db9d427064ec7d673a3d8e192e8b14722eb515ec61f269`. Its three manifests are separately pinned by that file. Revision 1 is retained but unselected because its 4x atlas allocation exceeded the unchanged 64 MiB limit. Revision 2 splits partially filled final rows into tight pages. On-disk base and data images retain the existing RGBA8 contract. Only verified temperate NAPOWR sources upload validated R/G remap channels as RG8; constant B=0/A=255 are checked before packing. Existing Conscript/GAPOWR allocation and rendering paths are unchanged.

| Density | Actual texture bytes | MiB | Pages / textures |
| --- | ---: | ---: | ---: |
| 2x | 16,966,656 | 16.18 | 5 / 10 |
| 4x | 66,712,416 | 63.62 | 6 / 12 |

The native Electron probe observes six RG8 and six matching SRGB8_ALPHA8 `texStorage2D` allocations, each with one level; these dimensions give the reported 4x bytes. This measures requested texture storage, not unobservable driver bookkeeping. Existing page size, eight-page-per-member and 64 MiB family limits remain enforced. A missing member, mismatched theater/source/hash, incomplete frame list, invalid page or allocation failure rejects the whole density, releases partial allocations, then retries 2x or Original. A 1900-pixel hardware limit rejects both current variants because the 2x construction page is 2048 wide; this correctly selects Original rather than exceeding the limit.

## Production wiring and native evidence

`loadPowerPlantHd` and its family coordinator have a bounded explicit NAPOWR branch; the default GAPOWR contract is preserved. Native image objects, pinned source hashes and the temperate gate bind the complete family. `ImageFinder` aggregates only the authored native ranges, leaving all tail/shadow slots original. The normal single-player lifecycle loads and disposes NAPOWR independently. A fourth ordinary graphics choice, “Soviet Power Plant (temperate)”, is appended to saved settings; older seven-field preferences keep all prior choices and default NAPOWR to Original. The change applies next match. No fixture is imported by the app entry.

The isolated native app uses Electron 44.4.0 on macOS arm64 and a separate profile. `desktop-gameplay-v4/` records normal Soviet lobby, deployment, placement and production, including accepted HD Conscript and Rhino. The reactor naturally reaches 45.87% health under native friendly force-fire, repairs to 100%, sells, rebuilds and is destroyed under native damage. Cost 600, strength 750, power 150 and legal placement remain native. Both green/damaged activity sequences are observed without changing rules or animation timing.

`desktop-lifecycle-v1/` completes ordinary abort/results navigation, verifies NAPOWR and other SHP textures are released and Rhino references reach zero, naturally builds accepted Allied GAPOWR in a separate Allied match, repeats cleanup, and checks disabled Original settings. Saved four-family choices survive a quit/relaunch. `desktop-evidence-validation.json` joins these bounded evidence sets without changing their historical statuses. The original v4 run stops on a harness-only confirmation-label lookup failure after its Soviet checks; the corrected lifecycle run passes. Earlier harness failures (wrong 0–1 health assumption, GPU probe attached before a renderer existed, and an unregistered custom palette) are retained. These needed test corrections, not gameplay changes.

The [complete native-size review](../.artifacts/m1-6a/final-review-v3/review.html) is self-contained and fixed at 340x260 reference pixels per panel, with actual world-rendered normal/damaged/construction comparisons, active/build/sale loops and registered blue/yellow owner colors. The same-tick Original/HD pairs preserve vertices, camera, pose and logical size, with zero changed pixels outside the building region. Terrain, adjacent original buildings, original shadows, foreground/background occlusion, shroud and accepted units remain visible controls. The final loops are frozen-scene render sweeps at the observed default multiplier 6: active 30 fps and construction 43.33 fps. The normal game retains all original speed scaling. The earlier review-v1 reference-rate sweeps remain preserved.

Final visual inspection rejected earlier Original/HD controls because direct override reassignment retained the prior HD material cache. Those images and receipts remain preserved; `final-review-v1/` and `final-review-v2/` have explicit comparison-failure receipts and are superseded. The corrected capture transitions builders through valid uncovered indexed slots before changing the binding, then restores the requested native frame. It does not change production code or normal next-match graphics behavior. An intermediate diagnostic attempt incorrectly advanced a parent shadow index and failed before capture; that failure is also retained. The final v3 probe passes material-type assertions and positive-difference checks (6,770–36,911 changed pixels per pair), with identical tick, geometry, camera and unaffected surroundings. Earlier combined receipts without that positive-difference check must not be used as comparison evidence.

Actual comparison dimensions: logical 1242.72x900, CSS 1279.99x927, DPR 2; buffers 1491x1080 and 2982x2160. This is 1080/2160-high sampling at the current aspect, not physical 3840x2160 panel validation. Reference review panels use the accepted 900-high display scale, without camera enlargement.

Relevant checks currently pass: 36 tests / 992 assertions across NAPOWR source/pack, existing building/SHP/coverage/binding/profile and desktop/R3 tests; entry typecheck; full exports; actual GPU allocation; spatial/color comparisons; native Soviet behaviors; Allied regression; saved options; match disposal. Disposable-resource fallback and the exact delivered-app checks also pass, as recorded below. Automated results never substitute for the final user's visual/gameplay decision.

## Final Mac review delivery

Build checkpoint: `77ff7d59dd9555362c76ec0deb0a9fa93808f7cc` (clean source snapshot). The application was built from that checkout, not a historical milestone artifact. Its source digest, file hashes and original packaging receipt are in `build-2026-09-20T04-05-21-444Z/artifact.json`; the superseding `delivery-validation-corrected.json` records completed validation without rewriting the packaging receipt. All 163 allowlisted payload files match, and current runtime source files match the build snapshot. Retail data, artwork/masks, registrations, profiles and diagnostic harnesses are excluded from the app. This remains a local development Electron bundle, without signing/notarization or publication.

- [New M1.6a Mac review app](../.artifacts/m1-6a/build-2026-09-20T04-05-21-444Z/Red%20Alert%202%20HD%20M1.6a.app)
- [Final fixed-size review and default-speed loops](../.artifacts/m1-6a/final-review-v3/review.html)
- [Direct native-size overview](../.artifacts/m1-6a/final-review-v3/native-overview.png)
- [Delivery and resource identities](../.artifacts/m1-6a/delivery-validation-corrected.json)

Launch exactly this new bundle:

```sh
open "/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-6a/build-2026-09-20T04-05-21-444Z/Red Alert 2 HD M1.6a.app"
```

The new default profile is `~/Library/Application Support/RA2 HD M1.6a`. It does not migrate old options. The existing `RA2 HD` resource registration currently points to `/Users/Aone/RA2remaster/ra2-hd/.local`; the new app reads that registration and stores its own copy under the new profile. The verified retail/support files and prior accepted packs stay in place. New NAPOWR family/member directories use revision 2. No external-resource ZIP or old app/profile is replaced.

If the resource chooser appears, select `/Users/Aone/RA2remaster/ra2-hd/.local` (Finder Go to Folder can enter the hidden path), not the `hd-packs` subdirectory. No reimport is needed. In ordinary Options choose **Soviet Power Plant (temperate) → HD**, return, then start a temperate Soviet offline skirmish. The choice applies next match. Conscript, the Allied Power Plant and Rhino remain separate optional choices; older settings retain their values and a new profile starts with Original. Restore Original for NAPOWR at any time before the next match.

The exact delivered app has a complete successful run in `desktop-gameplay-final/result.json`: ordinary Soviet production, accepted Conscript/Rhino in the scene, natural damage/repair/sale/rebuild/destruction, ordinary match exit, texture/reference teardown, separate Allied GAPOWR construction, second teardown, disabled Original controls and quit/relaunch preference persistence. Runtime errors and console errors are empty. `desktop-comparison-v3/healthy-napowr/` supplies corrected registered-color and same-frame comparisons from the exact delivered app. `desktop-evidence-corrected.json` verifies actual storage formats/bytes, positive Original/HD pixel differences in all eight pairs and zero changes outside NAPOWR. Visible material types are asserted separately in each control. The comparison capture has no runtime or console errors; its subsequent deliberate non-allowlisted route request produces the expected HTTP 404, recorded separately in `desktop-comparison-console-check.json`. `desktop-material-final/result.json` additionally observes actual NAPOWR draw calls using `HdSpriteMaterial`, enabled filtering, opaque pass 1 and soft-edge pass 2 with native depth behavior, confirming production C in the exact final app. The app launches with cwd `/private/tmp`, uses `ra2://game/`, and makes no accepted remote requests; no local server is needed.

`desktop-fallback-v1/result.json`, also from the exact delivered app, passes three isolated external-resource cases: missing NAPOWR → Original; a corrupt 4x activity page → all three members at 2x; corrupt 4x and 2x pages → all three Original. Conscript and Allied Power Plant remain 4x and Rhino remains ready in every case. Each scenario naturally constructs a reactor with cost 600, full health 100 and actual power 150. Only disposable copies were corrupted. The source identity test separately rejects real staged snow and urban resources; their loader theater gate keeps those theaters Original.

Physical mouse selection attempts in the automation session did not acquire Pointer Lock or select a unit. They remain **PHYSICAL_SELECTION_UNVERIFIED**, including the Original control; geometry/projection/placement checks pass. The final user should verify click selection and ordinary interaction manually. Windows, physical 4K-panel output and iCloud transfer remain NOT RUN; no extended endurance or human victory claim is made.

Final preservation checks cover 48,914 pre-existing entries and source archive hashes. All old artwork, resources, applications and normal `dist` payloads remain byte-identical. There are 58 new `.local` entries, all under new Soviet Power Plant pack paths; the parent `hd-packs` directory metadata changes accordingly. Strict old-profile equality remains **FAIL**: the three previously recorded GPU-cache files and an additional `DIPS-wal` runtime database file differ in the old M1.5 profile. PID 84999 and its helpers are still running against that old profile. The exact writer was not traced; all task Electron sessions explicitly use new isolated profiles. The old app was neither stopped nor relaunched, and no old-profile overwrite or repair was attempted. See `preservation-final.json`, `preservation-final-summary.json` and `preservation-final-processes.txt`; these differences are not hidden by the payload-preservation pass.

| Final gate | Status |
| --- | --- |
| `REPRESENTATIVE_ART_ACCEPTED` | Explicit user acceptance recorded |
| `COMPLETE_FAMILY_VALIDATED` | PASS: 67 slots, 2x/4x, native mapping/remap/fallback |
| `DESKTOP_GAMEPLAY_TECHNICAL_PASS` | PASS for the bounded exact-app automated scenarios; physical input limit above |
| `FINAL_VISUAL_ACCEPTED` | Explicit user acceptance of the delivered final version |
| `M1_6A_ACCEPTED_AND_DELIVERED` | SET by explicit final user confirmation |

## Final user acceptance

The user explicitly accepted the final delivered version after receiving the complete-family Mac app, corrected native-size review, resource instructions and disclosed limits. The separate [acceptance receipt](../.artifacts/m1-6a/final-acceptance.json) binds this decision to the exact delivered app, source checkpoint and family manifest. This closes the bounded M1.6a visual/gameplay acceptance gate. Historical review pages and delivery receipts retain their original pending labels as evidence; the acceptance receipt supersedes that pending status without rewriting them.

Acceptance is not a new instrumented physical-input test and does not convert the recorded profile-preservation failure or unrun platform checks into PASS. Keep the accepted artwork, app, resource revision, optional setting and accepted M1.5 R3 foundation unchanged. No rebuild or additional asset work follows automatically. Future M1.6a corrections stay in this task; a separately selected next building belongs in a new execution task.
