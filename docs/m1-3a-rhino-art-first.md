# M1.3a Rhino reference-guided artwork proof

Status: **ART_TARGET_ACCEPTED / RUNTIME_TRANSFER_UNVERIFIED**. The original Rhino remains active. No playable HD vehicle, override, production renderer change or Phase B is delivered. The current target is one primary-pose realism revision requested after the user found the first artwork too anime-like and model-like. The user explicitly accepted this primary realism revision after the native-size review: the version meets expectations.

## Baseline and scope

The checkout was verified at `a6ec515c01e59a313ae7405f98942c4442cbef6a`, branch `m0-2-stabilization`, initially clean. This follows `5486b51`; no reset or replacement checkout was used. The historical [M1.3 rejection](m1-3-rhino-feasibility-prototype.md) remains intact. M0 stays closed, M1.1 accepted, and GAPOWR visual satisfaction open with no M1.2a alternative promoted.

The execution prompt is `/Users/Aone/Documents/Codex/2026-09-10/referenced-chatgpt-conversation-this-is-an-2/outputs/m1-3a-rhino-art-first-execution-prompt.md`. Work was sequential, without subagents, push, publishing, new imports, Windows executables or packaging. All artwork and evidence remain ignored under `.artifacts/m1-3a/`. Only review/capture helpers and documentation are checkpointed.

## References and production method

Inspected the actual [original versus rejected geometry B](../.artifacts/m1-3/review-v2/4k-0-0-pair.png), [accepted Conscript representative artwork](../.artifacts/m1-1/art-review-v1/conscript-samples-v3.png), and original/HD Conscript native gameplay captures under `.artifacts/m1-1/4k-gameplay-v1/`. Read [art-production readiness](m1-1-art-production-readiness.md) and [M1.1 acceptance](m1-1-completion-acceptance.md). Conscript used reference-guided representative redraws followed by controlled export and native-size review; its historical attempts were not uniformly structurally successful. Rejected Rhino B replaced much of the original surface information with broad procedural forms. This proof uses actual authored raster images, not further subdivision of B.

New original captures used the preserved isolated M1.3 build, South Pacific, fixed seed `1700000000000`, one explicit cross-faction HTNK fixture beside the player's original MCV. Body/turret/barrel headings are 0° for the primary view and 180° for the complementary view. This is a diagnostic fixture, not evidence of normal faction production or gameplay acceptance.

For each pose and density, synchronous layers record untouched original, clean background, original shadow-only background, isolated tank against black/white, and restored original. Camera matrices, per-part projected bounds, tick, crop, density and hashes are in [capture metadata](../.artifacts/m1-3a/references-v1/result.json). Original and restored captures match exactly. Black/white coverage recovery produced transparent original reference layers; recompositing each over its shadow-only background exactly reconstructs the original image. Terrain and selection UI are not in the tank reference. The original shadow is reused only as a comparison aid, not a runtime shadow claim.

The primary original occupies 105×71 pixels in the 4K crop, or 52.5×35.5 CSS pixels. The complementary original occupies 105×69 pixels, or 52.5×34.5 CSS pixels. Reference boards are 1024×768 with an 8× nearest-neighbor presentation of those source pixels; enlargement does not create detail. [Reference metadata](../.artifacts/m1-3a/authoring-v1/reference-metadata.json) records crop bounds and board offsets.

### Generation history and exact provenance

The built-in image tool returned actual PNGs for all calls; no paid API, external model account or code-drawn substitute was used. Local reference images were inspected before submission.

| Call | Artifact | Role and outcome |
| --- | --- | --- |
| 1 | [Primary v1](../.artifacts/m1-3a/authoring-v1/primary-generated-v1.png) | Original pose authoritative; Conscript supports detail treatment; scene supplies context. Barrel and wheels read too heavy. |
| 2 | [Primary v2](../.artifacts/m1-3a/authoring-v1/primary-generated-v2.png) | One targeted correction for barrel thickness and exposed wheels; preserved as earlier evidence. |
| 3 | [Complementary v1](../.artifacts/m1-3a/authoring-v1/complementary-generated-v1.png) | Own original view authoritative, primary v2 supporting consistency. View-dependent disagreements remain. |
| 4 | [Current primary realism revision](../.artifacts/m1-3a/authoring-v2/primary-realism-v1.png) | One additional primary-only correction authorized by the subsequent request for more realism. No complementary regeneration. |

The initial three-call budget was exhausted before the subsequent user correction. Call 4 is recorded separately, not silently counted within that budget. Its brief asks for matte painted steel, restrained roughness, realistic surface response and reduced cartoon/toy presentation, while retaining the original reference. Conscript is not a style input for this realism correction. Exact prompts and reference/output hashes are preserved in [initial requests](../.artifacts/m1-3a/authoring-v1/generation-requests.json) and [realism request](../.artifacts/m1-3a/authoring-v2/generation-request.json), including the [exact realism prompt](../.artifacts/m1-3a/authoring-v2/prompt-primary-realism-v1.txt).

Current primary source SHA-256: `9162a8950bc397e26a806e87abf9a7c2e47fa4616507543ab75142cf310f5e38`.

## Native-size review and processing

Open the [static review page](../.artifacts/m1-3a/review-v2/review.html) at 100% browser zoom. It provides fixed-size side-by-side panels and a same-location radio toggle that works without JavaScript. Narrow windows scroll rather than shrink the tank. Every candidate comparison is labeled **2D ART COMPOSITE — NOT IN-ENGINE HD**. The complementary pose is retained in a clearly labeled prior-style section; it is not a second coherent view of the current realism target.

| Condition | Game CSS canvas | Actual drawing buffer | DPR | Renderer ratio | Each crop source | Review panel CSS |
| --- | --- | --- | --- | --- | --- | --- |
| 4K | 1920×1080 | 3840×2160 | 2 | 2 | 720×520 | 360×260 |
| 1080p | 1920×1080 | 1920×1080 | 2 | 1 | 360×260 | 360×260 |

The game world viewport is 1752×1048 CSS pixels; crop origin is `(816,384)`. Original panels are actual renderer captures; candidate panels are static composites, not new engine renders. Each pair has identical scene layers, owner color, lighting condition and sampling density. This is not physical-monitor 4K validation.

Direct pairs: [primary 4K](../.artifacts/m1-3a/review-v2/primary-4k-pair.png), [primary 1080p](../.artifacts/m1-3a/review-v2/primary-1080p-pair.png), [earlier complementary 4K](../.artifacts/m1-3a/review-v2/complementary-4k-pair.png), [earlier complementary 1080p](../.artifacts/m1-3a/review-v2/complementary-1080p-pair.png). A 4K pair file must display at 720×300 CSS pixels to retain gameplay scale; opening it at 1440×600 is an enlargement. The static page enforces the intended scale. Enlarged detail and alpha-inspection panels are supplementary only.

Both raw generated images are 1448×1086 RGBA. Deterministic processing clears alpha values 1–7 globally, leaving every other coverage value unchanged, crops transparent margins, applies one uniform scale, centers horizontally and aligns the bottom to the original tank envelope. No original silhouette mask, nonuniform stretch, warp or code-painted detail is used. Premultiplied-alpha Lanczos samples directly from the selected source into a 64×48 CSS review canvas.

| Target | Clean occupied source | Source samples / CSS pixel | Review-only 2x | Review-only 4x |
| --- | --- | --- | --- | --- |
| Current primary | 1140×777 | 21.89 | 128×96 | 256×192 |
| Earlier complementary | 1164×778 | 22.55 | 128×96 | 256×192 |

No upsampling is needed. The 4K composite uses the 2x export; the 4x asset export is separate from output resolution. Primary cleanup removes 8,517 faint pixels with total alpha area equivalent to 66.31 opaque source pixels; complementary cleanup removes 7,694 with area 59.88. Original raw outputs remain untouched. [Export metadata](../.artifacts/m1-3a/review-v2/export.json) records exact scales, translation, alpha bounds and image hashes. Primary registered bounds are approximately `(155.708,115)`–`(207.792,150.5)` CSS versus original `(155.5,115)`–`(208,150.5)`. Similar outer bounds do not prove matching silhouette or mass.

### Observed visual limitations

The realism revision reduces smooth plastic highlights, adds darker joints and rougher armor response, and separates the dark tracks from the lighter hull. The red owner panel remains readable against the terrain. However, the hatch shape/height, exposed wheels and distribution of turret mass still differ from the original and can read as a model. Mottled wear may be excessive; much of that detail disappears at native size. The large source image therefore overstates the visible gameplay benefit. There is no visual PASS or claim of faithful geometry.

The earlier complementary barrel projects farther ahead of the hull than in its original reference. Hatch/deck details and red-panel interpretation disagree between the generated views. It predates the realism correction and must not be presented as proof of a coherent new vehicle. Alpha was inspected on light and dark backgrounds; there is no large opaque background or clipped barrel in the delivered exports, but soft boundaries and changed shape remain visible. Keeping the original shadow cannot establish compatibility with the altered silhouette.

## Bridge to an actual vehicle — assessment only

The existing `.artifacts/m1-3/source-v1/` exports retain occupied voxel coordinates, palette color indices, normal indices/tables, section spans/bounds and HVA matrices. Body `htnk` has 4,816 voxels, 36 distinct colors and mode-2/36-entry normals; turret `htnktur` has 1,501 voxels, 29 colors and mode-2 normals; barrel `htnkbarl` has 155 voxels, one color and **mode-4/245-entry normals**. Each uses one `DUMMY01` section and one identity HVA frame. The barrel observation corrects the earlier report's blanket mode-2 description without rewriting its historical conclusions.

The current VXL builder/section material derives shading from palette indices, per-voxel normals and VPL lookup, then applies owner color and scene effects. The 256-color palette, 16 team-remap entries and 32 VPL lighting rows are not arbitrary RGB/PBR roughness materials. The rejected primitive proof discarded much of the original structure and shading data despite retaining outer bounds.

If the art target is explicitly accepted, the preferred next bounded proof starts from original per-part occupancy, colors, normals and transforms. Preserve body/turret/barrel structure and independent aim; conservatively refine a small set of armor planes, recesses and track boundaries, then compare a few actual-renderer poses against the approved target. Surface palette choices and normals may carry some of the requested light/shade separation. Roughness, arbitrary mottling and generated highlights cannot simply be copied through the present material.

A lit PNG supplies neither unlit albedo nor depth, normals or unseen surfaces. Treating its highlights as surface color and applying VPL lighting again risks double shading. No automatic image-to-3D method is validated here. An independent-part sprite alternative would require facing coverage, turret/body combinations, depth and occlusion, consistent scene lighting and shadows; that would be a separate implementation task. Neither route was built. **RUNTIME_TRANSFER_UNVERIFIED** remains true even if the user accepts the image.

## Checks, preservation and checkpoint

- **PASS_ORIGINAL_REFERENCE_CAPTURE:** four pose/density sets; exact restoration; no page/console/WebGL errors or external requests.
- **PASS_STATIC_EXPORT_CHECKS_ONLY:** all four isolated original layers reconstruct untouched scenes exactly; direct source sampling and registration recorded. This is not a silhouette or artwork-quality pass.
- **PASS_NATIVE_CSS_AND_STATIC_TOGGLE_ONLY:** 19 images decode; 1200- and 600-pixel browser widths; JavaScript disabled and enabled; 720×520 primary source displays at 360×260 CSS; zoom 1 and DPR 2; no external requests or page errors. See [browser evidence](../.artifacts/m1-3a/review-v2/browser-check.json).
- **PASS preservation:** before/after snapshots match for original installation metadata and three archive hashes, imported assets, all HD packs, M1.1/M1.2/M1.2a/M1.3 evidence, support files, accepted apps, normal `dist` and normal user profile. Derived protected files are SHA-256 checked; the full original installation is metadata-inventoried, not fully content-hashed. See [preservation result](../.artifacts/m1-3a/preservation-result.log).
- Production source, rules, logical geometry, camera, timing and active overrides are unchanged. Broad engine suites were **NOT RUN** because this proof changes only isolated tools, art and documentation. Windows **NOT RUN**; Intel Mac excluded. Gameplay, motion, independent aim, owner-color variants and runtime transfer for this artwork are **UNVERIFIED**.

Recorded local sequence, using existing installed dependencies and isolated build (reference/authoring/export directories refuse replacement):

```sh
python3 scripts/m1/preserve-m13a.py before
M12_BUILD_DIR=.artifacts/m1-3/build M12_PORT=4015 bun scripts/m1/serve-power-plant-game.mjs
M13_ORIGIN=http://127.0.0.1:4015 bun scripts/m1/capture-rhino-art-references.mjs
python3 scripts/m1/prepare-rhino-art-references.py
# Built-in image-tool calls are recorded in generation-request JSON; not a shell/API step.
python3 scripts/m1/export-rhino-art-proof.py --output .artifacts/m1-3a/review-v2 \
  --primary-source .artifacts/m1-3a/authoring-v2/primary-realism-v1.png
python3 scripts/m1/build-rhino-art-review.py
bun scripts/m1/check-rhino-art-review.mjs
python3 scripts/m1/preserve-m13a.py after
```

These are the recorded commands, not instructions to overwrite retained evidence. The initial clean checkout was checked before the preservation helper itself was created; its saved Git snapshot also lists the then-new task helpers. A reviewed local checkpoint contains only the six new helpers and this documentation amendment. The ignored `.artifacts/m1-3a/final-state.json` records the resulting commit and final clean status. Only the loopback server and isolated browsers started by this task are stopped.

## Visual decision — accepted

The user explicitly accepted the current primary realism revision in this conversation after reviewing the native-size comparison, stating that this version meets expectations. Record **ART_TARGET_ACCEPTED / RUNTIME_TRANSFER_UNVERIFIED** for the source SHA-256 above. The earlier complementary pose, rejected geometry B and earlier illustrated primary revisions are not promoted by this decision. The observed limitations above remain documented; acceptance does not assert exact silhouette parity.

The review page and generation/export metadata are retained as presented, including their historical pending labels; this decision supersedes those labels for the accepted primary source only. The ignored `.artifacts/m1-3a/art-target-acceptance.json` binds the decision to that exact source. No artwork pixels were changed during acceptance recording.

Keep the original Rhino active. No additional headings, runtime implementation, active override or Phase B is authorized by this visual acceptance alone. The next separately selected bounded task would be an actual-renderer transfer proof preserving original structure and independent body/turret/barrel transforms, followed by another native-size comparison against this accepted target. Keep Rhino corrections and acceptance in this conversation.
