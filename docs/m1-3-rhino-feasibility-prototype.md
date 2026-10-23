# M1.3 Rhino HD feasibility prototype — Phase A

**Outcome: REVIEWED_NO_DIRECTION_SELECTED. Original Rhino retained. Phase B: NOT STARTED.** The geometry experiment rendered successfully, but did not deliver a worthwhile native-size visual improvement. This is completion of the bounded feasibility investigation with a no-promotion outcome, not delivery of a complete HD vehicle.

## Visual decision and evidence

The user first selected staying in Phase A to provide visual feedback, then stated that B appears to consist only of simple lines, with no detail or light and shade (English translation of the Chinese response). This feedback refers to **candidate B, revision 2**, SHA-256 `720e37c9745dd57fe53b0aadb1a0bc0346c8cedb0a276f2fd3e9863c8fddabad`, shown in `.artifacts/m1-3/review-v1/review.html`. No candidate was selected and no approval identity exists. The [final static review](../.artifacts/m1-3/review-v2/review.html) retains identical candidate pixels and records the feedback. No further artwork follows this response.

The critique is consistent with inspection: broad bright planar areas, a simplified turret and sparse surface treatment replaced much of the original's visual complexity. The clearer track outline and round cannon do not compensate for lost detail and light/shade. The candidate is a procedural form study, not a successfully detailed HD Rhino. More geometrically regular parts alone did not meet the goal.

An additional measured limitation is important: unchanged local XYZ bounds and transform scale did **not** preserve the exact projected silhouette envelope. At heading 0, the body spans about **52.11 × 31.38 CSS pixels** in A versus **55.58 × 34.13** in B. At heading 90, A is **51.42 × 31.03** versus B **55.58 × 34.13**. B fills more of the same local bounding box, increasing its projected mass. Consequently **apparent silhouette-size preservation is FAIL for this candidate**, even though camera, root scale, pivots and logical bounds are unchanged. This is another reason not to promote it; the report does not claim all invariants passed.

The comparisons cover render body headings 0°, 90°, 180° and 270°, plus body 45° with independently aimed turret/barrel 135°. Each A/control/B/restored set is synchronous at one simulation tick. The real South Pacific skirmish provides terrain, native light, the original Allied MCV and one explicitly spawned cross-faction HTNK. No faction-production or combat rules are patched. These are diagnostic stationary render poses in an actual game scene, not normal production, movement or firing evidence.

Each scene crop displays at exactly **360 × 260 CSS pixels**. Primary 4K images are 720 × 520 physical pixels; 1080p repeats are 360 × 260. Browser canvas is 1920 × 1080 CSS, world viewport 1752 × 1048, DPR 2 and browser visual scale 1. Drawing buffers are respectively 3840 × 2160 and 1920 × 1080. Both sides of every pair have equal output density, crop, owner, ground, light and camera. Camera zoom/matrices, each part's projected CSS bounds, transforms and material state are recorded per set in the run JSON. Multiply CSS bounds by 2 for 4K buffer coordinates or by 1 for 1080p. No output preset is relabeled as a model-detail level.

The review embeds all 42 images, needs no JavaScript or external files, and has same-position radio switching plus adjacent A/B views. Narrow windows scroll instead of scaling the scene. Direct PNG pairs are `review-v2/4k-0-0-pair.png` through the other pose names and the `1080p-*` equivalents. The pair boards include labels; their raw file width is not the intended gameplay display width. `detail-3x.png` is an explicitly labeled supplement. Raw full-game A captures remain in `candidate-game-v2/*-scene.png`.

## Verified checkout and preservation

Initial checkout was clean on `m0-2-stabilization` at **`62fbc6b1bf7c2438884e3bccb72a3a98b64d7354`**, matching the reported baseline. There were no subsequent changes to overwrite. The initial protection snapshot includes only the newly written task-owned preservation script in Git status; the prior shell inspection established the clean starting state.

All implementation is under `scripts/m1/`; there is **no production renderer, vehicle, resource-loader, rules, shader, dependency, profile, packaging or default-activation change**. The production build therefore uses the unchanged baseline runtime. Reviewed local implementation checkpoint: **`5486b51`**. README and AGENTS amendments append current state without altering historical acceptance reports. Final documentation commit identity is recorded in `.artifacts/m1-3/final-state.json` after staged review.

`preserve-m13.py` snapshots source-install metadata plus the three source archive hashes; it hashes staged imports, existing HD packs, the accepted GAPOWR complete-art review, support files, both accepted application trees, `dist` and `~/Library/Application Support/RA2 HD`. Only new `rhino-*` candidate directories are excluded from the old-pack snapshot. Before/after snapshots pass exact equality. New files stay in ignored `.artifacts/m1-3/` and `.local/hd-packs/rhino-phase-a/{1,2}/`. No retail programs, Wine, updaters or external art services ran. Accepted Conscript and retained GAPOWR pixels, M1.2a candidates and prior evidence remain intact. No push, publication or application packaging.

## Actual resources and source identities

The staged core VFS resolves `[HTNK]` without an alternate `Image`; `[HTNK]` art has `Voxel=yes`, `Remapable=yes` and `PrimaryFireFLH=150,0,100`. Runtime decoded VXL data and all HVA names/matrices are compared with the extraction before candidate injection in `validation-game-v3`. The six body/turret/barrel members resolve from `ra2.mix/local.mix`:

| Member | SHA-256 |
| --- | --- |
| `htnk.vxl` | `0ca8517c29f8bed26c3a3f0138bb36bae01fbb751fc9eaa30bfa1fba352923a2` |
| `htnktur.vxl` | `4fc6ca0efb803621ae4dc99357f81eb4bc524cc70a90e386831fa0e63a416451` |
| `htnkbarl.vxl` | `42a3a41fdc52a5491b172bddcd8aac5b9baedec1d7703f95a68a9b96f8531398` |
| `htnk.hva`, `htnktur.hva`, `htnkbarl.hva` | All three: `16f3cd28642a66b1a0dc3f6cb4b063889c9f4721e46f12054fd60ed88cdc32ca` |

Each file has one `DUMMY01` section, normals mode 2, one identity HVA matrix and `hvaMultiplier≈0.083333336`; applied transforms are identity. Revalidated original grids/occupied voxels are body **46×34×12 / 4,816**, turret **28×18×9 / 1,501**, barrel **19×3×3 / 155**. Full section bounds, matrices, normal vectors, palette indices and exposed voxel faces are in `source-v1/`.

`unittem.pal` resolves from `ra2.mix/cache.mix`, SHA-256 `ed785e62eed291480f3198dd44f6b656ebe3a9b75e9f641944d710abc6bde3e3`. `voxels.vpl` resolves from `ra2.mix/local.mix`, SHA-256 `2d75fff8a6872ffe98308c7009858a9e904696e1529bc649181a44993979081c`; it has 32 lookup rows and remap indices 16–31. Extraction uses the existing `retailTree`/`resolveMember` precedence, not guessed filesystem overrides.

## Rendering path and bounded route

`Vehicle.createMainObject` resolves the body, `tur` and `barl` suffixes independently. `VxlBuilderFactory` selects the ordinary or batched builder. Both fetch section geometry through `VxlGeometryPool`, apply the matching HVA section's frame 0 through `scaleHvaMatrix`, and keep independently parented parts. `VxlBuilder` retains the original camera-derived scale and axis rotation; its original body bounding box remains the logical envelope used by the existing caller. This run's root scale is approximately 6.033977866 on all three axes.

`Vehicle.updateVxlRotation` applies tilt separately from body direction, then turret/barrel relative yaw. The diagnostic temporarily sets these representative render poses and restores the original rotations/facing in `finally`. It does not change camera/projection, unit placement, selection model, pathfinding/collision rules, speed, cost, health or timing. Retail strength/cost/speed are 400/900/6; the engine's converted runtime speed is approximately 23.630769. `ArmedTrait` supplies the original FLH to `Weapon`; projectile origin rotates FLH by muzzle facing and the original turret offset by body direction. Those callers are unchanged. Actual firing correctness is NOT RUN.

Geometry attributes supply palette index and normal to `PalettePhongMaterial`/`voxelPaletteShader`. VPL row selection depends on transformed normal, light and the up direction; the resulting index samples the current owner palette, then native ambient/effect terms apply. Opacity, clipping planes, depth writing and shadow casting remain on the same meshes/materials. Original geometry casts shadows under the existing world directional light; authored geometry changes fine shadow shape without a new light or shadow renderer. `Vehicle.updateBridgeRenderOrder` and normal occlusion callers remain untouched. Dynamic lighting/owner changes, clipping and bridges are not certified by these fixed-state samples.

The chosen route is **continuous indexed section geometry in the existing voxel material path**, with one coherent procedural source `rhino-geometry.ts`. It authors chamfers, separated track runs/road wheels, team panels, roof forms and a stepped circular barrel within the original section coordinates. It does not add a second renderer, use SHP/atlases, require image-to-model conversion, or multiply voxel density on every axis. It attempts readable major forms; it demonstrably fails to replace the original surface detail and light/shade successfully. Revision 1's closed track sides looked too solid. Revision 2 opens the track sides and corrects owner-panel symmetry/muzzle cap overlap; it is the user-reviewed B. Both immutable serialized revisions remain local; no third candidate is started.

`run-rhino-phase-a.mjs` injects geometry only into the three already-built meshes of its specifically spawned HTNK fixture. First it uses cloned **unchanged original geometry** as the control. Neither the VFS nor `VxlGeometryPool`/`VxlGeometryCache` is modified. Original section-object cache entries and persistent `geocache_` keys stay intact. Candidate validation binds content/source identities, revision, representation and builder version, checks the whole family before mutation, and limits geometry to 8 MiB. Invalid data ends the diagnostic before injection, leaving the original. This is not a production family fallback implementation.

Candidate buffer ownership is diagnostic-local; the original geometry is retained and restored before cloned controls/candidates are disposed. No candidate cache is persisted or ordinary instance activated. The recorded content key includes `HTNK`, candidate SHA, revision `2`, `section-mesh-v1` and `rhino-chamfer-2`. Multi-instance sharing/lifetime is NOT RUN and would remain a Phase B requirement if a future candidate were selected.

The actual Chrome run uses **VxlNonBatchedBuilder**. `Renderer.supportsInstancing()` currently queries `ANGLE_instanced_arrays`; the observed result is false. The batched builder's section transforms, palette-index/light/opacity attributes, shared material usages and `MeshBatchManager` geometry grouping were inspected, but **batched GPU candidate parity is NOT RUN**. There is no global batching override or shared-renderer fix. This is separate from the inherited indexed-SHP uniform issue, which remains unopened.

## Measurements and technical status

| Part | Original vertices / triangles / bytes | B revision 2 vertices / triangles / bytes | Original / B CPU build ms |
| --- | --- | --- | --- |
| Body | 9,296 / 6,799 / 416,244 | 5,088 / 1,696 / 193,344 | 20.263 / 4.455 |
| Turret | 2,444 / 1,769 / 109,212 | 396 / 132 / 15,048 | 5.707 / 0.277 |
| Barrel | 268 / 174 / 11,736 | 396 / 132 / 15,048 | 0.589 / 0.238 |

Original geometry totals **537,192 bytes**; B totals **223,440 bytes**. These are actual typed attribute/index arrays, not file-size estimates. Original meshes come from the monotone voxel builder; B uses explicit polygon faces. CPU times are single cold local constructions, not a stable performance benchmark. Lower buffer size and fewer polygons neither establish detail nor compensate for visual rejection. No higher-density voxel grid was authored; exposed-face counts apply only to the original voxel inventory, while candidate triangle counts describe its actual mesh.

The one-Rhino scene reports 12 draw calls for A and B. Textures remain 46 throughout: candidate geometry adds no textures. Original/restored scene geometry count is 52; holding three control clones and three candidate parts reaches 58. Explicit diagnostic teardown returns 58 → 52, leaves original references intact and keeps textures at 46. Match teardown clears the game reference. These are bounded allocation observations, not large-battle, multi-instance or driver/GPU recovery acceptance.

| Gate | Result |
| --- | --- |
| Visual value | **FAIL / REVIEWED_NO_DIRECTION_SELECTED**; user finds B lacks detail and light/shade |
| Projected silhouette-size preservation | **FAIL**; same local bounds but increased projected body extent/mass |
| Unchanged-original adapter and restoration | PASS; pixel-identical crops in all 10 pose/output sets |
| Original transforms, local bounds, fixed material state | PASS_DIAGNOSTIC_ONLY; recorded unchanged within each set |
| Runtime VXL/HVA identity and candidate validation | PASS; complete source binding before injection, synthetic rejection cases |
| Fixed-size static review | PASS; 42 images decode, 1200/600 widths, DPR 2, scripts disabled and enabled |
| Errors / GL / external requests | PASS; none in final source-validated run |
| Task geometry cleanup | PASS; six diagnostic geometries released, original restored |
| Existing targeted regressions plus synthetic Rhino tests | PASS; 37 tests / 711 assertions |
| Entry typecheck / isolated production build | PASS; `.artifacts/m1-3/build`, baseline chunk-size warning retained |
| Protected resources and user data | PASS_EXACT_EQUALITY |
| Phase B / ordinary playable override | NOT STARTED / NONE |

Early technical failures are retained: `control-v1` assumed batched mesh light attributes, then corrected the harness to read the actual ordinary material; the first review checker used an invalid numeric-leading CSS ID selector, corrected to `getElementById`; an initial synthetic rejection test accidentally aliased candidate/source objects, corrected by cloning its fixture. These were harness/test defects. `control-v2`, `candidate-game-v2`, `validation-game-v3`, `review-v2/browser-check.json` and final regression logs are the accepted diagnostic evidence. The visual failure remains, despite these technical passes.

Normal production, real movement/turns, firing/projectile origin, pointer selection, tilt/slopes/bridges, partial occlusion, dynamic owner/light/opacity changes, combined accepted Conscript/GAPOWR gameplay, batched GPU rendering, multi-instance lifetime, Windows, physical external monitors, manual play, sustained battles and GPU recovery are **NOT RUN in M1.3**. Their Phase B checks are not justified after this visual rejection. Prior M1.1/M1.2 results remain separate historical evidence.

## Reproduction and stopping point

Use existing staged `.local/assets/ra2/{ra2,language,multi}.mix`, accepted local setup, Bun 1.3.14, installed Chrome and Python/Pillow. Do not reimport or run source-install programs. Use new output directories; candidate and evidence creation refuses overwrite. The existing M1.2 preview server is reused only as the unchanged local static/asset server; no building experiment is invoked.

```sh
bun scripts/m1/extract-rhino.ts .artifacts/m1-3/source-fresh
bun scripts/m1/prepare-rhino-candidate.ts .artifacts/m1-3/source-fresh .local/hd-packs/rhino-phase-a/fresh
bun --bun vite build --outDir .artifacts/m1-3/build-fresh
M12_BUILD_DIR=.artifacts/m1-3/build-fresh M12_PORT=4014 bun scripts/m1/serve-power-plant-game.mjs
# In another terminal; an explicit diagnostic invocation, never an ordinary override:
M13_ORIGIN=http://127.0.0.1:4014 M13_SOURCE=.artifacts/m1-3/source-fresh \
  M13_CANDIDATE=.local/hd-packs/rhino-phase-a/fresh/candidate.json \
  M13_OUTPUT=.artifacts/m1-3/game-fresh bun scripts/m1/run-rhino-phase-a.mjs
python3 scripts/m1/build-rhino-review.py --run .artifacts/m1-3/game-fresh \
  --output .artifacts/m1-3/review-fresh
bun scripts/m1/check-rhino-review.mjs .artifacts/m1-3/review-fresh
bun test scripts/m1 scripts/m0/rendering.test.ts scripts/m0/desktop.test.ts scripts/m0/import.test.ts
bun run typecheck:entry
```

The commands reproduce the rejected design for inspection; they are not a recommendation or authorization to continue artwork. Ordinary browser startup stays original. Missing candidate selection runs only original/control calibration. Candidate absence, validation failure or teardown cannot install a persistent override.

Preserve the original Rhino and stop after Phase A. Any future Rhino correction should start from this feedback in **this same execution conversation**, with a newly selected bounded direction that addresses native-size detail and light/shade rather than broad planar simplification. Do not start Phase B, another asset or renderer experiment automatically. A separately selected, materially different objective can use a new conversation only when requested. No conversation, subagent, push or publication was created.
