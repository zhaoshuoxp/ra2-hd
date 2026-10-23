# M1.1 Conscript native special-state validation

Date: 2026-09-18. **Technical status: PASS_NATIVE_STATE_SCENARIOS.** This user-authorized continuation closes the named scenario gaps in the [historical audit](m1-1-special-state-audit.md). It is a scripted native-game validation on macOS Chrome, not a new user visual-acceptance receipt or certification of every map/platform.

## Corrections

- **Enemy cloak:** the shared fix already landed in `25ef116` during independent Rhino work. `ObjectCloakPlugin` now handles the actual local-player representation. This continuation verifies the fix with Conscript, including original-art and HD controls, native cloak activation, hostile ownership and damage-triggered reveal; it does not duplicate that implementation.
- **Bridge occlusion:** production-C fractional coverage previously ran in the global transparent queue after native bridge overlays. A counterfactual framebuffer probe reproduced 244 leaked pixels. Infantry on bridge tiles now keeps HD coverage inside its native render-order band, using premultiplied blending and the existing depth test. The final opaque and half-transparent probes both report zero leaked pixels. Ground sprites keep the existing production-C path; geometry and bridge artwork are unchanged.
- **Paradrop shadow:** naturally spawned paradropping infantry previously skipped blob-shadow creation. It now creates the existing ground/bridge-anchored blob; the floating body shadow is hidden during descent and restored on landing. No shadow artwork was authored or replaced.

The complete accepted Conscript pack is unchanged. Manifest SHA-256: `4255aaccb76f7f1372d34a447d9d54e9579fb5be9002a7987cd4a115833ea9a0`. Complete-member activation/fallback, native logical geometry, animation timing, rules and the accepted 900-high presentation remain in place. Existing Rhino changes, applications, `dist`, retail data and prior evidence are preserved.

## What actually ran

An isolated test entry starts the original `MP23T4` offline skirmish and seeds bounded actors/conditions. It then advances the full native game update, tasks, effects, animation clock and world renderer. The full run contains **7,182 simulation ticks** and **40 same-state original/HD capture pairs**, with a **3840x2160 drawing buffer** and **1600x900 logical presentation**. The camera follows the subject without changing its scale.

Movement uses native pathfinding and `MoveTask`; parachute descent uses `ParadropTask`; temporal attacks use a real Chrono Legionnaire's `AttackTask` and weapon. Cloak is granted through the native crate powerup handler, rather than a physically collected random crate. Death-type cases invoke original warhead damage at the impact boundary, rather than firing every corresponding projectile. Chronosphere and bridge destruction invoke their native effects/damage, followed by native simulation. The fixture clears prior actors between scenarios, reveals terrain for inspection, and isolates the crushing test by disabling the victim's movement and actors' weapons. These setup controls are explicit and confined to the test build.

| Scenario | Actual result |
| --- | --- |
| Four ramp orientations | PASS: native outward and return traversal through explicit ramp waypoints; moving samples observed on all four slopes, with HD pages retained. |
| Pitch, roll, rocking | Native infantry remains upright and follows interpolated terrain height. Infantry has no vehicle pitch/roll/rocking mechanism; no artificial vehicle tilt or new poses were added. |
| High and low bridges | PASS: shore-to-shore crossing and return, including entering and leaving each bridge. Moving bridge samples: high 400/400; low 386/340. |
| Bridge deck occlusion | PASS: body contribution 1,574 pixels, 1,556 covered, zero leaks. Half-transparent body: 1,538 pixels, 1,520 covered, zero leaks. The probe compares restored native scene renders with unit/deck visibility toggled, separately from the crossing simulation. |
| Cloak and recovery | PASS: friendly half-opacity, hostile hidden, native damage reveals the hostile body at full opacity. Both original-art and HD controlled regressions also pass the formerly failing assertion. |
| Ground and bridge paradrop | PASS: actual descent from height approximately 8.97 to ground 0 / bridge 4; parachute observed, blob remains anchored to the landing surface, body shadow hidden during descent, unit survives and lands correctly. |
| Temporal weapon | PASS: native acquisition/freeze, cancellation/release, reacquisition and erasure; native effect and renderable disposal observed. |
| Chronosphere | PASS: the original organic, non-teleporter Conscript is destroyed and disposed. Surviving transport would contradict its current native rules. |
| InfDeath 0 through 7 | PASS: all eight original death branches run to removal. Types 1/2 traverse body frames 134–148 / 149–163 and native corpse lifetimes; shared special-death effects appear for the other animated branches. |
| Vehicle crush | PASS: original HTNK moves onto the stationary hostile Conscript and native crushing removes it. No HD vehicle state is certified by this test. |
| Death during descent | PASS: damage during actual airborne descent removes the Conscript and completes cleanup. |
| Bridge collapse | PASS: native high-bridge damage/collapse destroys the occupying Conscript and completes cleanup. |
| Lifecycle and errors | PASS: all four allocated HD pack textures release on match exit; no remaining game reference, page errors, console errors, GL errors or external requests. |

Parachutes, corpses, fire/electrical/nuclear death animations, temporal effects and impact effects remain their original shared resources. Their correct integration does not make those resources newly HD. Relevant observed effects include `PARACH`, `DEATH_A`, `DEATH_B`, `DEATH_E`, `FLAMEGUY`, `ELECTRO`, `YURIDIE`, `NUKEDIE`, `CHRONOSK` and `WARPAWAY`.

## Evidence and verification

All media and raw traces are local and ignored under `.artifacts/m1-1/state-validation/`:

- `acceptance-v1/result.json`: complete-run result and case assertions; `*-trace.json`: native tick samples; `*-hd.png` / `*-original.png`: raw 4K frame pairs; `scenarios.webm`: accelerated native-simulation recording.
- `review-v1/review.html`: self-contained review with 40 embedded comparison boards and embedded video. Boards are native-pixel framebuffer crops, not resized artwork. Video is a 768x432 native crop plus a 40-pixel scenario/tick label. Raw 4K frames retain wider context, including parachute canopies that can fall outside a close crop.
- `review-v1/playback-verification.json`: Chrome decoded all 40 boards at 768x326 and played the 768x472 video; a nonblack decoded frame is saved as `video-playback.png`.
- `hd-regression/result.json` and `original-regression/result.json`: both `PASS_CONTROLLED_RENDER_STATES`, including enemy concealment. These controlled checks supplement the full native-scenario run.
- `build-v8/`: tested fixture build. `production-build/`: normal isolated production build, verified to exclude `__installConscriptStates` and the fixture entry.

Automated checks: **64 tests pass, 18,936 assertions, zero failures** (`bun run test:m1`); entry typecheck and isolated fixture/normal production builds pass. The build reports the existing large-chunk advisory. The added coverage test checks ordering/blending/depth behavior at the bridge boundary.

Earlier failed iterations remain available. `probe-v1` records the reproduced coverage leak. Intermediate `game-v*` failures exposed fixture routing, actor isolation and insufficient observation windows; these were corrected without shortening native reload, parachute or corpse timing. `deaths-v2` and `tail-v2` are subset runs only. The acceptance record is the full, unskipped `acceptance-v1` run.

## Reproduction

Run from the repository with the existing local imports and accepted HD pack:

```sh
M11_STATE_BUILD=.artifacts/m1-1/state-validation/build-replay bun scripts/m1/build-conscript-state-game.mjs
M11_BUILD_DIR=.artifacts/m1-1/state-validation/build-replay M11_PORT=4188 bun scripts/m1/serve-authored-game.mjs
```

While that loopback server is running, use another shell:

```sh
M11_STATE_OUTPUT=.artifacts/m1-1/state-validation/replay bun scripts/m1/run-conscript-state-game.mjs
python3 scripts/m1/build-conscript-state-review.py .artifacts/m1-1/state-validation/replay .artifacts/m1-1/state-validation/review-replay
```

For ordinary interactive play with the fixes and without fixture injection:

```sh
M11_BUILD_DIR=.artifacts/m1-1/state-validation/production-build M11_PORT=4188 bun scripts/m1/serve-authored-game.mjs
```

Open `http://127.0.0.1:4188/?conscript-hd=4`. Use one server on the port at a time. The normal build does not include scenario-control code; no existing launcher, accepted application or distribution output was replaced.

## Remaining boundaries

Windows, packaged apps, physical external-4K output, every map/facing/lighting/state combination and long large-scale battles remain NOT RUN here. These results do not add vehicle-style infantry tilt, newly authored shared effects, new assets or campaign support. They close the named Conscript technical gaps under the measured native simulation. Any visual corrections to these results stay in this execution conversation; a different asset objective should use a new task only when selected by the user. No push or publication.
