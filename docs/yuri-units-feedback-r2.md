# Task D: native effects feedback, R2

This follow-up preserves the user-accepted full Yuri artwork batch and addresses the six corrections requested on 2026-10-01. The selected runtime is the isolated R2 Mac package built from `7e10233`. Main and sibling tasks are unchanged. Cleaner mother-art samples remain review-only; no accepted atlas or master is replaced.

## Corrections and causes

| Reported issue | Cause and resulting behavior |
| --- | --- |
| DISK semicircle loss | Its flat support and raised rotating saucer shared a folded sprite depth surface. Each component now recovers its native physical height along camera rays, retaining authored pixels, pivots and logical bounds. |
| DISK rotation and ring laser | The engine ignored native `TurretSpins` and `DiskLaser`. The flagged turret advances by existing native ROT. A circumference sweep precedes the outgoing ray within native LaserDuration. Its radius uses the VXL local ground plane, avoiding diagonal bounding-box inflation; the rear ring obeys depth. |
| TELE purple beam | A brief fire-time ray could not follow native magnetic lifting. The victim owns a persistent ribbon with live source/target endpoints, removed on release, unspawn or controller loss. Normal blending preserves the native pink-purple color instead of clipping two additive bands to white. |
| MIND control arcs | The existing native visibility rule requires selecting the controller. Review fixtures now select it and verify both actual capture and arc geometry, then deselect it to verify removal. No unconditional visibility change is introduced. |
| CAOS gas centered on the enemy | Native AreaFire was parsed but ignored by ordinary projectile creation. AreaFire now resolves at the live caster; enemy acquisition and range checks remain unchanged. A nearby victim is affected while a farther witness is not. |
| YURIPR control arcs | The selected native controller displays its existing control arc. Capture and deselection cleanup are verified independently of the open PsiWave exception. |

Retail rule files, damage, cooldowns, camera geometry, input coordinates, accepted assets and allocation caps are preserved. Admitting previously ignored TurretSpins and applying native AreaFire are narrow simulation corrections authorized by this feedback; the remaining changes concern presentation and review evidence.

## Evidence and delivery

- Selected app: `.artifacts/yuri-units/feedback-r2/package-v4/RA2-HD-Yuri-Units-D-R2/RA2 HD Yuri Units D R2.app`.
- Copied resources: the app's sibling `RA2-HD-Editions-Resources`, preserving the pinned 2,680 resource files.
- Runtime source/build identity: `.artifacts/yuri-units/feedback-r2/runtime-build-v4/identity.json`; build-time signed inventory: `feedback-r2/package-v4/package-receipt.json`.
- Final native reports, UI verification, review hashes and delivery paths are pinned in `docs/yuri-units-feedback-r2.json`.
- Offline correction review: `feedback-r2/package-v4/RA2-HD-Yuri-Units-D-R2/Review/Yuri-Units-Feedback-R2-Review-v2.html`. Six gameplay previews are embedded and decoded from a lone relocated HTML file. The additional disc flight clip covers eight native body bearings during movement and turns. Eight rotating-disc bearings and ring/ray crops come directly from completed native drawing-buffer frames; short-lived effects are not reconstructed in post-processing.
- Style review: `.artifacts/yuri-units/feedback-r2/art-samples/Yuri-Clean-Art-Review-v2.html`. It compares eight accepted and clean bearings per family at identical registered logical sizes and 4x detail. The 4x layout uses wider cards, and every accepted/sample image is checked against its card bounds. MIND is a complete vehicle; LTNK and YTNK are chassis samples because their turrets/barrels remain independent components. Full mother sheets and hashed prompts are retained. These samples are not installed.

Native legal fixtures and original orders are used in an isolated profile, with frozen bots and passive test victims explicitly disclosed. This does not certify every natural-match condition. The focused tests cover native flags/colors, yaw-independent radius, ordinary versus AreaFire targeting, turret aim/rotation, effect sequence/lifetime, moving magnetic endpoints/release and selected-control visibility. Relevant mind-control, expansion-rule and shared geometry regressions are retained. An older Soviet manifest assertion could not run because this isolated worktree lacks `yr-soviet-schp-vxl/owner-r3/manifest.json`; its failure is recorded, and the two relevant helicopter geometry tests passed separately.

## Acceptance and integration boundaries

The full batch's prior human art acceptance remains intact. R2's runtime corrections and three new style samples require their own visual decision; passing runtime checks does not imply that decision. Keep the existing accepted art active until a clean-style direction is selected. Any subsequent accepted style expansion must preserve every source silhouette, heading, owner region and component relationship, followed by actual native-scale verification.

The prior DISK refinery money-payment failure and YURIPR PsiWave caster-destruction exception remain open. Windows remains NOT_RUN; signing is local ad hoc. Combined C+D deployment and memory acceptance remains separate. The integration manifest records exact shared-file semantics and resources for additive integration into advancing main; no merge or remote push occurs in this task.

Move the entire R2 folder together and retain its sibling resource directory. Continue fixes and acceptance of this result in this execution conversation. Start a new task only after acceptance and a materially different objective.
