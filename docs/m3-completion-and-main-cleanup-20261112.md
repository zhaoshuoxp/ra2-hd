# M3 completion, current-main cleanup and next scope

Date: 2026-11-12. Audited baseline: local main `1f9caf3a`. Accepted v0.5 runtime remains `88ac426b`; subsequent acceptance and maintenance changes do not rebuild or alter the signed application.

## Completion decision

**M3 is complete within the accepted original-campaign scope on Mac arm64.** No remaining planned production blocker was found. The source audit matches all 40 prepared mission identities and all 136 selected HD movie identities to the retained original inventory. Accepted RA2, YR and M3.4 runtime commits are ancestors of current main.

| Planned scope | Current result |
| --- | --- |
| RA2 Soviet, Allied and training | 12 + 12 + 2 accepted maps |
| Yuri's Revenge Soviet and Allied | 7 + 7 accepted maps |
| Campaign maps and objects | Accepted original-source maps, existing HD reuse, added task objects and theater coverage |
| Campaign flow | Selection, direct starts, objectives, outcomes, retry, next mission, saves and difficulty support delivered |
| Campaign presentation | Accepted loading/selection artwork, localized interface and media/caption routing |
| HD movies | 80 RA2 + 56 YR identities, full-screen and radar playback, Original setting/fallback |
| v0.5 menu | Accepted complete Yuri badge; original RA2 presentation preserved |

Authority: `ra2-campaign-final-acceptance-20261104.json`, `yr-campaign-final-acceptance-20261109.json`, `m3-4-final-acceptance-20261112.json` and their handoffs. The new `../../project-history/m3-closeout-20261112/scope-audit.json` records current identity checks and source ancestry. This audit reuses accepted gameplay/visual evidence; it is not a new forty-mission replay or every-frame inspection.

The two library-only movies unavailable in the downloaded package retain accepted R6 HD bytes inside the current selected pack. All 83 radar movies also retain accepted local HD bytes. They are accepted source exceptions, not unfinished production. The selected revision remains `downloaded-1080p-r1`, with 51 downloaded full-screen, 83 radar and two library-only entries.

Original-only SQD and the legacy RA2 YURIPR route remain the previously documented artwork policies. YR Yuri Prime uses its separate active HD family. Existing source-cue/caption, pristine-executable AI/RNG/particle/trajectory and complete all-difficulty victory qualifications are retained; acceptance does not expand those claims. Combined v0.5 Windows execution and physical 8/16 GiB validation remain unperformed. These boundaries are explicit and do not reopen accepted production.

`yr-campaign-current.json` contained two stale `remainingCommonWork` strings for already accepted visual feedback/retests. Their exact previous text is preserved in the scope audit; the current field is now empty and links to the final acceptance. Historical dated production ledgers remain unchanged.

## Current-only cleanup

The user again requested the established current-main-only retention policy. This supersedes earlier M3.4 closeout instructions that retained all prior apps and R5/R6 masters. This pass removed:

- Five superseded complete apps: the pre-movie YR r6 delivery and four M3.4 deliveries preceding v0.5.
- Three expanded independent movie-pack copies, two obsolete movie-pack ZIPs, and two unselected canonical R5/R6 movie revisions.
- 38,118 generated movie-processing media files: diagnostic frames, proxy clips, decoded derivatives and intermediate returns. Small reports, recipes, masks/control/reference/master inputs and the review directory remain.

The retired logical size is **122,142,842,575 bytes**. Observed filesystem free space increased by **110,592,000,000 bytes (110.6 GB / 103.0 GiB)**. Logical bytes, directory allocation and filesystem free space differ because some files share storage. These figures describe this additional pass and do not include the preceding M3.4 cleanup. Workspace allocation decreased from approximately **211.61 GiB to 97.59 GiB**, measured by a single traversal for each snapshot.

Keep these current deliverables:

- `/Users/Aone/RA2remaster/RA2-HD-Mac-v0.5-20261112/Red Alert 2 HD.app`.
- `/Users/Aone/Desktop/RA2-HD-Mac-arm64-v0.5-20261112.zip`.
- `/Users/Aone/RA2remaster/RA2-HD-Movie-Pack-downloaded-1080p-r1.zip`.

Canonical selected resources, original retail and downloaded inputs, current artwork/required authoring inputs, real profiles/saves/settings, source history, dependencies and final reviews remain. Current movie bytes are complete under `.local/media/hd-movies/downloaded-1080p-r1`; old R5/R6 production references remain provenance rather than live resource paths. Future work starts from current main and its selected pack. Do not restore entire obsolete apps or movie packs to satisfy a historical path.

Deletion receipts and compressed old delivery/pack descriptors live under `../../project-history/m3-closeout-20261112`. No complete historical resource archive was created. Unrelated user downloads were not removed. The remaining project-history tree still contains source inputs and regression dependencies and was not recursively purged.

## Verification

Before retirement, all 136 current movie payloads and the retained Desktop/independent ZIPs matched their accepted hashes. The current app passed deep strict signature verification. After retirement, all **16,444 selected files** retained exact hashes and **99,583 protected file/link metadata records** remained unchanged. The five pre-existing YR diagnostic files retain their accepted hashes and remain unstaged/uncommitted.

Post-cleanup registration and focused test results are recorded in `../../project-history/m3-closeout-20261112/verification.json`. The accepted uninterrupted 2,150-case host run remains applicable to unchanged runtime source; this cleanup does not claim another full host run, fresh native gameplay, Windows evidence or new visual acceptance. No game logic, renderer, selected resource bytes or signed app contents were modified.

## Recommended next milestone

**M4.1: v0.5 Windows integration validation and bounded cross-platform stabilization.** No new implementation or package is started by this recommendation.

1. Prepare a current-main Windows development handoff with exact commit/resource hashes, reproducible setup and a small reporting script. Transfer current code and required resources; omit Git history, historical apps, review captures and intermediate processing files. Reuse matching resources on the Windows machine when possible.
2. On actual Windows, check both editions' full-screen/radar HD movies, Original fallback, selection-to-mission flow, save/process restart, outcome/next mission and representative HD skirmish performance. Record hardware, output resolution, art density, frame timing, memory and video decoding behavior. Target actual failures; do not mechanically replay every accepted mission/difficulty combination.
3. Return commits and compact evidence to main, retain Mac behavior with focused regression checks, then stabilize current complete and program-only/resource-pack delivery layouts. Keep the user's accepted performance boundary; 90 FPS is not a required gate.

Same-outcome M3 corrections may continue in their existing execution conversations. M4.1 changes the objective and should use a new explicitly scoped execution conversation. No new conversation, branch, remote push, Release, upload or next-stage development was initiated.
