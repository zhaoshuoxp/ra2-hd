# M1.3b Rhino bounded runtime-transfer proof

Status: **ART_TARGET_ACCEPTED / RUNTIME_TARGET_NOT_MET / REVIEWED_NO_DIRECTION_SELECTED**. The user requested the next step after accepting the M1.3a primary realism target. This authorizes a bounded actual-renderer transfer proof, not automatic full-vehicle production or default activation. The original Rhino remains active. Work stays sequential and local, in the same conversation, with no subagents, push or publication.

**Assessment: target fidelity is not met.** The candidate renders as separate three-dimensional body, turret and barrel parts and approaches the target's matte armor treatment. It does not reproduce its authored panel boundaries, hatch profile, wear or track detail. At native size the improvement is limited, while geometry cost rises substantially. Do not expand this candidate into a full vehicle on the strength of technical checks. The accepted art target remains the reference; the user subsequently found the runtime result apparently much lower-resolution and no better than the original. No runtime direction is selected.

## Baseline and preservation

Started from verified clean `8d350d6f90354ec3af4767ea5b8ea93ded89fdb0` on `m0-2-stabilization`. Read current repository constraints, the [M1.3a report and acceptance](m1-3a-rhino-art-first.md), original VXL/HVA extraction, geometry builders, palette/VPL material and prior isolated capture tools. Inspected the actual accepted artwork, whose SHA-256 remains `9162a8950bc397e26a806e87abf9a7c2e47fa4616507543ab75142cf310f5e38`.

Only new tools, tests and documentation are tracked. All candidate data, captures and review files are ignored under `.artifacts/m1-3b/`. No production source, active pack, default override, rules, normal build output, importer or application bundle is modified. The preserved isolated `.artifacts/m1-3/build` serves the existing engine on loopback port 4016; fresh browser contexts do not touch the normal user profile.

Before/after preservation snapshots match for the source installation metadata and three core archive hashes; imports; all HD packs; M1.1, M1.2, M1.2a, M1.3 and M1.3a evidence; upstream support; accepted applications; normal `dist`; and normal user profile. Protected derived files are content-hashed. The full original installation is metadata-inventoried rather than fully content-hashed. See [preservation result](../.artifacts/m1-3b/preservation-result.log). Historical Rhino rejection, accepted Conscript, retained GAPOWR and M1.2a's no-promotion decision remain intact.

## One bounded transfer route

The source is the existing original `htnk`, `htnktur` and `htnkbarl` section export, not rejected primitive B. The harness verifies source content against the live decoded VXL and HVA before installing any candidate geometry. It binds the candidate to the accepted artwork hash, original source hashes, HVA hashes and generation-helper hash.

The new surface extractor samples original occupied voxels at half-voxel spacing and constructs surface-net faces. Each face inherits the nearest original occupied voxel's palette region. Each vertex blends locally averaged original normals at 80% with the occupancy surface gradient at 20%. Material boundaries use discrete indices, avoiding interpolation through unrelated palette entries or team colors. All three parts retain their original coordinates, native bounds, HVA matrices and independent runtime parents. This is source-derived surface refinement, not a model inferred automatically from the generated image. Smoothing may still alter projected shape and lose fine source features; equal outer bounds do not prove silhouette parity.

Two palette calibrations preceded the final proof, all retained in separate ignored directories. `candidate-v1` mapped armor index 70 to 71. `candidate-v2` mapped it to 74. Both retained the original material and remained too bright. Inspection of the actual VPL tables showed why: index 70 reaches white index 15 from lighting row 22 onward; index 71 reaches it from row 24. Merely choosing a darker base entry does not provide the target's matte surface response.

The final `candidate-v3` restores the original palette indices and adds a narrowly scoped candidate-only material clone. For armor palette indices 64–79, it multiplies the VPL half-vector highlight term by 0.15. The diffuse term, global scene lighting, team-remap range 16–31, non-armor response and other units are unchanged. This is a local approximation of matte armor, not a general PBR material or measured roughness. The material patch is checked against the exact expected shader expression and has its own program cache key. Original materials remain available and are restored when the diagnostic ends.

There is no texture projection from the lit PNG, baked image lighting, billboard, generated normal/depth map or invented unseen view. The accepted target's richer structural and surface detail consequently remains largely untransferred. No new image-generation call was made.

| Part | Original vertices / triangles | Candidate vertices / triangles |
| --- | --- | --- |
| Body | 9,296 / 6,799 | 45,102 / 63,884 |
| Turret | 2,444 / 1,769 | 11,121 / 17,273 |
| Barrel | 268 / 174 | 992 / 1,790 |
| Total | 12,008 / 8,742 | 57,215 / 82,947 |

The candidate has about 9.5× the original triangles and 2,557,422 geometry bytes versus 537,192 original bytes. These are costs, not proof of HD quality. No multi-unit performance claim is made. The actual native-size evidence does not currently justify this expansion cost.

## Actual renderer evidence and fair comparison

The isolated South Pacific match uses the same fixed seed and cross-faction HTNK fixture as prior diagnostics. It is not proof of normal Rhino production. The three representative pose combinations are body/turret `0°/0°`, `180°/180°` and `0°/90°`; the last demonstrates independent aim without turning the body. No extra artwork headings were generated.

Each pose captures original A, an unchanged-geometry clone control, runtime candidate R and restored original synchronously, at the same simulation tick. Candidate R is a true engine render with real geometry, depth and its own cast shadow. Original control and restored images are byte-identical to A. Camera, viewport, per-part world matrices, logical selection bounds, palette binding, extra lighting, opacity, shadow flag, clipping and depth-write state match within each pair; geometry and the explicitly declared candidate material response are the intended differences.

| Condition | CSS canvas | Drawing buffer | DPR | Renderer pixel ratio | Scene crop pixels | Review crop CSS |
| --- | --- | --- | --- | --- | --- | --- |
| 4K | 1920×1080 | 3840×2160 | 2 | 2 | 720×520 | 360×260 |
| 1080p | 1920×1080 | 1920×1080 | 2 | 1 | 360×260 | 360×260 |

The world viewport is unchanged at 1752×1048 CSS pixels. These are actual renderer output conditions, not physical external-monitor validation. The tank retains its approximately 52.5×35.5 CSS envelope in the primary view. Do not judge the 720×520 raw crop at full file width as native gameplay size.

The current capture differs in background pixels from the earlier M1.3a capture, so the accepted target T is recomposited using the new same-tick original shadow-only background. The already accepted 1x/2x exports and their original anchor are reused without repainting, rescaling, warping or masking. T is clearly labeled **2D ART COMPOSITE — NOT IN-ENGINE HD**. Its reused original shadow is only a comparison aid, not runtime compatibility evidence. R uses its actual geometry-generated shadow. This keeps scene context and output density equal without pretending that the accepted PNG itself is running as a vehicle.

Open the [static native-size review](../.artifacts/m1-3b/review-v1/review.html) at 100% zoom. It contains original/target/runtime primary panels, original/runtime complementary and independently aimed panels, and same-location radio toggles without JavaScript. Narrow windows scroll instead of shrinking. The only enlarged inspection is labeled 4× logical size.

Direct files: [1080p target/runtime](../.artifacts/m1-3b/review-v1/1080p-target-runtime.png), [1080p original/runtime](../.artifacts/m1-3b/review-v1/1080p-0-0-original-runtime.png), [4K target/runtime](../.artifacts/m1-3b/review-v1/4k-target-runtime.png). Pair files at 4K must display at 720×300 CSS pixels; use the page for enforced native scale.

## User feedback and explanation

After the completed comparisons were presented, the user found R apparently much lower-resolution and saw no improvement over the original. Record **RUNTIME_TARGET_NOT_MET / REVIEWED_NO_DIRECTION_SELECTED** for this runtime route. The accepted M1.3a art target is unchanged. Stop this route rather than promoting its technical checks.

Both panels have identical output pixel density and gameplay display size. Their information content differs: the accepted PNG contains newly authored panels, seams, wear and coherent painted shading, whereas R still derives its detail and palette layout from the low-resolution original voxel asset. Surface refinement and additional triangles do not reconstruct the target's authored structure. This is the primary failure of the attempted transfer, not a reason to lower the target or enlarge the tank.

Edge sampling also differs. The accepted image is premultiplied-alpha Lanczos-downsampled from a much larger authored source. `src/engine/gfx/Renderer.ts` does not request antialiasing; the installed Three renderer defaults to `antialias = false`. The unchanged engine path therefore does not provide equivalent edge filtering. This helps explain the rougher pixel edges, but antialiasing alone cannot create the missing panel/hatch/surface detail. No new renderer or building experiment is started to disguise that gap.

The review and capture metadata remain preserved as presented, including their historical pending labels. This recorded user feedback supersedes those labels. The ignored `.artifacts/m1-3b/runtime-review-decision.json` binds the outcome to the candidate identity and accepted target hash. No artwork or runtime candidate is modified after feedback.

## Checks and limits

- **PASS_BOUNDED_RENDERER_TRANSFER_CHECKS:** six pose/density sets in [final capture result](../.artifacts/m1-3b/game-v4/result.json), identity binding, same-tick controls, camera/transform/selection parity, exact original restoration, no page/console/WebGL errors or external requests. Final candidate source and measurements are in [candidate summary](../.artifacts/m1-3b/candidate-v3/summary.json).
- **PASS_DIAGNOSTIC_PART_TRANSFORMS:** at fixed body heading, the body world matrix is unchanged while turret and barrel matrices change together. See [independent-part checks](../.artifacts/m1-3b/independent-part-checks.json). This is rendered-pose validation, not combat aiming acceptance.
- **PASS targeted numerical tests:** 3 tests, 990 assertions cover convex surface winding and bounds, unchanged source data, discrete owner/dark palette regions, and nonuniform native coordinate scales with unit normals. See [test log](../.artifacts/m1-3b/surface-tests-final.log).
- **PASS review export:** differences between A and R are confined to the tank/shadow region in all six pairs. A target image is only shown for the accepted primary pose. Source hash is verified. No target for unapproved alternate headings is invented.
- **PASS browser review:** 29 images load; native 360×260 CSS size; DPR 2 and zoom 1; wide and narrow windows; JavaScript enabled/disabled; no external requests or page errors. See [browser checks](../.artifacts/m1-3b/review-v1/browser-check.json).
- **PASS cleanup:** original geometry and original materials restored; diagnostic geometry count drops from 58 to 52 on disposal, textures stay at 46; the match leaves cleanly. Only task-owned isolated browsers and the port-4016 server are stopped.
- **NOT RUN / UNVERIFIED:** movement, firing, damage, cloak/effects, owner-color variants, occlusion gameplay, multi-unit performance, batched vehicle path, Windows, packaged applications and physical 4K display. Intel Mac remains excluded. This does not reopen campaigns, other vehicles, buildings or packaging. Broad engine suites were not rerun for this isolated proof.

Recorded final commands (directories are immutable; do not overwrite retained evidence):

```sh
python3 scripts/m1/preserve-m13b.py before
M12_BUILD_DIR=.artifacts/m1-3/build M12_PORT=4016 bun scripts/m1/serve-power-plant-game.mjs
bun scripts/m1/prepare-rhino-transfer.ts
bun scripts/m1/run-rhino-transfer.mjs
bun test scripts/m1/rhino-surface-transfer.test.ts
python3 scripts/m1/build-rhino-transfer-review.py
bun scripts/m1/check-rhino-transfer-review.mjs
python3 scripts/m1/preserve-m13b.py after
```

Earlier captures and calibration sources remain in `game-v1` through `game-v3`; final evidence is `game-v4`, using `candidate-v3`. Source copies are saved with each capture. Concurrent unrelated changes to `scripts/m1/run-power-plant-game.mjs` and the new `scripts/m1/run-power-plant-zoom.mjs` appeared during this task and were left untouched and unstaged. The Git checkpoint contains only Rhino tools/tests/documentation; `.artifacts/m1-3b/final-state.json` records its identity. No original or generated artwork enters Git.

## Decision gate — closed without a runtime direction

The completed comparisons and user response establish no worthwhile improvement for this route. Keep the original Rhino active and preserve the accepted realistic 2D art target. No full-vehicle production, default override or new approach is selected. A future attempt would need deliberate part-by-part model and surface authoring to reproduce the accepted structure and material detail; simple resampling, smoothing, more polygons or increased output density are insufficient. No tested automatic conversion is established here. Keep follow-up decisions in this conversation.
