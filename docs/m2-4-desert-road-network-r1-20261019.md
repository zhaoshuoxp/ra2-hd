# M2.4 Desert road network correction / Batch 78 R1 / 2026-10-19

The user rejects Batch 78 for two concrete defects: broad seams through slope lanes and a different asphalt color on curves beside straight roads. The supplied screenshots are retained with hashes in `.artifacts/m2-4/desert-road-network-r1-20261019/feedback.json`. The rejected review, native evidence and resource versions remain unchanged. R5 NewUrban bridge acceptance is unaffected.

## Cause and bounded correction

The road path contains two independently packed TMP groups: the twenty-member paved-road family and the four-member paved-slope family. Prior source-equivalent reuse preserved the slope frame pixels but omitted accepted Temperate sampling gutters. Across both densities, the corresponding Temperate gutters contain 28,512 nonzero RGB samples and 2,032 covered samples; the Desert reuse gutters were entirely zero. The detailed audit is `gutter-difference-audit.json`. This difference is independent of source alpha, tile numbering or logical geometry.

Material colors also differ. At 4X, the neutral dark-material sample on straight `proad01` averages approximately `[56.2,57.8,58.8]`; curve `proad14` averages `[56.1,62.5,66.6]`, producing the reported blue cast. Early slope material has additional variation and darkening at individual cuts. Exact source equivalence did not prove consistent HD material across these separately authored road forms.

R1 applies actual accepted straight-road asphalt detail to all twelve non-straight paved-road members and four slope members. A periodic isometric material chart carries the same neutral color and fine detail across source subtiles. Native slope charts undo compressed/extended material coordinates without changing sprite geometry. One source-derived light gain per slope member retains the normal broad facet lighting. There is no per-map coordinate painting, native RGB texture enlargement, new random texture or new mother image.

The material mask represents a continuous road plane; native paint pixels do not create holes in it. Existing HD colored/light strokes are protected at output resolution. Transparent RGB is extended from visible colors without changing alpha. Two-pixel atlas gutters follow the accepted Temperate TMP edge-packing method. This terrain sampling contract is distinct from the SHP environment padding contract; the failed R5 SHP padding candidate is not reused as a terrain rule.

Internal candidates v1/v2 remain unselected. V1 receives a boundary-weight refinement before native testing. V2 is visually rejected internally for paint-sized holes and muted colored paint contaminating the material reference. V3 closes those holes and bounds material chroma while retaining the actual accepted detail. Receipts and previews remain under the evidence root.

Selected revision: `desert-m2-4-road-network-contacts-r1-v3`, manifest SHA-256 `bac5cbd39c5da4b7d9e1564e9c37b85a8d69e76002bc0d7103395cc75c512f86`. Only four atlas payloads in two complete groups change. The eight straight-road bodies remain exact, with restored sampling gutters. Nineteen other groups / 38 payload files remain exact. Target metadata, alpha, radar, depth, geometry, collision, timing and all source files remain unchanged. Fourteen unreferenced legacy zero-pointer compatibility slots retain Original body bytes and are excluded from artwork counts and source boards.

## Incremental evidence

Runtime source `40007cb11e06db01573a804f15d173e24a262240` passes the entry typecheck, isolated build and signed reusable Mac arm64 host staging. The two scoped loader runs pass fourteen tests / 936 assertions in total, exercising both changed complete families at both densities, lazy residency, corruption, foreign-theater refusal, budget refusal, cancellation and disposal. The independent static audit verifies 392 target-alpha rectangles, 364 active density rectangles, all restored gutters, 76 exact straight/compatibility body rectangles, and 1,121,141 unchanged opaque high-light/high-chroma samples. No game renderer, rules, Windows performance implementation or budget changes.

The fresh before 4X case reproduces the reported slope and curve defects on the unchanged `saharami.map`. Final 2X/4X cases use the same eight actual camera positions and each verify 905 paved-road plus 96 paved-slope placements. All 24 members are present; every actual placement uses a positive source image pointer. Native captures cover all four slope directions, both principal road orientations and curve-to-straight contacts. The two reported defect areas are inspected internally at native scale, with optional enlarged inspection kept separate from framebuffer capture.

Global Original controls explicitly disable HD at the same native camera positions and report zero terrain/environment HD world charge. Final 4X Original reset, disposal and reentry into `manhatta.map` pass. The accepted NewUrban bridge resource pointers remain exact. The previous two-source-map rule/tick probe is reused because this revision changes only RGB and sampling gutters; maps, adaptation code, player slots, economics and gameplay are unchanged. It is not relabeled as a fresh rule test.

World allocations remain exactly 149,999,160 / 536,870,912 bytes at 2X and 562,713,392 / 1,342,177,280 bytes at 4X. Prepared CPU peaks remain 45,156,556 and 108,112,788 bytes within 134,217,728. The core prepared index stays at `b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b`. TMP resources use validated RGBA atlases directly; no changed prepared dependency is relabeled or hidden.

This is a correction to already authored dependencies, adding zero source coverage groups. Derived authored gaps remain Desert 182 / NewUrban 358. Other reported seams and the remaining all-theater work remain open. Windows execution is `NOT_RUN`; native Mac technical evidence does not close user visual acceptance.

## Embedded review and resource authority

Desktop review: `/Users/Aone/Desktop/M2.4-Review-Desert-Road-Network-R1-20261019/M2.4-Desert-Road-Network-R1-Embedded.html`. The page opens with the reported slope and curve before/after pairs, defaults to native-scale 4X, and includes corrected 2X views, unchanged Original controls, optional other slope directions and complete comparisons for all sixteen changed members. Eight unchanged straight bodies are not resubmitted. The 46 PNGs are embedded in 33,474,359 bytes. Source and actual Desktop image hashes, decoding, dimensions and static controls pass. Interactive browser QA remains unperformed under the earlier local-protocol denial.

HTML SHA-256: `0baa2e4452523218a299a5fa3c14f0365a3d1fe7a18b5a2526e39c4a16bf6c68`. `resource-handoff-v3.json` extends the complete retained Batch 78 dependency ledger, explicitly repins only the changed task contract, and verifies 1,492 complete resource/evidence files. Its SHA-256 is `e0551ee88cdf96c844321103b0ef1cfd2b9cfa3d7dd4016c8d0a090f963e26ea`. Full versioned resources remain in the isolated task workspace. Desktop contains only HTML and two JSON ledgers; no per-batch app or resource copy is created.

Evidence root: `.artifacts/m2-4/desert-road-network-r1-20261019/`. Key receipts are `feedback.json`, `gutter-difference-audit.json`, `internal-attempts-v1.json`, `export-and-preservation-v3.json`, `independent-static-audit-v3.json`, `native-suite-v3.json`, `review-v3/static-qa.json`, `resource-handoff-v3.json`, `desktop-delivery-v3.json` and `desktop-static-qa-v3.json`.

User assessment of the two reported defect areas remains pending. No main integration, push, cleanup or M2.4 completion is claimed. Continue the correction and remaining theater work in this execution conversation.

The user rejects R1: slope centerlines remain disconnected/offset, curb joints remain dark, and curve centerlines contain repeated broken strokes. R1 is a partial asphalt correction, not complete road continuity. The high-light/high-chroma preservation rule retained defective paint and curb pixels; those regions are explicitly reopened in R2. Preserve the prior receipts and review unchanged.
