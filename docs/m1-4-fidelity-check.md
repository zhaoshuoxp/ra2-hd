# M1.4 bounded fidelity check

**PASS_SOURCE_EXPORT_ATLAS_IDENTITY_AND_MATCHED_CAPTURE / PRESENTATION_900_USER_CONFIRMED. CONSCRIPT_VISUAL_REVIEW_PENDING / GAPOWR_VISUAL_REVIEW_PENDING.** No artwork, material, shader, geometry, camera, gameplay or Rhino implementation changed in this extension. The user explicitly confirmed retaining reference height 900 on 2026-09-17: 1600x900 at 16:9 and 1440x900 at 16:10. This is now the presentation reference for later Rhino comparisons; it is not authorization to implement Rhino or asset appearance approval.

Open the [native-size source/export/game comparison](../.artifacts/m1-4/fidelity/review-v5/review.html). The existing runnable build and `bun scripts/m1/play-display-review.mjs` remain unchanged. The [main M1.4 report](m1-4-display-scaling-and-hd-review.md) retains the full display/input/build evidence and launch instructions.

## What was compared

The unchanged production build renders one frozen local skirmish at tick 646, with existing complete 4x packs. The bounded samples are Conscript frames 0, 8 and 164 (standing, walking and firing poses), and normal GAPOWR body `ggpowr.shp` frame 0 plus activity `ggpowr_a.shp` frame 2. Frame pins provide identical poses without changing animation assets; they are not evidence that a walking/firing action occurred. The earlier M1.4 actual-action, damaged and buildup checks remain separate evidence. No additional damaged/buildup fidelity claim is made here.

All columns use 1920x1080 CSS, a measured 3840x2160 buffer, DPR 2 and the confirmed 1600x900 presentation. Thus each presentation pixel has nominally 1.2 CSS pixels and 2.4 output samples. The actual world GL viewport is recorded; integer viewport rounding and the actual merged draw geometry determine sample positions. Using only an unbatched model's projected bounds misses the existing batch transform. The final comparison reads the actual draw batch, with no fitted image translation or enlargement of the game capture.

| Frame | Selected source crop | Actual 4x export, including padding | Nominal displayed rectangle, CSS pixels |
| --- | --- | --- | --- |
| Conscript 0 | 180x280 | 72x112 | 21.6x33.6 |
| Conscript 8 | 190x310 | 80x128 | 24x38.4 |
| Conscript 164 | 230x280 | 96x112 | 28.8x33.6 |
| GAPOWR body 0 | 327x358 | 336x368 | 100.8x110.4 |
| GAPOWR activity 2 | 171x323 | 176x336 | 52.8x100.8 |

The source column removes only the selected board's original green matte, then integrates premultiplied RGBA over each destination pixel footprint. It averages sRGB code values, matching the export convention; it is a controlled filter reference, not a proposed production filter. The export column samples the actual on-disk atlas crop with the same integration and fractional placement. Transparent even-dimension padding is included consistently. The game column is a direct canvas capture of the production renderer. Each column uses the same captured background, including retained original shadows. Controls retain authored red; remap and lighting are applied only in the supplemental prediction and actual game columns.

GAPOWR is shown both as a two-layer composite and as separate actual-renderer layers with only the counterpart's HD surfaces hidden. Native shadows, all materials and lighting remain active. Every visibility/frame substitution restores the full PNG byte-for-byte before the game resumes. The review page embeds 23 images, needs no JavaScript/network, fixes crops at half their physical output dimensions and scrolls on narrow windows. View at 100% browser zoom; DPR-2 hardware gives direct output-pixel mapping. Other display densities may resample in the browser. Direct PNGs and the labeled enlarged `inspection-contact.png` are inspection aids, not native-size acceptance.

## Provenance and where detail changes

The selected Conscript samples use `conscript-samples-v3.png` (SHA-256 `cc647b24c24bc220ecb9bc5223ab714660812dab00d662719205332d53eee29d`), retained byte-for-byte by the later complete candidate. They do not use the later batch board's same-numbered replacements. The current manifest, complete-candidate review hash and separate user acceptance receipt are verified. Historical pre-acceptance text inside a candidate report is not substituted for that receipt. GAPOWR source selection is traced through the original frame export reports to their actual generated boards. Complete per-frame source/report/export/data/manifest/atlas hashes and rectangles are in [fidelity.json](../.artifacts/m1-4/fidelity/review-v5/fidelity.json).

1. **Authored source to export:** Conscript falls from 10 source samples per logical pixel to 4. Fine face/helmet shading, coat folds and thin weapon details are averaged at this step. GAPOWR's selected source is only about 3.89 samples per logical pixel; making the 4x pack slightly resizes it and cannot add missing detail. Fine tower trim, pipework and small metallic highlights have limited samples even before display reduction. Reconstructing the original matte, resize and coverage policy reproduces all five exported base images exactly.
2. **Intentional silhouette constraint:** the native original-coverage mask removes 2.17%, 2.72% and 4.43% of pre-mask alpha area in the three Conscript frames; body/activity remove 2.80%/4.01%. This is concentrated on outer contours and protrusions, not a uniform loss of texture resolution. Percentages measure alpha area at export density, not perceptual detail. The source column intentionally shows coverage before this constraint. No silhouette repair or repaint was attempted.
3. **Export to atlas:** every reviewed base and remap crop equals the actual packed crop exactly; atlas hashes match manifests and runtime identities/UVs match those pages. **No extra resampling, compression loss or incorrect frame selection was found at packing for these samples.**
4. **Display sampling and color policy:** a 4x pack is sampled at about 2.4 output pixels per logical pixel here. The production nearest filter has no mipmaps, so thin lines and highlights can be skipped or become jagged; the controlled area average instead softens them. Higher local contrast is not necessarily greater fidelity. Red regions use the intentional 16-shade owner-color ramp (533/547/456 Conscript and 8314/1027 GAPOWR export texels), replacing some authored color variation. Current linear-light multipliers are 1.025 for Conscript and 0.825 for GAPOWR, then sRGB output; the darker building is not evidence of lost geometry or a lower-resolution texture.
5. **Alpha and layer composition:** the actual alpha-test threshold is 0.05, with opaque surviving fragments. Partial authored edge alpha therefore differs from the soft reference composite. No nonzero alpha texel is discarded by this threshold in the three Conscript exports or body 0; 130 very-low-alpha activity texels are discarded. Of 38,536 surviving partial-alpha activity texels, many are alpha 254 from original export rounding, not genuinely soft edges. The active layer changes 13,784 output pixels inside the body prediction's footprint; covered body detail is intentional composition, not disappearance in a downsampler. The isolated layers make that distinction reviewable.

After including the captured nearest sampling, owner palette, alpha policy, lighting and color conversion, the supplemental CPU main-surface prediction matches all three Conscript samples and the activity sample within two RGB levels per channel at every predicted visible pixel. Body 0 matches **99.9877%** (three boundary pixels differ). There are no actual changed pixels outside the predicted main-surface coverage. Those three lower-contour pixels remain a boundary/depth/rasterization residual, not a diagnosed rendering defect; the simplified predictor does not emulate every depth test. Mean maximum-channel residuals are 0.10-0.19 levels across the five samples. This is bounded evidence against an additional broad detail loss in upload/material/rendering, not proof that the artwork meets the user's visual target. Earlier measured world draws also ruled out a hidden low-resolution world intermediate in these conditions.

The useful distinction is that Conscript's fine detail is already reduced by the 10-to-4 export and small display footprint; GAPOWR's source density is already near the exported density, and final sampling, darkening, remap and activity coverage dominate the subsequent differences. Preserve all existing artwork. No alternative filter, lighting treatment, remap policy or asset revision is promoted.

## Validation and reproduction

Final captures: `.artifacts/m1-4/fidelity/capture-v3/result.json`; actual-match wrapper: `game-v3/result.json`. Both existing complete packs report density 4 with no fallback, no unexpected page/console/GL errors or external requests. All ten HD textures release and the game reference clears on teardown. Browser review checks pass at 1440- and 600-wide viewports with JavaScript disabled and all image sizes/links verified.

The original M1.4 build is preserved and its saved inventory reverified. **36 targeted tests / 839 assertions PASS; entry typecheck PASS; isolated production build PASS.** All 153 rebuilt files equal the delivered build's SHA-256 inventory. The build retains its non-blocking chunk-size advisory. Protected installation/assets/packs/prior evidence/app/profile entries (13,689), plus all 319 prior M1.4 files, pass exact preservation checks. Only harness scripts, this report and the current-stage README/AGENTS/main-report notes change. No Rhino file changes.

```sh
bun scripts/m1/serve-display-review.mjs
# Separate terminal; use new directories for every run:
M12_ORIGIN=http://127.0.0.1:4034 M12_SHORT=1 \
  M12_OUTPUT=.artifacts/m1-4/fidelity/game-fresh \
  M14_FIDELITY_OUTPUT=.artifacts/m1-4/fidelity/capture-fresh \
  bun scripts/m1/run-power-plant-game.mjs
python3 scripts/m1/build-display-fidelity.py \
  .artifacts/m1-4/fidelity/capture-fresh .artifacts/m1-4/fidelity/review-fresh
bun scripts/m1/check-display-fidelity.mjs .artifacts/m1-4/fidelity/review-fresh
```

Early evidence remains saved: capture v1 froze before normal selection-overlay removal; v2 allowed that update; v3 additionally records actual merged draw vertices. Review v1 rejected an initially unhandled flipped V coordinate; later diagnostic drafts used unbatched projection, exposing an alignment discrepancy. The final review uses the measured production batch transform and GL viewport, not an empirically fitted shift, and preserves exact restoration checks. These were diagnostic corrections, with no production patch.

**Stop at visual review.** The 900-high size decision is closed by the user's explicit confirmation. Conscript and GAPOWR visual satisfaction remain separate pending decisions in this task. Windows and physical panel/compositor fidelity are unverified. Rhino implementation remains outside M1.4.
