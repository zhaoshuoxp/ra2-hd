# MCV original-graphics shading correction — 2026-09-14

The user reported a simplified-looking Allied MCV in native Safari and supplied an eight-facing original-game reference. The reference shows much stronger wheel, cab and roof detail than the initial local rendering. The correction restores use of the locally archived voxel shading lookup; it does not replace the vehicle geometry or introduce HD artwork.

## Diagnosis and change

The imported `mcv.vxl` contains 21,119 occupied voxels in a 77×29×33 section. An independent exposed-face mesh preserves each voxel's color and normal indices. Its surface area and volume match the engine's monotone mesh to better than one part per million. At eight distinct orientations, the two meshes produce exactly the same framebuffer pixels in Chrome and Playwright WebKit. A hidden-MCV control changes 2,588 pixels, proving the comparison covers visible geometry. Increasing the mesh from 37,256 to 68,144 triangles does not recover the missing tonal detail.

The relevant rendering gap is different: `PalettePhongMaterial` used continuous Phong lighting without the archived `voxels.vpl` color lookup. The [Chrono Divide Mod SDK](https://github.com/chronodivide/mod-sdk#unsupported-engine-features) explicitly documents this unsupported feature. The local `ra2.mix/local.mix/voxels.vpl` is 8,976 bytes with 32 lookup rows and remap indices 16–31. Of the 1,248 row/color combinations used by the MCV's 39 color indices, 1,116 map to a different palette index. A simple brightness adjustment cannot reproduce those per-color mappings.

`VplFile` now validates and reads that table from the existing local VFS. The importer validates the required member before committing an import. `WorldView` owns one nearest-filtered, non-color lookup texture per game and supplies it through the voxel builder factory. Both voxel material construction paths receive it; batch material cache keys include its identity, and cloned materials retain the shared lookup. No new top-level retail archive or loose override is accepted.

The shader transforms stored voxel normals with the existing model/HVA transforms, chooses a clamped 0–31 lighting row, then resolves the result through the existing theater/player palette. The row equation follows the primary [Thomas Sneddon VXL renderer research implementation](https://github.com/ThomasSneddon/vxl-renderer/blob/master/shaders.hlsl), using the existing world light and world-up directions. This is a narrow rendering compatibility change within the retained engine, not a replacement engine. The equation combines a nonnegative normal/light dot product with a half-direction term `h / (3 - 2h)`, scales their sum by 16, floors it, and clamps it to the table range.

VPL supplies the shape-dependent tones; the existing map ambient/tint, elevation and effect brightness remain inputs. The old `1.5π` Phong compensation is removed when interpreting the latter inputs. Camera projection, logical size, geometry, HVA frames, simulation, rules, owner identity, selection and shadow casting remain unchanged. Existing development tools that do not supply a VPL retain the previous material path.

An opacity control exposed an existing material issue: switching to transparency did not recompile Three's `OPAQUE` specialization. The non-batched voxel builder now marks its material for recompilation only when that mode changes. The failed WebKit case is retained in `.artifacts/mcv/after-webkit/`; subsequent validation checks the corrected behavior.

## Acceptance and limits

Result: **PASS WITH LIMITATIONS** for this bounded correction. The build, entry typecheck and 24 tests (101 assertions) pass. Chrome and Playwright WebKit pass all eight mesh orientations and both synthetic GPU lookup endpoints with exact expected RGBA bytes. VPL changes 1,972 MCV pixels; the remap control changes 267, and the opacity control changes 1,972. The shadow on/off comparison retains 1,984 darkened world pixels in Chrome and 1,983 in WebKit.

The new ground regression ran 120,014 ms from tick 364 to 2,764 with all three AI opponents active (build counters 19/20/20). The normal American `AMRADR` → `ORCA` scenario passed production, selection, takeoff and movement with original FALC geometry and shadows. Accepted runs recorded zero runtime errors and attempted external requests; the ground run also recorded zero WebSockets and workers. These are fresh bounded regressions, not a repeat of the historical ten-minute acceptance run.

A separate 20.012-second WebKit sample measured approximately 59.60 FPS, p95 frame interval 18 ms and maximum 76 ms, with 401 simulation ticks. Mean render CPU time was 1.74 ms. This short sample shows the corrected material running near the display cadence; the remaining long frame means intermittent stutter is not declared fixed.

Final numeric results, including the separate WebKit timing sample, are recorded in `.artifacts/mcv/acceptance.json`. Local browser images, numeric mesh/shader checks and retained failures stay under ignored `.artifacts/mcv/`. Source protection still matches all 3,368 metadata entries / 3,146 files and all five imported archive hashes; parent/source Git directories are absent. Build and new-Git-path separation checks pass, including VPL/PAL exclusions. No screenshots, palette data, extracted models or table payloads belong in Git or the build distribution.

The supplied reference is used for qualitative wheel/cab/roof detail, not an exact pixel oracle: its game version, map lighting and capture settings are unknown. The new local rendering visibly recovers those features, but exact vanilla pixel parity remains unverified. Existing owner-remap ramps, rasterization, clipping, animated HVA frames, unusual map lighting and batch rendering require broader coverage. The tested browser configurations select the non-batched WebGL2 path. No native Safari automation or Windows execution is claimed. The user's Safari screenshot confirms shadows and reports 60 FPS / 61 ticks/s / p95 18 ms at that instant; it does not close the intermittent stutter report.

## Reproduction

From the existing imported checkout:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun run build
bun run start:offline
```

Open `http://127.0.0.1:4000/?stats=1`, reload the page, and start a new Offline Skirmish. No reimport is needed because the table is already inside the allowlisted archive. The controlled fixture uses South Pacific, Americans against three Normal Libya bots, fixed seed 1700000000000, speed 3 and ten starting units. Use the existing original camera and enabled shadows.

With the preview server running, run browser checks sequentially:

```sh
M01_SCENARIO=mcv M01_OUTPUT=.artifacts/mcv/final-chrome node scripts/m0/render-probe.mjs
PLAYWRIGHT_BROWSERS_PATH=.local/playwright M01_BROWSER=webkit M01_SCENARIO=mcv \
  M01_OUTPUT=.artifacts/mcv/final-webkit node scripts/m0/render-probe.mjs
M01_DURATION_MS=120000 M01_OUTPUT=.artifacts/mcv/ground-regression node scripts/m0/compat-browser.mjs
M01_SCENARIO=aircraft M01_OUTPUT=.artifacts/mcv/aircraft-regression node scripts/m0/render-probe.mjs
PLAYWRIGHT_BROWSERS_PATH=.local/playwright M01_BROWSER=webkit M01_SCENARIO=shadows \
  M01_MEASURE=1 M01_STATS=1 M01_OUTPUT=.artifacts/mcv/timing-webkit node scripts/m0/render-probe.mjs
bun test
bun run typecheck:entry
```

`mcv-sequence.mjs` checks eight mesh orientations, visible geometry, VPL versus Phong output, player remap, reduced ambient light and opacity. `voxel-palette-gpu.mjs` renders synthetic lookup rows 0 and 31 through the actual production material and compares framebuffer RGBA bytes with independently expected values. This also verifies that palette color-space conversion and lookup endpoint clamping work together. The test scenes restore temporary changes and dispose their resources.

The separate `voxel-shading-audit.ts` and `mcv-vpl-sequence.mjs` preserve the initial isolated experiment. They are diagnostic scripts, not the product asset loader. The latter's initial output under `vpl-prototype/` predates the production correction.
