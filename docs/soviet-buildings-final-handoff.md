# Accepted Soviet HD buildings: handoff to the main conversation

## Outcome and boundary

The user reported that all tests passed and asked to close this execution task, commit application changes to the workspace, retain useful experience, and return to the main conversation for the next step. The user clarified that keeping a Desktop application is not required. The original objective and all subsequent explicitly authorized additions are complete. Status: `SOVIET_BUILDINGS_ACCEPTED_AND_DELIVERED`. There are no unresolved acceptance items within this task's final authorized scope.

M1.6a NAPOWR was previously accepted. M1.6b's four-family batch is now `M1_6B_ACCEPTED_AND_DELIVERED` on the combined R4 foundation. The subsequent 13 remaining vanilla RA2 temperate Soviet families, feedback corrections and four HD targeting cursor families are also accepted. Human acceptance closes the visual/gameplay gate; it does not retrospectively turn unrun automated/platform checks into passes.

| Original batch family | Final status | Selected pack revision |
| --- | --- | --- |
| NAHAND — Soviet Barracks | Accepted and delivered | 5 |
| NAREFN — Ore Refinery | Accepted and delivered | 5 |
| NAWEAP — War Factory | Accepted and delivered | 5 |
| NACNST — Construction Yard | Accepted and delivered | 5 |

The other accepted Soviet families are NAPOWR, NARADR, NADEPT, NAYARD, NATECH, NANRCT, NACLON, NAPSIS, NALASR, NAFLAK, TESLA, NAIRON, NAMISL and NAWALL: **18 Soviet building families total**, including the retained NAPOWR baseline. The application registers 21 HD selections including existing Conscript, Allied Power Plant and Rhino. The 17 batch/remaining families use complete 2× sets; NAPOWR retains its accepted 4× selection. Native rules, footprints, camera, timing, shadows and the 900-high logical presentation remain the foundation.

No further production is authorized by this acceptance. Return to the main conversation to choose the next milestone. Other factions, new units, terrain/theaters, campaigns, Windows packaging, publication and signing were not completion requirements for this task. Do not infer acceptance of those scopes.

## Committed workspace baseline

The requested deliverable is the application implementation in `/Users/Aone/RA2remaster/ra2-hd`, on local branch `m0-2-stabilization`. Application code, HD resource bindings, production/validation tools and tests are committed at `120153e`; delivery documentation is at `8077c01`, and final acceptance/handoff documentation at `5f5e468`, followed by this clarification. All are local commits; nothing was pushed or published.

The source workspace is the starting point for the main conversation. Generated artwork, retail resources, app binaries and evidence remain in the existing ignored `.local/` and `.artifacts/` paths; they are not added to Git. Existing desktop packages are historical review artifacts, not required workspace deliverables. This clarification authorizes no Desktop copy, restoration, deletion or cross-worktree merge.

## Existing application and resource evidence

- Accepted app: `/Users/Aone/RA2remaster/ra2-hd/.artifacts/soviet-remaining/build-2026-09-21T23-51-18-571Z/Red Alert 2 HD Soviet Buildings R4.app`.
- Retained complete package: `/Users/Aone/RA2remaster/ra2-hd/.artifacts/soviet-remaining/desktop-transfer-r4/RA2-HD-Soviet-Buildings-R4-macOS-arm64-App-Resources-Review.zip`.
- Historical Desktop delivery: `/Users/Aone/Desktop/RA2-HD-Soviet-Buildings-R4-macOS-arm64-App-Resources-Review.zip`. This file is no longer at that location at closure; use the verified retained package above. It was not recreated or relocated during closure.
- ZIP: 683,487,715 bytes; SHA-256 `7bcfdb80142b29fb155d6f95fee0485bd4ca24872a67b249299c119b4a4ddfe4`.
- Retained local delivery/receipt: `.artifacts/soviet-remaining/desktop-transfer-r4/`.
- Resource registration: select the ZIP's `RA2-HD-Soviet-Buildings-R4-Resources` directory, or this checkout's `/Users/Aone/RA2remaster/ra2-hd/.local`. Do not select only `hd-packs`.
- One default-on HD setting controls all selections. Building selection changes apply fully on the next match; target cursors follow the same setting.
- Stable application profile: `RA2 HD Soviet Buildings R4`. Automated tests used separate isolated profiles; no user-profile migration is required.
- Production selection: `.artifacts/soviet-remaining/production-selection-r5.json`. This is an export-selection revision, not an application R5.
- Immutable manifest pins: `.artifacts/soviet-remaining/accepted-pack-identities.json`; runtime pins are in `desktop/hd-profile.mjs`. NAMISL selects pack revision 7. Do not overwrite accepted pack paths.

Implementation checkpoint: `120153e`; delivery documentation checkpoint: `8077c01`. The exact app has 1,326 runtime files bound by content to the implementation. Its build parent is `a21ed18`; its pre-commit source digest is `c67b78faad82d86eb3786103d58e78a28542dc540b745202a5635b390286aa0e`. Later acceptance/documentation commits do not require rebuilding an already accepted binary.

The accepted app bundle and retained local ZIP hash were rechecked at closure; see `.artifacts/soviet-remaining/closure-preservation.json`. The Desktop delivery receipt remains historical evidence, not a claim of current Desktop availability. Preserve older apps, raw/selected artwork, resource revisions, source imports, normal `dist`, profiles and failed-candidate evidence. No cleanup or replacement is part of closure.

## Acceptance and evidence

- Final acceptance: `.artifacts/soviet-remaining/final-acceptance.json`.
- Original four-family acceptance: `.artifacts/m1-6b/final-acceptance.json`.
- Current ledgers: `.artifacts/m1-6b/ledger.json` and `.artifacts/soviet-remaining/ledger.json`.
- Prior NAPOWR acceptance: `.artifacts/m1-6a/final-acceptance.json`.
- Combined review: `.artifacts/soviet-remaining/complete-review-r4/Soviet-Buildings-Review.html`.
- Adjacent `Target-Cursors-Review.html`, `Range-Markers-Review.html`, `Validation-Dashboard.html` and `validation.json` retain exact delivery-time evidence.
- Final native captures: `runtime-complete-r4-final/` and `runtime-ranges-r4-final/`; independent fallback: `fallback-r4/`, all under `.artifacts/soviet-remaining/`.

The final acceptance receipts supersede historical pending labels in reviews, dashboards and ZIP manifests. Those archived delivery bytes remain unchanged. Use the receipts and current ledgers for current acceptance status.

Final R4 technical evidence: 62 tests / 1,416 assertions, TypeScript checking, 1,492 native-controller motion captures across 17 families, 47 complete HD cursor frames, eight targeting captures at 1080p/4K and five HD-off/independent-fallback scenarios. Optional GPU allocation was 187,108,124 bytes (178.44 MiB), below the unchanged 256 MiB budget. All 429 packaged resource files and application links/executable permissions were verified.

Preservation evidence covers 502 recorded accepted source-art files, retained R3 resource/app/ZIP identities and 54,009 baseline entries. Four historical old-profile cache/runtime changes remain recorded as strict-equality failures, separate from stable payload preservation. Windows, a physical 4K panel and instrumented physical pointer handoff were not newly established by R4 automation. Native-controller review fixtures are not a new end-to-end superweapon battle test. These historical evidence boundaries do not reopen the user's final acceptance.

## Useful production and correction lessons

1. Resolve actual retail rules/art/theater members before authoring. Preserve archive/member hashes, frame counts, canvas/trim/padding, offsets, native sequence mappings and shared-effect boundaries. Labels and filenames alone are insufficient identities.
2. Reuse accepted masters and authored parts. Whole-picture fitting to a changing frame envelope makes construction or retraction stretch. Keep foundations/sockets fixed; use local translation, articulation and occlusion. Never resize the whole building to simulate motion.
3. Inspect complete normal and damaged cycles at native display size. Check the entire moving assembly, not just the antenna tip. NAPSIS needed one fixed mast/socket and continuous part motion; crane corrections needed complete jib/hook boundaries and stationary supports.
4. Opening and post-launch closure have different content. NAMISL closure must omit the missile that has already launched. Verify the closed endpoint against accepted pixels and compare fixed foundation pixels across every frame. Repeated alpha compositing can alter an otherwise stationary edge.
5. Owner masks must follow authored material coordinates throughout construction and functional states. Native remap positions alone miss relocated HD paint. Preserve the owner shade ramp while excluding neutral metal, hazard yellow, orange lights and genuine electric/emissive effects.
6. Keep an entire family at one effective density. Missing/corrupt members trigger that family's complete fallback, without disabling accepted peers. Measure combined GPU allocation using actual decoded storage and safe duplicate sharing; do not raise caps or silently reduce the accepted baseline.
7. Logical size and sampling density are separate. HD target cursors use 4× drawing buffers with the original 55×43 logical canvas, (27,21) hotspot and native animation runner. Output resolution must not change world/UI geometry, camera or click coordinates.
8. Verify native cursor art before claiming retail style. `mouse.shp` contains nuclear frames 319–328, Iron Curtain 346–350, Chronosphere 357–368 and storm 279–298. The new ground rings are aiming guides; Iron Curtain still affects the native square. Interface bands must render above shroud without revealing terrain, and be removed on cancellation/exit.
9. Bind final tests to the exact built app and selected manifests. A cached HD material can invalidate an Original comparison. Use explicit native/HD bindings, unchanged logical geometry and real controller frames; clearly distinguish staged fixtures from natural gameplay.
10. Reproduce bugs using the user's actual scenario. The evacuation report concerned infantry leaving civilian houses on the default first skirmish map, `mp02t2.map`. Keep this regression and the accepted loading/UI fixes, rather than testing an unrelated vehicle or map.
11. Keep raw art, immutable revisions, failed candidates and per-family evidence. Reuse passed work, isolate test profiles, work locally/sequentially, and obtain one consolidated art/acceptance decision. Routine export/integration/testing needs no repeated per-building permission.

## Main-conversation starting point

Treat the committed workspace implementation, pinned resources, one HD setting, accepted desktop controls and logical rendering conventions as the current accepted foundation. The R4 app is the corresponding retained test artifact, not a required Desktop installation. Read this document and the final acceptance receipt before planning the next milestone. Do not restart this batch, regenerate accepted artwork, rebuild for documentation alone, delete historical assets or automatically expand scope. The user will select the next objective in the main conversation; any correction to this delivered outcome can return to this execution task.
