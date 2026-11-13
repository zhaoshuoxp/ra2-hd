# Apocalypse seating and complete Flying Disc rotation

This follow-up corrects the two reported floating Apocalypse views and the stationary Flying Disc highlights. It supersedes the 0/90-degree placement and fixed-light treatment in `apocalypse-disc-repair-20261025.md`; the earlier artwork and evidence remain retained. The user accepted the final native Mac result at implementation `08cbc72b` on 2026-10-26. The accepted implementation and refreshed development entry are on canonical local main.

## Changes

The complete Apocalypse upper assembly moves down 2.5 logical pixels only at headings 0 and 90. Turret and barrels share the same offset. All PNG bytes, hull registration, source proportions, tube lengths, native joints, recoil, shadows and the other six headings are unchanged from r6. The additive r7 manifests are selected by both desktop and renderer contracts. The exporter records the mount offset so future exports reproduce it without a runtime registration override.

The Disc no longer compensates rotated artwork to keep its light stationary. Baked shading and owner paint follow the sampled surface. The top cap and inner deck, previously excluded from the rotating bands, now participate. Both native parts and all opaque, depth, edge and cloak passes receive one interpolated native phase. The lower body uses its flat projected orbit; the raised surface retains its projected cabin and deck orbits. Geometric outline coverage stays registered, with coverage-aware transitions at the photograph's transparent boundary. The native rotation clock, gameplay, hover, silhouette and shadow path remain unchanged.

The current Disc atlases remain byte-identical. Their retained packed G byte still requires decoding the low four owner-shade bits; the old illumination field is no longer applied. No new artwork, texture format, atlas density or allocation budget is introduced.

## Verification

- All 29 focused cases across six files pass, including unchanged source proportions, complementary component alpha, native registration, owner masks, complete-family fallback and allocation checks. The placement regression permits only the two requested translations and requires every atlas image to retain its predecessor hash.
- Entry typechecking, normal `desktop:prepare` and whitespace checks pass.
- Each independent density has 47 native 3840-by-2160 captures: eight Apocalypse headings, seven independently turned turret poses and 32 Disc phases. Unrescaled 720-by-540 crops use a disclosed camera zoom of 2.5. Every Disc part and coverage pass has the requested phase, with finite matrices, active requested density and no GL/console/page errors.
- Frozen-background screenshot patches confirm visible phase changes in the top cap, dome, collar, inner deck and outer plate at both densities. These numerical checks establish movement, not aesthetic acceptance.
- Separate continuous native-clock recordings capture all 32 phase bins at both densities. The 2X and 4X runs contain respectively 339 and 439 HD samples; both parts match at every HD sample and advance monotonically. Preparation-only samples are excluded explicitly.
- The normal main entry passes eight ordinary-zoom captures with blue opponent ownership, including both corrected Apocalypse headings and four Disc phases.

The first candidate passed rendering checks but introduced dark samples at transparent boundaries; it is visually rejected. The second retained a stationary inner deck and is also superseded. Both sets of captures remain evidence, not accepted results. The user accepted the final v3 result. Native Windows remains `NOT_RUN_ON_THIS_MAC`.

## Local handoff

The exact selections and evidence are pinned in [the receipt](apocalypse-disc-followup-20261026.json), with final approval and verification in [the acceptance receipt](apocalypse-disc-main-acceptance-20261026.json). The [self-contained native review](../../project-history/apoc-disc-followup-20261026/Apocalypse-Disc-Native-R7.html) includes both densities, all turret views and the Disc phase player. Its original pending-review badge is retained as a historical snapshot; the acceptance receipt records the subsequent approval. Continuous recordings, raw captures, source/export data, failed candidates and inventories remain in that history directory. The original masters and prompts remain in the predecessor history's `Art` directory.

Development continues on canonical local main. The normal development payload and allowlist are refreshed together; no new app package or remote push is included. Independent M3.2 commit `97c48206` and its evidence script are preserved. The history `handoff.json` binds the final local commit to the scoped cleanup receipt. Cleanup has retired all 655 inventoried files in this follow-up's test directory, retaining 371 evidence files and verifying 359 protected files. Acceptance closure rechecks these hashes and the absence of that directory; no new runtime build or test profile is needed. Canonical resources, predecessors, normal main output, dependencies and real user profiles remain preserved.

These two visual corrections are accepted and closed. Keep later corrections to this result in this conversation; start a new execution conversation for a materially different feature or milestone.
