# M1.6C accepted building integration into main

The user accepted the complete dual-edition Soviet building review and explicitly requested merging it into the updated main branch. Main checkout `/Users/Aone/RA2remaster/ra2-hd`, branch `m0-2-stabilization`, was clean at `f0412b9` before integration.

## Integration and preservation

The isolated continuation merged `f0412b9` at `89207af`. The only conflicts were desktop profile handling and native validation entry points. The resolution retains both DUAL-EDITION-R5 and M1.6C profiles, companion-resource discovery, and both suites of native checks. R5 gameplay/audio source files are byte-identical to the predecessor. Main then fast-forwarded to `69a50dd`, which includes the final building acceptance and integration authorization.

Added 245 hash-pinned resource files (67,150,514 bytes) using exclusive creation, replacing none. All 9,131 pre-existing `.local` / `dist` files and links match their saved pre-integration hashes or link targets. Accepted UI/building/unit resources, raw art, apps, ZIPs, user profiles and other worktrees remain preserved. Historical artwork and delivery evidence remain under `/Users/Aone/RA2remaster/ra2-hd-buildings-m1-6c`; relative historical artifact paths in M1.6C receipts refer to that checkout. The accepted review ZIP remains immutable.

## Validation

Integration evidence is under `.artifacts/m1-6c-main-integration-v1/` in main. `m1-6c-main-integration.json` pins the completed checks: 81 tests, TypeScript entry checking, an isolated build, 69 resource selections, all 162 building coverage cells across eight retail-map cases plus controlled Lunar loading, and the new building functional regressions. Both signed packaged editions pass all 18 building activations, retained M1.7 units, guard scans/promotions and R5 combat feedback. Native building destruction generates zero false lightning events; Yuri cannon/tank three-stage firing loops stop after target loss. All 1,626 packaged entries match their hashes or link targets. Controlled Lunar loading retains its original evidence boundary. Final visual acceptance remains valid for unchanged selected artwork; this integration does not expand the scope to new artwork, campaigns or platforms.

Continue this same task for fixes to the integrated outcome. A materially different objective belongs to the next user-selected task; no task is created automatically.

The default dual-edition package recipe now includes the 23 pinned coverage family manifests and all dependent pages, validates their registration, and carries accepted building documentation instead of an obsolete next-work prompt. Package validation explicitly checks the applicable 18 Soviet HD families in each edition. This integration-only packaging change is committed at `7d00735`; game runtime content is unchanged from the validated `69a50dd` build.

Status: `M1_6C_ACCEPTED_AND_INTEGRATED_INTO_MAIN`. Main is the source baseline for subsequent work. No additional artwork review is required for unchanged assets.
