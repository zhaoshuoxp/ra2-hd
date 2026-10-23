# M0.2a ordinary-play acceptance

Prepared: 2026-09-15. **Complete under the user's revised acceptance criterion.** Real desktop input and menu startup pass. Normal defeat and the results screen retain their existing acceptance. Ten-minute survival is no longer required; it is not claimed as passed.

The supplied M0.2a plan is retained locally in `.artifacts/m0-2a/approved-plan.txt`. During execution, the user explicitly replaced its mandatory ten-minute observation with the requirement that a game can end normally. `.artifacts/m0-2a/acceptance-amendment.json` records this change. Historical M0.2 failure labels and raw evidence are preserved.

## Results

| Gate | Result | Evidence and limits |
| --- | --- | --- |
| A: physical desktop input | PASS | Native minimal-page capture/release/recapture recorded; user confirmed all eight checklist items, including actual-game selection, drag selection, movement, attack, panning, Escape and click-to-recapture. |
| A: automated minimal-page input | Default launch FAIL; one foreground follow-up PASS | Native request rejected with `WrongDocumentError` initially; after `page.bringToFront()`, the next request resolved and captured the canvas. This is a bounded observation, not a general automation fix. |
| B: menu startup | PASS | Empty-source errors reproduced before correction, absent after correction and server restart; valid synthetic local video decoded and played; object URLs released. |
| C: normal ending, revised by user | PASS, retained evidence | Two previous natural defeats at 312.524 and 317.161 measured seconds reached the defeat results screen. The simulation and ending code remain unchanged. No fresh completed outcome is claimed in M0.2a. |
| Original 600-second observation | NO LONGER REQUIRED; NOT ACHIEVED | The additional run was stopped following the revision, with 308.703 seconds recorded and all four players still active. Administrative interruption is not a defeat or runtime failure. |
| Build / scoped entry typecheck / tests | PASS | Build and entry typecheck exited zero; 24 tests passed, zero failed, 101 assertions. |
| Source protection / distribution separation | PASS | Source metadata and five imported archive hashes unchanged; no local retail payloads found in the build or new Git paths. |

## Source identity and change

- Repository: `/Users/Aone/RA2remaster/ra2-hd`, branch `m0-2-stabilization`.
- Starting commit: `9a5caf0016b4f0ccb645f9cc1d8b16572ff29694`, initially clean.
- Implementation and harness commit: `50b73b5809d15cde29935301595091b525530fe0`.
- Upstream remains pinned to `898d89188542a3028a232031ce1a0bdc7c605b6f`.
- Host: Apple M2, 24 GiB, macOS 26.6.2, Chrome 153.0.8010.37; Bun 1.3.14, Node 26.7.0, Playwright 1.58.2.

The only product source change is a four-line absent-media guard in `src/gui/screen/mainMenu/component/MenuVideo.tsx`. Missing, blank and zero-byte file inputs now return the existing video wrapper without a video/source element, leaving the underlying static menu artwork visible. Valid local media behavior and object-URL disposal are unchanged. There are no changes to input handling, simulation scheduling, rules, AI, pathfinding, original camera, logical dimensions, VPL or shadows.

The new diagnostic scripts live under `scripts/m0/`. The stability harness gained optional headless execution, read-only unit state fields and a separately reviewed normal-command defense schedule. None of these scripts are product entry points or bundled retail fixtures.

The menu probes ran before the implementation commit: their `source` field consequently names starting HEAD `9a5caf0`, including the after-fix probes. Those after-fix runs exercised the rebuilt, then-uncommitted four-line correction subsequently saved unchanged in `50b73b5`. The additional game run explicitly records `50b73b5` and a clean worktree. Final report commit identity and final status are recorded separately in `.artifacts/m0-2a/final-state.json`.

## A: real input and the automation comparison

The retained M0.2 game-free reproduction was inspected before constructing the bounded comparison. A loopback-only manual check page at `http://127.0.0.1:4001/` recorded native request outcomes, active element, focus, visibility, capture target and browser metadata. The user opened it in normally launched foreground Chrome with a physical mouse, followed the game link, and saved the checklist. They subsequently confirmed in this task that everything worked.

Both saved submissions are preserved under `.artifacts/m0-2a/manual-input/`. The later record, `manual-1789494641627.json`, has `physicalMouseConfirmed: true` and all eight operations marked observed. Native events show capture, release and recapture with the document visible and focused, and the captured element named `target`. Chrome client hints identify architecture `arm`; the reduced user-agent string's generic Intel text is not host architecture evidence.

Minimal-page events are directly recorded. Actual-game operations are user-observed checklist evidence, not an instrumented hardware trace. The record's initial `kind: manual-pending` field is an unchanged page-mode label; the submission events, physical confirmation, checklist and user reply establish completion. The raw records have not been rewritten.

The separate headful automated comparison recorded one default-launch denial, then one successful request after bringing the same page to the foreground. Both attempts already reported document focus and visibility. Retry order and elapsed time are not eliminated as confounders, so this does not prove an exclusive root cause. A trusted event flag alone would also not prove physical input: the automated request carried that flag too. No system settings, normal browser profile or application input code were changed, and no exceptions were suppressed.

Evidence: `.artifacts/m0-2a/automated-input/result.json`, the two manual submissions, and `scripts/m0/{manual-input-server,pointer-input-probe}.mjs`. The comparison closes the manual gate without requiring all automated game input or native Safari automation to pass.

## B: actual startup fault and regression coverage

Tracing the active import corrected the review's preliminary hypothesis. `MainMenu.ts` uses the class in `src/gui/screen/mainMenu/component/MenuVideo.tsx`; the similarly named functional component under `src/gui/component/` is not the active menu path and was left alone.

`Gui.getMainMenuVideoUrl` found no playable local media and supplied `undefined`. Before correction, the active component nevertheless rendered `<source src="" type="video/webm">`. The DOM resolved this source to the application root, and each of two fresh navigations emitted one source-element error. **No actual media HTTP request was captured.** A resolved root URL is not proof of a root media request, and no prop/effect race was established in the active component.

| Probe | Navigations | Source-element errors per navigation | Media HTTP requests | Page / console errors | External attempts |
| --- | ---: | --- | ---: | --- | ---: |
| Before correction | 2 | 1, 1 | 0 | 0 / 0 | 0 |
| After correction | 2 | 0, 0 | 0 | 0 / 0 | 0 |
| After local server restart | 2 | 0, 0 | 0 | 0 / 0 | 0 |

The actual menu component also passed a focused browser lifecycle regression. Missing, empty-string, whitespace and zero-byte File inputs produced zero media elements. A browser-generated 1,067-byte synthetic WebM played through File and blob-URL inputs, File replacement, unmount and remount. Each played case reached readyState 4 and advanced playback time. Four object URLs were created and all four were revoked, including the fixture-owned URL. No source/video errors, page/console exceptions or external attempts were observed.

The synthetic clip existed only in browser memory; generated test bundles remain in ignored artifacts. Repeated full menu navigation, component remount and server restart are covered. A new post-match menu transition is not claimed. Coverage is Chrome on this Mac, not every media format or browser.

Evidence: `.artifacts/m0-2a/{menu-before,menu-after,menu-restarted,menu-lifecycle}/result.json`; `scripts/m0/menu-fixture.tsx`, `menu-lifecycle.mjs` and `menu-startup-probe.mjs`; `.artifacts/m0-2a/{checks.json,tests.log,typecheck.log,build.log}`. The scoped entry typecheck is not a claim that every upstream development/test entry typechecks.

## C: normal ending and the stopped optional run

The approved plan already accepts the two M0.2 natural defeats and says to repeat outcome validation only if input/startup changes affect the game lifecycle or another unresolved concern warrants it. A source comparison from both retained run commits to `50b73b5` shows only the menu guard described above. With the user's new criterion, another survival or defeat attempt is unnecessary.

| Retained run | Source | Measured duration | End tick / final tick | Observed ending |
| --- | --- | ---: | --- | --- |
| `.artifacts/m0-2/stability/result.json` | `edc7c94` (clean) | 312.524 s | 6629 / 6630 | Human defeated, game status 2, defeat results text present |
| `.artifacts/m0-2/stability-retry/result.json` | `41da24b` (only report untracked) | 317.161 s | 6704 / 6705 | Human defeated, game status 2, defeat results text present |

Both retained runs recorded zero page exceptions, console errors and external game requests; their separate startup source-element errors remain historical evidence and motivated Gate B. Raw file hashes and the source comparison are recorded in `.artifacts/m0-2a/retained-outcomes.json`. Human victory, clicking Continue after results, and a fresh completed match on the corrected build are not inferred from these records.

Before the user removed the duration requirement, one further defense run had started after review of the earlier losses. Existing action/economy evidence showed GIs behind the base and attackers beyond their practical coverage, with construction and replacement spending competing for credits. The reviewed schedule moved ordinary paid infantry and existing tanks forward, deployed stationary GIs and reserved money for construction and limited replacement. It did not grant resources, change health, weaken AI or force an outcome. The exact review, schedule and issued normal actions are preserved in `defense-review.json`, `defense-plan.json`, `scripts/m0/frontline-defense.mjs` and `active-1/result.json`.

The fixture stayed at speed 3, `MP01T4.map`, seed `1700000000000`, 1280 x 960 viewport, DPR 1, 10 starting units, 10,000 credits, Americans at start 0 and three Normal Libya opponents allied on team 1 at starts 1/2/3. Warmup was 20 seconds. This supplementary run used headless Chrome, lightweight observation and original high-quality shadows.

At administrative stop, its last saved measurement was 308.703 seconds, tick 6576; the human and all three opponents remained active. There were zero page exceptions, console errors or external game requests. The process was stopped because the test was no longer required, so it has no normal finalization record, natural end or final screenshot. `active-1/termination.json` explicitly records this distinction. There was no second further survival attempt. The original M0.2 ten-minute FAIL remains unchanged; no durations are summed and no ten-minute pass is claimed.

## Protection, shutdown and verified start instructions

Source protection compared 3,368 entries, including 3,146 regular files, with the original metadata snapshot. Sizes, modification times, modes and symlink metadata match; access times are excluded. All five allowlisted source archives match their stored SHA-256 values and local imported copies. The source and repository parent still have no `.git` directory. No import or installation executable was run.

The separation audit found no retail archive extensions or matching local asset hashes in `dist`, no new unignored asset paths, and no retail asset paths in the current Git index. Existing upstream history still contains binaries; the audit does not claim that history is sanitized or authorize distribution. Existing `.local` resources and ignored screenshots remain local. No dependencies were upgraded and nothing was pushed or published.

The task's test browser and loopback services on ports 4000 and 4001 were stopped after verifying process identity and repository working directory. Neither port had a listener afterward. The user's normally opened Chrome window and tabs were left untouched. See `.artifacts/m0-2a/{source-protection,separation-audit,shutdown}.json`.

To restart the existing local build:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun run start:offline
```

Open `http://127.0.0.1:4000/` in foreground Chrome and choose **Offline Skirmish**. Existing imports are already present. This command and loopback URL were verified, including a service restart. Stop the terminal service with Ctrl-C after use. If source is changed later, run `bun run build` before previewing it. No source installation program is needed.

## Remaining limits and next bounded task

M0.2a has no remaining blocker under the revised ordinary-play gates. It does not establish a human victory, thirty-minute endurance, performance improvement, a Safari stutter fix or a pathfinding repair. The previous speed-6 pathfinding error remains `NOT REPRODUCED` in its bounded follow-ups; preserve the original failed evidence. Automated pointer capture still depends on launch/activation conditions beyond the one successful follow-up.

Windows x64, Electron and native Safari were not validated here. Existing MCV/VPL/shadow findings retain their previous coverage limits. The custom upstream Normal AI is not proof of retail AI or exact vanilla 1.006 equivalence. Complete Simplified Chinese, campaigns and HD remain outside this task.

The next separately authorized task can build a minimal local Electron application for macOS Apple Silicon, preserving the current offline renderer and local-resource separation, and plan an early smoke test on an actual Windows x64 host. Bound that task to launch, resource access, real input and normal game exit; do not add installers, HD, campaigns or rebalance AI. A Windows pass must come from a Windows run. No later-stage implementation was started here.
