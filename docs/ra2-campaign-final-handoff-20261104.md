# Original RA2 campaign acceptance and main handoff

The user accepted the V56 repair and declared the original RA2 campaign complete on 2026-11-04. Status: `RA2_CAMPAIGN_03_USER_ACCEPTED_ON_CANONICAL_MAIN`. Continue future development only in `/Users/Aone/RA2remaster/ra2-hd` on local `main`. No task branch or worktree needs merging: all accepted implementation was already committed on main. Do not push canonical history upstream or start YR campaign implementation automatically.

## Accepted scope

- Original Soviet01-12, Allied01-12 and Training01-02: 26 playable source maps. Story loading production is 24/24, with both training loading pages also exported at independent 2X/4X densities.
- Shared catalog, faction and mission selection, direct source starts, Easy/Normal/Hard, original pre-mission sequences, radar communications, localized speech captions, Movie Library, outcomes, retry and next-mission flow.
- Original task objectives, trigger/team/AI execution, reinforcements and transports, source rules/art overrides, campaign progress and versioned save continuation. Skirmish, both editions, trainer persistence and Windows optimization paths are retained.
- Accepted campaign world/loading art, source-qualified reuse, complete-family fallback, bridge and narrow/wide road transitions, loading cylinders, wall-clock score time, C4 retreat, neutral-building targeting/retaliation, Allied10 three-house base production, squid/hull animation and the final intermittent AA turret repair.

The last defect was delayed HD turret attachment under an already settled static parent. The new color/depth meshes now publish their local matrix once before normal manual world traversal. This preserves existing culling and static-parent optimizations. Never replace accepted turret art or raise budgets to address this transform path.

## Source, delivery and verification

Accepted runtime commit: `0fc2321dd644524ebc54ee50490f476c69336b46`. Pre-acceptance delivery record: `fbf10285d94242baee46f4b12f1a7dc1874e4824`. User acceptance was committed at `3b2bf18a8f8cb36ca43df0c38ec1c0ea9a82474e`. The final closeout main identity and clean-worktree receipt are `../project-history/ra2-campaign-accepted-20261104/final-main.json`. The signed final V56 app is `/Users/Aone/RA2remaster/RA2-HD-Original-Campaigns-Mac-20261104-v56/Red Alert 2 HD.app`, release 0.3 / bundle 0.3.0. This closeout changes records and removes audited derived files; it does not rebuild the accepted runtime.

V56 passed 1,590 host cases across 270 executions with zero failures, loading/process errors, omissions or skips. Native Mac checks cover repeated original Allied11 openings at 2X/4X, actual world transforms and color draws before camera tours, camera return, Hawaii/finale AA, complete Original fallback and exact restart continuation of a real V55 missing-turret save. The final ZIP had all 15,507 extracted entries checked and four actual-extraction native checks. Its historical SHA-256 is `bae5a9c3e85d8fd676504586841bb1871bdd1a5590216a12c18e69c8449a4e11`.

The Desktop V56 ZIP, launcher and external review were already absent at this closeout's initial read-only check. Their absence is not attributed to this cleanup. Retain the signed final app and its embedded review. No replacement package is requested or generated.

Cleanup retires eight obsolete M3.2/V47/V50-V55 delivery directories, the campaign `.artifacts` tree and external campaign review copies: 111,388,031,518 logical bytes. Measured available disk space increases by 110,592,000,000 bytes (110.6 GB). The final signed V56 app remains byte-identical. All 51,062 protected files (41,355,873,698 logical bytes), modes and symlinks match their pre-cleanup hashes, including complete canonical `.local`, original installation, unique campaign Art/Reference and all discovered real Library profiles. The final app passes deep strict signature verification.

Before retiring intermediates, 131 unique authoring files (22,027,684 bytes) and selected raw reports/scripts were retained. The source manifest has 2,675 references, with 2,252 newly retained unique files totaling 122,374,049 bytes; existing canonical authorities are reused by hash. Large raw JSON receipts use gzip and retain the hash of their uncompressed content. Historical delivery identities remain as compact JSON receipts. No full recovery archive is created. See `retained-inputs.json`, `cleanup-plan.json`, `cleanup-execution.json` and `protected-after.json` in the closeout evidence directory.

Post-cleanup full host verification passes all 1,590 cases across 270 executions with zero failed cases, loading/process errors, skips or omissions. Entry typechecking and formal campaign hash/catalog validation also pass: 12 Soviet, 12 Allied and two training maps; 762 resource routes and 27 manifest/index selections. Tests use canonical resources and versioned fixtures after removal of the temporary tree. No native gameplay run or new package is needed for this records-only closeout; the complete accepted app is hash-identical. See `ra2-campaign-final-acceptance-20261104.json` and the closeout `HostFinal/summary.json`.

## Remaining qualifications

There are no remaining planned campaign production/material blockers in this accepted RA2 scope. Preserve these research and validation limits rather than treating user acceptance as new evidence:

- Soviet01 particle12 reachability/allocation/lifecycle remains unconfirmed. The local installation includes CnCNet patches; pristine executable AI cadence/recruitment/ties, RNG, particle and transport ordering have not been established as exact.
- Allied03 spark phase/blend, optional unattached media ordinals and archive-absent CASIN01W/S/E retain their documented source boundaries.
- Native C4 retreat/debris attribution is verified; pristine executable debris trajectories, naval fuse and escape trajectories are not compared.
- Complete victories for every mission at all three difficulties are not claimed. Native Windows and physical 8 GiB/2X and 16 GiB/4X target machines remain `NOT_RUN_ON_THIS_MAC`.
- YR campaign implementation remains unavailable. Both editions' existing skirmish support is preserved.

## Resource and data maintenance

Canonical resource authority is `.local`: original imports in `assets`, campaign source maps/media/payloads in `campaign/ra2`, movie library in `media`, and the existing selected HD/UI/environment/terrain packs. The V56 selected closure contains 14,948 files: 14,160 shared and 788 campaign entries. Root selectors and source identities remain unchanged. Current world caps remain 512 MiB at 2X and 1,536 MiB at 4X; UI remains 16 MiB.

Keep the unique masters, user-returned artwork, recipes, prompts and source-qualified inputs under `../project-history/ra2-campaign-completion-20261026/Art` and `docs/campaign-art`. Additional unique inputs retained from staging are in `../project-history/ra2-campaign-accepted-20261104/Authoring`. Resolve historical staging paths through `retained-inputs.json` before creating a new recipe; preserve the old recipe's identity and do not restore its retired staging tree. Publish future corrections as new immutable revisions with source/palette/theater/native-state checks and independent densities. Preserve `.local/prepared-hd`, original installation under `../Resource`, dependencies, Git history and real user saves/settings.

Distribution and development profiles remain separate. Normal main development uses `~/Library/Application Support/RA2 HD`; the accepted V56 app retains its existing `RA2 HD Campaign Review 20261102` profile name. A retained source-review profile, if present, must not be deleted with HTML reviews. Do not reset, silently migrate or clean real profiles. Test integration uses formal `.local` or small versioned fixtures; never restore retired multi-gigabyte test directories to satisfy old paths.

Useful code locations: `src/data/campaign` contains source definitions/catalog/media policies; `src/game/campaign` contains trigger/team/AI/runtime/save policies; `src/gui/campaign` and `src/gui/screen/mainMenu/campaign` contain selection, lifecycle, media, subtitles and progress. `desktop/campaign-profile.mjs` validates source identities and registers resources. `scripts/campaign-completion` contains the focused/native checks, fixtures and art recipes. Preserve version-pinned old-save semantics; fresh Allied10 uses `baseActivationVersion: 3`, while older saves retain their stored policy. The V56 render-transform repair applies after restoring existing saves without changing their simulation policy.

## Next development

Return to the main planning conversation with this report and `docs/development-state.md`. Let the user choose the next milestone; this execution does not start a new feature. Recommended next work is the user-selected feature or separately scoped Windows/physical-memory validation. Reuse accepted evidence for unchanged behavior and run checks appropriate to the next change.

Normal local entry:

```bash
cd /Users/Aone/RA2remaster/ra2-hd
bun run desktop:prepare
bun run desktop:start
```

Full host verification when justified:

```bash
RA2_TEST_RESOURCE_ROOT=/Users/Aone/RA2remaster/ra2-hd/.local bun run test -- --output /private/tmp/ra2-host-next
```

Same-outcome feedback can remain in the existing execution conversation. New milestone planning belongs in the main conversation after this accepted handoff.
