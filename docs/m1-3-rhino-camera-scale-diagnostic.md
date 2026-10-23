# Rhino follow-up: native 4K and camera scale

Technical status: **PASS_SAME_TICK_RHINO_NATIVE_4K_CAMERA_COMPARISON**. Visual target status: **DISPLAY_TARGET_ACCEPTED / RUNTIME_REALIZATION_UNVERIFIED**. The user explicitly selected the same display diagnostic used for GAPOWR before choosing further Rhino asset production. No new artwork, geometry, material revision, production zoom feature or default override is introduced. The original Rhino remains active; the accepted M1.3a target remains accepted and the M1.3b runtime candidate remains rejected.

## Scope and verified baseline

Started from clean `5a5695b` on `m0-2-stabilization`, preserving both the building display diagnostic and all earlier Rhino work. Read repository instructions, the [building camera-scale diagnostic](m1-2a-camera-scale-diagnostic.md), the [accepted Rhino art target](m1-3a-rhino-art-first.md), and the [unsuccessful runtime transfer](m1-3b-rhino-runtime-transfer.md). Work was sequential, local and in this conversation, without subagents, new assets, push or publication.

The retained `.artifacts/m1-3/build` was verified file-by-file against the earlier M1.3b preservation snapshot: all 153 build hashes match. See [build identity](../.artifacts/m1-3-zoom/build-identity.json). The existing isolated harness loads original VXL/HVA resources and the exact rejected candidate `0520e0cdb2ff96f6eb19ca7ee1f268da515e3e04a6d025737182e891b11f453e` only for comparison. Its source-derived surfaces and matte material are unchanged. It is not promoted by this experiment.

## Review

Open the [fixed-size display review](../.artifacts/m1-3-zoom/review-v1/review.html) at 100% zoom. All panels contain 720×520 output pixels displayed at 360×260 CSS pixels. Narrow windows scroll rather than shrinking. The first row compares original, rejected runtime candidate and accepted target at the same doubled display scale. Each asset then has its own A/B/C comparison and same-location switch:

- **A:** original camera scale, actual 3840×2160 drawing buffer.
- **B:** 2× camera, the same actual 3840×2160 drawing buffer. Object width/height double; this is not the original gameplay scale.
- **C:** explicitly synthetic control, taking the geometrically corresponding area of A's full screenshot and enlarging it 2× with nearest sampling. B and C show equal object size. C is not evidence that the game renders through a low-resolution intermediate.

Direct B/C pairs: [original Rhino](../.artifacts/m1-3-zoom/review-v1/original-zoom-vs-post-pair.png), [unchanged rejected runtime candidate](../.artifacts/m1-3-zoom/review-v1/runtime-zoom-vs-post-pair.png). These pair files should display at 720×300 CSS pixels, not their 1440×600 file dimensions; use the review page for enforced scale.

The accepted target is a separate **2D ART COMPOSITE — NOT IN-ENGINE HD** row. Normal scale uses its retained 128×96 export; doubled scale uses its retained 256×192 export, each sampled previously from the high-resolution generated source. No upsampling or new authoring is used for target B. Target C enlarges target A. Composites use this diagnostic's matching clean background and original shadow, which do not establish target runtime shadow compatibility. The target's source hash remains `9162a8950bc397e26a806e87abf9a7c2e47fa4616507543ab75142cf310f5e38`.

## Actual drawing-path measurements

All seven captures share simulation tick 76, with body/turret/barrel at 0°. The isolated South Pacific fixture, owner, light and rules stay fixed. Camera position, world matrix and orthographic bounds are unchanged; only zoom and the resulting projection matrix change. Geometry identities and attribute/index byte checksums, per-part world matrices, materials/shaders, palette, extra light, opacity, shadow flags and logical selection bounds are unchanged within each asset's A/B/restoration sequence.

| Measurement | A: normal camera | B: camera 2× |
| --- | --- | --- |
| Actual GL drawing buffer | 3840×2160 | 3840×2160 |
| World color viewport | `[0,64,3504,2096]` | `[0,64,3504,2096]` |
| Configured logical canvas | 1920×1080 | 1920×1080 |
| Logical world viewport | 1752×1048 | 1752×1048 |
| DPR / renderer pixel ratio | 2 / 2 | 2 / 2 |
| Original tank projected union | 104.22×71.42 output pixels | 208.44×142.85 output pixels |
| Original body projected extent | 104.22×62.76 output pixels | 208.44×125.52 output pixels |
| Rejected candidate body extent | 102.84×61.37 output pixels | 205.67×122.74 output pixels |
| World-color draws per capture | 60 | 60 |
| Shadow draws per capture | 4 | 4 |

Projected geometric extents are not alpha-mask pixel counts. Every part doubles its projected width and height. The control's inverse camera mapping is checked against actual projected bounds, with maximum error approximately `2.27e-13` CSS pixels. The synthetic source box is `[1812,908,2172,1168]` in the normal full 4K image: 360×260 source pixels enlarged to 720×520. See [mapping checks](../.artifacts/m1-3-zoom/projection-control-checks.json).

The probe wraps actual GL draw calls and separately marks calls made inside the shadow renderer. All 60 world-color draws go directly to the default framebuffer at the 3504×2096 viewport within the native 4K buffer. Four additional draws use a positively identified 8192×8192 shadow target. **No low-resolution world-color intermediate followed by enlargement was observed in this scene and path.** This conclusion is bounded to the tested build and fixture.

The first diagnostic run failed an overly broad assertion copied from the building experiment: it expected every draw inside world rendering to target the default framebuffer. The observed offscreen draws were legitimate shadow draws. The corrected probe identifies the shadow-render call boundary, records the render target dimensions, and checks main color and shadow passes separately. The failed `capture-v1` evidence is retained; successful evidence is [capture-v2](../.artifacts/m1-3-zoom/capture-v2/result.json). No game rendering behavior was changed to satisfy the check.

The actual context reports `antialias=false`, with zero default-framebuffer samples. Antialiasing remains unchanged; this experiment does not measure its independent contribution or claim that enabling it would close the artwork gap.

## Visual interpretation and selected target

My inspection finds that true zoom B resolves gun and armor edges more clearly than post-enlarged C. It rerasterizes the existing model into more pixels rather than duplicating the already sampled image. The unchanged candidate also shows more of its surface shading at this scale. These B/C observations remain an assistant assessment; the user's explicit selection described below is the target image, not an endorsement of the rejected runtime candidate.

At the same doubled scale, the accepted target still has substantially different panel divisions, hatch form, track treatment and authored surface detail. Those features do not appear in the rejected runtime candidate merely by zooming. The diagnostic therefore separates a real display sampling constraint from an asset-content gap; it does not prove how much each contributes to the user's overall judgment or revive the rejected candidate.

Camera 2× gives each tank four times the output area while halving visible world span along each axis. It also enlarges existing low-resolution terrain and neighboring units. A useful zoom result would be a display/view tradeoff, not proof of improvement at the original native game scale or approval of a new default camera.

B/C differ at 8,268 RGB pixels for the original row, 10,958 for the rejected runtime row and 23,909 for the target composite row. These are full-crop difference measurements, not quality scores or comparable measures of useful tank detail. The nearest-neighbor synthetic control is intentionally explicit; it does not stand for every possible image-upscaling filter.

## Verification and preservation

- **PASS rendering/camera checks:** same tick, actual GL targets/viewports, 2× projected extents, unchanged per-asset data/transforms/materials and selection bounds. Original and rejected-candidate restoration reproduce their full PNGs and crops byte-for-byte; the final original capture also matches the initial original.
- **PASS browser review:** 21 images load at fixed 360×260 CSS; wide/narrow windows; JavaScript disabled/enabled; DPR 2 and zoom 1; no external requests, page errors or document overflow. See [browser evidence](../.artifacts/m1-3-zoom/review-v1/browser-check.json).
- **PASS preservation:** source installation metadata and core archive hashes, imported resources, all HD packs, prior M1.1/M1.2/M1.2a/M1.3/M1.3a/M1.3b evidence, building zoom evidence, support files, application bundles, normal `dist` and user profile match before/after snapshots. Protected derived files are content-hashed; the full retail installation is metadata-inventoried. See [preservation result](../.artifacts/m1-3-zoom/preservation-result.log).
- **PASS isolated cleanup:** original geometry and material restored, diagnostic geometry disposed, game reference cleared. Only the task-owned isolated browser and port-4031 loopback server are stopped. The existing runtime harness gains only an explicit `M13_ZOOM_OUTPUT` hook and variant switch for this diagnostic.
- **NOT RUN:** production zoom controls, input/culling changes for a zoom feature, movement/combat, other poses, batching, antialiasing alternatives, new assets, physical-monitor validation, Windows, packaged applications or broad engine regression. Intel Mac remains excluded.

Recorded commands, using fresh evidence paths and the preserved build:

```sh
python3 scripts/m1/preserve-rhino-zoom.py before
M12_BUILD_DIR=.artifacts/m1-3/build M12_PORT=4031 bun scripts/m1/serve-power-plant-game.mjs
M13_ORIGIN=http://127.0.0.1:4031 M13_OUTPUT=.artifacts/m1-3-zoom/game-v2 \
  M13_ZOOM_OUTPUT=.artifacts/m1-3-zoom/capture-v2 bun scripts/m1/run-rhino-transfer.mjs
python3 scripts/m1/build-rhino-zoom-review.py
bun scripts/m1/check-rhino-zoom-review.mjs
python3 scripts/m1/preserve-rhino-zoom.py after
```

Retained output directories refuse replacement. Executed source copies and hashes accompany the captures. The local checkpoint contains only tooling and documentation; ignored `.artifacts/m1-3-zoom/final-state.json` records its identity. No source or derived artwork enters Git.

## Decision — exact display target accepted

The user explicitly selected [target-zoom2.png](../.artifacts/m1-3-zoom/review-v1/target-zoom2.png), stating that this image closely meets expectations and should be the implementation target. Record **DISPLAY_TARGET_ACCEPTED / RUNTIME_REALIZATION_UNVERIFIED**. Bind this decision to the exact image and underlying accepted art in [display-target acceptance](../.artifacts/m1-3-zoom/display-target-acceptance.json).

The selected image is 720×520 pixels, displayed at 360×260 CSS pixels on the review page. It combines the real 4K, 2× camera background and original shadow with the previously accepted 256×192 transparent tank export. That export was downsampled directly from the 1448×1086 authored source, not enlarged from the low-resolution original tank or from a normal-scale screenshot. The tank therefore has both authored detail and twice the normal camera's linear display footprint. Standalone image viewers may display the file larger than the fixed-CSS review page.

This is the target for future visual fidelity, not a claim that the target itself is a functioning 3D vehicle. Retain its armor planes, panel boundaries, hatch/track separation, material shading, restrained wear and clean silhouette as acceptance criteria. Future runtime evidence must compare at the same declared display scale and output density, with independent body/turret/barrel behavior, depth and shadow integration verified separately. More polygons or a larger preview alone cannot satisfy it.

The user's image selection does not explicitly select B over C for the old candidate, approve that candidate, choose an asset-production method or activate a default camera change. The completed diagnostic's earlier pending labels are retained in its evidence page; this decision supersedes them for the exact selected target only. Keep original Rhino and the original default camera active. No new asset production begins in this display-diagnostic step. Keep implementation, corrections and acceptance in this conversation.
