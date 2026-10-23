# Dual-edition R3: guard crash correction and accepted Soviet units

Status: `CRASH_REPRODUCED_AND_FIXED_M1_7_INTEGRATED_USER_ACCEPTANCE_PENDING`.

The user reported a Soviet YR skirmish stopping after several minutes with `Cannot read properties of undefined (reading 'neverUse')`, while running Desktop R2. They also requested integration of the updated M1.7 main-branch units and a complete M1.6 continuation prompt for building HD gaps.

## Crash correction

`ArmedTrait.computeGuardScanRange` inspected an absent weapon slot. The optional access stopped at `w?.rules`, then `.neverUse` dereferenced undefined. Single-weapon units such as Conscript and Rhino can trigger this through area guard; promotion can also enable that behavior. Filter absent slots before inspecting rules or range. Preserve selected-weapon, NeverUse dummy-range, native guard-range and capped-range semantics.

The retained R2 build reproduces the exact displayed error after a native Guard order in a Soviet YR match on GroundZe. Its failure screenshot is `.artifacts/editions/guard-r2-reproduction/last-state.png`; the stopped simulation is an in-game exception, not evidence of a native process/signature crash. All 172 Desktop R2 application-payload files match the retained package receipt. No Desktop installation or user profile was changed. The screenshot alone does not identify the original saved match, so this is a same-error/same-code-path reproduction, not a replay of that exact match.

The regression fails before the fix and passes afterward, including absent primary/secondary slots, selected versus dummy weapons, guard range and override/cap behavior. Current native guard scans continue with valid ranges in both editions.

Runtime source is committed at `f700653`. The final build is `.artifacts/editions/build-r3-final`; all 169 runtime files match the tested `build-r3-v2` byte for byte. Package documentation and validation tools may have later commits without changing those runtime bytes.

## M1.7 integration

Main commit `471c1c5` was merged into this branch at `f56a28c`, following crash fix `b1dd73a`. Both branch histories are retained. The main checkout remains untouched. The merge preserves dual-edition mechanics, application profiles and accepted unit rendering changes.

All 167 inventoried M1.7 resource files were added without replacing existing paths; all 3,539 pre-existing HD/UI files retain their hashes. The 22 accepted new HD families are DRON, SENGINEER, DOG, FLAKT, SHK, IVAN, YURI, TERROR, DESO, CIVAN, DTRUCK, SMCV, TTNK, APOC, HTK, HARV, V3, DRED, SUB, HYD, ZEP and SAPC. Existing E2 and HTNK remain retained. SQD and YURIPR retain their accepted Original exceptions; the RA2 Yuri Prime artwork must not override YR's different YURIX source. Original edition buildability is unchanged. YR-only units outside M1.7 are not newly authored by this integration.

The unit loader now permits dry-theater reuse only after its existing complete SHP/VXL/HVA source hashes and geometry checks. Snow remains Original for the new batch. It does not replace changed expansion sources merely because the rules name matches. SHP families retain accepted 2x allocation, VXL families 4x; the combined optional budget remains 256 MiB.

## Verification

Evidence is under `.artifacts/editions/`:

- `integration-r3/regression-final.log`: 236 passing tests, no failures, 7,629,359 assertions. Includes all 166 M1 tests, edition/UI regressions and the guard correction. `integration-r3/typecheck.log` passes entry type checking.
- `units-r3-yr-temperate`: original Guard orders complete; all 22 new families reach READY and bind to actual renderers on XMP23T4. SQD/YURIPR stay Original. Unit allocation 46,585,172 bytes, below available shared-budget headroom; GL error 0.
- `units-r3-ra2-temperate`: the same full roster and guard checks pass on MP23T4, preserving RA2 behavior.
- `units-r3-yr-newurban-land`: GroundZe land/air actors bind correctly, including 19 accepted HD families; YURIPR remains Original. Three accepted naval families and SQD are excluded here because this map has no legal water placement; coastal coverage is recorded separately above.
- `battle-r3-yr-newurban`: a 900-second Soviet-versus-Yuri autonomous match advanced from tick 320 to 80,194 across 90 strictly advancing samples. Normal economies, production, combat, advanced units and Industrial Plant appeared without the reported crash or a game-error overlay. No resources/units/attacks were supplied by the harness. Neither player lost within the time bound, so the original **full-match assertion remains FAIL (timeout)** and score/reentry were not reached. `integration-r3/soak-assessment.json` records the narrower successful stability observation without relabeling that full-match failure. The optional missing `rulescd.ini` diagnostic is not a simulation failure.
- `packaged-runtime-r3`: the signed app extracted from the candidate ZIP cold-started both editions with automatic adjacent-resource discovery. Each Soviet case completed 18 ordinary and 18 post-promotion guard scans, bound all 22 accepted unit families, retained both Original exceptions and reported GL error 0. Status: `PASS_PACKAGED_GUARD_PROMOTION_AND_M1_7_BOTH_EDITIONS`. Total accepted optional allocation in RA2 is 233,693,296 bytes, below 268,435,456. Package/runtime source is unchanged when the final validation document is refreshed.
- `guard-r2-reproduction` is an intentional before-fix failure and remains a failure record. `units-r3-yr-newurban` initially requested a squid on a waterless map and failed fixture placement; it is not a passed naval test. Earlier broad test failures due to absent historical Rhino fixture files were resolved by copying exact preserved main-checkout fixtures, without changing their bytes. The changed availability description has an updated expectation.

The complete M1.6 building continuation prompt is [m1-6-soviet-building-gaps-execution-prompt.md](m1-6-soviet-building-gaps-execution-prompt.md). Its source inventory is `integration-r3/building-gaps-final.json`. Industrial Plant (NAINDP), Battle Bunker (NABNKR), distinct snow variants and incompatible NAPOWR construction variants remain explicit building HD gaps. No new artwork was generated in this correction task.

R3 uses a new `RA2 HD Dual Edition R3` profile and package name. R2 and earlier apps, archives, imported resources and profiles stay preserved. Continue crash/integration feedback in this execution task; return to the existing M1.6 task for the requested building artwork continuation. Technical verification does not substitute for user gameplay acceptance.

## Test delivery

The final package is `RA2-HD-Dual-Edition-R3-Mac-Test`, containing `Red Alert 2 HD Dual Edition R3.app`, adjacent `RA2-HD-Editions-Resources`, validation/fidelity notes and `BUILDING-HD-NEXT.md`. It contains 919 resource files, including the exact 167 accepted M1.7 additions, and retains the 430-asset UI selection. The intended Desktop delivery is `/Users/Aone/Desktop/RA2-HD-Dual-Edition-R3-Mac-Test.zip`; `.artifacts/editions/delivery-receipt-r3.json` records the verified delivered bytes. Keep the resource folder beside the application after extraction. No previous package or profile is replaced.
