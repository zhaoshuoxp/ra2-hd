# M1.1 Conscript HD special-state audit

Date: 2026-09-18. **PARTIAL_PASS_WITH_REPRODUCED_CLOAK_DEFECT.** This is a follow-up to the bounded prototype acceptance, not certification of every special-state scenario.

**Subsequent correction:** [native special-state validation](m1-1-state-validation.md) records the now-passing enemy cloak regression, bridge-coverage and paradrop-shadow fixes, and actual native ramp/bridge/airborne/temporal/death scenarios. The failures and NOT RUN entries below describe this earlier audit and are retained as historical evidence.

## Conclusion

Conscript HD replaces the complete native SHP body resource within the existing infantry renderer. It has no Rhino-style state gate that replaces the whole unit with original artwork on ramps, bridges, elevation, cloaking or destruction. Preserving that path does not prove all those scenes render correctly. The audit found a shared enemy-cloak visibility defect in both HD and original-art controls.

The inspected implementation baseline was `11788e8`, including production C filtering and the confirmed 900-high presentation. An isolated build was made before subsequent concurrent Rhino edits. No production code, artwork, accepted pack or existing application was changed by this audit; unrelated Rhino work remains separate.

## Results by condition

| Condition | Finding | Acceptance boundary |
| --- | --- | --- |
| Ramps | Native `ObjectPosition.updateWorldPosition` interpolates slope height, and `RenderableManager` forwards the resulting world position. The HD override does not replace either path. | SOURCE VERIFIED; natural ramp traversal was NOT RUN in this audit. |
| Pitch, roll and rocking | Infantry uses directional SHP frames and stance sequences. It has no vehicle `TilterTrait`, `tiltObj` or rocking transform. HD preserves that behavior; no separate pitched/rolled artwork was authored. | NOT APPLICABLE to native infantry behavior; a new vehicle-style tilt requirement is NOT IMPLEMENTED. |
| Bridge / relative height | Injecting `onBridge` and four tile-height units keeps the HD page bound, raises world Y, and assigns render order 2. Returning to ground restores the position and order 0. | PASS_CONTROLLED_RENDER_STATES; actual bridge deck/rail occlusion, crossing and collapse remain NOT RUN. |
| Airborne / paradrop | Injected Air zone retains HD and render order 2. Separately injected Paradrop stance selects native frame 292 with the HD page retained and no GL error. | PASS_CONTROLLED_RENDER_STATES; these are separate injected checks, not a complete natural parachute descent/landing. Parachute/blob shadows remain original assets. |
| Friendly cloak appearance | Injected cloak keeps the unit visible at opacity 0.5; removing cloak restores opacity 1 without replacing the HD resource. Ordinary Conscript starts without a cloak trait. | PASS for controlled material transition, not natural acquisition or full cloak gameplay. |
| Enemy cloak visibility | A hostile Conscript remains visible despite no shared intelligence. Reproduced with HD enabled and original art. | FAIL_ENEMY_REMAINS_VISIBLE; see defect below. |
| Temporal freeze / release | `WarpedOutTrait.debugSetActive` reaches native half-opacity and recovery; HD pages and original shadows remain bound. | PASS_CONTROLLED_RENDER_STATES; natural temporal attack, removal and special-effect interaction remain NOT RUN. |
| Chronosphere transport | The actual Conscript rules are `organic=true`, `teleporter=false`. `ChronoSphereEffect` destroys such organic units instead of transporting them. | SOURCE/RULE VERIFIED. Survival after transport is not a valid expected result for this unit. |
| Ordinary death | All native death frames 134–163 retain correct HD base/remap pages and render without GL errors. Earlier M1.1 actual combat separately exercised ordinary death. | PASS for the forced 30-frame sweep plus historical bounded combat; not all natural death causes. |
| Other destruction / effects | Fire, electrocution and other special deaths select separate shared animation resources. Corpses, chrono sparkles and parachutes also use separate assets. Temporal/crush removal bypasses normal infantry death sequences. | SOURCE VERIFIED; those shared assets have not become HD through `cons.shp`, and full special-death scenarios remain NOT RUN. |

## Reproduced enemy-cloak defect

`WorldView.init` passes a plain local `Player` through `RenderableFactory` into `ObjectCloakPlugin`. The plugin reads `this.localPlayer.value`, treating the missing value as an observer-like view and permitting visibility through cloak. The diagnostic records:

- Actual local player: `Player 1`; hostile owner: `@@AI2@@`.
- Actual `alliances.haveSharedIntel(localPlayer, owner)`: `false`.
- Plugin argument name: `Player 1`; its `.value` is missing.
- Plugin `lastCanSeeThroughCloak`: `true`; target remains visible after cloak activation.
- The original-art control reproduces the same result, so this is a shared visibility-path defect, not an HD texture selection failure.

The cloak trait is deliberately injected to exercise this renderer condition; the normal Conscript starts without it. No claim is made that a natural cloak acquisition was observed. The audit does not certify enemy invisibility, repair the shared plugin, or convert the failed assertion into a pass.

Relevant source: `src/gui/screen/game/WorldView.ts`, `src/engine/renderable/entity/RenderableFactory.ts`, `src/engine/renderable/entity/plugin/ObjectCloakPlugin.ts`, `src/engine/renderable/entity/Infantry.ts`, `src/game/gameobject/ObjectPosition.ts`, `src/game/gameobject/infantry/sequenceMap.ts`, and `src/game/superweapon/ChronoSphereEffect.ts`.

## Evidence and reproduction

Ignored evidence root: `.artifacts/m1-1/state-audit-2026-09-18/`.

- `build/`: isolated current-source browser build, preserving earlier accepted builds.
- `check-v1/result.json`: ten controlled HD render states pass before adding the hostile-visibility assertion.
- `check-v2/result.json`, `check-v3/result.json`: retained failed hostile-cloak checks and diagnosis.
- `hd-v4/result.json`, `original-v1/result.json`: matching final diagnostics. Both report `renderStates=PASS_CONTROLLED_RENDER_STATES`, `enemyCloak=FAIL_ENEMY_REMAINS_VISIBLE` and overall `FAIL`.
- Both final runs use actual 3840x2160 WebGL output, with no unexpected page/console/GL errors or external requests. Each verifies ten state snapshots and 30 death frames. These are controlled state injections inside a real match, not screenshot-based visual acceptance or full scenarios.

```sh
bun --bun vite build --outDir .artifacts/m1-1/state-audit-fresh/build
M11_BUILD_DIR=.artifacts/m1-1/state-audit-fresh/build M11_PORT=4187 \
  bun scripts/m1/serve-authored-game.mjs
# Separate terminal; the assertion exits nonzero while the cloak defect remains.
M11_STATE_OUTPUT=.artifacts/m1-1/state-audit-fresh/hd \
  bun scripts/m1/check-conscript-states.mjs
M11_STATE_ORIGINAL=1 M11_STATE_OUTPUT=.artifacts/m1-1/state-audit-fresh/original \
  bun scripts/m1/check-conscript-states.mjs
```

The prior bounded M1.1 acceptance remains historical evidence. A blanket claim that all the newly requested conditions work is unsupported: enemy-cloak visibility fails, and natural ramp/bridge/airborne/special-death scenarios still need dedicated acceptance.
