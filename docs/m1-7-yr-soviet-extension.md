# M1.7 Yuri's Revenge Soviet unit extension

Current status: all reviewed families are accepted and integrated into main. See `m1-7-yr-final-acceptance.json` and `m1-7-yr-main-integration.md`; delivery-time pending and isolated-branch labels below are historical.

Status: `COMPLETE_FAMILY_REVIEW_PENDING`. The five representative sheets are accepted. Full resources and native action validation are complete for BORIS, SCHP, CCOMAND and PTROOP; final complete-family visual/gameplay acceptance remains separate. Work stays in `/Users/Aone/RA2remaster/ra2-hd-units-yr` on `m1-7-yr-soviet-units`. Main's committed building, combat/audio and snow-unit updates through `f508f43` are integrated here. The final package also retains main's lamp-blending and paused-score corrections. Main and other worktrees' uncommitted files have not been modified; this extension has not been merged back to main.

## Coverage and selected resources

The audited YR Soviet skirmish roster has 28 roots: 23 accepted HD reuses, four new complete HD candidates, and the user-selected Original SQD/SQDG exception. Required dependencies are counted with their parent. `m1-7-yr-coverage.json` is the consolidated per-identity ledger; `m1-7-yr-resources.json` pins all 50 selected new resource files. `.artifacts/m1-7-yr/source-v1/inventory.json` and `rules-audit.json` retain the actual source/rules audit.

| Family | Selected resources | Complete native coverage |
| --- | --- | --- |
| BORIS | Body revision 2, family revision 2, BPLN VXL revision 1 | 409 body slots; eight aircraft bearings; normal two-plane and elite four-plane airstrikes |
| CCOMAND | Body/family revision 1 | 348 body slots; stolen Allied technology gate, teleport recovery, weapon and C4 |
| PTROOP | Body/family revision 1 | 315 body slots; stolen Yuri technology gate, mind control, C4 and release on death |
| SCHP | VXL/family revision 1, SCHPDEPL revision 2 | Flight body, main/tail rotors, deployed SCHD body, SCHDTUR turret, 11 deployment phases in both directions |

All 1,072 infantry slots include native embedded shadow coverage; empty second-half shadow slots are retained. SCHPDEPL retains its 11 separate native shadow frames. Generic weapon/death effects remain native. Alpha-aware export prevents sheet labels from entering Boris's extended flare crops. Immutable rejected art/export revisions and exact image-generation prompts remain in the ignored authoring history.

Eligible stolen-tech identities retain their real prerequisites: CCOMAND requires stolen Allied technology, PTROOP stolen Yuri technology, and existing CIVAN stolen Soviet technology. Test spies actually infiltrate the relevant laboratories before production becomes available; no stolen-tech flags are injected. Laboratory and prerequisite placement is a controlled fixture, not evidence of a naturally played match. YURI/YURIPR are Yuri-faction production in YR, while LUNR is campaign-only; they are explicit scope exclusions. The accepted RA2 YURIPR guarded-Original exception remains preserved.

## Runtime and evidence

All paths below are relative to `.artifacts/m1-7-yr/`.

- `native-{boris,ccomand,ptroop}-sweep-v1`: all 1,072 slots for both owners, paired Original/HD rendering, identical geometry/world transforms and native shadows, clean GL state and released textures.
- `native-{boris,ccomand,ptroop}-actions-v3`: native production, movement/teleport, primary weapons, C4 or normal/elite airstrikes, and actual 15-frame gunfire death playback. PTROOP releases its controlled target on death. No post-activation live actor switches to Original were observed.
- `native-bpln-v1`: both owners and eight actual native aircraft headings, alongside Boris's executed airstrike evidence.
- `native-chopper-v10`: native production, movement, forward/reverse deployment with HD animation and native shadows, live rotor matrices, normal/elite air and artillery weapon damage, 32 owner/state/heading views, and airborne crash/removal. `native-chopper-v11` repeats this on the final integrated build.
- `native-roster-v1`: all 28 roots simultaneously placed and bound; 27 HD and SQD Original. Measured unit demand is 59,518,140 bytes. Including accepted base/building resources, total optional allocation is 245,514,840 bytes within the unchanged 268,435,456-byte cap. Package validation rechecks the final build and theater-specific allocation.
- `production-tests-v6.log`, `typecheck-production-v11.log`: resource, animation, mixed-family atomic fallback, lifecycle, snow/temperate and desktop regressions plus entry type checking. Missing body or child assets withhold the complete Boris/SCHP family.
- `production-preservation-v1.json`: all 167 accepted unit files, 1,760 initial HD files, 245 subsequently accepted building files and five approved representative sheets match their pinned hashes. Existing resource hashes were checked in both main and the isolated checkout.

New family identity is restricted to YR. The current main source-matched snow loader is retained; all SHP/VXL/HVA source identities, geometry, camera, rules and allocation checks remain mandatory. The Mac package validator runs both editions on temperate and snow maps, confirms four new families are absent from RA2 selection, checks existing buildings/units, and repeats guard/combat regressions. Exact package outcomes are recorded in the delivery receipt rather than inferred from source tests.

Earlier failed reference captures, artist corrections and the initial Boris export are retained and superseded. `native-boris-actions-v2` used a tank warhead selecting a generic explosion, so its expectation of unit Die frames was invalid; v3 uses a native gunfire warhead and observes all required Die1 frames. `authoring-qa-resolution-v2.json` links corrected candidates to native visual review. A historical test PASS never overrides a later visual rejection.

## Review and delivery

`YR-Soviet-Units-Full-Review-v1.html` embeds all 4,288 paired native frame images, four native action recordings, SCHP state/owner contacts and BPLN owner/headings. It opens directly without a server or network. Default 1x preserves captured 1080p framebuffer pixels; 2x/4x are explicitly inspection magnification. Its frame playback is a paused-renderer review aid, separate from actual action recordings.

The uniquely named `RA2 HD YR Soviet Units R1.app` uses a separate profile, discovers sibling `RA2-HD-Editions-Resources`, and retains both editions and accepted building/UI/unit content. Move the complete test folder together. It is a local ad-hoc signed Apple Silicon app; Windows, campaigns, all other theaters and natural battle-to-victory completion are not claimed. Final complete-family acceptance is pending. Continue corrections and acceptance in this same execution task, locally and sequentially without a web server, subagents or publication. Recheck current main before any later authorized integration.
