# Dual-edition R2 presentation and AI corrections

Status: `MAC_R2_DELIVERED_USER_ACCEPTANCE_PENDING`. The user's R1 feedback requests a viewport-filling selector, equal shared HD/health presentation in both editions, less aggressive three-tier AI, and a retail-fidelity checklist. Work stays local and sequential. Existing artwork, R1 package and profiles remain intact.

## Corrections

The startup selector is fixed to the viewport instead of shrinking inside the legacy centered body. Its background follows window/fullscreen bounds while the two original covers retain their aspect ratios.

YR's `pips.shp` inserts an infantry self-heal image before the rank and unit-health images. The old RA2 indices selected the gold elite-rank image for a full health bar. YR now uses health frames 16/17/18 and rank frames 14/15; RA2 retains 15/16/17 and 13/14. Thresholds and palette colors are unchanged.

The original HD loaders rejected every non-temperate theater even where the original member was identical. Accepted building families now permit compatible dry-theater aliases, requiring the entire original member hash and all logical frame geometry to match the accepted source. Conscript and Rhino likewise verify their complete original sources independently of theater. Family fallback, shadows, camera, logical sizes and the existing memory budget stay intact. Snow building variants are deliberately not replaced by non-snow artwork. NAPOWR retains complete-family fallback on New Urban, Desert and Lunar: the original construction SHP has different pixels and trim geometry, so the accepted temperate family cannot be substituted faithfully without adapting and reviewing that animation. This remaining coverage gap is explicit, not a passed HD family. Obsolete RA2 NACLON/NAPSIS art does not override YR's redesigned equivalents.

A native R1 reproduction showed the main Soviet HD families and units already loaded on a temperate map. The reported YR failure is therefore not a universal edition switch failure; the obsolete theater guard was separately reproduced and corrected. The user was asked which map exposed the problem; until identified, the exact reported scene is not claimed reproduced.

## AI tiers

Pacing uses simulation ticks, so real elapsed time varies with game speed. These are the earliest formation times for an offensive wave, not guaranteed arrival times. Defence still responds when attacked. Original human rules and retail combat/production difficulty modifiers are preserved.

| Setting | Easy | Normal | Brutal |
| --- | ---: | ---: | ---: |
| RA2 first offensive wave | 7,200 ticks | 4,800 ticks | 3,000 ticks |
| YR first offensive wave | 8,100 ticks | 5,700 ticks | 3,900 ticks |
| RA2 interval between waves | 6,000 ticks | 4,200 ticks | 3,000 ticks |
| YR interval between waves | 6,600 ticks | 4,800 ticks | 3,600 ticks |
| Concurrent ground attack missions | 1 | 1 | 2 |
| Requested squad scale | 50% | 70% | 90% |
| Additional Yuri squad multiplier | 85% | 85% | 85% |
| Ordinary miner production target cap | 3 | 4 | 6 |
| Slave-miner target cap, deployed/mobile combined | 1 | 2 | 3 |
| Naval production target cap | 2 | 3 | 4 |
| Capital ship cap (Boomer / Dreadnought / Carrier) | 1 | 1 | 2 |
| Deliberate harvester targeting | No | No | Yes |

Composition minimums still apply. A requested economy cap is not a rule that deletes captured or gifted units. Both refinery/mobile-miner planner paths and replacement requests use the same tier values. Naval, Fortress and offensive-power orders respect the opening preparation period. Scouts move rather than attack-move during it. The planner is still not the original retail team-script interpreter.

## Validation ledger

All artifact paths are relative to `.artifacts/editions/`. Preserve early failures as evidence.

- `diagnose-presentation-r2b`: R1 native YR temperate reproduction; HD loader reports and original pip frame palette values identify the rank/health indexing bug.
- `hd-reuse-audit-r2d.json`: read-only archived member audit, all 18 Soviet families across theater aliases, original pip dimensions and map theaters.
- `presentation-r2-temperate`: corrected YR native construction-yard HD, accepted unit packs, generated health texture RGB checks and visual capture pass.
- `presentation-r2-newurban-v2`: construction-yard/unit/health checks pass on the original Ground Zero New Urban map; NAPOWR remains original for the source mismatch described above. The first attempt requested Austin in standard mode; Austin is not listed for that mode, so that run fails before entering a match and is not relabeled.
- `regression-feedback-r2-v5.log`, `typecheck-feedback-r2-v3.log`: 70 regression tests / 465 assertions and application typecheck pass.
- `hd-regression-feedback-r2.log`: 51 HD contract/family tests / 1,811 assertions pass, including source mismatch rejection, complete-family fallback and bounded allocation.
- `feedback-r2-suite-v2/{easy-yr,normal-yr,brutal-yr}`: natural first waves respect 8,100 / 5,700 / 3,900 tick preparation. The normal match resolves and re-enters a new match. This candidate precedes the final capital-ship cap; it is pacing evidence, not the final naval-cap verification.
- `feedback-r2-suite-v2/ra2`: original-edition construction-yard/unit HD, green/yellow/red health and original rank geometry pass.
- The first combined RA2 diagnostic requested YR-only pip frames and failed in the test reporter; frame enumeration is now bounded by the original atlas. The first desert case put the sole opponent in slot 4 on a two-player map, so the lobby correctly refused to start. Both failures are retained; neither indicates a passed test or a gameplay crash.
- `feedback-r2-terrain-v3/{desert,urban}`: final-source native HD/health/rank checks pass on Sahara Mirage (Desert) and XMP33U4 (Urban). Urban NAPOWR is HD; Desert NAPOWR correctly rejects its incompatible construction member and falls back as a family.
- `napowr-theater-source-difference-r2.txt`: the original New Urban / Desert construction SHP differs in pixels and trim geometry from the accepted temperate source, despite sharing the 210-by-140 canvas and 52-frame count.
- `feedback-r2-naval-final/normal-yr`: final source `879079a` passes natural Allied-versus-Normal-Yuri play, defeat at tick 25,421, the score screen and a new match with its original MCV. Yuri never exceeds one Boomer in the sampled match. The first wave forms at tick 5,706. Both economies and advanced production are active; no fixture resources or attacks are supplied.
- `navigation-feedback-r2-final`: background bounds exactly fill 1920x1080, 1920x1200, 1512x982 and 1280x832 viewports. Native desktop fullscreen follows the display setting; original cover aspect ratios, RA2/YR/RA2 reloads and independent preferences pass.
- `packaged-runtime-r2`: the signed R2 app cold-starts both editions with independent profiles, automatic adjacent-resource discovery and actual match/MCV deployment.

The reviewable remaining differences are in [game-editions-fidelity.md](game-editions-fidelity.md). Corrections and human acceptance continue in this task.


## Mac R2 delivery

Runtime source is committed at `879079a`; packaging documentation is committed at `4a26696`. The final built payload is `.artifacts/editions/build-feedback-r2-final-v3`. All changes are local; nothing is pushed. R1 remains preserved.

- Desktop ZIP: `/Users/Aone/Desktop/RA2-HD-Dual-Edition-R2-Mac-Test.zip`.
- Verified runnable app: `.artifacts/editions/mac-review-r2/RA2-HD-Dual-Edition-R2-Mac-Test/Red Alert 2 HD Dual Edition R2.app`. Keep `RA2-HD-Editions-Resources` beside it.
- Archive: 653,958,829 bytes, SHA-256 `d802418b938a950dc9e46b5e288a6abeeb05fbf8b5e9b0540b2c994151660a9c`.
- All 1,207 extracted files/symlinks match the package receipt; strict deep signature verification passes. The Desktop archive hash matches the verified local ZIP. There are 752 resource files, 21 registered HD families and the retained 430-asset `remaining-ui-v4` UI selection.
- The application profile is `RA2 HD Dual Edition R2`. Previous applications and profiles are not migrated or overwritten. Extract the ZIP to a local directory outside Desktop, which previously added FinderInfo attributes to loose bundles.
- Delivery receipt: `.artifacts/editions/delivery-receipt-r2.json`. Source/evidence/package integrity does not substitute for visual or difficulty acceptance.

The incompatible NAPOWR theater variants and snow building coverage remain unresolved and are listed prominently in the fidelity checklist. The exact originally reported map was not provided. Continue corrections and acceptance in this same task.
