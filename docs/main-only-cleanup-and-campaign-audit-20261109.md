# Main-only cleanup and campaign audit — 2026-11-09

The user requested current-main-only maintenance, an explanation of five uncommitted diagnostic scripts, and a campaign artwork gap audit before HD movie implementation. Starting main was `f190c8ed`. No gameplay, rendering, media, selected artwork or real profile data was changed. M3.4 implementation has not started.

## Retired content and retained authority

The cleanup retired 187 unselected resource directories (161 terrain, 9 environment, 17 HD), 16,777 obsolete diagnostic files, and the superseded RA2-only V56 delivery. The accepted combined r6 application remains the current delivery. Its deep strict signature verification passed. Current selected resources, authoring masters and necessary recipe inputs, original retail installation, real saves/settings and Git history remain.

The first retirement increased measured filesystem free space by 28,672,000,000 bytes; V56 retirement increased it by another 12,288,000,000 bytes. Combined observed increase: **40.96 GB (38.15 GiB)**. Workspace `du` decreased from about 109.75 GiB to 63.57 GiB. Filesystem free space and summed directory allocation differ because historical files share storage and filesystem accounting differs. Do not add the retired logical atlas sizes to the measured free-space result.

Approximate remaining allocated sizes: main repository 15.29 GiB, project-history 33.54 GiB, combined r6 delivery 11.87 GiB, original retail inputs 2.69 GiB, plus finished showcase material. Remaining history includes authoring sources and live recipe/test dependencies; this is not a claim that every remaining historical file is indispensable.

All **16,306 selected shared/campaign files** retained their hashes. Before/after resource plans are exactly equal: 16,866 routes, 211 selections, 12 layers and no metadata overrides. The first pass also preserved 38,075 protected metadata records; V56 was subsequently retired under a separate explicit receipt. No full historical resource backup was created. Retired pack descriptors and deletion hashes are retained as compact provenance.

Receipts live in `../../project-history/main-only-cleanup-20261109/`: `execution.json`, `v56-retirement.json`, `selected-hashes-before.json`, `selected-before.json`, `selected-after.json`, `retired-resource-manifests.json.gz`, `retired-diagnostics.json.gz` and compressed V56 metadata. Historical links to retired captures/atlases are provenance, not live dependencies. The root `PROJECT-LAYOUT.md` and repository development guidance describe the new retention boundary.

## Regression maintenance

Keep tests that protect current behavior after a bug is fixed. Retire candidate-specific experiments and obsolete delivery dependencies. A small metadata fixture or current resource selector should replace a large historical atlas dependency when that preserves the relevant assertion.

- Authored terrain tests now validate current selected groups once, using original TMP geometry, pinned pages, independent 2X/4X bindings, release, budget, corrupt/missing/source fallback and incomplete multi-member behavior. They no longer require every intermediate terrain revision. Single-member groups do not register a meaningless partial-member case.
- Desert reuse retains a 743,825-byte versioned prior manifest and its original ledger hash, preserving provenance assertions without the old atlas payload.
- Rejected SQD and legacy RA2 YURIPR artwork tests were retired. Current Original-only policy checks cover both identities; active families retain pooled-byte, atomic loading and fallback coverage. The combined-budget case uses active DOG/DOGP resources.
- CASLAB checks pin current complete payloads to the original accepted registration hashes and retain source-slot compatibility proof. The historical donor-pixel comparison was completed during registration; this maintenance does not claim to repeat it after donor atlas retirement. Other donor checks remain intact.

One full scan covered 320 executions and found four failed cases in two files: three retired Soviet candidate dependencies and one CASLAB donor dependency. Both files were repaired and rerun successfully (20 and 141 cases). Combined applicable evidence is **2,143 passing cases, zero failures, loading/process errors or skips**. `host-combined-final.json` preserves the original scan and targeted rerun provenance. This is not a second uninterrupted full run. The earlier broad CASLAB migration attempt failed and remains in `building-rubble-rerun.log`; the final scoped implementation passed in `building-rubble-final.log`.

Entry typecheck, selected-resource verification and current app signature checks passed. Runtime and selected resource bytes are unchanged, so no new full package or gameplay replay was produced. Combined-main Windows remains untested.

## Five pre-existing uncommitted scripts

These files total 26,046 bytes and retain their pre-maintenance hashes. They were neither committed nor discarded by cleanup. They are developer automation tools, not game runtime imports or evidence that gameplay fixes are missing.

| File in `scripts/yr-campaign/` | Purpose |
| --- | --- |
| `supported-prism-column.mjs` | Shared automated force-control helper. Its local change optionally limits targets and support positions to playable bounds. Several existing validation scripts import it. |
| `native-allied06-robot-column.mjs` | London robot/IFV force scenario with base construction, source objectives, restart and result checks. |
| `native-allied06-robot-final-force.mjs` | Continues a built robot force toward remaining playable objectives and restart/result checks. |
| `native-allied06-supported-robots.mjs` | Alternative London checkpoint strategy with robots supported by prism tanks and IFVs. |
| `native-soviet07-boris-beacon.mjs` | Boris production/transport, beacon destruction, liberation/base transfer and restart scenario. Its scenario status does not establish full-mission victory. |

Script contents describe intended checks; their existence is not a new execution result. The shared helper has live development-tool consumers. The four scenario entry points may be retired later if their diagnostic value is no longer wanted, without changing gameplay. Resolve that separately from absorbing their uncommitted work into this maintenance commit.

## Remaining campaign scope

The accepted scope includes 26 RA2 campaign/training maps and 14 YR maps, campaign selection/progression, difficulty support, saves, source media routing, radar playback, subtitles and loading/world artwork. Existing source-semantic and platform qualifications still apply.

**HD movie footage remains outstanding.** Installed movies are still original low-resolution footage. M3.4 should audit both editions' introductions, briefings, endings and in-mission radar transmissions, preserving source timing, audio/language mapping and Original fallback.

The current YR art inventory has 4,159 rows and no `MISSING_AUTHORED_FAMILY` rows. Its 28 native-exception rows include repeated theater entries, empty base layers, invisible lights and system rubble markers; they do not mean 28 unfinished visible assets. Inventory evidence is distinct from final user visual acceptance.

Visible policy exceptions remain:

- SQD swimming/grapple artwork deliberately stays Original under prior user direction.
- The legacy RA2 YURIPR HD route retains an old `UPSTREAM_GAMEPLAY_BLOCKED` Psi Wave qualification. This audit did not reproduce that historical gameplay issue. No literal YURIPR reference was found in the imported RA2 campaign maps; indirect production was not exhaustively proved unreachable. Treat it as an optional exception audit, not a newly established campaign blocker.
- YR Yuri Prime uses its separate active YURIX HD family and must not be confused with the legacy RA2 route.

No further whole batch of unmade campaign buildings, units, terrain, selection/loading UI or icons was identified by this audit. Exact original particle/blending behavior, complete three-difficulty victory replay for every mission, pristine engine/RNG equivalence and combined-main Windows/physical-memory validation retain their documented limitations. Those are compatibility or verification boundaries, not a new artwork production batch. Historical per-item `PENDING` strings must be read together with the later final acceptance, not promoted back into active work without evidence.

`campaign-gap-audit.json` records inventory counts and exception identities. The next recommended implementation remains M3.4 HD cinematics; current Original exceptions can be reviewed independently if the user wants to reopen them.

## Agent policy

The no-subagent clause came from earlier execution instructions retained in `AGENTS.md`; canonical-main development does not technically require it. Future explicit task instructions can permit read-only source research, inventory or quality audits by subagents while one agent coordinates shared-file and resource-selection writes. This maintenance did not spawn agents or silently change that default.
