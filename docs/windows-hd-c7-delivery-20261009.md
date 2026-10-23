# C7 Windows HD delivery and continuation — 2026-10-09

The new C6 S1 return identifies exact Windows first-use shader waits, and the focused C7 source repair is complete locally. Native Mac mechanism, lifecycle and full-output controls pass. The complete Windows x64 candidate is sealed, verified after fresh extraction, launched from that extraction and copied to Desktop with full SHA-256 and member CRC checks. Windows performance, loading cost and user acceptance remain pending. Main remains clean at `d38f136`; no merge, push or publication occurred.

## Delivery identity

- Desktop: `/Users/Aone/Desktop/RA2-HD-WINHD-20261008-D38F136-C7-3ab266e-Windows-x64.zip`.
- Preserved delivery original: `/Users/Aone/RA2remaster/deliveries/RA2-HD-WINHD-20261008-D38F136-C7-3ab266e-Windows-x64.zip`.
- ZIP: 3,499,998,753 bytes; 8,123 members; SHA-256 `5e590732d1765b538cad25fca93c22fc80d448e111b6f9baa6edc501a113cb40`.
- Manifest: `1133beff253fc177d8b4a007077560a0a3a6de3aeb65f833464085dd65485458`; 8,122 catalog entries.
- Shipped source checkpoint: `3ab266e3b0b2c755f33ac65ca0866b1055f019d0`. Source-focus checkpoint: `baa847aa3a5366b6b99a5855bcf7a3c53611850a`. The later checkpoint changes documentation/reference packaging only; all 288 mapped build files and 469 application/map files are byte-identical to the native-validated checkpoint.
- All 6,033 frozen R10 world/UI resource files retain inventory SHA-256 `071134520e28ebf9bff42137117d8aac62b24b22c0e1fef269920a35d3672dbc`. World 2X/4X limits remain 512/1,280 MiB; prepared CPU/UI limits remain 128/16 MiB.

## Confirmed cause and source change

The validated return `WINHD-20261008-D38F136-C6-RETURN-2026-10-10T03-41-03-540Z.zip` contains three runs. All previous run files remain exact. The new run `2026-10-10T03-33-47-535Z-stress-4x-none` has exact setup and machine parity with C6 Normal, four valid phases and zero errors. The shipped S1 provenance, automatic F9, native Windows x64 staging and exact C6 manifest are verified. See `docs/windows-hd-c6-shader-identity-windows-20261009.md/json` for raw-return identity, exact shader hashes and task attribution.

Damage smoke waits 64.560 ms and SLAV's nearest indexed/embedded-shadow program waits 130.855 ms. Native driver-query waits and ANGLE compiler worker CPU agree with those events. Tiled building body/coverage add 17.365/19.980 ms. All four programs are released within the captured playing window. The 1,096.049 ms profiler startup is instrumentation overhead, not a game stall. A separate 80.927 ms PNG validation/readback task remains outside the shader repair.

The only application increment over C6 is `Renderer.ts` plus `batch/CombatProgramWarmup.ts`. C7 compiles and validates exactly those four Windows-observed variants during single-player HD map loading and retains detached program owners for the scene lifetime. It borrows loaded textures, adds no gameplay FX or draws and does not preload asset families. Existing C1–C6 rendering/pooling changes, normal error checks, art, simulation, logical geometry, fallback and budgets remain intact. Original adds no owners. Cancellation/failure releases pending owners; exit, shutdown and context replacement release retained owners.

## Completed checks and limits

All 65 focused/shared tests (940 assertions) and entry type checks pass. Preserved early test failures were fixed before the source checkpoint. Native Mac compiles the four exact Windows source pairs at tick zero before play; every program is then used during 28 seconds of actual play without relink/deletion. Final scene removal releases each owner once and no borrowed textures. Four instrumented stress phases progress normally. Nine same-state full-output cameras across stress 4X, Small 2X and Small Original have zero different bytes after warmup removal/restoration and batch handoff. Original owns zero groups. These establish mechanism and image preservation, not Windows FPS gains.

Final ZIP extraction verifies every catalog member. The final freshly extracted copy completes four valid uninstrumented stress phases with zero errors and native 8-player/7-AI 4X rendering. Desktop size, full SHA-256 and all member CRCs match the sealed original. No profiles or diagnostic runs are shipped. Raw QA runs belong only to owned extraction/testing directories; the pristine assembly and delivery original were never launched.

Read `docs/windows-hd-c7-native-validation-20261009.json` and `docs/windows-hd-c7-delivery-20261009.json` for bounded receipts. Main apply-check of the complete D38-to-C7 application patch passes without applying it. The M2.3 peer independently advanced from `12bc0c3` to `ba13182` and has its own modified native-bridge checker; it was inspected only. No peer changes or assets enter the C7 kit.

## Next Windows run and acceptance

Extract the complete new C7 ZIP to a new local folder, run Verify-Kit.cmd, then Launch-Diagnostics.cmd with [8] eight players, [4] 4X and [N] Normal. Keep the game focused through all four 15-second phases. Avoid F8/F9 and settings/camera changes. Close after final capture, use Export-Reports.cmd and return the new ZIP. Describe enemy/combat hitches, loading wait and any edge/occlusion/shadow/color changes. One launch is requested; no old-version rerun or density/control matrix is requested.

Retain C6 Normal baseline run `2026-10-10T00-42-54-111Z-stress-4x-none`, source `4d3e41f`, manifest `f7bdd266...`, from the validated return extraction `.artifacts/windows-hd-diagnostic/returns/2026-10-10T03-41-03-540Z-c6-s1`. Select that run explicitly; the other two C6 runs contain instrumented windows. Compare matched phase tails/long frames, native ticks, errors, machine/power/output/driver, exact resources/caps and actual binding/fallback sets. Never treat a Mac trace, higher FPS with missing HD, or artificial profiler overhead as Windows acceptance.

Preserve the user's accepted C4 Small scrolling/play result. Stress combat remains open; the C6-versus-C5 subjective result remains no noticeable difference. Formal deliverability requires a valid matched Windows result, acceptable combat/scrolling/loading feedback, no new visual defects and preserved source/resource regressions. Remaining PNG work, other shader variants, startup simulation, GPU timing and actual residency are not closed by C7. Keep this same execution conversation for the repair and its acceptance; only start a new one after acceptance with a materially changed objective.
