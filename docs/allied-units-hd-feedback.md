# Task B visual feedback corrections

Baseline: clean local main `8bc3c22`. This remains Task B; accepted Allied buildings, Soviet assets, the prior package and all earlier evidence remain intact. Final user acceptance is pending.

## Rendering findings

The accepted Rhino uses a 4x atlas and the shader's one-texel minimum footprint. The new Allied VXL families used 2x atlases with a fixed four-texel minimum footprint. Both the Rhino and Allied artwork contain near-opaque alpha values around 253/255. Since that value is below the shader's 0.995 opaque threshold, the wider Allied coverage branch averaged interior detail as well as edges. This explains the direct screenshot difference; video compression was not the primary cause.

Allied VXL families now use the accepted Rhino sampling footprint. No alpha threshold, source alpha, sharpening filter, camera or world scale was changed. All 16 families were re-exported from their existing authored masters into 4x atlases. Logical sizes, offsets, component matrices and reference origins remain byte-for-byte equal as JSON values. Team-color support keeps the same logical margin. Four large CARRIER bearings exceed their available master sampling by 1.02–1.35x; their 4x atlas is not a claim of additional authored detail in those four views. The other 268 component bearings are downsampled from their masters.

The excessive coverage width also spread bright silhouette coverage into the ground-shadow contact region. Correcting the sampling footprint removes that expansion while retaining the original VXL shadow casters and accepted translucent-shadow behavior. Soviet renderer settings and resource bytes remain unchanged.

DLPH source bearings run clockwise, whereas the generic vehicle SHP direction mapping runs counterclockwise. Only DLPH's visual facing selection is reversed; animation phase, movement direction, weapon targeting and native effects are unchanged.

DEST, CARRIER, AEGIS and LCRF now use the same registered water-surface depth recovery as the accepted Soviet ships. Camera-ray displacement preserves projected artwork while preventing visible hull pixels from starting below the water clipping plane. Native sinking and pitch still act on the resulting local surface.

ORCA and BEAG can be registered as docked before finishing descent. The previous reload test missed final parking visibility. Once actually parked, airport sprite depth could occlude the aircraft. The correction recovers depth against the occupied airport's body, bib and animation surfaces along camera rays. It keeps normal depth testing and preserves the aircraft's projected position and size; it applies only to these aircraft at their actual occupied ground dock. Flight poses remain unchanged.

## Incremental evidence

The retained diagnostic iterations are under `.artifacts/allied-units/feedback-probe-v1` through `feedback-probe-v9`; failed and incomplete diagnostic alternatives remain historical evidence, not acceptance. `quality-probe-v3/MTNK-filter-1.png` shows the revised sampling and 4x Allied tank alongside the unchanged Rhino. `quality-probe-v1/MTNK-filter-4.png` reproduces the original blur.

Final 16-family CPU source/hash/allocation checks are in `feedback-vxl-4x-final/*-validation.json`. Eighteen focused tests passed with 7,085 assertions, including source boundaries, naval projection, native dolphin action phases, docking projection and independent family fallback. Entry type checking passed. The copied correction package passed YR native DLPH / DEST / CARRIER / AEGIS / LCRF actions, including required child aircraft and passengers, and ORCA / BEAG sortie, completed descent and reload. A separate RA2 snow check shows all four occupied aircraft parking slots. The final mixed Allied / Soviet clarity scene uses 193,982,612 bytes (185.0 MiB) of the 256 MiB shared budget, with no browser errors. All 2,366 hashed files and 14 symlink targets in the prior package are unchanged.

New review capture supports a real 3840x2160 drawing buffer at the original logical camera, VP9 capture targets of 30 fps and 48 Mbps, plus lossless PNGs. These are fresh captures, not enlarged or sharpened copies. The prior 1080p clips remain historical evidence.

Continue fixes and final acceptance in the same B execution conversation. No push, new milestone or Desktop ZIP is implied.

Current review: `.artifacts/allied-units/Allied-Units-Feedback-Review.html`. Current app and sibling resources: `.artifacts/allied-units/feedback-package-v1/RA2-HD-Allied-B-Corrections`. The receipt records a working-tree build based on `8bc3c22`; source changes are checkpointed locally after validation. The only later runtime-source edit is indentation with identical TypeScript-transpiled JavaScript. No resources were overwritten and no remote push was made.

## Residual shadow-gap correction

The subsequent three user screenshots disproved the claim that filtering alone removed the contact gap. The remaining ground-colored, stepped fringe was caused by the native VXL depth-only mesh, not leftover matte pixels. The bridge-only visibility expression returned `undefined` when there was no bridge. Three.js skips objects only when visibility is explicitly `false`, so the invisible original voxel outline continued masking the ground-shadow receiver outside the narrower authored silhouette. Rhino has no such bridge-only depth mesh.

The runtime correction coerces the optional bridge result to a boolean. It changes no artwork, atlas alpha, sampling, shadow caster, world geometry or building resource. The regression exercises the actual renderer update and scene visibility traversal for no bridge, low bridge, under a high bridge, on a high bridge and air zone. Ten focused tests passed with 6,762 assertions; entry type checking passed.

The new package is `.artifacts/allied-units/shadow-gap-package-v1/RA2-HD-Allied-B-Shadow-Fix`; previous packages remain intact. Same-frame diagnostics compare the corrected default, the reproduced legacy undefined mask, explicit mask removal, HD depth removal and shadow removal. Ground AMCV and land LCRF defaults exactly match explicit mask removal. Evidence is under `shadow-gap-ground-v1` and `shadow-gap-naval-v1`. These controlled diagnostic captures do not repeat earlier native action acceptance.

The actual packaged GAAIRC and NAWEAP body, bib and animation builders both reported active HD, `HdSpriteMaterial`, `smoothCoverage=false`, minimum footprint 1, nearest texture filters and depth writes enabled. Both use the shared SHP rendering path. GAAIRC remains the accepted 2x family; the aircraft are now 4x. Most accepted Soviet building families are also 2x, with 4x exceptions such as NAPOWR. Therefore equal sampling parameters do not imply equal source detail, and the airport is not affected by the former Allied vehicle four-texel blur. No building quality revision is promoted by this diagnosis.

The user accepted this residual shadow correction on 2026-09-29. The earlier statement that filtering alone removed all contact gaps is superseded by this correction and its review evidence. The subsequent hardware-gated atlas-density request is tracked separately in `unified-4x-density.md`.

Waterborne DEST also passes the same-frame equality check in `shadow-gap-dest-v1`. The self-contained comparison is `.artifacts/allied-units/Allied-Shadow-Gap-Review.html`.
