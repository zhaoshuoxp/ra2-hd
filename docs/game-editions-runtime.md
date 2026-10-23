# Dual-edition runtime implementation and evidence

Latest follow-up: [R2 presentation and AI corrections](game-editions-feedback-r2.md), with an explicit [retail-fidelity checklist](game-editions-fidelity.md). The R1 implementation and delivery ledger below is retained as historical evidence.

Status: `MAC_REVIEW_DELIVERED_USER_ACCEPTANCE_PENDING`. The selector draft is user-approved. Queue shading, status weight and production/deployment sound corrections have native regression evidence. Both resource profiles now start actual matches, and the expansion mechanics below execute in the engine. This is a playable implementation with native test evidence, not a complete retail-fidelity certification or user acceptance. Preserve the accepted Desktop package and the UI worktree.

## Implemented paths

The launcher selects immutable `ra2` or `yr` resource/rule profiles and reloads when switching editions. Preferences are namespaced. Expansion archives precede base archives only in the expansion profile. Rules, art, sounds, EVA, strings and map catalogs use their edition-specific sources; original files remain read-only. ThirdSide retains its own country, starting MCV, factories, sidebar, radar, cursors, loading and results artwork. Campaign execution remains deferred.

The new engine paths cover slave-miner deployment, workers/cargo/regeneration and original shovel/carry sequences; magnetic lift, drag and landing; finite and overloaded mind control; Gattling stages; bio-reactor occupants; flying-disc drain; robot power control; berserk targeting; tank bunkers; industrial-plant discounts; open-topped passengers and heavy crushing; Siege Chopper deployment; Boris airstrikes; Boomer cruise missiles; Virus clouds; and per-occupant garrison weapons. Expansion powers implement Psychic Reveal, Force Shield, Genetic Mutator, Psychic Dominator and Spy Plane. Retail parameters come from the isolated INI profile.

Miner morphs also preserve health and veterancy; the original undeploy and cloning-factory sound references are wired. The focused native morph/cloning rerun passes. Controller death now releases victims even when the controller is an unspawned passenger; the native transport-death regression passes.

The built-in AI now handles Yuri economy, replacement miners, production and tech, power/naval decisions, Fortress passengers, reactor occupants and deployed weapons. All three selectable difficulties run a strategic bot and read the archived armor, firing/build rate, movement, cost and team-delay modifiers. It remains this engine's AI, not an implementation of the complete original `aimd.ini` team/script system. Do not describe its tactics as identical to retail AI.

## Evidence ledger

All paths below are relative to `.artifacts/editions/`. A passing mechanism fixture proves its assertions, not every interaction of that mechanic. Deterministic mechanism fixtures pause AI decisions and suppress unrelated units' attacks; AI and natural-match cases run separately. Fixture grants, invulnerability and accelerated readiness must not be presented as natural play.

| Evidence | Result and scope |
| --- | --- |
| `suite-control-final-r1/tower`, `passengers` | PASS on the final candidate: tower acquires three units, releases all on power loss, reacquires after power returns and releases on destruction; passenger control/temporal cleanup and Mastermind regression |
| `final-review-r2/navigation` | PASS on R1: edition switches RA2/YR/RA2, independent preferences and intact covers at 16:9, 16:10 and two MacBook-like viewport sizes |
| `final-review-r2/feedback-allied`, `feedback-soviet`, `feedback-yuri` | PASS on R1: each faction's static queued mask, active progress, bold quantities/status, actual decoded unit/MCV audio and HD on/off, with no GL errors |
| `final-review-r2/yr-battle` | PASS on R1: active Allied versus Brutal Yuri economy/combat, normal defeat at tick 9571, results and successful new match |
| `mechanics-consolidated-r1.json` | PASS: 18 native mechanism cases with per-case evidence hashes: v49/R1 baseline plus focused final control regression; combines only passing cases and retains all historical failures |
| `yr-bridges-v2` | PASS: original Bridging the Gap high bridge, magnetic drop lands on the deck and an offline robot survives on it; the first map fixture lacked a high bridge and remains FAIL |
| `yr-brutal-autoplay-v1` | PASS on build v46: active Allied versus Brutal Yuri economies, natural technology/production/combat, defeat at tick 9843, original results page and a new match from that page |
| `ra2-easy-autoplay-v1` | PASS on build v46: active Allied versus Easy Soviet economies, natural ground/air/naval combat, defeat at tick 27806, results and a new match |
| `yr-tech-buildings-v1` | PASS on build v48: hospital/repair-shop healing, paid foreign Desolator production from a supplied lab reward, loss of both healing and production eligibility after ownership transfer |
| `yr-virus-drift-v1` | PASS on build v49: three moving original cloud sprites, persistent damage, subsequent dissipation and removal; raw opacity and frame timings |
| `yr-air-v46` | PASS: Siege Chopper deployment and weapons, Boris aircraft, original house-colored designation line and cleanup |
| `yr-transitions-v2` | PASS on build v43: reactor occupied/empty art and evacuation on destruction, offline robot water death, magnetic water/collision damage, all three elite anti-air Gattling weapons |
| `yr-core-v39` | PASS: disc power/money drain and animation interruption, berserk original-ally preference, and the core/support/building/naval/air cases |
| `regression-unit-tower-r1.log`, `typecheck-tower-r1.log` | PASS: 60 tests / 381 assertions across edition, UI, retail compatibility, rendering and civilian ownership; application typecheck |
| `yr-loading-ai-v1` | PASS on build v33: AI reserves/boards three Guardians and two GIs in a supplied empty Fortress and puts an Initiate in a supplied reactor; production and entry orders are autonomous, infrastructure is a fixture |
| `yr-miner-production-v2` | PASS on build v34: queued SMIN exits the factory, automatically deploys and spawns five workers; v1 exposed factory ramp checks treating the exiting vehicle itself as a blocker |
| `yr-tech-catalog-v3`, `ra2-tech-catalog-v1` | PASS on build v35: reachable production trees iterated from the original MCV of all 19 country/edition combinations, country exclusives, edition/faction separation and stolen-tech restrictions; not all-unit gameplay |
| `feedback-allied-v2` | PASS on build v37: original Allied queue shading, bold status, production/MCV audio, HD on/off and GL checks |
| `yr-morph-cloning-v1` | PASS on build v30: health/veterancy across miner morph, cloning production factory identity and grinder refund |
| `feedback-yuri-v1` | PASS on build v30: Yuri queue shading, bold quantity/status, original production/deployment audio and HD on/off regression |
| `yr-passengers-v2` | PASS on build v32: passenger temporal erasure, unload beam release, passenger mind control and restoration after forced transport death; v1 exposed the corrected death cleanup bug |
| `yr-autoplay-v4` | PASS on build v30: two active Allied/Yuri economies, natural production/combat, defeat at tick 25826 and results screen |
| `yr-soviet-autoplay-v1` | PASS on build v32: two active Soviet/Yuri economies, Soviet tech/industrial plant and natural Dreadnought production, defeat at tick 14499 and results screen |
| `suite-countries-v1` | PASS on build v29: all nine RA2 and ten YR countries start with their edition-specific catalog/forces and deploy their MCV; country startup only, not full matches |
| `suite-mechanics-v1/ai-powers`, `naval-ai` | PASS on build v28: all five AI power decisions and AI naval production/attack in declared fixtures |
| `suite-mechanics-v1/economy` | PASS on build v28: mining, five workers, regeneration, move/redeploy, fixture ownership-transfer/free ownership and shovel/carry states |
| `suite-mechanics-v1/powers` | PASS on build v28: five power effects, delayed mutation, permanent control, shield blackout/expiry and completed spy flyby; no page errors |
| `suite-mechanics-v1/cloning` | PASS on build v28: one production order yields two distinct Initiates; grinder pays the original 100-credit refund |
| `suite-mechanics-v1/core`, `fortress`, `garrison`, `virus` | PASS on build v28 in separate controlled scenes |
| `feedback-final-allied-v1`, `feedback-final-soviet-v1` | PASS on build v17: actual RA2 queues with HD on/off; waiting yellow mask, active sweep, bold queue/status text; original unit voice PCM and MCV deployment sound |
| `navigation-v1` | PASS on build v21: two complete covers at 1920x1080, 1920x1200, 1512x982 and 1280x832; RA2/YR/RA2 reloads and independent preferences |
| `yr-bootstrap-v6`, `ra2-bootstrap-v1` | PASS on their recorded builds: country catalogs, starting force, MCV deployment; not a full match matrix |
| `yr-economy-v2` | PASS: five workers, mining/deposit, replacement after loss and worker identity across miner repacking |
| `yr-mechanics-v3` | PASS: magnetic lift/drag/Stop/landing, Mastermind overload and ownership restoration on death |
| `yr-powers-v2` | PASS: five supplied/charged power effects, shield expiry/blackout, mutation, permanent control, flyby and reveal |
| `yr-traits-v1` | PASS: ground Gattling stages/cooling and one reactor occupant's power/evacuation |
| `yr-support-v2` | Historical PASS: robot power cycle, disc drain/release and berserk friendly fire/expiry; later combined testing exposed and corrected a disc deceleration interruption bug |
| `yr-buildings-v2` | PASS: bunker entry/range/exit and industrial-plant discount/power loss |
| `yr-naval-v1` | PASS: manually ordered Boomer launches a cruise missile that hits a coastal structure |
| `yr-air-v3` | PASS: Siege Chopper deploys and fires artillery, undeploys/moves; Boris calls two aircraft that destroy the target and leave |
| `yr-fortress-v1` | PASS: passenger firing with transport attack disabled, range bonus, unloading cleanup and heavy vehicle crushing |
| `yr-virus-v1` | PASS: Virus infantry kill produces persistent damaging clouds after the shooter stops |
| `yr-ai-v4` | PASS: autonomous Yuri construction, slave economy and actual infantry/vehicle production |
| `yr-garrison-v3` | PASS on build v26: mixed GI/Initiate occupancy, independent retail weapons, elite weapon change and evacuation cleanup; fixed missing attack traits on YR buildings with CanOccupyFire |
| `yr-fortress-v2` | PASS on build v24 in an independent scene: passenger fire, range, unloading and crushing |
| `yr-naval-ai-v2` | PASS on build v23: AI queues and builds a Boomer and attacks a coastal structure; shipyard and map visibility supplied by fixture |
| `yr-ai-powers-v4` | PASS: AI activates all five expansion powers with supplied tech, ready timers and visible targets |
| `yr-battle-v2` | PASS: normal Yuri AI defeats a passive human starting army/deployed MCV at tick 6059 and reaches the original Yuri results screen; not an advanced or balanced all-country match |

Later builds and combined runs are retained under unique paths, including failures. `yr-combined-v4` verifies the disc drain correction but fails a berserk fixture due to competing targets. `yr-combined-v5` fails isolated-fixture placement. Neither is a combined PASS. The later `yr-combined-v7` passes core, support, building, naval and air assertions, but its fortress target is interfered with by prior fixtures. The independent fortress case above passes. `yr-autoplay-v1` reaches results but the Allied AI stalls after power construction; this is insufficient active-opponent evidence. A shared fallback/mission queue conflict was corrected. `yr-autoplay-v2` develops both sides and runs to tick 21019 without runtime errors, but reaches the four-minute test timeout before victory; this is not a complete-match PASS. It also exposed poor miner relocation; legal deployment-site selection was corrected and the move/redeploy case passes in suite v1.

`ra2-autoplay-v1` on build v35 completes an active Allied/Soviet match at tick 15491 and reaches the results screen (`battle.status=PASS_AI_VS_AI_MATCH`). Its combined script is FAIL because it incorrectly attempted the separate catalog fixture after game teardown. The catalog check was moved before the battle and passes independently as recorded above. Keep this distinction; do not relabel the combined run PASS. `yr-tech-catalog-v1` supplied mixed-faction buildings and is not valid isolation evidence; v2 had a fixture type-enum error; v3 above corrects both issues. `yr-disc-money-v1` found that the new drain animation name was being read from the wrong INI section; build v38 uses the original CombatDamage value through the existing global-rule resolver and awaits suite v2.

## Current verification and fidelity boundaries

The v49 game payload and the independently named `build-editions-r1` payload contain exactly the same 155 frontend files (SHA-256 equality). The latter changes only desktop naming/profile/resource discovery. The new profile is `RA2 HD Dual Edition R1`; no previous profile is migrated.

The 17-case mechanism suite, three-faction UI/audio regression and the R1 complete match pass. The final candidate additionally corrects Psychic Tower power-loss release; its focused control regression passes and is recorded separately rather than relabeling older builds. Full matches above use ordinary starting forces and resources, with a bot attached to the local player as well as the opposing AI. Mechanism cases supply only the declared setup and then run native simulation/orders. They are not natural-match evidence. The all-country catalog/startup matrix remains distinct from full matches.

Historical final-suite failures are retained: v5's Virus fixture counted additional chain-reaction victims as an incorrect particle count; v6's passenger Yuri acquired an unrelated victim left by the preceding setup. Both fixtures were isolated without disabling the behavior under test. Neither failed run is relabeled PASS. Earlier `yr-core-v45` exposed a missing render-plugin lifecycle method; v46 fixes it. Earlier miner-production waits followed an obsolete deployed object after legitimate relocation; they now follow the replacement chain.

The AI is the engine's strategy planner, not the original `aimd.ini` team/script executor. Original difficulty `BuildSlowdown`, `ContentScan` and `DestroyWalls` behavior is not reproduced as a retail AI script system. Secret-lab assignment uses the original pools with persistent map-level rewards, but not the original biased random-selection bug. Gas particles use bounded two-lepton drift; the original binary's precise random acceleration sequence has not been reproduced. These differences must remain visible when assessing the requested original-game fidelity.

Exact frame-by-frame parity of Dominator lighting and missile trajectory, all possible transport/control/terrain combinations, human visual/input acceptance and Windows runtime are not certified by these tests. Campaign execution remains intentionally deferred. A playable review is not a claim of binary-identical retail simulation or user acceptance. Continue corrections and acceptance in this same task.

## Mac review delivery

Runtime source is committed locally at `53b4eff`, following `9b8f380` and `acd1035`. The final executable payload is `.artifacts/editions/build-editions-r1-final`. The source worktree is not pushed. UI direction and the earlier accepted artwork remain accepted; this gameplay delivery awaits hands-on review.

- Desktop archive: `/Users/Aone/Desktop/RA2-HD-Dual-Edition-R1-Mac-Test.zip` (653,950,388 bytes; SHA-256 `af4cd92b81e30f981c377380d69dc8a5ff7eb12a15e5331a6948addc4a30cdd8`).
- Directly runnable application: `.artifacts/editions/mac-review-r1/RA2-HD-Dual-Edition-R1-Mac-Test/Red Alert 2 HD Dual Edition R1.app`. Keep its adjacent `RA2-HD-Editions-Resources` directory in place.
- `packaged-runtime-r1/result.json` passes actual signed-app cold startup, independent profiles, automatic relative resource discovery, original/expansion selection, match startup and MCV deployment in both editions.
- All 1,204 extracted package files/symlinks match the package receipt; both the source and ZIP-extracted application pass strict deep signature verification. The final Desktop ZIP hash matches the verified local archive. See `.artifacts/editions/delivery-receipt-r1.json`.
- The loose Desktop copy repeatedly received automatic `com.apple.FinderInfo` attributes and failed strict signature verification despite identical file contents. It was moved intact to `.artifacts/editions/desktop-copy-failed-r1` as failure evidence. Extract the delivered ZIP into a local directory outside the Desktop, or run the verified workspace application directly. Existing Desktop apps and profiles were not replaced.

The package retains 752 allowlisted resource files, all 21 accepted HD families and the accepted 430-asset UI selection. Its actual packaged startup verification is separate from gameplay regression and from user acceptance. Continue fixes and acceptance in this task; do not infer complete retail or Windows parity from this Mac delivery.
