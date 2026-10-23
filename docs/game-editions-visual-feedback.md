# Airstrike, Iron Curtain and repair feedback fixes

Status: `PASS_TARGETED_NATIVE_VISUAL_FEEDBACK`. Based on main `5369148`, including the accepted M1.7 YR unit integration. The user explicitly limited this follow-up to the reported bugs; the accepted unit artwork was neither changed nor submitted for another review.

## Corrections

- Boris's designator existed but used the opaque render pass, which allowed transparent world sprites to cover it. It now renders with the other transparent effects, without depth writes. The target building receives a red tint while designation is active. Independent spotters retain independent markers; stopping or removing a spotter releases only its own marker. Weapon rules, endpoints and airstrike mechanics are unchanged.
- Both HD vehicle rendering paths could reduce Iron Curtain brightness to zero. They now use the existing relative sprite-light multiplier, retaining authored detail under the dark effect. The baseline comes from ordinary lighting rather than the potentially active effect at lazy-load time, so brightness also restores correctly afterwards.
- The native seven-frame repair wrench inherited a one-shot animation and stopped at its last frame. It now loops while repairing and releases its animation when repair stops or the indicator is replaced.

## Verification

The retained main integration build reproduced the defects: repair frame 6 remained fixed across all 12 samples, both tested HD vehicle multipliers were `[-1, -1, -1]`, and Boris had an opaque line with no building marker. The candidate was then checked in the native Electron client using isolated profiles and controlled live skirmish fixtures. Fixture setup suppresses unrelated combat and activates repair/Iron Curtain directly; Boris uses an actual attack order and waits for the airstrike target to become active.

| Case | Evidence |
| --- | --- |
| RA2 shared effects | Repair frames continue cycling; HTNK and APOC retain approximately 25–50% brightness under Iron Curtain, then restore normal brightness. Repair stops cleanly. |
| YR shared effects | The same repair and vehicle checks pass. |
| YR Boris | The red laser and red target-building tint are visible in the captured client frame. Cancelling designation removes both and restores the target tint. |
| Focused code checks | Two tests, 13 assertions: line rendering/independent marker cleanup and repair looping/disposal. Entry type checking and whitespace checks pass. |

Evidence is retained under `.artifacts/editions/`:

- `visual-feedback-before/result.json`: reproduction on the retained main build.
- `visual-feedback-after-ra2/result.json`: RA2 shared-effect results.
- `visual-feedback-after-yr/result.json`: YR results, including active and cleared tint/light values.
- `visual-feedback-after-yr/boris-designation.png`: visible laser and target tint.
- `visual-feedback-after-yr/visual-feedback-active.png`: dark vehicle detail and repair indicator.
- `visual-feedback-after-yr/visual-feedback-cleared.png`: cleared Boris effects.
- `visual-feedback-tests.log`, `visual-feedback-typecheck-final.log`: focused automated checks.

An earlier candidate run sampled before Boris acquired an active airstrike target and failed that assertion. The harness was corrected to wait for the actual trait state; the failed evidence remains in `visual-feedback-after/`. No gameplay workaround was added for that timing issue.

To repeat only these cases, build an isolated review directory and run:

```sh
bun test scripts/editions/visual-feedback.test.ts
bun run typecheck:entry
node scripts/editions/validate-bootstrap.mjs BUILD OUT_RA2 ra2 --country=5 --map=MP23T4.map --visual-feedback
node scripts/editions/validate-bootstrap.mjs BUILD OUT_YR yr --country=5 --map=XMP23T4.map --visual-feedback
```

These are bounded effect checks, not a new full-roster acceptance, a long-duration match test or Windows validation. Continue any corrections to these effects in the current task.
