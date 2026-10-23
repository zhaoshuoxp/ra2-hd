# Trainer R2: continuous toolbar hover and unavailable building feedback

Subsequent user review explicitly confirmed both fixes successful. That acceptance closes the two R2 corrections without rewriting their recorded automation limits. The requested modest power-plant/satellite brightness adjustment is tracked separately in [R3](ui-cameo-brightness-r3.md).

User review requested two corrections to accepted Task F and a complete replacement test package on Desktop. Starting baseline: clean local `main` at `05e9c22a7355fbe6a9f9ef8feb9a06b8248011c0`. This is a bounded follow-up; A–E and new artwork are not selected. Prior applications, resource packs, profiles, reports and archives remain preserved.

## Findings and changes

The toolbar previously released pointer lock as soon as the virtual game cursor entered its bounds. That invoked the native cursor restoration bridge; `Pointer.onMouseMove` deliberately ignores motion during restoration. Re-entering and leaving could therefore feel sticky. Hover now retains relative motion and updates button highlighting using the existing logical-to-display coordinates. An explicit menu click opens the DOM panel and performs the existing handoff. Matched press, release and browser-click events are consumed so a toolbar gesture cannot become a battlefield click or toggle a panel twice. Closing the panel releases its input capture. No pointer coordinates, camera geometry or OS acceleration settings change.

The building-limit model was already correct in the old application. All six tested superweapon buildings became disabled after construction, retained a limit of one, and received the existing 0.5 light multiplier. The user confirmed the issue concerned construction icons, later observing that the nuclear silo looked brighter than the spy satellite. Those are different underlying images: the actual silo cameo is `msslicon.shp`, not the separate `nukeicon.shp` firing icon. Selected HD images have mean 8-bit grayscale values of 135.65 for the silo and 85.68 for the satellite (about 1.58 times). This source-image statistic supports the brightness-difference explanation; it is not a calibrated display-luminance measurement or proof that either artwork is intrinsically incorrect.

The correction strengthens unavailable-state feedback without rewriting accepted artwork. Idle, disabled, single-instance superweapon construction icons receive a stationary neutral dark mask in addition to existing dimming. Available and ready-to-place icons do not receive it; production retains its native colored sweep. The separate usable powers, satellite artwork and industrial plant behavior are unchanged. The mask disappears when the building is removed and construction becomes available again. The full-mask sprite is reused with zero light only for this unavailable state, and normal light is restored for every other state.

## Verification and reproducibility

Evidence root: `.artifacts/trainer-followup-r2/`. The new `scripts/offline-trainer/native-followup-r2.mjs` runs through `scripts/editions/validate-bootstrap.mjs --trainer-followup` with isolated profiles. It uses native production and placement actions, verifies duplicate rejection, samples the actual sidebar, removes each building through the engine, and verifies re-enablement. Before/after PNGs accompany each building. RA2 covers NAMISL, NAIRON, GACSPH and GAWEAT; YR additionally covers YAPPET, YAGNTC and the NAINDP control.

- Focused trainer, production-feedback and cameo-geometry tests: 25 passed, 263 assertions, zero failures. Entry typecheck passed.
- Native icon checks: RA2 `candidate-ra2-v5/result.json` and YR `candidate-yr-v6/result.json` passed. All tested construction limits and removal transitions passed. These runs precede the final mouse-release isolation change; final delivery evidence is recorded separately below the evidence root.
- Final candidate YR `candidate-yr-v7/result.json` passed all seven building transitions and matched mouse-event isolation; 276 controlled motion samples crossed both toolbar edges without a hover handoff.
- Cursor checks sweep the real relative-motion handler across the toolbar, assert uninterrupted per-event displacement with zero hover handoffs, then exercise a menu click and panel close. The final harness also checks that left/right toolbar gestures do not reach the canvas event listeners.
- Native focus could not be obtained by automation in this session. Pointer lock reported `WrongDocumentError` or a pointer-lock error despite renderer focus. The harness explicitly records `CONTROLLED_LOCK_STATE_REAL_RELATIVE_MOTION_HANDLER` when it substitutes only lock state, and restores the real API before panel handoff. This is a controlled regression check, not a physical-mouse or real-lock pass. Human hover feel and final visual acceptance remain pending.

Final package identity, payload hashes, Desktop paths and packaged runtime results live under `.artifacts/trainer-followup-r2/delivery/`. The package includes this report and the existing report collection. Consult its delivery receipt for the exact source commit rather than inferring identity from the retained R1 internal application name.

## Diagnostic lessons and rejected attempts

| Observation | Resolution and boundary |
| --- | --- |
| A bright nuclear icon was initially suspected to ignore BuildLimit | Inspect model state and actual light before changing gameplay. The old model and multiplier were already correct. Compare the same cameo before/after; different artwork brightness is not a reliable enabled-state comparison. |
| A first full-mask candidate looked yellow/olive | The native progress palette is colored. Use neutral lighting only for the unavailable-building mask and restore native lighting for queued/active production; do not recolor the artwork. |
| A production fixture never reached ready status | Building object type is 2, distinct from sidebar Techno target type 0. Drain the native action queue before manually advancing controlled fixture ticks. No production runtime workaround was needed. |
| A debug cameo helper was missing | Debug helpers live under `__ra2debug.helpers`. Final checks read the actual active sidebar after selecting/scrolling the tab instead of forcing slot updates through that helper. |
| An early fixed-delay sample reported Original while a later image displayed HD | Asynchronous artwork binding can outlive the delay. Treat a sample's HD flag as that moment's state; do not claim permanent fallback from a transient sample. |
| Pointer lock failed even with a connected canvas and renderer focus | Native window focus is a separate prerequisite. Preserve the failed native attempts, identify the controlled-state fallback, and leave physical confirmation to the user. |
| Consuming only a toolbar press was insufficient | The engine can synthesize a canvas click from mouse-up without a matched down path. Consume the matched release and browser click as well, and check canvas listeners during the native UI fixture. |

Keep corrections and acceptance in this execution task. No push, Windows validation, new artwork generation, profile migration or cleanup of historical evidence is implied.
