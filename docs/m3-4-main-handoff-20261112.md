# M3.4 accepted main handoff — v0.5

M3.4 is complete and user accepted as of 2026-11-12. The user accepted the movies, then approved the complete reference-faithful Yuri menu badge and requested canonical-main closeout, cleanup and this handoff. Public release is **0.5**, and the Mac bundle/package version is **0.5.0**. The [formal acceptance](m3-4-final-acceptance-20261112.json) supersedes pending visual-review flags in earlier immutable production and signed-build records.

All implementation is on `/Users/Aone/RA2remaster/ra2-hd` local `main`. Accepted frozen runtime `88ac426b84723bc4a0451c221e6a43b35704791b` is an ancestor of acceptance commit `6de5415b`. Later acceptance and handoff commits change documentation only. The signed app is retained unchanged; no merge, branch, worktree, push, Release or upload is needed or performed. The [handoff JSON](m3-4-main-handoff-20261112.json) pins delivery, acceptance, protection and cleanup receipts. The final documentation commit and exact remaining worktree status are recorded in `/Users/Aone/RA2remaster/project-history/m3-4-accepted-20261112/final-main.json`.

## Accepted result

| Movie source | RA2 | Yuri's Revenge | Total |
| --- | ---: | ---: | ---: |
| Downloaded full-screen, 1440x1080 / 60 fps | 32 | 19 | 51 |
| Retained HD radar, 560x440 / 15 fps | 47 | 36 | 83 |
| Retained library-only HD exceptions | 1 | 1 | 2 |
| Registered HD identities | 80 | 56 | 136 |

The selected immutable revision is `downloaded-1080p-r1`, manifest SHA256 `cc4ab6015567a7055f89177ebbbc9d8aa196aefede5f06409efa367dd72cc11a`, with 5,541,473,018 movie bytes. The downloaded package lacks RA2 `emprtrlr.bik` (`ra2:archive-87500336`) and YR `renegade.bik` (`yr:archive-2e440187`); those library-only entries retain exact R6 HD payloads. All 83 radar payloads also retain exact R6 bytes by explicit user choice. These are accepted provenance exceptions, not unfinished movie production.

Full-screen, pre-mission, report, victory/post-score, archive-library and in-mission radar routing is integrated for both editions. Original footage remains available through the independent per-edition HD movies setting and missing/damaged/unsupported-file fallback. Original dialogue, existing localized captions, queue/cancel behavior, decoder release and audio ducking are preserved. Movie Library selection preserves mouse and keyboard scroll. H264 High level 4.2 is admitted by both desktop and renderer for native 60 fps; older 15 fps level 4.0 and VP9 routes remain supported. The independent pack needs the updated runtime, including v0.5.

The Yuri Home radar uses a complete rebuilt silver-winged `YURI'S REVENGE` badge, including small gold Command & Conquer and red/gold title lettering. A separate clean plate and source-space exclusion remove the baked RA2 emblem while retaining radar motion. Both HD and Original UI show the accepted badge; video failure retains the clean radar sweep and badge. The existing RA2 menu artwork stays exact. The [2172x724 authored master and independent 2X/4X exports](../art/yuri-menu-logo-20261112/provenance.json) retain their prompts and supplied-reference provenance. The original RA2/YR campaigns and accepted gameplay artwork are unchanged: all 26 RA2 campaign/training maps and fourteen YR maps remain in the complete app.

## Delivery and startup

- Complete signed app: `/Users/Aone/RA2remaster/RA2-HD-Mac-v0.5-20261112/Red Alert 2 HD.app`.
- Desktop ZIP: `/Users/Aone/Desktop/RA2-HD-Mac-arm64-v0.5-20261112.zip`, 13,366,380,602 bytes; SHA256 `6fdf923635ce22dd018de0fd0f23e3969a4753c6435747602638e1bae62f1412`.
- Independent movie pack: `/Users/Aone/RA2remaster/RA2-HD-Movie-Pack-downloaded-1080p-r1.zip`, 5,541,587,802 bytes; SHA256 `82c3cef82c1740dc653e4c82e3cfc2012f5c366518351cb363dec39b5caddd33`.
- [Accepted movie excerpts and coverage](../.artifacts/hd-movies/review/M3.4-Downloaded-Movies-r1.html), SHA256 `718b02b968651cd16d8d51899b09a37cb91c9630d9dfa5cfb14ee682732196c5`.
- [Accepted menu and actual 2X/4X review](../.artifacts/yuri-menu-logo-20261112/Yuri-Menu-v0.5-Review.html), also embedded in the app as `HD-Movies-Review.html`.

Quit an older app before opening v0.5. Its configured review profile is `RA2 HD Movies Review 20261111`; an explicit `RA2_DESKTOP_USER_DATA` overrides it. Existing actual Library profiles, settings and saves were preserved without migration. Normal main development uses its existing `RA2 HD` profile and current canonical `.local` resources:

```bash
bun run desktop:prepare
bun run desktop:start
```

Keep the packaged source identity separate from later documentation commits. Signed `Campaign-Info.json` records the earlier new-logo review checkpoint; the formal acceptance above establishes the current accepted status without mutating the signed app.

## Verification and retained qualifications

The accepted v0.5 runtime passes one uninterrupted full host run: 2,150 cases across 322 executions, with zero failures, skips, load errors or process errors. Typecheck and current-source native checks cover both editions, three viewports, three retail radar positions, HD/Original UI, actual 2X/4X exports, video-error fallback, Options return and the v0.5 footer. The actual Desktop ZIP passes all 17,017 entry bytes/modes/symlinks, real extraction, strict signing and four fresh extracted-app native scenarios: menu/logo/lifecycle, RA2 movies/radar/save/restart, YR movies/radar/save/restart and both-edition library scroll/caption/release. All 16,444 game-resource files match the preceding accepted movie delivery. Movie engineering separately verifies all 202,236 native downloaded frames in order, exact original AAC payload/PTS/DTS/duration, 164 final-frame holds and the original dialogue/caption clocks. Prior native library coverage samples all 136 identities at 408 bounded start/middle/end sections.

Fresh post-cleanup checks pass typecheck, thirteen existing regression tests across four isolated files, current selected-resource registration, all 136 streamed HD hashes, strict signatures before/after native startup and the retained app's both-edition menu scenarios. The selected plan remains 16,444 files, 17,002 routes, 212 selections, twelve terrain/environment layers and zero metadata overrides. All 105,626 protected records retain their content, modes and recorded link targets. The five real Library profiles retain all 245 records, rechecked again after native validation. The 2,150-case full suite predates this cache-only cleanup; the post-cleanup tests are separately identified in the [verification receipt](../../project-history/m3-4-accepted-20261112/Verification/post-cleanup.json).

Downloaded MRZJL marks, native interpolation, variable picture phase, occasional blended cuts, motion blur and fine-edge softness remain source qualifications. The 164 end holds preserve original clip durations; user acceptance does not establish every-frame human review or zero upstream artifacts. Existing caption/source-cue exceptions and original campaign/source/difficulty qualifications remain unchanged. Mac arm64 is verified. Windows, physical 8/16 GiB targets and additional exhaustive pristine-engine/difficulty validation remain unperformed. The app is ad hoc signed, with deep/strict verification, and is not notarized.

## Cleanup and preserved working state

The audited closeout retires one byte-verified redundant r2 ZIP extraction, 119 receipted or interrupted source-derivative/MIX copies and 121 historical isolated test profiles. Each profile's state is archived without disposable caches before removal; two newly created post-cleanup native profiles are likewise archived and removed. Retired logical size is 29,894,578,005 bytes. Observed filesystem free-space increase during removal is 29,959,647,232 bytes; shared storage and concurrent activity affect this observation. The [cleanup execution](../../project-history/m3-4-accepted-20261112/Cleanup/execution.json), plan, compressed protection ledger and verified profile archives remain under `/Users/Aone/RA2remaster/project-history/m3-4-accepted-20261112`.

Canonical `.local`, R5/R6/downloaded masters, all original retail inputs, the seven original downloaded inputs, accepted current/prior apps and ZIPs, authoring masters/frames, source recipes, raw technical reports, embedded reviews, real profiles, dependencies and Git history remain retained. Every regression test remains in source; the retired caches are not current test inputs. Historical receipts can name retired proxy/extraction/profile paths. Use immutable manifest hashes for current movie bytes, fresh output directories for new authoring and the archived state for historical QA. Do not recreate obsolete complete test applications merely to satisfy old provenance links.

Five pre-existing unrelated YR diagnostic files remain byte-identical and outside the acceptance/cleanup commits: modified `supported-prism-column.mjs` and untracked `native-allied06-robot-column.mjs`, `native-allied06-robot-final-force.mjs`, `native-allied06-supported-robots.mjs`, `native-soviet07-boris-beacon.mjs`, all under `scripts/yr-campaign/`. Preserve their edits and staging independently. The remaining worktree status is intentional.

Return this document to the main planning conversation. Same-outcome M3.4 maintenance can continue in this execution conversation. After this acceptance, a materially new milestone should receive a new explicit scope and a new execution conversation when requested. No conversation, next feature, branch, remote push or publication starts automatically.
