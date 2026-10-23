# M1.2a: native-size GAPOWR clarity investigation

**Status: REVIEWED_NO_DIRECTION_SELECTED. Visual quality: REVIEW_OPEN.** M1.2 technical acceptance remains `COMPLETE_BOUNDED_PROTOTYPE / PASS_BOUNDED_MAC_4K`. This follow-up has produced controlled comparisons, not a replacement pack or a new visual PASS. No full-family reauthoring or renderer-default promotion is authorized by these results.

**Later user-authorized diagnostic, 2026-09-17:** [Fixed-4K camera-scale comparison](m1-2a-camera-scale-diagnostic.md) tests normal and 2x views plus an explicitly post-enlarged screenshot control. It directly observes native-resolution world draws; the user confirms the real 2x view is clearly better and closer to expectations. Default camera behavior remains unchanged. The no-promotion decision for the sampling/shadow/edge alternatives below is unchanged.

The selected plan is `/Users/Aone/Documents/Codex/2026-09-10/referenced-chatgpt-conversation-this-is-an-2/outputs/m1-2a-native-size-clarity-plan.md`. The checkout was clean at `2c8e1f3`, after M1.2 technical completion `8e75955`. Diagnostic implementation checkpoint: `2175c6d`. Work is sequential, local and confined to this execution conversation.

## User review outcome

Open the [native-size review](../.artifacts/m1-2a/review-v2/review.html) in a browser at **100% zoom**. The scene has fixed dimensions of **500x340 CSS pixels**. Its 4K PNG contains 1000x680 pixels; opening that PNG at its raw width doubles the intended logical display size. Narrow layouts scroll instead of shrinking the scene. The main review provides same-position A/B/C/D switching, an adjacent A/B view, damaged examples and lossless animation loops. It works with JavaScript disabled. A separate section compares all alternatives at 1080p; no candidate comparison mixes output densities.

Before user review, my provisional assessment was that **B was the most useful direction to inspect**, with smoother small metallic features but some loss of crisp point highlights. Its benefit at native size is modest, not a demonstrated jump to the source-image impression. C gives a slight shadow-readability change; D is not a convincing improvement and has little or no effect on many frames. None should be promoted without user judgment. Keeping A, or reporting no convincing improvement, is a valid result.

The user subsequently reported that all improvements were limited and the differences were small (English paraphrase). No candidate was selected. This feedback supersedes the provisional recommendation to prioritize B: the tested sampling, shadow and edge alternatives have not established a worthwhile improvement direction. Retain A as the operational baseline, without treating that retention as renewed visual approval. No renderer promotion or full 44-frame revision follows. The larger diagnostic/contact images are supplemental, not the visual acceptance target; viewing hardware, zoom and detailed motion approval remain unconfirmed.

This bounded investigation is complete with a no-change outcome. The findings do not establish that all rendering adjustments are ineffective, or that a full reauthoring would succeed. Return this result to the existing main planning conversation for the next decision; any further M1.2 correction stays in this execution conversation under a newly selected bounded scope.

## Single-frame trace

The earlier M1.2 game evidence at tick 673 identifies body `ggpowr.shp` frame 0 and activity `ggpowr_a.shp` frame 2, aggregate indices 0 and 5. The new controlled normal capture reproduces that frame pair at tick 672. The active layer covers the central machinery: the composed game object is not the standalone generated body image.

| Stage | Body frame 0 | Activity frame 2 |
| --- | --- | --- |
| Generated source | `art-samples-v1/generated.png`, 1683x935 | `full-art-v1/batch-00/generated.png`, 1682x935 |
| Source crop, left/top/right/bottom | 113, 90, 440, 448 | 1312, 90, 1483, 413 |
| Generated crop size | 327x358 | 171x323 |
| Native trim, x/y/width/height | 28, 14, 84, 92 | 48, 14, 44, 83 |
| 4x export, with even native padding | 336x368 | 176x336; last native row is padding |
| Atlas dimensions | 2048x384 | 2048x672 |
| Atlas sample rectangle, x/y/width/height | 2, 2, 336, 368 | 362, 2, 176, 336 |
| Export to atlas | Exact RGBA equality | Exact RGBA equality |
| Projected native screen extent | 84x92 CSS pixels | 44x84 CSS pixels including padding |
| Corresponding 4K output extent | 168x184 pixels | 88x168 pixels |

The existing preparation is reproduced exactly: scaled board-coordinate crop, green-matte removal, premultiplied BOX resize, unpremultiplication, original-alpha intersection, owner-mask/shade extraction and transparent padding. The 4x source export is a slight enlargement of these generated crops, not a new high-resolution repaint. Atlas packing adds no resampling or pixel difference. Original-alpha intersection removes approximately 2.80% of the body's pre-mask alpha area and 4.01% of the activity frame's alpha area. These are intentional silhouette constraints with a tradeoff, not proof that all removed pixels should be restored.

Browser decode preserves alpha exactly and preserves the discrete remap data exactly. Visible body RGB is unchanged; visible activity RGB differs by at most one 8-bit level at 1900 pixels, consistent with the Canvas premultiply/unpremultiply round trip. Larger differences in fully transparent RGB are not visible detail loss. No second geometric rescale or atlas corruption was found. The raw uploaded rectangles are retained as `.rgba` files and decoded PNGs for inspection.

Base and palette textures are annotated sRGB; discrete remap data is not color data. The pinned Three.js implementation is 0.183.2. Its texture upload chooses sRGB storage for the color textures, and the renderer outputs sRGB with no tone mapping. The inspected path has one color decode and one output encode, not an additional manual gamma pass. Textures use nearest min/mag filters, no mipmaps and `premultiplyAlpha=false`. The generated activity image has near-opaque and low-alpha edge pixels; the body example is binary-alpha after export. No visible green-dominant pixels survive in the selected exported frames under the preparation's matte predicate; that check alone cannot rule out every subtle color fringe.

The owner-color extraction retains the native 16-shade ramp and limits detected red regions to the permitted mask. Frame-0 body has 8314 marked remap pixels; frame-2 activity has 1027. This restriction and red-channel shade quantization remain intentional transformations. Native remap area and unmapped red-like counts are recorded in the trace; red-like pixels outside the allowed region are not automatically classified as lost team-color detail. No alternative remap extraction was authored in this follow-up.

Exact generated, export and atlas hashes, reconstruction checks and per-frame measurements are in `.artifacts/m1-2a/trace-v2/trace.json`. Body export SHA-256: `2f78fc48a2260db63d6d4dc54681737e32aacad0b2d364a6986a2b569689738b`; activity export SHA-256: `26ef8140f53aca02bffdaa9dba3710fe1bc5484e4658db5f8611114d49c9d5fe`. Source references, crops and all derivative images remain ignored.

## Controls and independent alternatives

The actual game is the existing South Pacific offline fixture with normally produced GAPOWR and eight explicitly disclosed cross-faction Conscripts. The accepted Conscript, terrain, yard, original shadows and shared effects are unchanged references. There is no replacement renderer or isolated-scene substitute.

All alternatives share the same native frame, tick, background, owner, lighting, camera, geometry and drawing buffer within each comparison. The main normal capture has a 1920x1080 CSS canvas, a 1752x1048 logical world viewport excluding UI, a 3840x2160 buffer and device pixel ratio 2. Crop bounds are 726, 299, 500, 340 in logical coordinates. Body bounds are approximately 983,453 to 1067,545; active bounds are 1003,453 to 1047,537. The red owner occupies palette row 5; its ramp starts at RGB 252,23,23. Both layers have opacity 1, per-mesh extra light (-0.175,-0.175,-0.175), depth writing enabled and ordinary alpha test 0.05. The original batching path applies that light multiplier. Camera bounds, position/matrix, mesh vertices, UVs, complete ramp values and material settings are recorded for every capture in `candidates-v4/result.json`.

| Label | Only changed factor | Explicitly retained |
| --- | --- | --- |
| A | None; current accepted control | All original behavior |
| B | Four-tap bilinear interpolation of resolved linear-light colors, weighted by source alpha | Nearest coverage/alpha, geometry, texture data, light and opacity; each tap resolves an integer shade to a valid owner color before interpolation |
| C | A smooth, luminance-limited lift of dark non-owner pixels, peaking at 28% in linear light | Existing sampling, alpha, owner colors, lighting configuration and geometry; no uniform sharpening, global contrast inflation or new microtexture |
| D | Inward-only discard of alpha below 0.50 instead of 0.05 | RGB sampling, source mask, bounds, geometry and original shadow; no expanded or softened silhouette |

These are three independent runtime diagnostics, not combinations. C is a tonal probe, not a new native-size artwork candidate. D tests the implicated low-alpha coverage, not relaxed native-mask clipping. No new raster art is generated or edited for production, and no missing frames are manufactured. All probes stay outside the ordinary complete-family resolver.

Only the explicit `M12A_OUTPUT` harness hook injects the experiment after the game fixture is ready. The injected code patches actual GAPOWR merging-batch material clones identified by their building color textures; it does not alter source material defaults, Conscript materials, texture filters globally or production manifests. A separate shader-program key prevents cache collision. Two-pixel atlas gutters exceed the half-texel bilinear footprint, and alpha-weighted color interpolation avoids mixing transparent RGB into visible edge colors. No discrete shade ID is interpolated as a color. The original shaders are restored between sampled game frames and after the diagnostic.

## State, motion and regression results

**43 synchronous comparison sets** cover the fixed normal 4K frame, a separate normal 1080p comparison, the fixed damaged 4K frame, 16 stationary normal samples (frames 0–7 twice), eight moving normal samples (0–7), eight stationary damaged samples (8–15), and eight moving damaged samples (8–15). Damage is inflicted by native force attack and stopped below 48% health. Native camera edge scrolling moves right and left in short pulses; camera matrices verify movement while the building remains in view.

Every sampled set restores A pixel-for-pixel and preserves the recorded geometry, frame, camera and texture/geometry allocation counts. All candidate pixel changes lie within the union of the projected building layers, with a two-output-pixel rounding allowance: zero changes outside that region in the scene crops. This includes the unchanged Conscript, nearby original sprites and terrain. Candidate D changes only 119 pixels in the fixed normal 4K crop and none in the selected binary-alpha damaged example. Pixel counts measure scope, not clarity or preference.

Contact-sheet inspection shows the same architecture and damage progression under each treatment. B softens fine speckled highlights; C changes shadow brightness consistently; D cannot remove the inherited frame-to-frame detail changes and has inconsistent utility where alpha is binary. The independently generated animation's tower/panel/machinery variations remain in A and all candidates. Original fire effects sometimes obscure damaged machinery. There is no detected page/program binding flash, but absence of perceptible shimmer or a preferred animation appearance is **not** certified: the general feedback does not provide a separate motion-quality acceptance.

The lossless animated PNGs use consecutive native frame IDs at 180 ms per review frame. They are assembled comparisons, not a real-time frame-rate or exact wall-clock timing claim. Raw game ticks and camera positions are retained. Browser capture work itself can delay the next native update; no simulation or animation rules are changed.

| Check | Result |
| --- | --- |
| Export reconstruction / atlas identity | PASS; selected normal and damaged body/activity examples |
| Browser alpha and remap data | PASS; unchanged; visible RGB decode rounding recorded separately |
| Actual game / controls / Conscript isolation | PASS_DIAGNOSTIC_CAPTURE_ONLY; 43 same-tick sets, no outside-building changes |
| Errors and network | No page/console/GL errors or external requests in final `game-v4` |
| Teardown | All ten HD textures released; diagnostic GPU programs 1 before teardown, 0 after; game reference cleared |
| Review dimensions and controls | PASS at 1200/600 widths, DPR 2, visualViewport scale 1; all 35 images decode, no document overflow; same-position toggle works with scripts disabled |
| Existing regression tests / typecheck / isolated build | PASS; 34 tests / 682 assertions; source entry typecheck and `.artifacts/m1-2a/build` |
| Protected resources | PASS_EXACT_EQUALITY; all HD packs, accepted complete-art review, imports, source installation, support, applications, dist and normal user profile |
| User visual feedback | RECEIVED: improvements limited, differences small; no candidate selected or new visual PASS |

Earlier attempts are retained, not overwritten: `game-v1` failed because the diagnostic read a Canvas palette as a typed array; corrected without an engine change. `game-v2` completed but let a late moving-camera crop leave the scene. `game-v3` explicitly rejected an out-of-view crop. `game-v4` uses bounded right/left pulses and passes the final checks. Only v4 is the final moving-state evidence. These are diagnostic-harness corrections, not accepted-pack or gameplay failures.

## Reproduction, identities and stopping point

Run sequentially from the repository root. Existing ignored accepted packs/imports are prerequisites. Fresh output names prevent overwriting previous candidates; stop a server only if it belongs to this task.

```sh
python3 scripts/m1/trace-power-plant-clarity.py --output .artifacts/m1-2a/trace-fresh
bun --bun vite build --outDir .artifacts/m1-2a/build
M12_BUILD_DIR=.artifacts/m1-2a/build M12_PORT=4013 bun scripts/m1/serve-power-plant-game.mjs
# In a second terminal, while the dedicated server runs:
M12_ORIGIN=http://127.0.0.1:4013 M12_SHORT=1 \
  M12_OUTPUT=.artifacts/m1-2a/game-fresh M12A_OUTPUT=.artifacts/m1-2a/candidates-fresh \
  bun scripts/m1/run-power-plant-game.mjs
python3 scripts/m1/build-power-plant-clarity-review.py \
  --run .artifacts/m1-2a/candidates-v4 --output .artifacts/m1-2a/review-fresh
bun scripts/m1/check-power-plant-clarity-review.mjs .artifacts/m1-2a/review-fresh
```

The review builder above intentionally reproduces the retained v4 run; use `--run` to select a fresh successful run. The retained `trace-v2` records support its pipeline section. Plain loopback game startup uses the accepted renderer; the experiment is injected only by the diagnostic harness, not by URL activation or ordinary asset loading.

Local evidence lives under `.artifacts/m1-2a/`: `checkout.json`, `preservation-before.json`, `preservation-after.json`, `trace-v2/`, `candidates-v4/`, `game-v4/`, `review-v2/`, regression logs and `build-identity.json`. The latter hashes every isolated build file. The run's `source-identity.json` plus archived `source-*.mjs` preserve exact executed diagnostic sources independently of the later checkpoint. Direct scene PNGs are `candidates-v4/normal-4k-{A,B,C,D}.png` and `damaged-4k-{A,B,C,D}.png`, each intended for 500x340 CSS display. The trace and review use only local embedded resources.

Accepted family identity remains `31b76d8632f470e41886aaf2987c3df618370f1b25ea80725d044e450f94b2d2`; no candidate family is packaged. Windows, physical external-monitor viewing, manual play, GPU recovery, long-duration performance and production use of these shader alternatives remain NOT RUN. The ordinary indexed-material dynamic-uniform issue is unchanged. An eventual shared-renderer change would still need ordinary-path, clone/cache, other owner/lighting/opacity and broader combined-asset checks; this diagnostic is not that promotion.

Stop after the received feedback with no candidate promoted. Await a new bounded decision before further implementation in the same M1.2 execution conversation; the feedback does not authorize replacing all 44 frames. No other building, vehicle, campaign or desktop packaging is started. All commits remain local; nothing is pushed or published.
