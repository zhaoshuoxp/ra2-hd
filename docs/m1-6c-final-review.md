# M1.6C Soviet building coverage: consolidated review

Status: `M1_6C_ACCEPTED_AND_DELIVERED`. The user explicitly approved the consolidated final review. See `m1-6c-final-acceptance.json` and `m1-6c-final-handoff.md`; historical pending labels below are superseded for the reviewed scope. The user accepted the representative direction. The delivered production, native technical checks and final human review are complete.

The continuation integrates current dual-edition main `477341f` into branch `m1-6-soviet-edition-coverage`. Main and sibling worktrees remain preserved. Application changes are committed workspace source; the separate Mac package is a review delivery. Keep corrections and final acceptance in this M1.6 task. Do not create a new task automatically. A materially different milestone follows acceptance.

Main integration is now complete on `m0-2-stabilization`, retaining the newer R5 combat/audio fixes. See `m1-6c-main-integration.md` and its receipt; earlier delivery statements below describe the unchanged accepted package.

## Coverage and delivery

RA2 and Yuri's Revenge each have 18 applicable Soviet building identities, with a union of 20. All 162 edition/theater/building cells activate complete HD families. There are no Soviet building Original exceptions in this matrix. See `m1-6c-coverage-matrix.csv` for actual resolved members, source hashes, density, allocation, evidence hashes and the boundary of each check.

Added coverage comprises Industrial Plant (`NAINDP`) and Battle Bunker (`NABNKR`) dry/snow families, the shared NEWURBAN/DESERT/LUNAR Soviet Power Plant construction variant, 18 distinct snow families, and validated snow reuse for Shipyard and Tesla Coil. NACLON/NAPSIS are Soviet only in RA2; their Yuri counterparts are outside scope. Cameos do not count as world-building coverage. SQD/YURIPR retain their independent accepted Original unit exceptions; snow unit coverage, other factions, terrain and campaigns are not expanded.

The package contains one independently named Mac app, companion `RA2-HD-Editions-Resources`, offline `BUILDING-REVIEW.html`, this report, a coverage CSV and selected-addition hashes. Keep the app and companion resources together. The review embeds exact atlas pixels, all authored native slots and original static references; its superweapon resting preview includes the native SUPER layer. Actual terrain, native shadows, remap, lighting and independent turret composition are reviewed in the app.

## Validation

- Eight actual retail-map Mac runs cover RA2 TEMPERATE/URBAN/SNOW and YR TEMPERATE/URBAN/SNOW/NEWURBAN/DESERT. Every applicable family resolves and uploads at its retained density; controlled legal placement and damaged-state checks confirm world renderer bindings. Lunar's 18 cells use the actual VFS/ImageFinder/GL family loader and disposal in a disclosed controlled fixture. No ordinary retail lunar skirmish map exists in the audited map list; lunar gameplay is not claimed.
- Industrial Plant retains retail production economics: Rhino 900 to 675, Kirov 2000 to 1500, Conscript unchanged at 100; blackout restores Rhino cost to 900. Battle Bunker enters occupied HD frame 2, fires UCM1Carbine, evacuates two surviving occupants, retains ownership and evacuates on destruction. Five Conscript civilian-house entry/exit cycles pass on the YR default first map.
- A bounded 120-second Soviet-versus-Yuri run uses native production/orders and the existing AI on both sides. Both economies develop, with 12 production events and 205 weapon events in the observation window. This is sustained production/combat evidence, not a battle-to-victory or original-AI fidelity claim.
- Exact 1920×1080 and 3840×2160 drawing buffers pass in a native 960×540 16:9 Mac window. A 1440×900 16:10 window passes at 1728×1080 and 3456×2160. Body/shadow vertices, camera projection, logical coordinates and animation tick remain identical when changing only render density. This verifies output buffers, not a claim that the physical panel has native 4K resolution.
- Four matches in one app verify fresh-profile default-on HD, HD off/on, RA2-to-YR switching, snow-to-newurban switching and disposal of every observed building texture on return to the score/menu flow. Missing, corrupt, incompatible and over-budget family cases reject atomically without GPU upload. The optional texture cap remains 256 MiB; accepted densities are unchanged. Accepted units remain simultaneously available in the combined dry-map fixture.
- TypeScript entry checking and 74 focused retained/new tests pass. Full pack validation checks native trims, empty frames, remap data, frame sharing, measured pooled allocation and texture disposal. The offline review validates all 23 selectable additions, embedded resources, native display sizes and animation controls without network requests.
- Packaged signed launch, relocation, companion-resource discovery and retained guard/unit regression are recorded in `PACKAGE-VALIDATION.json` beside the app. The package inventory binds shipped files. Windows runtime and notarization are not included.

## Preservation and production notes

`m1-6c-added-resources.json` pins 245 selected new resource files and 23 family selections. Earlier pack revisions and rejected art/export attempts remain local history. All 497 representative-checkpoint files and 167 retained unit resource files hash-match their prior receipts. Accepted building/UI registration and resource tests also pass.

Stable architectural masters and rigid ground occlusion avoid whole-image construction scaling. Snow transfers reviewed authored snow material under original per-frame coverage controls, retaining accepted architectural pixels and articulation. NATECH snow changes canvas by 38×10 pixels; a 19×5 center-preserving offset maintains world geometry. NAYARD/TESLA snow SHPs match accepted bytes. Their palettes are not byte-identical: used differences are indices 1 and 254 respectively. Authored RGBA bypasses those indexed colors, the remap ramp remains native, and the original shadow path retains its own palette behavior; actual snow rendering validates this reuse.

The native bunker test exposed pre-existing civilian-style ownership reset on evacuation. Buildable garrison defenses now retain ownership; civilian/map-only structures still become neutral. Entering an already-owned bunker no longer increments captured-building statistics. Rules, prices, foundations, timing and unit artwork remain unchanged.

`m1-6c-final-evidence.json` records the per-family ledger and failures, including the corrected NATECH canvas, NAPOWR unused data alpha, NACNST empty rectangles, TESLA rules/Image distinction and offline NAMISL SUPER layer. Failed test assumptions and their corrected runs remain visible. The final human decision should cover the new construction, snow appearance, machinery and bunker states in this combined review.

## Final delivery receipt

The selected package is `.artifacts/m1-6c/delivery-v2/RA2-HD-Soviet-Buildings-M1.6C-R1.zip` (890,656,327 bytes). SHA-256: `49ec4f5655c30cf1ab79115ee79bfa582bcd2ae4127eefa9ea49e8a26b82055d`. App runtime source is committed at `9e635b1`; later commits only record delivery evidence and checks. `docs/m1-6c-delivery.json` pins the package, dashboard and runtime validation receipts.

The relocated, ad-hoc signed package passes both editions, automatic companion-resource discovery, all 18 applicable Soviet building activations per edition, guard scanning, promotions and retained M1.7 checks. All 1,625 inventory entries match the ZIP, which also passes CRC checks. The offline dashboard and linked embedded artwork player load without network requests. The package contains `REVIEW-DASHBOARD.html`, `BUILDING-REVIEW.html`, `BUILDING-COVERAGE.csv`, `PACKAGE-VALIDATION.json`, `ADDED-RESOURCES.json` and `DELIVERY-INVENTORY.json` beside the app/resources.

The first packaged check rejected legacy profile identity before gameplay. Dedicated M1.6C profile and companion-discovery handling corrected it; failed delivery-v1 and native-package-v1 remain preserved. The first dashboard check queried the family selector before its embedded data initialized; v2 waits for all 23 options and passes using the identical shipped files.

At final delivery main remains at committed `477341f` and has new concurrent uncommitted combat/audio work. Those files were preserved and are not silently included in this build. Do not integrate into that dirty checkout; re-audit current main and coordinate after this task's final visual/gameplay acceptance. This branch contains the committed implementation and reproducible scripts. No Desktop app, accepted package or user profile was overwritten.
