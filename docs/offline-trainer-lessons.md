# Offline trainer implementation and diagnostic lessons

The post-acceptance [R2 follow-up](offline-trainer-followup-r2.md) records toolbar handoff latency, nuclear cameo brightness, neutral disabled feedback, matched mouse-release isolation, native-focus limitations, and the refreshed Desktop delivery.

This report preserves decisions and failed-attempt lessons from Task F. The accepted implementation is `cc2adea`, with completed validation/handoff at `4ea1f03`. Raw attempts, logs, fixtures and screenshots remain under `.artifacts/offline-trainer/`; final evidence is indexed in [the implementation report](offline-built-in-trainer.md). A failed intermediate run is not a final pass.

## Implementation map

| Area | Change and rationale | Primary source |
| --- | --- | --- |
| Native operations | Typed, bounded per-session dispatcher; live local human/offline/edition/object checks; commands consumed by the next ordinary simulation tick | `src/game/trainer/TrainerRuntime.ts` |
| Lifetime | WeakMap game/player state; object-reference protection; reset, ownership change and disposal cleanup; completed one-shots are not rolled back | `Game.ts`, `HealthTrait.ts`, trainer runtime |
| Economy and production | Per-player credits/power/build-time effects; native payment, queue, factory, placement and power availability remain authoritative | `PowerTrait.ts`, `ProductionTrait.ts`, `Production.ts`, `ConstructionWorker.ts`, `SuperWeaponsTrait.ts` |
| Capture | Native owner transitions plus coherent passengers, bunker occupants and slave detachment | `Game.ts`, `GarrisonTrait.ts`, `SlaveMinerTrait.ts` |
| Interface | Shared menu/pause master, default OFF per edition; optional 30-logical-pixel toolbar; mouse access and configurable conflict-checked shortcuts | `TrainerController.ts`, `TrainerToolbar.tsx`, `trainer.css`, `GeneralOpts.tsx`, `CombatantUi.tsx` |
| Input and legacy controls | Editable fields, IME, repeats, focus and dialogs reject shortcuts; legacy cheat commands use the same dispatcher | `KeyboardHandler.ts`, `GameScreen.ts`, controller |
| Recording | First applied command invalidates replay recording; save and serializer guards prevent misleading playback | `Replay.ts`, `GameScreen.ts` |
| Delivery | Separate signed Mac app/profile and companion resources; reuse strict dual-edition packager without replacing normal dist | `desktop/main.mjs`, `scripts/editions/package-mac-test.mjs`, `scripts/offline-trainer/build-review.mjs` |

## Problems, causes and resolutions

| Observed problem | Cause and resolution | Evidence / reusable lesson |
| --- | --- | --- |
| Leaving a match could refresh a disposed production sidebar | Trainer cleanup occurred after game disposal. End the trainer session early in `GameScreen.onLeave`; refresh only the matching live session. | Final packaged lifecycle case passes. Cleanup ordering is part of the feature, not only a UI concern. |
| Shared production acceleration could affect AI | Legacy global `speedCheat` applied outside player scope. Retire its global production effect and use player-bound trainer state. | Simultaneous native AI production and OFF comparisons pass. |
| Invalid numeric draft could apply an earlier valid value | React state retained the previous valid value. Reject the relevant command while its input has an invalid draft, including DOM validity state. | Native input validation exercises actual UI controls. |
| Power check expected charging during blackout | Fixture expectation ignored native availability. Preserve the native paused state rather than bypassing blackout. | Native power eligibility tests and power harness. |
| Force Shield finished before recharging was allowed | Native blackout outlasts the shield effect. Wait for blackout recovery and record its ticks. | Full power cases activate all actual eligible instances twice. |
| Captured robot disappeared | Fixture spawned a land unit in water; native sinking was correct. Place the object on legal land. | Corrected native ownership case; no gameplay workaround. |
| Slave Miner ownership fixture moved/deployed unexpectedly | Native scanning interfered with the controlled setup. Suspend scanning only inside that fixture, then check child owner consistency. | YR ownership cases; shared rules unchanged. |
| A blocked factory exit did not resume after movement was restored | Disabling movement can cancel the native exit task. Remove the intentionally stalled blocker through native destruction and validate subsequent queue delivery. | `native-queues.mjs`; this does not claim cancelled exit tasks automatically resume. |
| AI money appeared to change without trainer targeting | Disabling planning did not stop already queued native expenses. Temporarily pause pre-existing AI queues only in the isolated cash assertion, then restore them. | Independent concurrent AI production test remains intact. |
| Mouse capture missed a valid object | The fixture target was outside the current visible camera region. Pan the native camera before generating the real pointer click. | Final capture input check uses actual mouse interaction. |
| Native blur/hide did not produce a false document focus state | Automation retained renderer focus even across attempted native window transitions. Test the guard with an explicit false renderer focus fixture and disclose the boundary. | Guard passes; physical application switching remains UNVERIFIED. |
| Fullscreen transition lost the open popover | Native blur can close it during transition. Close only if the control is still present. | No production workaround or forced focus claim. |
| Guard regression failed after building coverage was added | Fixture-wide unit movement/attack freezing happened before combat checks. Run building coverage after combat and before lighting/score probes. | Final both-edition package validation passes strict existing assertions. |
| Civilian evacuation fixture found no occupiable building | Selected trainer matrix map was unsuitable. Use the existing original MP01T4/XMP01T4 dedicated civilian scenarios. | Five entry/exit cycles per edition pass. |
| HD visual probe sampled before asynchronous binding | A fixed delay was insufficient. Wait for the required HD binding/light, retaining the strict visual assertions. | Final RA2/YR repair, tint and missile results. |
| Boris target died before screenshot/cancellation checks | Native airstrike damage raced capture latency. Give only the fixture instance additional health and use native healing. | No shared weapon/rule changes; final designation and cancellation pass. |
| Native Electron launch failed in the initial sandbox | The native launcher required its execution allowance. Use the approved launch path; record the failed attempt separately. | Do not call a blocked launch a runtime gameplay defect. |
| Reference retrieval encountered cache/TLS issues | Fetch the pinned read-only source revision for behavior comparison. Do not port the Windows memory injection implementation. | Reference snapshot retains the exact revision and files. |

## Evidence organization and reproducibility

The authoritative final matrix is `matrix-complete/matrix.json`. Some successful cases deliberately reference prior successful directories through symlinks (`matrix-final`, `matrix`, `recheck-ra2-soviet`). Keep those dependencies intact. Directory age or a failed sibling case is insufficient evidence that a folder is disposable.

`final-receipt.json`, `package-final/package-receipt.json`, `build-final/identity.json`, `protected-before.json`, `runtime-source-verified.json` and `regression-candidate.log` distinguish source identity, runtime identity, protected data, automated tests and the packaged application. Acceptance is a later separate receipt. Do not rewrite the original pending review record or label platform gaps as passed.

For future corrections, reproduce the problem against canonical `main` and the exact edition/map/profile first. Keep fixture changes isolated from native gameplay fixes, use native owner/production/power APIs, preserve OFF parity, and validate teardown plus edition switching. Keep source baseline, resource selection, build identity and human acceptance separate in every handoff.
