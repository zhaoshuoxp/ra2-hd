# Dual-edition R5 combat feedback corrections

The user reported lightning-storm visuals after destroying enemy buildings and continued Yuri Gatling fire or firing audio after enemies disappeared. Both faults are reproducible in the delivered R4 runtime. This is a bounded correction on project main; accepted art, weapon balance, AI, geometry, original resources and existing Desktop packages remain preserved.

## Debris incorrectly marked as lightning

`Debris.detonate` passed `true` to `Warhead.detonate`'s `isWeatherStorm` argument. Ordinary building and vehicle debris could therefore dispatch lightning-strike events, trigger `WCLBOLT1/2/3`, and use weather-storm damage behavior. Remove that argument so debris follows the normal warhead path while retaining its configured damage, spread, expiry effect and water-splash handling. The actual Lightning Storm effect still explicitly sets its own storm flag.

The R4 native Soviet power-plant destruction fixture recorded 13 false lightning events and matching storm-bolt animations. The fixed YR fixture records zero; the positive lightning-handler regression still renders an explicit real-strike event. Debris' own impact/explosion effects remain.

## Gatling audio outlived combat

Weapon reports marked `Control=loop` started another indefinite playback on every shot. `SoundHandler` discarded the handles and passed a fixed position instead of the firing object, so neither target loss nor removing that object ended those loops. The R4 Gatling-tank fixture recorded zero shots and an idle attack state after target loss, but 21 sound handles still playing. The first cannon fixture also had surviving enemy crew and is not used as proof that its additional shots were invalid.

Looping reports now have one tracked current handle per shooter. Continuing the same report refreshes its firing deadline; stage/report changes stop the previous loop. Idle, disabled or removed/destroyed shooters, ownership changes, missed firing cadence and screen disposal stop and release the handle. The object-bound playback also lets world-sound cleanup track removal. Normal one-shot weapon reports retain per-shot playback. Existing attack/decay audio behavior is preserved.

Native corrected tests cover both `YAGGUN` and `YTNK`, including all three original attack-loop stages. The fixture removes surviving enemy crew as well as the designated target before asserting zero new shots, idle attack state, stage zero after cooldown and no active loop handles. High target HP is a test-only fixture allowing the weapons to reach stage three; no production rules change.

## Validation and boundaries

Evidence under `.artifacts/editions/`:

- `combat-feedback-r4-reproduction`: old delivered code, false debris strikes and orphaned loops reproduced.
- `combat-feedback-fixed-yr-v1`: corrected initial-stage cannon/tank target-loss checks.
- `combat-feedback-fixed-yr-stages`: corrected three-stage cannon/tank checks, no page errors.
- `combat-feedback-fixed-ra2`: original-edition debris regression passed, with zero false lightning events and no page errors.
- `combat-feedback-regression.log`: 69 focused tests / 490 assertions pass.
- `combat-feedback-typecheck-final.log`: entry type checking passes.
- `combat-feedback-regression-full.log`: complete integration regression passes 241 tests / 7,629,420 assertions.

Regression tests separately cover ordinary reports, repeated-loop reuse, stage switching, independent shooters, cadence expiry, disable/removal/destruction, capture, disposal and positive lightning rendering. The initial debris unit fixture assigned inherited read-only properties and was corrected; that fixture error is not counted as evidence of the production bug. Native old-runtime events supply the independent reproduction.

The existing R4 loading fix, R3 guard/promotion crash fix and accepted M1.7 HD roster remain included. [Earlier fidelity limits](game-editions-fidelity.md), [loading validation](game-editions-loading-r4.md), and [building HD handoff](m1-6-soviet-building-gaps-execution-prompt.md) remain applicable. Audio verification observes native playback state and simulated firing; final physical-speaker listening and user acceptance remain separate. No Windows runtime or new long-match victory claim is made. Continue corrections in this same task.
