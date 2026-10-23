# M1.4 sampling and soft-edge experiment

**Subsequent step:** the user requested production integration after accepting C. See [production C integration](m1-4-production-c.md) for the new default and validation. This report and its retained build describe the historical harness-only experiment.

**PASS_BOUNDED_EDGE_DIAGNOSTIC / C_VISUAL_ACCEPTED / PRODUCTION_INTEGRATION_PENDING.** The user observed harder lines, jagged contours and poor background integration in the fidelity check's game column, then explicitly selected the proposed A/B/C experiment. This supersedes the preceding diagnosis-only restriction for these harness-only sampling/material trials. The default application remains A. No artwork, pack, production shader, lighting, camera, geometry, rules, shadows or Rhino changes are made. Reference height 900 remains user-confirmed.

The user accepted C after review: "C has a noticeable effect and is acceptable." This completes the A/B/C visual-selection gate for the reviewed Conscript/GAPOWR cases. C is the selected filtering and soft-edge direction; this does not certify every animation/state, production performance or other platforms. The [acceptance receipt](../.artifacts/m1-4/edge-review/visual-acceptance.json) binds this decision to the retained review and capture evidence. Their historical pending labels are preserved. Production integration has not been performed; the default remains A.

## Review and play

Open the [native-size A/B/C review](../.artifacts/m1-4/edge-review/review-v1/review.html). It contains normal High/1080p rows, a blue team-color control, ten synchronized actual movement samples, exposed/occluded positions, firing, damage and a post-live-C capture. Each row holds pose, tick, camera, light, owner palette and output dimensions constant across A/B/C. Different rows occur at different ticks; the High and 1080p rows are not a frozen cross-resolution comparison. The earlier M1.4 sampling-only triplet remains that evidence.

For continuous gameplay with the experiment's controls:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun scripts/m1/play-display-edges.mjs
```

Wait for fixture readiness, then use the top A/B/C buttons or **Alt+1 / Alt+2 / Alt+3**. Compare **1080p and High** output in the same window. This filter trial is bounded to those conditions: its derivative footprint is capped at four atlas texels, so lower output densities are not validated filter references. Keep browser zoom at 100%. The launcher verifies and serves the existing isolated build, opens a disposable visible Chrome profile and prepares the existing complete 4x Conscript/GAPOWR fixture. It uses the actual window/DPR. Ctrl+C closes the owned browser/server. `M14_PORT=4035` selects another unused port. The standard `play-display-review.mjs` entry remains original rendering; there is no stored preference promoting B or C.

| Mode | Color sampling | Coverage and occlusion |
| --- | --- | --- |
| A | Existing nearest sampling | Existing hard alpha test and opaque surviving pixels |
| B | Area-weighted resolved colors in linear light | Same nearest coverage, alpha threshold and depth behavior as A |
| C | Same filtered colors as B | Opaque interior plus individually sorted, depth-tested, premultiplied blended edges |

The page fixes every crop to **420x320 CSS pixels**, with 840x640 source pixels at High and 420x320 at 1080p. Narrow windows scroll; no crop is fitted or enlarged to improve appearance. The sampled-motion slider updates all three columns together. Playback holds each sample for 500 ms and is explicitly not a real-time motion video; use the playable scene for continuous motion. Direct PNG links expose output pixels for inspection. Physical panel/compositor fidelity and Windows remain unverified.

## Implementation and limits

`display-edge-probe.mjs` is injected only by the explicit test or experiment launcher into the unchanged game build. It patches only actual HD draw batches backed by the currently validated Conscript/GAPOWR pages. Textures retain their original bytes, filters and identities. A restores the original shaders and removes all experiment attributes/meshes. There is no production import of this probe.

Each covered source texel first resolves its categorical owner-color shade through the captured palette, then contributes alpha-weighted linear RGB and coverage to the destination footprint. This avoids interpolating palette indices. Per-sprite UV bounds travel with the batch vertices; samples outside the frame return zero, preventing neighboring atlas frames from bleeding in. No automatic whole-atlas mipmap chain or repainting is introduced. The filter averages existing information and may soften texture; it cannot recover clipped artwork.

C leaves interiors with coverage at least 0.995 in the opaque depth-writing pass, treating the existing alpha-254 export-rounding interiors as effectively opaque. Fractional edges above 0.001 use a separate depth-tested pass without depth writes. Edge meshes are split per sprite for sorting and retain the original split geometry, material clipping, vertex owner palette, light/opacity attributes and render order. This is necessary for layered buildings and unit occlusion; simply making an entire merged sprite batch transparent would not provide the same ordering. Existing shadows and shared fire/effect sprites are untouched. Near-coplanar, intersecting and very crowded scenes still require broader validation before production promotion.

The controls preserve the current lighting and native silhouette constraint. B addresses interior aliasing while deliberately retaining hard edges; C additionally addresses coverage discontinuities. Neither is a new art direction or a complete remedy for style differences between HD sprites and original terrain. The user has accepted C's visible improvement in the reviewed cases.

## Evidence

Final run: `.artifacts/m1-4/edge-review/game-v3/result.json` and `capture-v3/result.json`. **19 same-tick triplets / 57 full game PNGs**, with exact full-PNG A restoration after every triplet. All ten movement samples have the target unit's actual moving flag; firing and damage are observed through normal commands. The alternate blue palette is a synchronous render-only control using an existing palette row; ownership and rules are unchanged. C also runs continuously for 1.8 seconds during another movement command before the final triplet.

All triplets preserve presentation, camera, HD identities, source-model geometry/UVs, frames and unit state. **38 image-difference checks pass with zero changed pixels outside HD bounds plus a four-output-pixel projection/edge margin.** No unexpected page/console/GL errors or external requests occur. All ten HD textures release on teardown, the game reference clears and no `m14-edge` GPU programs remain.

Depth occlusion is measured by hiding/showing the target unit surface and building, with normal state restored afterward. Counts are output pixels whose RGB changes by more than two levels; C's additional edge samples naturally change coverage counts, so equal counts are not required.

| Position | A visible / unobstructed | B visible / unobstructed | C visible / unobstructed |
| --- | --- | --- | --- |
| Exposed flank | 1524 / 1524 | 1524 / 1524 | 1648 / 1648 |
| Partial occlusion | 1356 / 1408 | 1356 / 1408 | 1447 / 1500 |
| Rear flank | 822 / 1441 | 822 / 1441 | 932 / 1553 |

In the rear-flank control, **347 pixels inside A's hard-occlusion region**, excluding a two-pixel border, remain fully hidden under C: **zero newly visible interior pixels**. This is a bounded no-leak check, not certification of every overlap or animation frame. Normal and damaged GAPOWR body/activity composition is included in the visual review; construction/selling and all 301 Conscript frames are not recertified for these experimental materials.

Instrumented render/finish medians across the 19 triplets are approximately **A 2.76 ms / B 1.71 ms / C 8.70 ms** on this Mac. These include harness/driver/compilation effects and are not a claim that B is faster than A. C adds 10-15 temporary edge geometries and 20-30 world draws in the sampled scenes, with no extra atlas textures. Its additional sorting/draw cost needs production optimization and larger-battle testing before integration. No performance-based default promotion is made.

The native-size review passes at 1440- and 600-wide browser viewports: all 57 images load, displayed crops remain 420x320, all ten motion positions and playback work, links resolve, and no external request occurs. The visible-browser launcher smoke test passes buttons, Alt hotkeys and exact A restoration, then closes cleanly (`manual-smoke.log`, `PLAYABLE_SESSION_CLOSED`).

The first run's C fringe clone omitted the original merged-material palette/light defines, producing wrong-colored edges. Visual inspection caught this despite the initial runtime checks passing. That run is explicitly **FAIL_VISUAL_IMPLEMENTATION_SUPERSEDED** in its separate `review-audit.json`; it is not offered as a candidate. Copying those defines fixes the edge path. Run v2 adds the blue control; v3 adds the deeper occlusion-interior test. No production shader was changed to fix the diagnostic.

## Preservation and reproduction

The original assets, all accepted HD packs/artwork, prior Rhino evidence, normal applications/`dist`/profile and the M1.4 build remain unchanged. Preservation checks cover **13,689 protected entries plus 715 prior M1.4 files**. **36 targeted tests / 839 assertions PASS; entry typecheck PASS; isolated production build PASS.** All 153 rebuilt files equal the original delivery inventory. The existing non-blocking chunk-size advisory remains. Only experiment scripts, explicit fixture/launcher hooks and current-stage documentation are changed. No push or publication.

```sh
bun scripts/m1/serve-display-review.mjs
# Separate terminal; use fresh output directories:
M12_ORIGIN=http://127.0.0.1:4034 M12_SHORT=1 \
  M12_OUTPUT=.artifacts/m1-4/edge-review/game-fresh \
  M14_EDGE_OUTPUT=.artifacts/m1-4/edge-review/capture-fresh \
  bun scripts/m1/run-power-plant-game.mjs
python3 scripts/m1/build-display-edges.py \
  .artifacts/m1-4/edge-review/capture-fresh .artifacts/m1-4/edge-review/review-fresh
bun scripts/m1/check-display-edges.mjs .artifacts/m1-4/edge-review/review-fresh
```

**The A/B/C visual-selection gate is complete: C is accepted.** The 900-high scale remains confirmed, and all independent Rhino decisions remain intact. The next implementation scope would be bounded production integration and validation of C in this task; it has not been started. This acceptance does not change the default renderer or constitute complete-family production acceptance.
