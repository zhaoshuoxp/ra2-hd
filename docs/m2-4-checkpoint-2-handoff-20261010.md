# M2.4 checkpoint 2 handoff

Status: unified skirmish and SNOW representative technical checks passed. Visual direction is pending. Full SNOW, URBAN, NEWURBAN and DESERT artwork is incomplete; M2.4 is not complete. Windows is NOT_RUN. Keep feedback and remaining execution in this conversation.

## Review delivery

- App: `/Users/Aone/RA2remaster/M2.4-Snow-Samples-Mac-20261010-v1/RA2-HD-M2.4-Snow-Samples/Red Alert 2 HD M2.4 Snow Samples.app`.
- Review: `/Users/Aone/RA2remaster/M2.4-Snow-Samples-Mac-20261010-v1/Review/index.html`.
- Complete sibling resources: `RA2-HD-Editions-Resources`; independent user profile: `M2.4-Review-Profile`, both beside the app. Preserve the package directory together. The app can launch independently of the task worktree. The copied package has no external symlinks.
- Package receipt: `/Users/Aone/RA2remaster/M2.4-Snow-Samples-Mac-20261010-v1/package-receipt.json`. It records packaging before runtime validation. The superseding validation/delivery receipt is `.artifacts/m2-4/checkpoint-2-v3/receipt.json` in the task worktree.

Runtime source is commit `3a74a194a741a1a23cbdaf6886bf332e4188ab3a` on `task/m2-4-all-skirmish-theaters`; subsequent changes are validation scripts, inventory accounting and documentation. Main remains clean at `a5d7b86c3721511ec6c054a52dd3cdb0f7450c02`. No main integration, push, publication, archive cleanup or accepted-app replacement occurred.

## Scope and unified adaptation

| Measurement | Count |
| --- | ---: |
| Imported catalog declarations | 298 |
| Inventoried entries, including explicit exclusions | 417 |
| Scoped edition/source entries | 305 |
| Independent source files and distinct byte streams | 234 |
| Declared mode variants across scoped edition/source entries | 376 |
| Sources without catalog mode declaration | 31 |
| Unified-menu selectable entries | 304 |
| Native verified entries | 301 |
| New native checks / verified accepted evidence reused | 191 / 110 |
| Original archive structure failures retained | 4 |

Original tags are preserved: standard 152, meatgrind 52, nukewar 21, navalwar 24, airwar 3, megawealth 66, duel 33 and teamgame 25. These overlapping counts total 376, not 376 independent maps. Every admitted source takes standard `mpbattle.ini`, actual starting-location capacity and existing lobby options. Only the map's `MultiplayerDialogSettings` section is restored from the standard merged rules. All other original mechanisms, placements and map rules remain. `checkpoint-2-v3/mode-adaptation.json` and `.csv` record original identity, tags, capacity changes, restored/preserved sections, menu status and actual native evidence per source.

The custom-options native check on `tourofegypt.map` confirms 7,500 credits, selected starting units, allies, standard technology/refinery construction and disabled quick game, superweapons, MCV repack and bridge destruction. Native defeat/victory follows the user's non-quick-game setting. Original DESERT and NEWURBAN initialization passes; the two exact 20-byte all-zero TMP image tables are empty slots, with numbering retained and actual references still rejected.

## SNOW resource and validation checkpoint

Four complete terrain resource groups contain 11 files and 21 subtiles; five complete environment families contain four trees and CAEUR1 with four body states. Both 2X/4X densities come from generated detail masters at sufficient resolution, with exact original geometry, masks, remap indices, frame order and separate shadows. The initial combined ramp/road/cliff master was rejected for registration quality and replaced by isolated masters; all attempts and prompts are retained.

Selected packs are `snow-m2-4-representatives-v2` and `snow-environment-m2-4-representatives-v1`. The 37 copied pointer, manifest and atlas files are independently hash verified. The copied package contains all accepted dependencies and the imported archive files, not only source code. New SNOW assets use independent PNG/RGBA loading; unchanged faction prepared data remains pinned. World/UI/prepared budgets are unchanged.

Native `xdisaster.map` passes at both densities with 86 actual environment object bindings each. CAEUR1 normal, damaged, repaired, occupied, evacuated and rubble states pass. Original restart and the SNOW-to-TEMPERATE 4X transition release old textures and zero retained charges. World charges are 70,219,148 bytes at 2X and 205,475,080 bytes at 4X, within 512/1280 MiB. Focused tests passed 27 cases and 925 assertions; typecheck and isolated build passed. Review UI verification passes with 50 hash-pinned images, eight matched scenes, four building states and 18 atlas comparisons. Default viewing retains 1:1 pixels.

Inventory accounting now follows existing loader behavior for cross-theater shared units and byte-identical Soviet building aliases. It does not require new art for already accepted GI/Engineer/Conscript/Rhino families or snow shipyard/Tesla sources. Full coverage gaps remain SNOW 876 groups, URBAN 1,001, DESERT 703 and NEWURBAN 928. TEMPERATE has zero new-art gaps. LUNAR has zero scoped maps and no production work.

## Open issues and next batch

- Three original archive variants (`ra2:mp04t8.map@beaac8d3ffd2`, `yr:mp04t8.map@beaac8d3ffd2`, `yr:xmp04t8.map@f11a0e453c44`) reference absent `hyte01.tem`, tile 22, subtile 0, at map coordinates [77,161]. A representative fails in the copied app with the explicit missing-TMP error. No replacement tile or map rewrite was fabricated.
- `yr:id-5b521907.map@26a65602d7a0` has zero starts and only non-start waypoints 699/700. It remains in the audit and cannot start a skirmish without inventing map data.
- Both edition sources of `mp13s4mw.map@a4f07f9b9271` have undeclared original modes and disable starting HTNK, E2, SHK, LTNK, MTNK, HOWI and E1. The source-specific classification question remains pending; its overrides are preserved.
- SNOW direction review is pending. The next production batch expands reusable SNOW terrain, transitions/water/bridges and complete environmental/native-state families, then proceeds through URBAN and NEWURBAN/DESERT. The representative subset is not full map coverage. No main merge is performed before visual acceptance.

Failed receipts remain intact: initial native launch restrictions; test-only fixture/decoder limits; the rejected combined terrain master; the missing-native-tile case; a temporary HTML verifier startup issue; checkpoint v1's abstract PNG-name/path mismatch; and custom-options v1-v3 UI locator/transition races. Corrected checks use actual published paths and wait for visible lobby controls. These validation-tool failures did not alter source maps or accepted art. `native-evidence-v3.json` supersedes planning that had incorrectly inferred accepted membership for eight newly unblocked dry-theater maps; all eight received new native checks.
