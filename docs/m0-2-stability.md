# M0.2 stabilization evidence

Date: 2026-09-14. This report follows the user-approved `m0-2-review-and-execution-plan.md`. Only M0.2 was executed. All referenced `.artifacts/m0-2/` files are ignored, local evidence; screenshots and retail data must not be distributed.

## Decision

**No runtime correction.** The measured frame and input endpoints do not establish a sufficiently isolated engine defect for a safe performance fix. This is a bounded diagnostic result, not a claim that the user's Safari stutter is fixed. The Chromium pointer-lock failure is reproducible even without the game; its host/browser cause remains unresolved. Feature expansion must wait for the ordinary desktop input gate to be resolved.

**Ordinary-play acceptance remains incomplete.** Both requested ten-minute observations ended in natural human defeat, after 312.524 and 317.161 seconds. They demonstrate current-build defeat handling without runtime errors, but neither satisfies the ten-minute continuous-active gate. Together with the unresolved automated pointer-capture gate, this blocks feature expansion.

## Source identity and preservation

- Upstream remains `898d89188542a3028a232031ce1a0bdc7c605b6f`, `huangkaoya/redalert2`, preserving the Chrono Divide-derived engine direction.
- Local branch: `m0-2-stabilization`. Initial preservation checkpoint: `5ef3981d5cc6e8e8c2d77e202ebf2041886ecca1`. The explicit reviewed list contains 78 implementation/documentation paths; its hashes and the pre-checkpoint diff are retained. No indiscriminate staging, repin, reset, clean, push or publication occurred.
- Earlier diagnostic source: `edc7c94c271232b1b24d8a14afdc9f6fcc0b007a`. This adds diagnostic scripts and updates the local scope note. `runtime-diff-from-checkpoint.txt` is empty: `src/`, `public/`, dependency manifest/lock, Vite configuration and entry typecheck configuration are unchanged. `runtime-source-manifest.json` identifies the actual files. The final diagnostic/input-schedule commit is `41da24b10cf668c3928f584ebc0bbe44bdc12096`; it adds a stronger legitimate defense retry and more precise stress logging. Product runtime files remain identical to the initial checkpoint. The final report-only delivery commit and clean/dirty state are recorded in `final-state.json` after writing this document.
- Profiling records include their current HEAD/dirty status; profile 3/4/light also record the harness SHA-256. Profile 2 predates the additional native pointer-lock observer; normal actions and the three CPU wrappers are the same. This observer refinement is disclosed rather than claiming byte-identical diagnostic harnesses.
- Existing tests: 24 passed, 0 failed, 101 assertions. Build and scoped entry typecheck passed once, before browser tests. No runtime code changed afterward. The entry check still excludes the pre-existing optional development/test routes; it is not a full-repository typecheck. New diagnostic scripts passed `node --check`.

## Environment and fixture

Apple M2, 24 GiB RAM, macOS 26.6.2 (25G83), arm64, Bun 1.3.14, Node 26.7.0. Chrome 153.0.8010.37 was visible/headful, using ANGLE Metal on Apple M2. Browser User-Agent reports an Intel compatibility string; this is not an Intel Mac test. Main display: DELL S2722QC, 3840×2160 physical / 1920×1080 UI at 60 Hz. Browser viewport 1280×960, DPR 1; measured rAF medians approximately 16.7 ms. Browser-emulated screen dimensions are not the physical display dimensions.

AC power, 80% battery at capture. Thermal queries yielded no usable temperatures or throttling telemetry; no thermal conclusion is warranted. Other user applications remained open and untouched. Only one task test browser ran at a time. No GPU completion timestamps or browser CPU stacks were collected. Chromium exposed `EXT_disjoint_timer_query_webgl2`, but availability alone is not a GPU measurement.

Primary fixture: South Pacific `MP01T4.map`, Americans at start 0/team 0 versus three Normal Libya bots (`d=4`, `c=5`) at starts 1/2/3 on team 1; credits 10,000, army count 10, speed option 3 (20 ticks/s, internal multiplier 4/3), fixed seed timestamp 1700000000000. Shadows fixed at quality 3, actual 8192² target. Camera remains orthographic, zoom 1, rotation `[-π/6, π/4, 0, YXZ]`; world viewport 1112×928 within the 1280×960 canvas. No logical geometry, rules, camera or VPL changes were made.

Each primary sample has 20 seconds of warmup excluded from measurement, then approximately 60 seconds of normal MCV deployment, paid defense construction, two DOM selection/ground-click sequences and one normal ForceAttack ground command. Raw command ticks are retained because a fixed seed does not make wall-clock-driven inputs identical. Construction and attack commands use the ordinary ActionsApi; there are no free resources, spawned units, forced kills or modified difficulty semantics. `profile-1` is a separate 90-second calibration run with a different action schedule and is excluded from the three-sample comparison.

## Frame and input measurements

All times below are milliseconds. Counts use strict thresholds `>33.3` and `>50`; these are approximately 2× and 3× a 60 Hz frame budget.

| Sample | p50 | p95 | p99 | Maximum | >33.3 ms count / rate | >50 ms count / rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| profile-2 | 16.71 | 20.40 | 22.88 | 66.57 | 1 / 0.028% | 1 / 0.028% |
| profile-3 | 16.71 | 20.87 | 23.04 | 71.00 | 3 / 0.083% | 1 / 0.028% |
| profile-4 | 16.67 | 21.05 | 23.74 | 62.81 | 1 / 0.028% | 1 / 0.028% |
| profile-light | 16.95 | 28.31 | 35.71 | 84.75 | 61 / 1.821% | 3 / 0.090% |

The three instrumented samples averaged approximately 59.96 FPS and maintained approximately 20 simulation ticks/s. These averages do not erase the outliers. The lighter comparison disables simulation/update/render/action wrappers while retaining rAF observation and the same gameplay schedule. It was slower, so it does not establish negligible observer overhead: host/run variability and instrumentation effects remain confounded. No before/after performance improvement is claimed.

Timestamp correlation, not comparison of unrelated maxima:

- Profile 2: the 66.575 ms interval at tick 431 overlaps 8.210 ms simulation, 24.450 ms renderable update and 20.950 ms CPU render submission.
- Profile 3: the 70.995 ms interval at tick 431 overlaps 7.990 / 25.310 / 24.780 ms respectively. Another 33.980 ms interval at tick 1441 includes 15.470 ms simulation.
- Profile 4: the 62.815 ms interval at tick 430 overlaps 6.850 / 22.780 / 19.760 ms respectively.
- These repeated deployment-adjacent outliers establish a shared visible workload, but do not isolate a particular allocation, geometry build, shader compilation, GC pause or GPU bottleneck. No shadow-quality change or speculative optimization was made. Raw frame intervals, overlapping spans and supported long-task entries are in `summary.json` and each run's `result.json`.

The queue-to-application p95 values are 38.34, 41.06 and 46.55 ms (13 applied observed actions per run). Some queued actions can be coalesced by normal game behavior and therefore have no application timestamp. DOM receipt and enqueue/application timestamps are recorded separately. The observer's event-ID context did not survive deferred dispatch, so `temporalAssociations` explicitly uses the closest preceding mouseup within 100 ms, not a proven causal ID; observed associated receipt-to-application ranges from 4.99 to 36.97 ms.

First observed renderable-position changes occur roughly 0.71–0.74 seconds after the pre-click observation marker in these movement probes. That interval includes browser input dispatch and unit behavior before translation; rotation/startup phases were not separately instrumented. It is neither queue delay nor hardware click-to-photon latency. No GPU completion, display presentation, physical mouse or photon endpoint was measured.

## Pointer-lock failure

All three ordinary DOM-input samples produce four console errors, identified as `pointerlockerror`, and warnings carrying `WrongDocumentError: The root document of this element is not valid for pointer lock.` Native request observations show a connected canvas, the same owner document, a visible page and `document.hasFocus() === true`. Ground movement commands still enqueue and apply, but this does not pass pointer capture.

A separate same-origin document containing only a button and canvas, with no game script, fails three of three native `requestPointerLock()` attempts with the same exception. Evidence: `pointer-lock-minimal.mjs` and `pointer-lock-minimal.json`. An earlier `setContent` attempt retained the old document execution context and is preserved only as `pointer-lock-context-retained.json`, not the isolation proof. The failure can occur outside the game; its exact Chrome/automation/window-activation cause is not established. No error suppression or replacement input mode was introduced.

## Final verification

| Case | Result | Current evidence / boundary |
| --- | --- | --- |
| Existing build / scoped entry typecheck / 24 tests | PASS | `checks.json` and individual logs; 101 assertions, no product code changes afterward. |
| Three Chromium 60-second performance/input samples | PASS for collection | `profile-2`, `profile-3`, `profile-4`; timing is not a blanket responsiveness pass. |
| Chromium automated pointer capture | FAIL | Four console errors per primary sample; same native request fails 3/3 in the game-free reproduction. |
| Ten-minute active observation, original defense | FAIL | 312.524 seconds, ticks 401–6630; natural defeat event at 6629. |
| Ten-minute active observation, reinforced defense retry | FAIL | 317.161 seconds, ticks 401–6705; natural defeat event at 6704. |
| Natural human defeat / results UI | PASS | Both final runs show the normal defeat/results UI, without forced outcomes. `natural-outcome.json`, `stability*/result.json`. |
| Human victory | NOT RUN | Defeat does not establish the victory branch. |
| Gameplay page exceptions / console errors in the two stability attempts | PASS | Zero in both; all three bots remained active until human defeat. This is not ten-minute active acceptance. |
| Initial menu media-source events | FAIL | Both attempts record two non-fatal `SOURCE` error events during startup; see detail below. |
| Old speed-6 failure, Chromium | NOT REPRODUCED | One exact speed/army/seed attempt; deployed yard, produced/selected/flew original Harrier. No old path error or timeout. |
| Old speed-6 failure, WebKit | NOT REPRODUCED | One equivalent attempt; same successful scenario. This is not proof the historical issue is fixed. |
| Current WebKit MCV/VPL/shadow comparison | PASS | Fresh `webkit-visual-acceptance.json`; eight directions, independent-mesh/control comparisons, palette endpoints, remap, ambient light, opacity and visible shadows. |
| Native Safari automation | BLOCKED | Fresh safaridriver session rejected: Allow remote automation is disabled. No settings changed; WebKit is not native Safari. |
| Full current Chromium MCV material suite / ordinary speed-3 aircraft rerun | NOT RUN | No shared runtime/material correction in M0.2; previous detailed passes remain historical. Current speed-6 flight is reported separately. |
| Attempted external game requests / WebSockets / workers | PASS | Zero in all M0.2 gameplay fixtures; route capture and page guards retained. |
| Existing imports after server/browser restart | PASS | Restarted service loaded the same preserved import in fresh contexts; source/import hashes match. |
| Source, logical dimensions and asset separation | PASS | Unchanged runtime manifest/camera, source metadata and five archive hashes; no retail payload added to Git/build. |
| Task process shutdown | PASS | Preview PID 23615 stopped after command/cwd validation; port 4000 empty, no task harness or safaridriver left. Test browser close calls completed. |
| Windows x64 / Electron / full M0 thirty-minute stability | NOT RUN | No Windows execution, Electron integration or thirty-minute run occurred. |

The second defensive schedule is recorded in `scripts/m0/stability-defense.mjs`: up to 32 normally queued pillboxes, two refineries, additional paid GIs moved/deployed through normal orders, and ordinary repair toggles. Actual construction remained constrained by credits, queue timing and combat. It changed test inputs only. At defeat, human build/kill/loss counters were 30/74/52 versus 11/64/31 in the original defense run. Neither schedule survived the requested window. No shorter runs were combined and no speed reduction, resource grant, health change, AI substitution or forced end was used. The resulting gate is **FAIL due to early natural defeat**, not an observed simulation crash.

The startup event observer also catches two `SOURCE` media-load errors pointing to the same-origin root, around 1.9 seconds after navigation, before gameplay measurement. The existing `src/gui/component/MenuVideo.tsx:61` contains an empty `video/webm` source, consistent with these events. They do not become page exceptions or console errors in the stability scenarios. They remain disclosed as a non-fatal startup defect; no claim of a completely error-free startup is made.

Stress fixture details: speed option 6 means 60 ticks/s/internal multiplier 4, initial army 0, the same map/house/bots/starts/credits/seed, three-second pre-scenario wait, and the original 240,000 ms production deadline. The generic `fixture.duration` field in the raw result is unused by the aircraft helper; the actual deadline and elapsed duration are recorded in `stress-acceptance.json`. Chromium: initial tick 182, yard present by the first production command at 218, aircraft ready at 3388, final tick 3944, 62.609 seconds. WebKit: 181 / 212 / 3371 / 3934, 62.539 seconds. Both have zero page/console errors, external requests, WebSockets and workers, and no deployment timeout. Keep `.artifacts/rendering/aircraft-webkit/probe.json` as the historical handled `toId is not defined in this graph: 58_96` failure. One current attempt per browser does not resolve its causal history or recurrence probability.

Fresh WebKit visual details: 21,119 original MCV voxels, 58,263 rendered vertices; eight independent-mesh comparisons with zero differing pixels and a 2,588-pixel positive control. VPL/remap/ambient/opacity changes affect 1,972 / 267 / 6,347 / 1,972 pixels. Synthetic rows 0/31 produce the expected palette bytes. Shadow toggle darkens 2,042 world-viewport pixels by more than five mean RGB levels. The current initial screenshot was visually inspected; this still does not establish exact retail pixel parity or native Safari acceptance.


## Source and asset protection

Fresh checks preserve all 3,368 installation entries / 3,146 regular files by size, modification time, mode and symlink state (access time intentionally excluded). Source and imported copies of `ra2.mix`, `language.mix`, `MULTI.MIX`, `MAPS01.MIX` and `MAPS02.MIX` match their retained SHA-256 values. Parent/source Git directories are absent. No source executable, patcher, updater, Wine or CnCNet was run.

Separation audit finds no retail archive extensions or local asset hash matches in `dist`, no newly unignored asset paths, and no remaining tracked retail payload in the worktree. The upstream Git history still contains its original binaries and is not authorized for distribution. Existing `.local/` resources and manifests were preserved; no re-import or wholesale CnCNet/Yuri copy occurred. The restarted preview server successfully loaded the existing local import in a fresh browser context. Request isolation conclusions apply only to exercised game-page paths, not to unrelated applications or Chrome background traffic.

## Reproduction and startup

From `/Users/Aone/RA2remaster/ra2-hd`:

```sh
bun run start:offline
```

Open `http://127.0.0.1:4000/`, choose **Offline Skirmish**, South Pacific, Americans versus three Normal Libya bots, speed 3. Existing imports are already present; do not run the importer again merely to start this build. `?stats=1` is an optional read-only FPS/tick/frame display, not an input latency meter.

Diagnostic examples (one browser at a time; use a new output name to preserve evidence):

```sh
M02_OUTPUT=.artifacts/m0-2/manual-profile node scripts/m0/stability-profile.mjs
M02_MODE=stability M02_LIGHT=1 M02_DEFENSE=reinforced M02_OUTPUT=.artifacts/m0-2/manual-stability node scripts/m0/stability-profile.mjs
PLAYWRIGHT_BROWSERS_PATH=.local/playwright M02_MODE=stress M02_BROWSER=webkit M02_OUTPUT=.artifacts/m0-2/manual-stress node scripts/m0/stability-profile.mjs
node scripts/m0/summarize-stability.mjs
```

## Limits and next bounded task

Windows x64, Electron, native Safari automation, full vanilla 1.006 equivalence, human victory, thirty-minute stability, complete Simplified Chinese/font coverage, campaigns, HD overrides and installers are not implied by this evidence. The Supalosa-derived Normal bot is not retail AI. Existing campaign findings still include missing trigger operations and no complete retail teams/scripts/task-force execution pipeline. VPL/mesh comparisons are not an exact original-game pixel oracle; batched voxels and broader HVA animation remain unvalidated.

**Single next task: close the remaining M0.2 ordinary-play acceptance gates.** Start by isolating foreground activation and pointer capture with the retained game-free reproduction and an equivalent game input sequence. Include the disclosed empty media-source startup event in the clean-start audit. Once real desktop input is reliable, use normal human defensive play or a reviewed defensive input schedule to obtain one uninterrupted ten-minute speed-3 1v3 observation. The two failed defensive schedules are evidence of defeat, not proof of an engine stability defect or incorrect AI balance. Preserve source, speed, bot difficulty and resources. Defer the proposed minimal Electron integration and all feature expansion until these gates are evaluated; do not combine this follow-up with HD, campaigns or AI changes.
