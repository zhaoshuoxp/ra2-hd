# M1.2a follow-up: native 4K and camera scale

Prepared: 2026-09-17. **Technical result: PASS_SAME_TICK_NATIVE_4K_CAMERA_COMPARISON. Diagnostic visual feedback: IMPROVEMENT_CONFIRMED; overall M1.2 visual quality: REVIEW_OPEN.** The user explicitly authorized testing normal and 2x camera views at fixed true 4K output after questioning whether HD art was first rendered at low resolution and then enlarged. This is a diagnostic extension of the existing M1.2 conversation, not a production camera feature or a full-family artwork revision.

## Review

Open the [fixed-size comparison](../.artifacts/m1-2a-zoom/review-v1/review.html) at 100% browser zoom. Each scene crop is 1280x1040 output pixels displayed at exactly 640x520 CSS pixels. Small windows scroll instead of shrinking it.

- **A:** actual game, normal camera, native 3840x2160 drawing buffer.
- **B:** actual game, 2x camera, the same native 3840x2160 drawing buffer.
- **C:** explicitly synthetic control: a geometrically corresponding part of A's full screenshot enlarged 2x with nearest sampling. B and C show equal object size. C is not a capture of the game's rendering pipeline.

All actual captures share tick 671, body frame 0, active frame 2, accepted 4x GAPOWR and Conscript assets, palette, lighting and original model geometry. Only the orthographic camera zoom changes. The full buffer and logical 1920x1080 canvas remain constant. Crops follow the building for comparison; full 4K captures are retained alongside them. Camera position and bounds stay constant while its projection matrix changes. A restoration capture reproduces the original full PNG and crop exactly.

| Measurement | A: normal | B: camera 2x |
| --- | --- | --- |
| GL drawing buffer | 3840x2160 | 3840x2160 |
| GL world viewport, excluding UI | 3504x2096 | 3504x2096 |
| Logical world viewport | 1752x1048 | 1752x1048 |
| Body atlas rectangle | 336x368 | 336x368 |
| Body output extent | 168x184 pixels | 336x368 pixels |
| Active atlas rectangle | 176x336 | 176x336 |
| Active output extent | 88x168 pixels | 176x336 pixels |
| Observed world GL draws | 69 | 69 |
| Framebuffer for every observed world draw | Default | Default |

The runtime probe intercepts world-scene GL draw calls, reading `VIEWPORT`, `FRAMEBUFFER_BINDING` and actual `drawingBufferWidth/Height`. All 69 draws in each of the three captures target the default framebuffer at viewport `[0,64,3504,2096]`, inside the 3840x2160 buffer. This is stronger evidence than a 4K filename or canvas CSS dimensions alone. No low-resolution intermediate world rendering followed by enlargement was observed in this tested build and scene.

## Interpretation and limits

The normal view downsamples the 4x body and active textures by approximately two along each screen axis. At camera 2x their projected extents match their texture sample rectangles: approximately one output pixel per texel along each axis. The object gains four times the output area. This supports the distinction between a high-resolution full screen and the much smaller pixel budget of a particular building.

My visual assessment is that B resolves finer metal edges, tower detail and Conscript contours than the post-enlarged C. It is not merely a larger copy of A's sampled pixels. B and C differ at 68,705 RGB pixels in the crop, a difference measurement rather than a quality score. The user explicitly selected the response that B is clearly better and closer to expectations (English paraphrase). This confirms a perceptually useful improvement in this comparison. It does not establish final artwork acceptance, approval of a default camera change or a claim that every remaining discrepancy is solved.

Camera zoom also halves the visible world span along each axis and enlarges the original terrain and adjacent low-resolution structures. This comparison does not establish that zoom should become the default or that it solves every art-transfer discrepancy. The remaining appearance differences from a generated reference can include composition of body and active layers, masking, remap, lighting and prior artwork preparation. Their relative perceptual contribution is not quantified here.

The user supplied a separate Rhino target-versus-runtime comparison during this diagnostic. Its similar apparent object size but different surface appearance is relevant feedback, not proof of the GAPOWR renderer's resolution or of a common cause across the two asset pipelines. This task does not modify Rhino, its scripts, artwork or reports. Camera interaction, expanded-view culling, other states, animation, manual monitor viewing and a production zoom feature are NOT RUN. Prior M1.2 technical acceptance and M1.2a's no-promotion decision remain intact.

## Verification and preservation

- Actual game capture and synchronous assertions: PASS. Same tick, frames, UVs, geometry, accepted identities, output density, camera position and bounds; exactly doubled projected body/active extents; exact restoration.
- Browser review: PASS at widths 1440 and 600, DPR 2, scale 1, JavaScript disabled. All three switches preserve 640x520 CSS display size with decoded 1280x1040 source images and no document overflow.
- Page, console and external-request errors: none. All ten HD textures released on teardown; game reference cleared; no diagnostic shader programs allocated.
- Protected payload snapshot: PASS_EXACT_EQUALITY. Source installation, all 64 HD-pack entries, 188 accepted-art-review entries, imported resources, support, application bundles, `dist` and normal user profile are unchanged.
- Node syntax and whitespace checks: PASS. No production source or shader changes; the existing game harness gains an opt-in `M12_ZOOM_OUTPUT` hook only. No new application build or broad gameplay regression claim is made.

The checkout began at `8d350d6` with another task's untracked Rhino files. The other task subsequently committed `459c1eb`; preserve that work. To isolate this experiment, it uses the retained M1.2a build originally recorded at `2c8e1f3`, with every build file verified against its saved SHA-256 before serving. The relevant current rendering/geometry sources had no diff from the prior M1.2a checkpoint when inspected. Exact executed harness source copies and hashes are retained with the capture; this is not a validation of all later Rhino runtime changes.

Evidence root: `.artifacts/m1-2a-zoom/`. It contains `build-identity.json`, preservation snapshots, `initial-git.json`, `game-v1/result.json`, `capture-v1/result.json`, source identities, full/cropped PNGs and `review-v1/{review.html,analysis.json,browser-check.json}`. The first two unprivileged preview starts reported ports unavailable; a direct bind check established sandbox `Operation not permitted`, and the authorized loopback preview then started successfully on port 4027. No other server was stopped.

Reproduction, using fresh output names and the preserved build:

```sh
M12_BUILD_DIR=.artifacts/m1-2a/build M12_PORT=4027 bun scripts/m1/serve-power-plant-game.mjs
# In another terminal while that isolated preview runs:
M12_ORIGIN=http://127.0.0.1:4027 M12_SHORT=1 \
  M12_OUTPUT=.artifacts/m1-2a-zoom/game-fresh \
  M12_ZOOM_OUTPUT=.artifacts/m1-2a-zoom/capture-fresh \
  bun scripts/m1/run-power-plant-game.mjs
python3 scripts/m1/build-power-plant-zoom-review.py \
  --run .artifacts/m1-2a-zoom/capture-fresh --output .artifacts/m1-2a-zoom/review-fresh
bun scripts/m1/check-power-plant-zoom-review.mjs .artifacts/m1-2a-zoom/review-fresh
```

The requested comparison and its visual feedback are complete. Stop with the improvement direction confirmed and the production baseline unchanged. Await a separate decision on display/view tradeoffs; do not promote a camera change, generate replacement art or update all 44 frames from this evidence alone. Further M1.2 corrections stay in this execution conversation; no new conversation or milestone is started automatically. All changes remain local; nothing is pushed or published.
