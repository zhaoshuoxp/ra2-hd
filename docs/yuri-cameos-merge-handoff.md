# Task E: accepted Yuri cameos, loading repair and merge handoff

Current outcome: the user subsequently authorized and completed [E integration into local main](yuri-cameos-main-integration.md), excluding D/sidebar/loading optimization. The historical branch handoff below remains intact; its broader peer-integration suggestions were superseded by that narrower authorization.

Status: `YURI_CAMEOS_E_ACCEPTED_AND_DELIVERED_NOT_MERGED`. On 2026-10-01, the user accepted the final repairs and requested this handoff for the main coordination conversation. All 31 selected canonical cameos, 12 rank aliases and the additional Yuri loading background are accepted. This acceptance closes the remaining artwork gate; it does not certify Windows or a combined main build. No merge, push, publication or cleanup was performed.

The authoritative current acceptance is [yuri-cameos-final-completion.json](yuri-cameos-final-completion.json), backed by `.artifacts/yuri-cameos/final-acceptance-v1.json`. Earlier pending reports, rejected alternatives, accepted app bundles and Desktop ZIP bytes remain historical evidence and are preserved.

## Branch and application identities

| Item | Identity |
| --- | --- |
| Worktree | `/Users/Aone/RA2remaster/ra2-hd-yuri-cameos` |
| Branch | `task/e-yuri-cameos-hd` |
| Original main base | `ee35fcf04de2d24c1bce2ee7497e4156483b21f1` |
| Last implementation/delivery checkpoint before acceptance closure | `39f6c935faed534bf9c31ca834dcf384ca3bf744` |
| Reviewed R3 application source | `96a053cfc61c3e0908dae2ca0e672c54af564808` |
| Main observed at handoff | `0370e9b41d4736a0b80bbe35d2552b3f3a39a4a4`, with unrelated uncommitted Yuri building/bunker work |
| Sidebar peer observed | `fix/allied-animation-sidebar`, `3b4202a8862ce637e3322dd0e31efaba87499149` |
| Loading optimization peer observed | `fix/skirmish-loading-isolated`, `4c7992d`, including the sidebar peer and uncommitted prepared-HD work |

Use the final committed tip of `task/e-yuri-cameos-hd` for source and current documentation. The R3 binary was built from the application source above; subsequent commits add packaging, evidence and acceptance documentation. Main and peer snapshots may advance independently and must be rechecked before integration. Nothing in this report authorizes changing their uncommitted files.

## Completed coverage and artwork corrections

The native audit covers 157 owner candidates and selects 34 legal Yuri roots (15 buildings and 19 units), plus four powers. Its 52 cameo references comprise 31 new canonical pictures, 12 additive rank aliases, eight reused accepted references and one absent native variant. Both 2x (120 x 96) and 4x (240 x 192) exports are provided. Native cameo geometry remains 60 x 48 and the aggregate sidebar canvas remains 64 x 48. The accepted 430-entry predecessor was preserved; cameos bring the isolated catalog to 473 and the loading background to 474. The 512-entry limit and 16 MiB UI budget are unchanged.

The user-supplied original image sheet is the composition, proportion, viewpoint and color authority. Final images add authored texture and fine detail with smoother natural contours, following the original subjects. Early enlarged-pixel and edge-only alternatives were rejected and retained as history. Selected master hashes and all 62 density exports are pinned in `.artifacts/yuri-cameos/batch-acceptance-v2.json`.

| Subject | Reported problem and accepted correction |
| --- | --- |
| INIT | Head illumination is ordinary sunlight, not a laser beam. |
| LTNK | Lower, less tall tank; raised placement with less upper empty space; slightly downward original viewpoint; longer barrel. |
| YAPOWR | One near and two distant buildings, each with three reaction chambers. Wider gaps, native colors with less yellow, symmetric narrowing below the middle and a separate pedestal as wide as the middle. Composition moved upward and lower connecting pipes extended. |
| MUTE | Genetic Mutation reverted to the exact earlier approved master and exports. |
| CAOS | Four radial horizontal cannon barrels on two perpendicular axes, replacing lens-like shapes. |
| FORC | Translucent luminous blue energy field, replacing solid cage-like material. |
| GGUN | Small left gun uses the same model as the main gun at smaller scale; invented small firing flames removed. |
| PDOM | Psychic Dominator power follows the native building-opening activation effect rather than a ground object. Its native references are pinned locally. |
| PSYRI | Psychic Reveal preserves the eyes, red/orange palette and detail, removes invented fabric/hair, and adds native-guided black mist around the image. Latest `psyricon-v3` is accepted. |
| PSYT / TBNK | Rigid Psychic Tower panels and stationary Tank Bunker foundation replace cloth-like panels and moving outer tracks. |

The eight reused identities are `ccomicon.shp`, `ccomuico.shp`, `clonicon.shp`, `engnicon.shp`, `ivncicon.shp`, `psicicon.shp`, `psicuico.shp` and `psisicon.shp`. Native exceptions remain explicit: absent `engnuico.shp`; untrainable YENGINEER/CAOS/MIND alternates; localized `inituico.shp` byte collision with `ltnkuico.shp`, resolved through the correct INIT base plus the existing shared rank overlay. No native training eligibility or power rule was changed.

## Follow-up repairs

**Force Shield across factions:** native `ForceShieldSpecial` resolves the same `forcicon.shp` in Yuri's Revenge Allied, Soviet and Yuri matches. All three actual copied-app runs fetched the approved 240 x 192 image, SHA-256 `037eeb4431d4b3fa847a388d05f8078f077b07439e7142ad4ce8988c2a70b706`. Geometry, UV trim, dynamic name and HD Off/On allocation checks passed. A faction alias or gameplay patch was unnecessary. Force Shield remains expansion-only. Evidence: `.artifacts/yuri-cameos/loading-followup-v1/runtime-v1/result.json`.

**Yuri skirmish loading:** Yuri lacked both an authored HD entry and a country binding. The existing nine-country 186 x 150 portrait overlays could not represent its full background. Native `ra2md.mix/loadmd.mix/ls800yuri.shp` and `ra2md.mix/localmd.mix/mpyls.pal` provide the 800 x 600 reference. The accepted new `loading-background-yuri` image is 1448 x 1086, used directly without export resampling (1.81x density), SHA-256 `730b7819866cc593ec5979d46e069c596ba69e77c7716d1fe4a002608ddbc93f`.

The loading pipeline prepares this full background through the existing bounded 500 ms optional-art lease. HD and Original use the same native logical layout; only the empty 430..440 corridor expands with aspect ratio. Live player names, map labels and progress remain separate. HD switching, missing/invalid/timed-out art fallback, loading teardown and actual match entry pass. Existing nine-country portraits remain intact. Provenance, prompt, export receipt and actual HD/Original captures are under `.artifacts/yuri-cameos/loading-followup-v1/`.

**Isolated resource routing:** `RA2_UI_RESOURCE_ROOT` lets the copied review app select task-local UI resources while reusing read-only native/world inputs. The desktop profile propagates this root, and registered `/local-ui/` requests retain containment and hash checks. Missing/invalid review selections fall back to Original. The normal selection and native/world root were preserved.

## Source changes and peer coordination

Seven production files change relative to the original base:

- `desktop/hd-profile.mjs`, `desktop/main.mjs`, `desktop/protocol.mjs`: independent UI root registration and serving.
- `src/gui/screen/game/loadingScreen/loadingArtwork.ts`: Yuri full-background binding and shared artwork-ID resolution.
- `src/gui/screen/game/loadingScreen/prepareLoadingUnit.ts`: prepare the selected portrait or background through the bounded lease.
- `src/gui/screen/game/loadingScreen/LoadingScreen.tsx`: pass the prepared Yuri background ID to the backdrop.
- `src/gui/screen/game/loadingScreen/LoadingBackdrop.tsx`: acquire optional HD background, preserve native layout/fallback and release on teardown.

Focused tests extend `scripts/editions/loading-preparation.test.ts`; task tooling lives under `scripts/ui/yuri-cameos/`. Task E changes no gameplay rules, world geometry, camera/input coordinates, C/D world masters, `SidebarCard`, `UiArtPage` or `UiArtSpriteBuilder`.

At this handoff, the loading optimization peer has uncommitted prepared-HD work in `desktop/hd-profile.mjs` and world sprite files. The only currently observed production-file intersection with Task E is `desktop/hd-profile.mjs`; its prepared-resource registration must be retained alongside the independent UI root. No peer changes to the four loading-screen files were observed. Recheck before merging rather than assuming this remains true.

Preserve the accepted sidebar peer's asynchronous page preparation, lease release and current-model identity checks. Task E's historical 16 rapid-switch run observed transient Original; that peer correction was neither merged nor certified by Task E. Human acceptance does not turn this old observation into a technical pass. Run a focused rapid-switch check after combining the branches.

## Validation and delivered package

Evidence is reused from the actual accepted artifacts; this acceptance-only closure does not rebuild or repeat historical matrices.

- Cameos: 13 UI tests / 109 assertions, four profile/protocol tests / 35 assertions, entry typecheck, signed copied app, actual 34-root / four-power YR bindings and bounded RA2 Allied/Soviet controls. Fourteen declared alternate pairs were exercised; 12 are naturally trainable. Queue, progress, quantity, disabled, name/rank, HD Off/On, geometry and UV checks passed. Maximum measured UI reservation was 14,040,832 bytes and HD Off released to zero.
- Loading follow-up: five tests / 58 assertions, typecheck, deep/strict copied-app signature, 131-image embedded offline review with zero external requests, three-faction Force Shield runs and Yuri loading-to-match checks. Loading bitmap reservation is 6,290,112 bytes; match UI peak is 13,672,192 bytes. Renderer errors are zero.
- Complete Desktop ZIP: 5,595 inventoried payload entries, hash/mode/symlink validation, source-to-Desktop ZIP identity, extracted signature, automatic sibling discovery and actual RA2/YR match startup from fresh isolated profiles without preseeded registrations or UI-root overrides. Validation retained intentional Original exceptions.

Native runtime checks disclose legally placed prerequisites, passive bots and controlled stolen/veteran grants; they are not an organic full-tech playthrough. Windows and the future combined integrated build remain `NOT_RUN`.

Recorded Desktop delivery: `/Users/Aone/Desktop/RA2-HD-Yuri-Cameos-E-R3-Complete-macOS-arm64.zip`, 1,770,666,461 bytes, SHA-256 `7bc2cff1731510e151cf67609181b9b0a7e0b0bf6916b6ef4ff2cf8a56fdfeef`. It includes the unchanged signed R3 app, both native editions, registered world/UI dependencies and offline review/provenance. Keep `RA2-HD-UI-Resources` and `RA2-HD-Yuri-Cameos-Resources` beside the app. It is complete for its recorded R3 source and does not incorporate concurrent C/D or peer source changes. The accepted ZIP was not repacked after this acceptance.

At acceptance bookkeeping the recorded Desktop path was no longer present. The original ZIP remains at `.artifacts/yuri-cameos/complete-zip-r3-v1/RA2-HD-Yuri-Cameos-E-R3-Complete-macOS-arm64.zip`, with the prior source/Desktop hash and extracted runtime evidence preserved. This closure records that availability change and does not automatically recreate a Desktop copy.

Detailed phase evidence: [cameo acceptance](yuri-cameos-final-acceptance.json), [loading follow-up](yuri-ui-loading-followup.json), [Desktop ZIP delivery](yuri-cameos-desktop-zip.json). Original artifact receipts remain immutable, including their historically pending review labels; the new final acceptance supersedes those labels for current status.

## Integration instructions for the main coordinator

1. Recheck main and peer branch heads, dirty files and the current accepted UI selection. Preserve unrelated work and reconcile the seven production changes with the sidebar/loading peers.
2. Transfer the ignored artwork and evidence with their pinned identities; a Git merge alone does not carry `.local/` or `.artifacts/`. Resource provenance is chained through `.artifacts/yuri-cameos/loading-followup-v1/integration-resource-manifest.json`, `.artifacts/yuri-cameos/production-v5/accepted-integration-resource-manifest.json` and its pinned production-v4 predecessor. Final closure supplements are in `.artifacts/yuri-cameos/final-handoff-v1/integration-resource-manifest.json`.
3. Apply the 43 additions in `.artifacts/yuri-cameos/production-v5/pack-delta.json`, including the 12 shared-rank alias contracts, followed by the one loading addition in `.artifacts/yuri-cameos/loading-followup-v1/pack-delta.json`, to the current accepted catalog. Their predecessor hashes describe Task E's source baseline; they are not reset targets. Require collision review and preserve newer accepted entries instead of replacing the current catalog with the entire 474-entry review manifest. Use production-v5's accepted selection, not an older production-v4 Psychic Reveal image.
4. Reuse existing evidence and run focused combined checks: additive registration/hashes, normal/rank/power bindings, three-faction Force Shield, Yuri loading plus native fallback/teardown, rapid switching with the peer fix, bounded RA2 controls and copied-package resource discovery under the unchanged UI budget. Record combined-build acceptance separately.

Continue corrections or acceptance issues for this result in the existing execution conversation. The main conversation coordinates integration; a new conversation is appropriate only for a materially different objective after acceptance.
