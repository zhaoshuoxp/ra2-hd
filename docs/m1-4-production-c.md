# M1.4 production integration of accepted C

Subsequent unexplored-terrain speckles and GAPOWR structural animation drift are addressed in the [bounded correction report](m1-4-shroud-and-animation-fix.md). The launch command below now opens that corrected isolated build. This document's original build, measurements and accepted-C comparisons remain preserved historical evidence.

**PASS_BOUNDED_PRODUCTION_C / C_VISUAL_ACCEPTED / PRESENTATION_900_USER_CONFIRMED.** Local browser build delivered; Windows, sustained battles, physical panel output and packaging remain unverified.

The user accepted C's visible improvement for Conscript/GAPOWR, then explicitly requested the next step: production integration, performance work and state regression. This supersedes the preceding harness-only restriction for this bounded renderer correction. Reference height 900 stays confirmed. No artwork, exported pack, native geometry, lighting, shadows, rules, input or Rhino implementation is changed.

## Run

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun scripts/m1/play-production-c.mjs
```

This verifies the new isolated build inventory, opens a disposable visible Chrome session and prepares the existing 4x Conscript/GAPOWR fixture. **C is active automatically; no diagnostic shader injection or A/B/C selection is needed.** Output resolution remains independently selectable in the game Options menu. `M14_PORT=4035` selects another unused local port; Ctrl+C closes the owned session. The cross-faction infantry fixture is diagnostic setup; normal production rules remain intact.

The [native-size verification page](../.artifacts/m1-4/production-c/review-v2/review.html) labels its columns **A legacy / B accepted experimental C / C production C**. These labels differ from the historical A/B/C experiment. Every column uses the same tick, pose, palette, light, camera and output density. Each crop occupies 420x320 CSS pixels; High stores 840x640 pixels and 1080p stores 420x320. Narrow windows scroll. The original build and `play-display-edges.mjs` remain preserved as historical controls; normal `dist` and existing applications are not overwritten.

## Implementation

`HdSpriteMaterial` adds a remap-aware area filter for the existing world sprite merging path. Palette indices are resolved before color averaging. Colors are accumulated in linear light with premultiplied coverage. Per-item frame bounds prevent atlas neighbors from bleeding. Texture bytes, filters and manifests remain unchanged. Opaque interiors retain depth writes; fractional edges are separate, sorted, depth-tested draws without depth writes. Alpha-254 export-rounding interiors retain the accepted 0.995 threshold. Existing light and owner-color attributes apply to both passes.

`HdSpriteEdges` views the merged batch's existing position/UV/palette/light/frame-bound buffers. It allocates views once, sets an index range and bounding sphere per sprite, reuses them during animation, hides unused views and disposes them with the batch. There are no per-frame sliced geometry copies or duplicate edge attribute uploads. Cached frame bounds update only when UVs change. Faded/transparent HD sprites use individually sorted full-coverage views, retaining opacity without making the entire merged batch one transparent sorting object. Indexed sprites gain no edge pass. HD is still activated only by the existing complete-member/family resolver.

The exact filter footprint increases from the experiment's four-texel cap to eight texels to cover 720p. Smaller windows whose footprints exceed eight texels retain bounded filtering rather than an unbounded shader loop. This extreme minification is not a full prefiltered mip hierarchy. Unbatched diagnostic/tool rendering retains its prior path; the shipped Conscript/GAPOWR world path uses merging. Near-coplanar geometry and arbitrary larger crowds are not universally certified.

## Evidence

Evidence is under `.artifacts/m1-4/production-c/`.

- `comparison-v1`: 19 same-tick triplets. **Accepted experimental C and production C are pixel-identical in all 19 full-scene pairs**, including High/1080p, blue remap, actual movement, firing, damage and layered occlusion. Legacy restoration is exact in every triplet. All 38 comparisons against legacy change zero pixels outside the HD bounds plus the retained four-pixel margin.
- Occlusion: 331 rear-flank interior pixels plus six partial-occlusion interior pixels remain hidden; zero newly visible interior pixels under production C. This is a bounded no-leak measurement.
- `checks-v1/frame-sweep.json`: all 301 Conscript visible frames and all 44 GAPOWR aggregate frames render with the expected page/map/data binding and no GL errors. This forced frame sweep supplements natural gameplay; it does not claim natural execution of every infantry action. Five opacity transitions also pass.
- `checks-v1/presets.json`: Auto, Window 1x, 720p, 1080p, 1440p and High preserve logical height 900, camera, target coordinates, model geometry and viewport; no GL errors.
- `game-v1` and `checks-game-v1`: both complete without unexpected page/console/GL errors or external requests. Ten HD textures release on leaving, the game reference clears and production/experiment GPU programs release.

The first full gameplay attempt, `gameplay-v1`, failed its old occlusion probe: the M1.2 harness used presentation coordinates directly as output pixels after the M1.4 display transform. Its result remains **FAIL**, not a renderer PASS. The probe now scales its readback location and region by buffer-height/presentation-height. The independent M1.4 comparison probe already reproduced occlusion before this correction. **The corrected `gameplay-v2` run passes** natural production/placement, buildup, movement/cheer/page changes, original shadows, selection, foreground/background occlusion, resolution switching, damage, repair, sale, second construction and destruction. Health reaches 41.33%, repairs to 100%, then the second plant is destroyed at tick 3040. No unexpected errors occur and HD resources release on exit.

**38 targeted tests / 864 assertions PASS; entry typecheck PASS; isolated production build PASS (153 files).** Tests cover HD material/buffer lifecycle, geometry, complete-member/family fallback, presentation, resolution, pointer behavior, cursor and importer isolation. The existing non-blocking chunk-size advisory remains. Preservation is exact for 13,689 protected entries and 1,183 prior M1.4 files. No push or publication.

Additional browser controls pass: rejected 4x GAPOWR pages fall back as a complete family to 2x; rejected 4x/2x pages fall back as a complete family to original while Conscript remains 4x; original-art-only startup uses indexed materials. The injected missing-page controls produce only the expected 404 messages. The native-size page passes at 1440- and 600-wide viewports with all 57 images and ten synchronized motion positions.

The new visible-window launcher passes with C active by default: actual CSS canvas approximately 1200x828, drawing buffer 2400x1656, DPR 2, reference height 900. It exits cleanly with all HD textures/programs released (`manual-1789710008538`). The first smoke attempt used Chrome-blocked port 4045 and is retained as FAIL; retrying on 4036 passes without changing browser security settings. This is application/window evidence, not physical panel certification.

## Bounded performance

Balanced A/B/C/C/B/A order with 12 warm-up frames and 24 measured frames per visit gives 48 samples per mode, load and output. Timing includes batch update, rendering and `gl.finish`; it excludes simulation and is neither isolated GPU timing nor a frame-rate guarantee. A/B are controls inside the new build, including its base bookkeeping; these numbers are not a historical-build benchmark.

| Infantry | Output | Experimental C median | Production C median | Production C p95 |
| --- | --- | --- | --- | --- |
| 8 | 1080p | 1.255 ms | 1.090 ms | 2.655 ms |
| 8 | High | 1.040 ms | 0.910 ms | 1.630 ms |
| 64 | 1080p | 2.775 ms | 1.645 ms | 2.600 ms |
| 64 | High | 2.330 ms | 1.470 ms | 1.970 ms |

The bounded load contains stationary fixture infantry and existing buildings. Production C uses 10/66 edge views at 8/64 units, all sharing their parent batch buffers. Sorting/draw overhead remains; no atlas texture allocation is added. Sustained battles, Windows, physical panel output and packaged applications remain unverified.

## Reproduce

```sh
bun run build --outDir .artifacts/m1-4/production-c/build-fresh
M12_BUILD_DIR=.artifacts/m1-4/production-c/build-fresh M12_PORT=4044 bun scripts/m1/serve-power-plant-game.mjs
# Separate terminal, with fresh output directories:
M12_ORIGIN=http://127.0.0.1:4044 M12_SHORT=1 \
  M12_OUTPUT=.artifacts/m1-4/production-c/game-fresh \
  M14_PRODUCTION_OUTPUT=.artifacts/m1-4/production-c/comparison-fresh \
  bun scripts/m1/run-power-plant-game.mjs
M12_ORIGIN=http://127.0.0.1:4044 M12_OCCLUSION=1 \
  M12_OUTPUT=.artifacts/m1-4/production-c/gameplay-fresh \
  bun scripts/m1/run-power-plant-game.mjs
python3 scripts/m1/build-display-edges.py \
  .artifacts/m1-4/production-c/comparison-fresh .artifacts/m1-4/production-c/review-fresh
bun scripts/m1/check-display-edges.mjs .artifacts/m1-4/production-c/review-fresh
```

Keep any M1.4 corrections and acceptance in this execution conversation. Rhino implementation, other assets, repainting, campaigns, packaging and publication remain outside this task.
