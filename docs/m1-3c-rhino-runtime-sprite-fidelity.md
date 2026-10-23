# M1.3c Rhino single-pose runtime sprite fidelity

**SINGLE_POSE_RUNTIME_RENDER_PASS / TARGET_FIDELITY_ACCEPTED / STANDARD_SCALE_ACCEPTED.** The accepted artwork now renders on an actual HTNK entity in the world scene. This is an explicit diagnostic, not a normal asset override or a complete vehicle. **INDEPENDENT_TURRET_NOT_IMPLEMENTED / FULL_VEHICLE_NOT_IMPLEMENTED.** The original Rhino remains active in normal startup.

Started from verified clean `2afd483` on `m0-2-stabilization`. Preserve M1.3a primary-art acceptance, M1.3b rejection, M1.4 production C and the confirmed reference height 900. Read the complete M1.3c execution prompt, repository guidance, related Rhino/M1.4 reports and actual material, batching, depth, vehicle and shadow ownership. No subagents, generation, repainting, source-asset edits, packaging, push or publication.

## Review and run

Open the [fixed native-size review](../.artifacts/m1-3c/review-v1/review.html) at 100% browser zoom. Each row is **A original runtime / 2D REFERENCE — NOT RUNTIME / R actual world rendering** at one tick, pose, owner, light, camera and output density. The primary rows use the normal 900 reference at High and 1080p. Historical target size is a separate diagnostic row. Every crop stays 420x320 CSS; narrow windows scroll. Direct cropped/full PNGs, source export, four depth controls and measurements are linked. Runtime images are direct renderer captures, only cropped for review.

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun scripts/m1/play-rhino-sprite.mjs
```

The launcher verifies the isolated build, adapter and artwork hashes; starts a loopback preview; opens a disposable visible Chrome session; and prepares the existing 4x Conscript/GAPOWR fixture plus two diagnostic HTNK entities. One Rhino is initially visible. Use **A / R** or **Alt+1 / Alt+2**. The initial scene is frozen for comparison. Selection and camera movement remain available; **Resume gameplay** allows normal commands and exposes whole-vehicle fallback outside the supported pose/state. The diagnostic does not freeze ordinary aiming rules. Ctrl+C closes the owned browser/server. `M13C_PORT=4039` selects another unused port. `--check` runs the headless verification and exits. Browser zoom should remain 100%.

Normal application entries never import the adapter or load this image. The additional two local resource routes exist only when the diagnostic server explicitly enables `M13C_DIAGNOSTIC=1`; no artwork is embedded in the application build.

## Identity and registration

| Resource | SHA-256 |
| --- | --- |
| Selected `target-zoom2.png` | `5057d3d610ee4bfdf3c5a3784f4588d31ea63acbd2496c939823631187efa523` |
| Authored `primary-realism-v1.png` | `9162a8950bc397e26a806e87abf9a7c2e47fa4616507543ab75142cf310f5e38` |
| Retained transparent `primary-4x.png` | `045fab22c03abf380d07a3d10b70c51fb1105f1e4ea6f9aef45fddd938c2f1c7` |

The selection receipt and all three hashes are verified. `.artifacts/m1-3c/candidate/primary-4x.png` is a byte-identical copy of the retained 256x192 export. There is no new resampling or alpha normalization. `candidate/provenance.json` retains the original source/export metadata: 1448x1086 source, global removal of alpha 1..7, cleaned bounds `[157,203,1297,980]`, uniform scale `0.04568854568854569`, and the original premultiplied Lanczos export. The accepted pose is body 0 degrees / turret 0 degrees; the earlier complementary image remains unaccepted and unused.

The 64x48 logical canvas starts at `[-31,-32.1]` relative to the original entity anchor. This derives from the earlier `[149,108]` export origin and `[180,140.1]` projected anchor within the same reference crop. The existing `Coords.ISO_WORLD_SCALE` and camera rotation convert it into world geometry. Native body size, selection/collision/pathfinding bounds, VXL/HVA transforms, muzzle/weapon definitions, health, cost and timing are unchanged. Artwork already differs somewhat from the original silhouette; this proof does not impose an original-alpha mask or invent unseen views.

## Actual rendering contract

The isolated TypeScript adapter directly imports the current `MergedSpriteMesh`, `HdSpriteMaterial`, `HdSpriteEdges` and `SpriteUtils`. It creates a one-item merged world batch under the entity's position parent. It does not use the unbatched diagnostic material path. There is no DOM tank, HUD image, post-render composition, VPL lighting or procedural vehicle reconstruction. The optional HTML bar only controls the experiment.

C's exact shared filter resolves the zero remap mask, decodes sRGB, accumulates alpha-weighted linear color, clamps the full frame and encodes output once. Its opaque pass retains the 0.995 threshold; fractional coverage uses the existing sorted, depth-tested, premultiplied edge pass without depth writes. Edge attributes/index buffers are shared, as in production C. Its eight-texel footprint limit is unchanged. The diagnostic uses no inferred red-pixel mask: **OWNER_REMAP_UNVERIFIED**, fixed reference red owner only; another owner/color falls back.

Painted shading is preserved. Reference scalar light is normalized to one; subsequent scalar changes use `(1 + current SHP extra light) / (1 + reference SHP extra light)`, separately per channel. No second geometric/specular light is applied. Non-unit opacity, invulnerability, cloak/warp/submerge, destruction, firing, bridge/ramp/elevation/tilt and unsupported body/turret pose use the complete original family. Full light-condition and owner-color coverage remain **UNVERIFIED**.

Only valid active candidates substitute all three original part materials with private colorless, non-depth-writing clones. Original geometry, transforms and shadow casts remain intact. A, unsupported states and disposal restore the exact original material objects. The entity update/dispose hooks are restored on release. Multiple proof instances share one decoded image and textures by reference count; disposing one does not invalidate another.

## Why a separate depth proxy is necessary

The retained export's near-opaque interior is predominantly alpha **252–253**, not 255: 2,230 texels have alpha 252 and 13,071 have alpha 253; only 71 are 254 and 427 are 255. C correctly sends most of this unchanged artwork through its fractional pass. The engine's ground-shadow receiver renders later at its existing order 5. Without an interior depth surface, that ground shadow darkens the tank image. A no-shadow control reproduced the cause; no global lighting/material change was needed.

The bounded correction has two explicitly approximate parts:

1. Start with the engine's split sprite depth geometry. Where its vertices would extend below the local ground, move them only along the camera view axis until local height is 0.1 world units. Screen positions and scale remain unchanged, verified by projection tests. This produces a ground-clamped folded sprite, not recovered tank geometry.
2. Add a **colorless coverage depth proxy** sharing that batch's buffers. It reuses C's exact full-coverage filter with depth testing/writes and alpha test **0.985**. This catches the measured near-opaque interior plateau. It never changes source alpha or color. The C color/edge passes keep their original thresholds and blending. Genuine low-coverage contours have no proxy depth; transparent corners have none.

The proxy is separately instrumented and is not mislabeled as C's opaque color pass. No render-order increase, disabled depth test, exposure/blur/sharpen adjustment or original-VXL depth blocker is used. Original VXL remains the disclosed live shadow approximation, with no baked ground/background. The three original shadow sections draw exactly once in A and R; the raster/proxy do not cast another shadow.

**PASS_BOUNDED_SHAPED_SPRITE_DEPTH:** open ground, partly occluded GAPOWR/yard positions, fully hidden construction-yard positions and two overlapping supported tanks were tested. At yard `[0,0]`, the measured C opaque and fractional color contributions both fall to zero while the unobstructed control remains nonzero. Partial and two-tank controls retain a strict subset of unobstructed pixels. The test separates opaque and fractional draws; most interior artwork is also fractional because its original alpha is 252–253. Depth comparisons retain the proxy in both color-on/off controls so a shadow change is not counted as tank color.

Frozen positions use diagnostic placement and are restored; some full-coverage controls overlap a building footprint deliberately and do not assert legal pathfinding. The two-tank stress control uses a disclosed temporary render-position offset, then restores it. These cases do not certify arbitrary depth intersections, slopes, large crowds or a fully playable vehicle. The saved depth PNGs are actual world renders. Original shadows and authored silhouette need future complete-vehicle review.

## Display and fidelity evidence

Primary evidence: `.artifacts/m1-3c/capture-v8/result.json`, game wrapper `game-v8/result.json`, and review measurements `review-v1/review.json`. All three comparison rows are at tick 662; A restoration is byte-exact. The primary view uses CSS 1920x1080, DPR 2, presentation 1600x900 and world presentation viewport 1432x868. Camera, projected logical bounds, UI and world coverage are identical across output presets.

| Condition | Output / renderer ratio | Actual world GL viewport | Art quad in CSS | Reference/runtime mean maximum-channel difference |
| --- | --- | --- | --- | --- |
| Standard High | 3840x2160 / 2.4 | `[0,76,3436,2083]` | 76.78x57.59 | 1.02 RGB levels |
| Standard 1080p | 1920x1080 / 1.2 | `[0,38,1718,1041]` | 76.78x57.57 | 1.30 RGB levels |
| Historical target High | 3840x2160 / 2.4 | `[0,76,3436,2083]` | 127.97x95.99 | 0.97 RGB levels |

These are transparent **canvas** bounds; the registered visible artwork is approximately 62.5x42.6 CSS at the standard view and 104.2x71 at historical size. The historical camera factor is calculated from current projected/CSS bounds (approximately 1.6667 here), not blindly set to 2. Its 0.03-CSS difference from 128 arises from integer GL viewport rounding. Normal camera state is restored exactly. This is not a new gameplay zoom or a reopening of the accepted 900 reference.

The trace records default-framebuffer color draws and separate 8192x8192 shadow-target draws. Readback/reference coordinates account for the **actual integer GL viewport**, not presentation coordinates used directly as output pixels. The CPU reference applies the same area-footprint/color/coverage policy to the unchanged export over the same-tick original shadow background. It is explicitly synthetic; the runtime column is not created with it.

Approximately 96.67%, 95.27% and 97.24% of reference-covered pixels in the three rows agree within two channel levels. Remaining differences concentrate on coverage/depth/shadow boundaries and raster precision; this is not an exact image-match claim. There are **zero changed pixels in transparent reference corners**, and **zero changed pixels outside both Rhino quads plus a four-output-pixel margin**. Thus the matched Conscript/GAPOWR, terrain and UI regions retain pixel parity with C active. These numerical results do not substitute for user judgment of panels, seams, hatch, tracks, barrel, highlights, edges, contact or recognizability.

## Checks, cost and preservation

- **43 tests / 900 assertions PASS:** new provenance/pose/registration/fallback/shared-lifetime/entity-disposal tests plus relevant HD family/material/coverage, presentation, resolution, pointer/cursor and import isolation regressions. Entry typecheck and the standalone adapter typecheck pass.
- Synthetic GPU colors/coverage pass before artwork loading: alpha 255 and 254 retain `[128,64,32]`; alpha 128 blends to `[64,32,16]` over black; alpha zero contributes nothing. Two-texel black/white minification produces `[188,188,188]`, confirming linear-light averaging rather than an sRGB-code average of 128.
- Missing-response injection and invalid bytes preserve the complete original, including byte-exact rendered restoration. Unsupported body/turret states fall back as a family. Hidden entity state leaves no raster draw. Disposal/re-entry and two-instance shared lifetime pass; textures release at the last disposal. The missing response is a deterministic loader-level 404 injection, not deletion of a real asset.
- Actual click selects HTNK 1382. Panning/restoration, a 1440x900 resize retaining height 900, and output switching pass. A normal one-tile northward command yields a moving, active candidate at body/turret 0, original color writes disabled and all three live shadows retained. Other turning/firing behavior is fallback, not accepted HD motion.
- Two allocated proofs, one normally visible, eight existing Conscripts and GAPOWR form the disclosed small load. Each visible candidate adds three draws: depth proxy, C interior and C fractional coverage. Texture bytes are 196,608 plus eight metadata bytes, shared across instances. Each instance has 496 merged buffer bytes plus 184 source geometry bytes; edge/proxy views add no attribute copies. Hidden original meshes still incur their original geometry/shadow work. No per-frame texture decode/allocation, geometry-view replacement or shader recompilation was observed. Across 48 frozen render/finish samples, median was about 1.08 ms and p95 1.31 ms; these are instrumented small-scene timings, not a battle performance claim.
- Fresh isolated Vite build passes; **all 153 files equal the accepted production-C build bytes**, confirmed independently. The unchanged build's chunk-size advisory remains non-blocking. The diagnostic bundle and image are served separately. The visible launcher smoke passes Alt+2 and clean exit; the final `--check` run (`check-1789713836525`) also passes depth, real straight movement, fallback and final resource release after the lifecycle-hook correction; the fixed-CSS review passes at widths 1440 and 600 with JavaScript disabled, all local links/images and no external requests.
- **15,495 protected entries PASS** before/after, covering installation metadata and three archive hashes, imports, all accepted packs/art, prior Rhino/M1.4 evidence, applications, normal `dist` and normal user profile. No protected file is intentionally modified. Complete original-installation contents are not all hashed; the inventory and three selected archive hashes retain the existing preservation scope.

Windows, physical panel/compositor fidelity, Electron HD packaging, sustained battles, independent turrets, multiple headings, firing/slopes and complete vehicle gameplay remain **UNVERIFIED / NOT IMPLEMENTED**.

## Reproduction and retained failed drafts

```sh
bun run build --outDir .artifacts/m1-3c/build-fresh
# The delivered launcher binds the reviewed build directory via build-identity.json.
# Do not overwrite retained evidence; choose fresh capture/review paths for reruns.
M13C_DIAGNOSTIC=1 M12_BUILD_DIR=.artifacts/m1-3c/build M12_PORT=4041 \
  bun scripts/m1/serve-power-plant-game.mjs
# Separate terminal:
M12_ORIGIN=http://127.0.0.1:4041 M12_SHORT=1 \
  M12_OUTPUT=.artifacts/m1-3c/game-fresh M13C_OUTPUT=.artifacts/m1-3c/capture-fresh \
  bun scripts/m1/run-power-plant-game.mjs
python3 scripts/m1/build-rhino-sprite-review.py \
  .artifacts/m1-3c/capture-fresh .artifacts/m1-3c/review-fresh
bun scripts/m1/check-rhino-sprite-review.mjs .artifacts/m1-3c/review-fresh
```

V1 failed an overly thin synthetic fixture whose sampling footprint crossed its own boundary; the corrected interior controls pass. V2–V4 exposed ground shadow over the mostly fractional-alpha artwork, rather than silently declaring fidelity success. V5 added the separate proxy but still exposed the below-ground half of the folded plane. V6 added projection-preserving ground clamping and passed the bounded depth cases. V7 added loader/linear checks; its straight movement tile was occupied, recorded NOT RUN. V8 uses a clear straight fixture tile, verifies real movement and corrects the depth-image capture to show the restored occluder. All earlier evidence remains retained and is superseded by the final review, not rewritten into PASS.

**Stop at the visual gate.** Ask separately whether actual runtime R preserves the accepted target's appearance and whether the standard 900 view is satisfactory. Neither decision is inferred from prior static art or M1.4 acceptance. If both are accepted, the next separately authorized experiment would use authored body/turret components at two body headings and two turret headings, checking four combinations and hidden surfaces/remap/overlap/shadows. No such authoring, renderer or production activation starts in this step.

## Visual acceptance — 2026-09-18

The user explicitly confirmed satisfaction in response to the review question covering actual runtime R appearance and clarity at the standard 900 reference. This closes both visual gates for the reviewed **single-pose proof**: `TARGET_FIDELITY_ACCEPTED / STANDARD_SCALE_ACCEPTED`. The [acceptance receipt](../.artifacts/m1-3c/visual-acceptance.json) binds the decision to the reviewed implementation, build identity, adapter, artwork, capture result and native-size review files by SHA-256.

The original review, captures and final-state receipt retain their historical pending labels. This acceptance supersedes those labels without rewriting the evidence. Recording started on clean `fad916b`; all subsequent M1.4 shroud, animation, pause/HUD corrections and delivery acceptance are preserved. This documentation-only step neither rebuilds the older Rhino proof on that newer baseline nor claims combined regression evidence.

The original Rhino stays active in normal startup. Fixed-owner remap, approximate depth/shadows and incomplete vehicle behavior retain their documented limits. Independent turret, multiple headings and production activation remain unimplemented and require a separate instruction. The next suggested bounded experiment is separately authored body/turret components with two body headings and two turret headings, testing the four combinations before any wider production. It has not started.
