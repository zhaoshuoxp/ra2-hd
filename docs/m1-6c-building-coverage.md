# M1.6 continuation: Soviet building edition/theater coverage

Status: `M1_6C_ACCEPTED_AND_DELIVERED`. The user explicitly approved the consolidated final review. See `m1-6c-final-acceptance.json` and `m1-6c-final-handoff.md`; historical pending labels below are superseded for the reviewed scope. See `m1-6c-final-review.md` for the completed continuation; the representative checkpoint below is preserved history. This explicitly authorized continuation preserves the accepted 18-building M1.6 and 22-unit M1.7 deliveries. It does not reopen accepted art or replace sidebar cameos.

Worktree: `/Users/Aone/RA2remaster/ra2-hd-buildings-m1-6c`, branch `m1-6-soviet-edition-coverage`. Main was rechecked at `471c1c5`; the clean dual-edition baseline `7b2f9ba` contains that commit, the guard-scan correction, M1.7 integration and edition/UI fixes. Other worktrees are read-only. Imported data and dependency directories are independent copy-on-write copies, not write-through links.

At checkpoint, main remained clean at `471c1c5`. The independent edition task advanced to descendant `b02b4da` (only six documentation lines) and had an untracked `scripts/editions/validate-loading.mjs`. Both were preserved. This representative-only branch remains based on `7b2f9ba`; recheck and reconcile later commits before runtime integration.

Scope is NAINDP, NABNKR, NAPOWR NEWURBAN/DESERT/LUNAR construction members, all distinct required Soviet snow building families, and verified complete-family reuse across RA2 TEMPERATE/URBAN/SNOW and YR TEMPERATE/URBAN/NEWURBAN/DESERT/LUNAR/SNOW. The union is 20 identities; NACLON/NAPSIS are RA2 Soviet only. Yuri replacements, NATBNK, NASAM, civilian/tech buildings, new units, terrain and campaigns are excluded.

The first gate is one offline embedded-image representative review: original and HD at native size, enlargement, new industrial/bunker samples, a NAPOWR construction variant, and representative snow buildings. Pause for that decision before extending unapproved art. Archive lookup and native ImageFinder resolution are distinct from actual-game activation; no gap is closed merely by changing a theater gate.

Full production, integration, original-rule functional tests, combined GPU allocation/fallback, cross-edition/theater and match-lifecycle checks, actual Mac runtime validation and one versioned relocatable signed test package follow representative approval. Preserve the 256 MiB optional budget and accepted densities. Current accepted building/unit allocation from prior evidence is 233,693,296 bytes, leaving 34,742,160 bytes; remeasure with real additions before activating complete families. Final visual/gameplay acceptance remains a separate gate.

## Representative checkpoint

Open `.artifacts/m1-6c/review-v1/Soviet-Buildings-Representative-Review.html` directly. Its images and all 26 construction frames are embedded; no server or internet connection is required. The first pair in each section retains the native logical canvas, with optional 3x inspection. Samples are isolated sprite comparisons, not actual game captures.

- NAINDP Industrial Plant normal: selected authored v4, following corrections to excess housings/slats and silhouette proportions.
- NABNKR Battle Bunker normal: included as the second review section. Four native body slots, original occupancy frame 2, five muzzle sockets and AltPalette are inventoried. Full occupancy/damage and garrison tests remain pending.
- Snow NAPOWR, NAHAND and NAREFN: three material/coverage representatives using accepted dry masters. The refinery retains one conveyor and an empty basin for separate storage/ore layers.
- NAPOWR NEWURBAN construction: fixed accepted HD canvas with the variant's trim/padding and decoded native shadows. All 26 occupied temperate source frames match at the same canvas coordinates. Differences add 1,545 index-11 and three index-198 retail rim pixels; these are not enlarged into HD art. NEWURBAN/DESERT/LUNAR share one exact source hash. The adapted frames reconstruct every accepted HD canvas pixel without scaling or translation.

Source inventory covers 162 applicable edition/theater/building cells and 143 unique SHP members. `docs/m1-6c-coverage-matrix.csv` records the compact matrix; `.artifacts/m1-6c/source-v2/inventory.json` retains detailed frame trims, padding, aggregation, animation ranges, archive identity, hashes, palette and dependency data. Native metadata is not proof of in-game activation. NAPOWR active metadata includes 76 aggregate slots while accepted authored ranges cover 38; this pre-existing convention remains unchanged.

NAYARD and TESLA snow members match accepted SHP hashes, but used palette entries differ at indices 1 and 254 respectively. Actual palette/lighting and runtime validation are still required before reuse acceptance. All original shadows remain native. No candidate loader, runtime rule, desktop preference or resource registration was changed.

The offline review passed image, native-size, playback, stepping, reverse and endpoint checks at 1920x1080, 1440x900 and 600x900. TypeScript entry checking passed. Sixty retained tests passed across guard scanning, NAPOWR, building fallback and unit resource registration/pooling. One test initially failed because its output directory was absent in the fresh worktree; creating that directory and rerunning the failed test resolved it. The initial source-audit, browser launch and artwork/reference failures are preserved in the evidence ledger rather than hidden.

`docs/m1-6c-representative-evidence.json` binds the selected artwork, every local source/reference/review artifact, 20-family ledger, failure history and protected checkout status. Existing source and pack bytes remain untouched. There is no new app or final gameplay acceptance at this checkpoint.

## Continue after the art decision

Continue in this same task and isolated branch. On representative approval, complete NAINDP/NABNKR dry families first, then the shared NAPOWR variant and distinct snow families. Validate the full matrix through actual runtime lookup, preserve per-family Original fallback and the combined allocation cap, run original-rule functional/lifecycle tests, and deliver the already-authorized uniquely named combined Mac package. Keep dual-edition crash feedback with its own execution task. Recheck current main/dual-edition ancestry before eventual non-overwriting integration; do not merge this checkpoint over newer work blindly.

## Representative approval receipt

The user approved the consolidated representatives and specifically requested verification against the current dual-edition main. `.artifacts/m1-6c/representative-acceptance-v1.json` pins that review. Full production and routine integration/validation/package delivery are authorized; recheck current main before delivery. The inventory matrix remains source-only until actual runtime evidence fills each applicable cell.
