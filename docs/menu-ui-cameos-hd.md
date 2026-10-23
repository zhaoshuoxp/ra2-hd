# Menu, loading, controls and cameo HD review

Status: `ACCEPTED_EXCEPT_PRODUCTION_FLICKER_AND_FACTION_LABELS`. The user accepted the delivered UI/artwork and requested only stable production icon edges and factionless unit/building labels. The correction implementation passes native production checks; final feedback on these two corrections remains pending. All previously accepted artwork and selected pack bytes are preserved. Windows runtime remains unverified.

Worktree: `/Users/Aone/RA2remaster/ra2-hd-ui-m1-8`, branch `m1-8-menu-ui-cameos`. Preserve the accepted foundation in the main checkout and concurrent M1.7 work. Existing apps, normal `dist`, imported archives, accepted world art and user profiles remain untouched. Everything is local; no push. The user subsequently authorized the new Mac desktop test package below.

## Production feedback correction

Native production on retained build-v22 reproduced Original-frame flashes on every clock change: 55 building transitions and 37 infantry transitions, with 79 and 36 sampled visible fallback frames respectively. The hover outline and progress clock also shared world Z = -3. The fix retains the last decoded HD frame while the next frame of the same registered clock animation loads, then swaps atomically. Cancelled/stale requests cannot overwrite newer frames. Failure, hiding, HD Off and teardown still release resources and preserve Original fallback. Different cameos never retain one another's artwork. The outline now uses its own layer (world Z = -3.25); logical dimensions and hit areas are unchanged.

Eighteen explicit Simplified Chinese locale overrides remove redundant Allied/Soviet prefixes from building and MCV names. Both refineries display the requested generic refinery label. Shared strings update sidebar names, sidebar tooltips and world hover text; rule identities, prices and proper names such as Yuri are unchanged.

Evidence under `.artifacts/menu-ui/`: `production-feedback-baseline`, `production-feedback-fixed` and `production-feedback-allied`. Native building/infantry queues in both factions pass with 197 observed frame changes and 1,202 sampled display frames, zero Original handoff flashes, distinct outline depth, zero GL errors and HD Off returning allocation to zero. These tests invoke the normal sidebar production handler; only prerequisite buildings are spawned by the test. Lifetime/failure and shared-name regressions supplement the existing UI/desktop tests (26 tests, 258 assertions). `runtime-production-r2/result.json` passes the full existing native UI regression: 122 cameo IDs, all 471 Allied/Soviet/dormant Yuri control states, shared ranks, HD switching, density/aspect checks and match restart; no page/console/GL errors. This is a technical pass, with the user's correction review pending. Continue fixes/acceptance in this task.

R2 delivery: Desktop `RA2-HD-UI-M1.8-Mac-Test-R2.zip`, 536,544,039 bytes, SHA-256 `6a3859f67d70b102864c93679bab9bc282d97b92ea501631aadf4fed59d047f2`. Source checkpoint: `d0eb380`; clean build-v24. Its runtime payload matches validated build-v23 except whitespace-only locale formatting (parsed values identical). `mac-test-r2/runtime/result.json` passes actual packaged startup, sibling resource registration, native match, HD toggle and restart. Strict ad-hoc signature and archive verification pass all 1,203 entries and 747 resource files. The accepted 430-entry artwork manifest is unchanged. `mac-test-r2/desktop-delivery.json` verifies the Desktop ZIP and unchanged earlier ZIP. Extract into Downloads or another local non-synced directory, keeping the app and resource folder together. Only the production-edge and naming corrections need user retesting; all other delivered scope retains acceptance.

## Mac desktop test package

The user explicitly requested a Mac build on Desktop for physical testing, superseding the earlier no-packaging boundary only for this local delivery. The new Apple Silicon app is `Red Alert 2 HD UI M1.8.app`, distributed with sibling `RA2-HD-UI-Resources` and embedded review pages inside `RA2-HD-UI-M1.8-Mac-Test`. Keep the application and resource folder together. The app automatically registers that sibling folder on first launch and uses its own `RA2 HD UI M1.8` profile; it does not import another app's settings or resource registration.

Build `build-v22` preserves the accepted renderer and artwork. The only runtime changes are the dedicated profile/title and bounded packaged-resource discovery. `mac-test-v2/runtime/result.json` records `PASS_PACKAGED_MAC_START_GAME_HD_SWITCH_RESTART`: actual packaged executable, first-run discovery without prewritten registration, all 21 existing HD world families available, selected 430-entry UI revision, menu/video, native skirmish and 4K selection, 94 active HD controls, HD Off release and restart. Page/console/GL errors are zero. This is automated package validation; the user's physical panel, pointer/focus and gameplay test remains pending.

The app is locally ad-hoc signed, not notarized. Archive verification binds all 1,203 file/symlink entries, 747 selected external resource files and executable permission bits. The earlier `mac-test-v1` failure is preserved: the Electron-named executable reported development-runtime semantics and skipped packaged-resource discovery. The corrected executable is named `RA2 HD UI` and `app.isPackaged` is verified true. Existing packages are not overwritten.

Desktop delivery is the verified `RA2-HD-UI-M1.8-Mac-Test.zip` (536,520,014 bytes; SHA-256 `55cf34e16e94b86d2f92e9819b4b2c767cd42e3661d6a847e41e4733ec4977b8`). The Desktop File Provider repeatedly adds FinderInfo to expanded app/helper bundles, causing strict signature verification to fail despite unchanged file bytes. That newly created expanded copy was moved back into ignored evidence, not left as a ready app. Extract the ZIP into a local non-synced folder, such as Downloads, and keep its app/resources together. The staged bundle passes strict signature verification and packaged runtime tests; the ZIP and Desktop copy have identical hashes. `mac-test-v2/desktop-delivery.json` records this delivery limitation separately.

Reproduction: `node scripts/ui/build-review.mjs <new-build>`, `node scripts/ui/package-mac-test.mjs <build> <new-output>`, `node scripts/ui/validate-mac-package.mjs '<output>/RA2-HD-UI-M1.8-Mac-Test/Red Alert 2 HD UI M1.8.app' <output>/runtime`, then `python3 scripts/ui/archive-mac-test.py <output>`. The package receipt hashes the signed app and copied resources; the archive receipt records ZIP identity. Desktop copying is a separate authorized final delivery step. Seven focused desktop/resource-registration tests with 80 assertions and script syntax/diff checks pass.

## Current delivery and launch

Resource root is `/Users/Aone/RA2remaster/ra2-hd-ui-m1-8/.local`. Its `ui-selection.json` now selects immutable `remaining-ui-v4` with `reviewOnly: false`, manifest SHA-256 `1da8b86dccd529314d83836c990e2bf0f542397e32cd8d65bc1cd904585a08d8`. The final 430-entry pack uses the existing default-on HD option. Original mode, missing/corrupt-member fallback and world-pack selection remain intact. The prior pointer is retained in `final-integration-v1/ui-selection-before.json`; restoring that file reverses this local selection without deleting any pack.

Final acceptance is bound to exact masters, exports and reviewed pages in `.artifacts/menu-ui/final-integration-v1/art-acceptance.json`. The selected corrections are `gapicon-s3`, `sealicon-s2`, `shkicon-s3` and the equal side-by-side turret `ttnkicon-s3`. Earlier acceptance/rejection receipts and immutable revisions retain their historical status. The editable production ledger now reports 92 accepted canonical images and zero pending corrections.

The consolidated delivery page is `.artifacts/menu-ui/delivery-v1/review.html` (235 embedded images); its `small-ui/review.html` contains 376 embedded images. Both pass HTML-only isolation with zero external image requests. This page contains original/accepted cameo comparisons, shared rank variants, native menu/loading/HUD captures and the completeness matrix. The old review pages below are historical and are not overwritten or silently relabeled.

| Group | Current coverage | Explicit limit |
| --- | --- | --- |
| Home | Six localized menu entries, 17 original-style button states and original animation | Campaign/LAN/Movies remain disabled; movie is source-resampled |
| Loading | Nine restored specialty-unit regions, original country composition, wide/MacBook-shaped layout | Background maps/flags retain source detail; observer remains Original |
| Allied/Soviet HUD | 31 panel/control families, 33 radar frames and 55 progress frames per skin | Native geometry, colors and timing retained |
| Yuri HUD | Verified shared panels/controls/progress and separate purple radar | Dormant native fixture only; no playable faction |
| Cameos | 92 accepted canonical images plus 30 shared rank aliases | Six source exceptions retained Original; three missing retail references; expansion-only roster not authored |
| Small UI | 231 entries backed by 166 files, including command/progress entries above | Conservative 4x source resampling; no claim of invented detail |
| Text/overlays | Original name-label style; lighter yellow status/quantity text; live overlays | Source logical size retained |
| Future toolbar | `OptionalToolbarSlot` type-only overlay contract | No visible allocation, trainer behavior or viewport shrink |

Isolated executable `build-v21` passes `runtime-selected-v1/result.json` through ordinary resource registration with `RA2_UI_REVIEW=0`. No art manifest or fetch responses are injected in this mode. Both first launch and restart match all 430 selected entries. Coverage includes six menu routes, keyboard focus/disabled guards, Options, original/HD video, nine staged native country loading views, narrow/wide/MacBook-shaped layouts, Soviet/Allied matches, all 122 cameo IDs in 11 native batches, 471 faction states including 99 radar frames, normal/rank texture sharing, HD Off, return, second match, quit and restart. Paged roster fixtures reuse E1 rule labels solely for render coverage; they do not certify gameplay roster labels. The ordinary mixed-cameo fixture separately verifies real localized labels and live overlays.

The native run has no page/console/GL errors. Same-view 1080p/1440p/4K preserve logical geometry. Peak measured cameo-batch allocation is 13,487,872 bytes under the separate 16 MiB UI budget; HD Off releases UI reservations. DOM copies and radar scratch memory are reported separately; browser video decoder storage is not included. `display-selected-v1/result.json` passes native 3840x2160 fullscreen, 30 resize events retaining Options, and HD Off persistence on restart. It does not certify display-mode persistence or physical pointer-lock recovery. Physical MacBook output/input remains `UNVERIFIED`; Windows is `NOT RUN`.

Focused suites cover 24 tests / 222 assertions at the final test revision: `final-integration-v1/tests.log`, `desktop-tests.log`, and the updated selection-gate case in `selection-tests.log`. Entry typecheck, isolated build and diff checks pass. `final-integration-v1/preservation.json` rechecks all 1,600 accepted/imported baseline files without differences. The main checkout, separate unit worktree, apps, ordinary `dist`, existing profiles and historical assets were not changed.

Launch the validated executable with a fresh isolated profile:

```sh
cd /Users/Aone/RA2remaster/ra2-hd-ui-m1-8
node scripts/ui/launch-review.mjs .artifacts/menu-ui/build-v21
```

The launcher verifies payload hashes and uses normal selected-art registration. `--review-only` is reserved for inspecting historical review-only selections. Reproduce technical validation with fresh output paths using `validate-runtime.mjs <build> <output> --selected-pack=remaining-ui-v4 --original-screens` and `validate-display.mjs <build> <output> --selected-pack=remaining-ui-v4`. Generate this consolidated page with `python3 scripts/ui/build-delivery-review.py`. Keep corrections and final human input feedback in this task; a trainer or other materially new objective belongs in a separate task. The sections below preserve prior checkpoints, not current pending status.

## Historical four-cameo correction and remaining-art acceptance

Latest Tesla Tank clarification: the user specifies two equal-sized turret assemblies side by side across the top deck. The earlier high/rear large turret and low/front small turret arrangement in `ttnkicon-s2` is rejected. Candidate `ttnkicon-s3` implements the matching lateral pair, using the retail original and the explicit user geometry correction. Its built-in generation prompt is `remaining-v1/masters/ttnkicon-s3.prompt.txt`. The new embedded comparison is `remaining-v1/tesla-tank-pair-v1/review.html`; four images and native-size controls pass HTML-only isolation. Immutable `remaining-ui-v4` changes only `ttnkicon.shp` and its shared rank alias from v3; the other 428 entries and bytes are preserved. All payload hashes/dimensions pass, selection remains unchanged, and native runtime was not rerun for this asset-only correction. This candidate and the other three corrected cameos still await explicit acceptance; no additional approval is inferred from this clarification. Earlier correction details below are retained as history.

`remaining-v1/four-corrections-v1/acceptance.json` binds the user's acceptance to the exact prior gallery pages, v1 pack manifest, 76 selected accepted masters/exports (plus the unchanged original 12), and small-UI receipt. Prior pages and immutable packs are preserved. The original source exceptions remain Original; acceptance does not invent missing source data or certify untested platforms.

The new candidates are `gapicon-s3` (broader, lower base with the prior upper assembly retained), `sealicon-s2` (dry torso/dock foreground, removing invented water), `shkicon-s3` (anatomical left arm on image right hangs down, retaining the prior helmet/armor/weapon), and `ttnkicon-s2` (two separate staggered turret assemblies). Original retail images govern content and pose. Built-in image generation was used; the final Gap Generator and Tesla Trooper edits additionally use the prior HD image as the edit target to constrain unrelated changes. Exact prompts and masters remain under `remaining-v1/masters`. Earlier s2 variants and their review evidence are retained separately.

Immutable `remaining-ui-v3` contains the four corrections and three shared rank aliases. All other 423 manifest entries and payloads are unchanged from `remaining-ui-v1`. Exports remain opaque 240x192 images for 60x48 logical slots. The new pack stays unselected; `original-screens-v4` remains the review-only selection. No engine or font changes accompany this correction.

`remaining-v1/four-corrections-v1/review.html` embeds 15 images showing original/previous/current versions and shared rank variants, with 1x/2x/4x viewing controls. `validation.json` records complete payload hash/dimension validation and preservation of accepted artwork and prior pages. The native runtime was not rerun for this asset-only change; the earlier v1 runtime result remains its own evidence. Continue review of these four candidates in this task.

Reproduce the final exports with `python3 scripts/ui/export-remaining-pack.py remaining-ui-v3`, then `python3 scripts/ui/build-four-corrections-review.py`. Check embedded images with `node scripts/ui/check-embedded-review.mjs .artifacts/menu-ui/remaining-v1/four-corrections-v1 --remaining`. The sections below retain earlier checkpoint status and evidence.

## Prior source fidelity, rank reuse and yellow status text

Chrono Commando, Desolator and Chronosphere were regenerated from their own retail references, preserving the original composition and equipment instead of using another unit/building as a style reference. Accepted candidates are `ccomicon-r4`, `desoicon-r3` and `csphicon-r3`; `source-fidelity-review-v1/acceptance.json` binds the exact master/export hashes. Earlier anatomy, pixelation and content-drift failures remain rejected. Chrono Miner `ahrvicon-r4` retains the front crushing rollers and restores the blue-white effect inside its circular mechanism; its acceptance remains pending. Masters and exact built-in image generation prompts are under `.artifacts/menu-ui/remaining-v1/masters/`.

`remaining-v1/source-fidelity-review-v1/review.html` embeds 18 images: original/previous/current comparisons and ordinary/rank examples. HTML-only isolation and scale controls pass with zero external image requests. Outputs are 240x192, displayed at the original 60x48 logical size. The review pack `cameo-corrections-v1` is unselected; `original-screens-v4` remains the review selection. Its 88 prior entries and payload hashes are preserved exactly.

`scripts/ui/cameo-aliases.json` maps 30 visually audited normal/rank pairs. All 30 pairs now share the exact base filename, decode, texture and reference-counted lifetime. A separate shared 184,320-byte transparent rank layer is blended in the original cameo draw before lighting and opacity. Missing or corrupt layers retain the complete Original icon. No independently generated rank version is used.

The user clarified that cameo names should retain the earlier Fira Medium / 0.75 outline. That style is restored. Only yellow Ready/On Hold and quantity text now uses light output-density `UiText`, replacing fixed-resolution label sprites; status and queue semantics are retained. Earlier unit-tooltip changes remain unchanged.

Isolated build `build-v17` and `runtime-cameo-reuse-v4/result.json` pass the bounded native runtime checks. Eight correction/rank slots load; three normal/rank pairs share identical texture objects, rank layers appear only on alternates, and the fixture reserves 10,735,360 bytes under the 16 MiB UI budget. 1080p/1440p/4K keep the same logical view. HD Off frees all allocations; second-match and restart checks pass without page/console/GL errors. The 23 focused tests / 211 assertions and entry typecheck pass. Earlier sandbox launch failure and fixture data-URL failures remain recorded as failed runs; the fixture now supplies in-memory responses through the existing decode path without weakening the offline guard. These results do not assert full-roster or all-control-state validation for the new pack.

The earlier correction checkpoint above is superseded by the completed review pack below. Continue visual feedback and acceptance in this same task.

## Completed remaining review pack

Chrono Legionnaire `clegicon-s2` aligns its emitted beam with the muzzle and barrel axis. Cloning Vats `clonicon-s2` restores opaque scene content at both edges, removing white/transparent bands. Both use only their retail original as the content reference and remain `REVIEW_PENDING`. Built-in image generation masters and exact prompts are retained under `remaining-v1/masters`; deterministic exports are 240x192 for the unchanged 60x48 logical cameo canvas.

The ledger covers 128 available references: 98 canonical sources and 30 rank aliases. Ninety-two canonical images produce 122 HD cameo IDs. Six exceptions remain Original: five garbled sources (`hindicon`, `liteicon`, `obmbicon`, `proicon`, `sbagicon`) whose audited rule references all have TechLevel -1, and the authentic `xxicon` missing-cameo placeholder. The absent retail references `engnuico`, `falcuico`, and `psybicon` remain unresolved; ordinary Engineer and Harrier cameos are covered. Exact source/rule evidence is in `remaining-v1/source-exceptions.json`. Expansion-only Yuri unit cameos are outside this vanilla roster; dormant Yuri UI remains covered separately.

Small UI exports preserve source frames and colors through conservative 4x Lanczos resampling, without invented detail. There are 231 entries backed by 166 files: Allied/Soviet command buttons, 55 progress-clock frames per faction, 34 PCX flags/indicators/checkbox/scroll widgets, a three-state dialog button atlas and the native 24-pixel-cell CSS sprite. Yuri command and clock entries reuse Soviet payloads only after matching both source and palette hashes. Clock frames load independently to keep resident allocations bounded.

Native SHP controls, PCX image elements and CSS widgets now acquire verified HD payloads while preserving their logical dimensions, state positions and timing. DOM copies participate in the same 16 MiB UI ceiling; shared leases and Blob URLs are released when no longer used. Insufficient budget or missing/corrupt resources preserve Original rendering. The actual dialog-button atlas has HTML frame coverage; its selector was not present in the measured lobby CSS check.

Immutable `.local/ui-packs/remaining-ui-v1` contains 430 entries; manifest SHA-256 is `39215289a429fa1afbfbea2bb53aeb3301956ebc8e4a9c2f20c4e8b3103f2b19`. It is unselected. `.local/ui-selection.json` still selects `original-screens-v4` with `reviewOnly: true`. Final native validation injects the candidate pack only inside the isolated harness. No accepted artwork or ordinary startup selection is promoted by this checkpoint.

Build `build-v20` and `runtime-remaining-v2/result.json` pass. Coverage includes all 122 cameo IDs across 11 native HUD batches; 157 states per Allied/Soviet/Yuri skin (471 total, including 99 radar frames); PCX/CSS density and unchanged bounds; shared rank textures; HD Off release; second match; quit and restart. Cameo-batch peak allocation is 13,487,872 bytes, below 16 MiB. No page, console or GL errors occurred. Yuri is a detached native-renderer fixture. Paged cameo fixtures deliberately reuse E1 rule labels and do not assert gameplay roster/name mapping. Physical MacBook input/panel output and Windows remain `NOT RUN` or `UNVERIFIED`.

Focused checks pass 24 tests / 220 assertions, entry typecheck, isolated build and `git diff --check`. `remaining-v1/preservation-final.json` verifies 1,600 baseline files, all 88 prior UI entries, three accepted correction exports and the unchanged selection. The earlier `runtime-remaining-v1` failure is retained: four native menu-video requests used the injected revision incorrectly. The corrected harness retains the verified existing video source without weakening offline guards.

`remaining-v1/remaining-gallery/review.html` places the latest two corrections first and embeds 188 images; `remaining-v1/small-ui-v1/review.html` embeds 376. Both pass HTML-only isolation with zero external image requests and working native-size controls. Their receipts distinguish the 15 accepted canonical images from 77 candidates. Source exceptions are visible in the gallery. Final visual acceptance remains pending.

```sh
python3 scripts/ui/export-small-ui.py
python3 scripts/ui/export-remaining-pack.py remaining-ui-v1
python3 scripts/ui/build-remaining-review.py
node scripts/ui/check-embedded-review.mjs .artifacts/menu-ui/remaining-v1/remaining-gallery --remaining
node scripts/ui/check-embedded-review.mjs .artifacts/menu-ui/remaining-v1/small-ui-v1 --remaining
node scripts/ui/validate-runtime.mjs .artifacts/menu-ui/build-v20 .artifacts/menu-ui/runtime-remaining-v2 --remaining-pack=remaining-ui-v1
```

Use a fresh evidence directory for repeated runtime checks. Immutable export refuses differing existing bytes. Earlier sections below describe retained historical checkpoints and their then-current omissions, not the final remaining-pack coverage.

## Prior radar black field and label follow-up

The decision is preserved separately in `.artifacts/menu-ui/feedback-radar-text-v1/acceptance.json`, bound to all three reviewed HTML pages, the immutable v4 manifest and 88 asset entries. Earlier review receipts are unchanged. No artwork file is regenerated by this correction.

The final native radar image has an opaque black center. The transfer previously left its multiplier at 1 when both the base and final palette channels were zero, leaking small colored details from the restored base. Only the terminal-frame zero-channel case now forces the multiplier to zero. Its effect maps use exact sampling to prevent interpolation from bleeding rail colors into the black field. Frames 0..31 retain the prior computation, native timing, transparency and geometry. Metal rails remain part of the original source transfer.

Live cameo names use regular Arial with explicit PingFang SC / Microsoft YaHei fallback and a 0.3 logical-pixel outline instead of 0.75. The bundled Fira family contains only Medium/Bold; selecting weight 400 alone would still use Medium. Shared canvas UI text, queue labels, unit tooltips, control-group numbers and primary-factory labels now use real regular faces. Fitting measures the same font used for drawing. This is a readability adjustment, not a claim to reproduce the retail bitmap font. Logical font sizes, output-density handling and world geometry remain unchanged; menu HTML typography is retained.

Correction build: `.artifacts/menu-ui/build-v16`; runtime: `runtime-radar-text-v3/result.json` (`PASS_BOUNDED_NATIVE_RUNTIME`). All 246 control/radar states retain native geometry, all three terminal display regions contain 246,400 opaque black pixels, and radar frames 0..31 match the previous captures byte-for-byte. The 12 live names and three native unit tooltips are captured; 1080p/1440p/4K preserve the same 1600x900 logical view. HD Off frees UI allocations, a second match and restart pass, and no page/console/GL errors occur. The 21 focused tests / 201 assertions and entry typecheck pass. The initial fixture-initialization failure and the subsequent Allied edge-interpolation failure remain in `runtime-radar-text-v1/v2`; neither is relabeled PASS.

`feedback-radar-text-v1/review.html` embeds all 16 images, with native-size/inspection controls. Its HTML-only isolation check passes with zero external images. `verification.json` records pixel comparisons. All 88 accepted asset entries and the immutable manifest retain their hashes; the main worktree remains clean at `ee371e0`. The correction's visual acceptance remains separate from these technical checks. Continue feedback and remaining production in this task.

The remaining list is copied into `feedback-radar-text-v1/completeness.json`: 12 accepted HD cameos and 104 additional build-menu references, including normal/alternate and missing or unsupported references. These are references, not 104 independently reachable unit types. Command-button families, flags and other small raster families also remain Original; the entire UI is not complete.

## Current behavior and assets

The six localized Home items remain Campaign (disabled), Skirmish, LAN (disabled), Movies (disabled), Options and Exit Game. Disabled routes reject mouse and keyboard activation. Skirmish/Options/desktop Exit reuse existing controllers; the browser Exit hint remains honest. The generic black/gray HD button CSS is removed. Home uses the original mechanical red/orange/yellow button design, including all 17 source frames and original slide offsets/timing. Text remains live.

The original animated menu is `language.mix/ra2ts_l.bik`, SHA-256 `48cfefeca1ad9d0b37127de293e6d17d614f0c514c18c972743171dc422d26e8`. Both web videos retain its 15 fps, 28.734-second content and 632:570 aspect ratio. Original is 632x570; HD is a conservative 1896x1710 Lanczos resample, not invented frame detail. Playback resumes its position when switching HD and unloads outside Home. The original contour-map background fills the wider menu area. Desktop streaming validates both video identities and supports bounded byte ranges.

Nine specialty-unit regions were located inside the original `ra2.mix/load.mix/ls800*.shp` country backgrounds, using `mpls.pal`. They are baked into the backgrounds rather than separate unit files. The restored patch is exactly `(210,8,186,150)` in the original 800x600 canvas; its export is 744x600. A source-derived matte retains original grid pixels outside the unit. Countries: `ustates`, `france`, `germany`, `ukingdom`, `russia`, `cuba`, `libya`, `iraq`, `korea`. Observer art remains Original. Country maps/flags/backgrounds retain original detail, with improved sampling and layout only.

Loading uses three background slices. The original left 430 pixels and right 360 pixels keep their geometry; only the empty 430..440 corridor expands. Country units, maps, flags, labels and progress are not stretched or cropped. Main-menu video uses proportional contain sizing. Tested shapes include 16:9, 16:10, 1512x982, 1728x1117, 1280x832 and 1440x932 logical MacBook-shaped viewports. These are emulated shapes on macOS Electron, not physical MacBook-panel certification.

Each Allied/Soviet skin includes 21 complete control/panel families at 4x: `tab00..03`, `diplobtn`, `optbtn`, `repair`, `sell`, `r-up`, `r-dn`, `sidebttn`, `credits`, `top`, `side1`, `side2`, `side2b`, `side3`, `addon`, `lendcap`, `bttnbkgd`, `rendcap`. Atlas sampling preserves original frame rectangles and native hit geometry. Missing, corrupt or mismatched atlases retain the complete Original state group. The native solid-color power strips remain native.

All three radar bases are 672x440 for the original 168x110 footprint. Every 33-frame sequence transfers its original per-channel darkening/flash and transparency onto the restored base using bounded reusable canvases. This preserves original CRT scanning/noise/flash timing without substituting a low-resolution emblem during a transition. It does not invent 33 unrelated generated images. A failed base or insufficient allocation restores Original radar rendering.

The verified Yuri source is `ra2md.mix/sidec02md.mix/radary.shp` with `radaryuri.pal`. Original Yuri shares Soviet sidebar members; source/palette hashes are checked before reusing the 21 shared HD families. The separate purple radar base and all 33 source transition frames are prepared and exercised through detached native-renderer fixtures. No playable Yuri side exists in this engine; the 22-family asset set remains dormant. No faction or gameplay is unlocked. Source inventory also retains 79 Yuri-owner rule candidates and 102 normal/alternate cameo references, including shared buildings; Yuri cameos are not yet authored.

## Soviet fidelity and alignment correction

The user's screenshot exposed mixed faction geometry below the radar. The offline VFS had mounted both `ra2.mix/sidec01.mix` and `ra2.mix/sidec02.mix`. Removing only the short archive names left the nested Allied alias first in priority. Soviet controls therefore used Allied blue artwork and dimensions (for example, 28x27 tabs and 64x31 repair buttons), while the candidate panels used Soviet coordinates. Dimension guards correctly rejected these mismatched HD controls, revealing the underlying source error.

`unloadHudSideArchives` now removes both nested and ordinary HUD aliases before loading one selected side. All unrelated archives stay mounted. Soviet controls now resolve exclusively from `sidec02.mix`: 32x28 tabs, 52x32 repair/sell, 72x22 top buttons. The correction applies consistently in Original and HD modes and during subsequent side switches. Native geometry comes from the selected retail faction, without moving the world camera or changing viewport coverage.

The source Soviet panels do contain yellow brass trim, satin silver plates and dark recesses. The initial candidate had overly bright highlights. The revised master in `ui-controls-v2/soviet-panels.png` reduces polish/contrast using the original sheet as the primary reference. It replaces only ten Soviet panels and their ten shared Yuri aliases in the new immutable revision. The revised sheet shrank its content by approximately 3%; revision v3 exposed repeating panel seams. Revision v4 registers that sheet back to the source grid (0.97 scale, -2 native-pixel horizontal shift) before slicing. Shape/alpha export still uses source coverage; the flawed v3 exports remain historical evidence. The user accepted this reviewed material and alignment; this is not a claim of pixel-identical reconstruction.

A separate initialization regression is fixed: widgets selecting a state before their mesh exists must not cache an HD lease key prematurely. Existing original frame geometry and late-loading fallback are preserved.

## Historical original-screens checkpoint completeness

| Group | Delivered in this checkpoint | Remaining |
| --- | --- | --- |
| Menu navigation | Six entries, disabled guards, live localization | Human input review |
| Home artwork | Original movie, 17 restored button states, wide layout | Other frame/monitor/splash raster art |
| Loading | Nine restored unit regions, source maps/flags, wide layout | Original background detail remains |
| Allied/Soviet HUD | 42 full control/panel groups plus two complete radar transitions | 20 faction command-button families; terminal radar correction |
| Yuri HUD | 21 shared groups and one complete purple radar transition | Dormant display only; command buttons and expansion cameos |
| Sidebar cameos | 12 accepted 240x192 exports, unchanged bytes | 104 additional unique build-menu references; alternate/superweapon completion |
| Flags, dialogs, small raster widgets | Source/palette/state/density audit | Restoration pending; currently Original |
| Text, progress, simple indicators | Live output-density rendering and geometry preserved | Thinner-label correction review |
| Accepted cursors/targeting/world art | Preservation baseline | No regeneration in this task |

Exact entries, source hashes, dependencies, native dimensions, route, fallback and density status are in `review-original-v3/completeness.json`. The source density inventory has 117 vanilla families / 496 frames and 34 Yuri/shared families. Existing `inventory-complete.json` retains all live references, rule-backed cameos and missing retail entries (`engnuico.shp`, `falcuico.shp`, `psybicon.shp`). A literal reference is not evidence that an unsupported screen is reachable.

## Validation and memory

`runtime-screens-v7/result.json` records the preceding isolated `build-v14` run; the correction run above supersedes it for current executable behavior. The harness covers six menu routes, disabled mouse/keyboard behavior, Options, original/HD menu video, nine staged native loading components, narrow/wide/MacBook-shaped viewports, actual Soviet and Allied matches, same-view 1080p/1440p/4K, all 12 accepted cameos with live overlays, HD Off, return, second match, quit and restart. It checks 82 authored states per faction (246 total), including all 99 radar frames, against the native vertex positions. Yuri is explicitly a detached fixture. Per-frame PNG captures and state JSON accompany the receipt.

The preceding `runtime-screens-v5` passed all those checks with no page/console/GL errors before the radar flash transfer refinement. `states-v3` proves corrected exclusive Soviet source ownership and 164 native Allied/Soviet states. `display-screens-v1` passed native fullscreen, 30 resize notifications without replacing Options, and HD Off selected through Options persisting on restart, using build-v13. The later change is restricted to radar compositing. Physical pointer retention/focus and physical MacBook panel output remain `UNVERIFIED`; Windows is `NOT RUN`.

Focused tests: `tests-screens-final.log` has 21 passing tests / 201 assertions; `typecheck-screens-v7.log` and isolated build-v14 pass. Tests cover archive alias precedence across side switches, initial control state loading, unchanged atlas geometry, safe video manifests/ranges, loading layouts and existing fallback/lease behavior. Earlier failed runs are preserved: source-owner discovery and a harness collection-iteration mistake are not relabeled PASS.

UI allocation uses a separate 16 MiB ceiling. The tested mixed 12-cameo Soviet HUD reserves 11,841,280 GPU texture bytes including two radar transition outputs; decoded static images account for 9,475,840 bytes. Final radar scratch canvases account for 2,808,960 CPU bytes. Menu buttons share one 8,386,560-byte atlas. HD Off releases all UI texture/scratch allocations; returning from matches releases the HUD and returns to the one menu atlas. Loading retains one 1,785,600-byte unit texture and separately reported DOM canvases. Menu video decoder memory is browser-managed and is not included in the UI texture counter. These are allocation bounds, not process RSS. Accepted world packs retain their selected densities and unchanged budget; no world downgrade funds UI textures. The independent M1.7 worktree is not included in this measurement.

## Review and reproduction

Current resource root: `/Users/Aone/RA2remaster/ra2-hd-ui-m1-8/.local`.
Current immutable pack: `.local/ui-packs/original-screens-v4`; 88 entries, with shared Yuri files reused. Manifest SHA-256: `1e2f35c6a2babda384d44051fd2a7486c04ffd92a412848298030e20b85b0f51`. Selection remains `reviewOnly: true`. Ordinary launches retain Original UI artwork; navigation/source-selection fixes remain active. Accepted cameo bytes are copied unchanged from direction-v5. Previously invented menu/loading images are absent from this pack; old revisions remain historical evidence.

Review pages embed every image, including original references. `review-original-v3/review.html` contains materials, country units and complete control-state groups; `radar.html` contains all 99 original/HD frames; `screens.html` contains native wide/MacBook-shaped and same-view captures. `completeness.json` lists exact omissions. The HTML-only isolation check passes all 389 embedded images and all radar frame controls with zero external image requests. `preservation-screens-final.json` rechecks all 1,600 imported/accepted baseline files without differences. The consolidated reviewed art direction is now accepted, excluding the specified terminal radar correction. That approval does not imply completion of the remaining roster. Keep feedback and acceptance in this task; do not create another task for these corrections.

```sh
cd /Users/Aone/RA2remaster/ra2-hd-ui-m1-8
node scripts/ui/launch-review.mjs .artifacts/menu-ui/build-v16
```

The launcher verifies executable payload hashes and creates a fresh isolated profile. It does not package or alter an existing app.

Source preparation: `bun scripts/ui/audit-original-screens.ts`, `bun scripts/ui/audit-ui-density.ts`, and `bun scripts/ui/audit-yuri-ui.ts '/Users/Aone/RA2remaster/Resource/Command and Conquer Red Alert II'`. `python3 scripts/ui/prepare-ui-references.py` decodes the audited raw buffers and creates exact source sheets. Raw imagegen prompts and outputs are retained under `loading-units-v1`, `ui-controls-v1` and `ui-controls-v2`. For the original movie derivatives, run `node scripts/ui/transcode-original-menu.mjs <ffmpeg-executable>`; existing videos are preserved. Export with `python3 scripts/ui/export-original-screens.py original-screens-v4`; immutable member changes are rejected. Build the embedded pages with `python3 scripts/ui/build-original-review.py`. Retail data, artwork, videos and evidence remain ignored.

Historical cameo corrections and acceptance remain in `art-v3`, `art-v4`, `cameo-acceptance.json`, `review-v4` and commits `67d9600`/`f1ced84`. The native aggregation fix preserves each cameo's 60x48 canvas independently of a 64-pixel aggregate header. The accepted Conscript gas mask, two-handed GI rifle pose, completed bottom content and live outlined names remain intact.
