# M1.1 authored resource readiness

**Latest status:** the user accepted the complete candidate's appearance and instructed continuation. The current pack has passed bounded local gameplay checks; see [gameplay acceptance](m1-1-gameplay-acceptance.md). The earlier FAIL_NEEDS_CORRECTION records below are preserved as historical authoring observations and are superseded by the explicit user art acceptance, not by a claim that every recorded detail was repainted.

The user approved the v3 representative art direction and the correction that falling firing particles are metallic ammunition, not smoke. The rendering foundation remains committed at `be55d60`. At that checkpoint, full authored-art and actual-match acceptance remained open; the latest status is recorded above.

## Production probe

Two built-in image-generation attempts requested exact original frame placement and transparent alpha for the six representative frames. Both returned RGBA images, but both failed the read-only frame-boundary check: semi-transparent glow and occupied pixels remain outside the original declared rectangles. The second attempt specifically requested background removal and exact rectangle limits; it did not fix the issue. Neither candidate replaces the user-approved v3 style reference or becomes an active pack.

Local evidence is under `.artifacts/m1-1/art-production-probe/`:

| Artifact | Result |
| --- | --- |
| `validator-reference-control.json` | PASS_STRUCTURAL_ONLY: directly rasterized original coverage, alpha 0/255, no pixels outside declared rectangles |
| `validator-rgb-control.json` | FAIL as expected: the approved RGB review board has no transparent background |
| `alpha-probe-v1.json` | FAIL: generated alpha has coverage outside native frame rectangles |
| `alpha-probe-v2.json` | FAIL after targeted cleanup: coverage still extends outside native frame rectangles |
| `prompt-alpha-probe.txt`, `prompt-alpha-cleanup.txt` | Exact built-in image-generation requests |

The validator reports silhouette overlap and native-coordinate bound shifts without treating those metrics as user art approval. Canvas dimensions alone do not establish valid sprite positions or alpha. No generated artwork was locally edited during these checks.

## Complete-frame authoring plan

`scripts/m1/plan-conscript-art.ts` generates `production-plan.json` from the staged decoded Conscript metadata. The plan partitions all 301 visible frames into 14 non-overlapping authoring groups and preserves their sequence membership, trim origin, dimensions and legacy even padding. Native frame 85 is not referenced by the archived sequences but is nonempty; it remains required by the complete-member contract. The 301 original shadow frames remain separate and unchanged.

The plan is metadata, not an activatable pack. It does not claim any additional authored frames are complete.

## Authorized six-frame export

The user explicitly authorized local deterministic image processing: cropping, original-frame alpha constraints, remap extraction and 2x export of six review frames. `scripts/m1/prepare-authored-sample-export.py` has now run against the approved v3 board. It creates no runtime pack manifest and never enables incomplete artwork.

The first export exposed opaque board-color fill when original alpha was forced over the approved board. The corrected export removes the board's green matte before premultiplied downsampling, intersects authored alpha with original coverage and extracts remap data from red cloth. A source-derived shoulder band prevents brown coat pixels from being classified as team color. This extraction is specific to this board, not a general-purpose authoring solution.

The first converted review is preserved in `.artifacts/m1-1/native-sample-probe-v3/`. The current resolution review is described below:

- Six 2x RGBA base images and six remap data images, with preserved native trim origins and even padding; hashes are recorded in `review-export.json`.
- `comparison.png`: original, authored, blue remap, light-background and native-size comparisons. The 4x columns enlarge the 2x assets for inspection; they are not 4x authored assets. The native-size column is a downsampled static preview, not an in-game capture.
- `review.html`: native/2x/4x display and contrasting-background controls. Blue previews follow `Palette.remap` factors with diagnostic owner RGB (64, 128, 255); they do not certify actual-match palette behavior.
- `validation.json`: all six pass structural checks for original alpha boundaries, padding and remap channels/coverage. The approved input board remains unchanged. Art acceptance remains pending and actual-match acceptance is NOT RUN.

Visual inspection found no large opaque green fringe on the light-background review. The side-facing brown-coat remap false positive was corrected. Alpha-weighted coverage retains 77.5-85.5% of original occupied area: authored silhouettes are slimmer, and clipping is not proof of pose equivalence. The firing ammunition remains brass-colored, but its placement differs from the original; constrained exports lose some particle detail. This must be corrected before final artwork acceptance. No missing details were synthesized or silently filled with original artwork.

This was the status of the initial conversion. The user subsequently accepted the corrected six-frame resolution review and authorized expansion, as recorded below. Complete-art approval still precedes actual-match native-size, team-color, shadow, action, selection and occlusion validation; the original-graphics regression does not replace those checks.

## Reproduction

```sh
bun scripts/m1/plan-conscript-art.ts
python3 scripts/m1/inspect-authored-samples.py \
  .artifacts/m1-1/art-production-probe/alpha-probe-v2.png \
  --output .artifacts/m1-1/art-production-probe/alpha-probe-v2.json
```

The inspector exits nonzero on structural failure. Local processing was explicitly authorized in this conversation; the command-line flag records that authorization. Use a fresh output directory to preserve earlier exports.

```sh
python3 scripts/m1/prepare-authored-sample-export.py \
  --art .artifacts/m1-1/art-review-v1/conscript-samples-v3.png \
  --output .artifacts/m1-1/native-sample-probe-v3 \
  --user-authorized-image-processing
python3 scripts/m1/build-authored-sample-review.py .artifacts/m1-1/native-sample-probe-v3
```

The review builder validates exported coverage and data channels against decoded source metadata. These checks establish file structure only; visual correctness and real-renderer acceptance are separate gates.

## Resolution feedback and corrected review

The user found the artwork satisfactory and raised only the low apparent resolution of the interactive review. Record this as representative-art feedback, not full-member or gameplay acceptance. The old "Inspection 4x" control displayed a 2x export at 4x logical size; it could not recover details discarded during export. On a screen with device-pixel ratio 2, a 4x logical display needs 8 samples per logical pixel to avoid enlarging image samples. Asset density, display zoom and screen scale must be reported separately.

The updated exporter supports 2x, true 4x and a 10x source-detail reference, each sampled directly from the approved board. The 10x reference retains the board's sampling density and remains review-only; it does not extend supported game-pack densities. All six frames at all three densities retain the original coverage constraint, geometry metadata and complete-member activation prohibition. Prior 2x base/data image hashes are unchanged.

Current entry: `.artifacts/m1-1/resolution-review-v1/review.html`, built with `scripts/m1/build-density-review.py`. It defaults to Source detail, separates image resolution from display zoom, offers smooth/pixel inspection and contrasting backgrounds, and compares densities at identical display sizes. It reports when display zoom and screen scale require more samples than the selected image contains. A higher sample count alone does not establish artistic quality or exact original silhouette.

Validation: 18 frame/density exports pass structural checks. Six browser cases (three densities at screen scales 1 and 2) confirm actual image dimensions, constant display size, loaded images, absence of default-layout overflow and correct sampling notices. Native/8x display controls and pixel inspection were also exercised, with zero page errors or external requests. Evidence: `browser-check.json` and `review-retina.png` in the current review directory. The screenshot is browser review evidence, not a game-renderer Retina claim.

Reproduce with a fresh root directory, exporting and building a review for each density before building the combined page:

```sh
for density in 2 4 10; do
  python3 scripts/m1/prepare-authored-sample-export.py \
    --art .artifacts/m1-1/art-review-v1/conscript-samples-v3.png \
    --output ".artifacts/m1-1/resolution-review-v1/${density}x" \
    --density "$density" --user-authorized-image-processing
  python3 scripts/m1/build-authored-sample-review.py ".artifacts/m1-1/resolution-review-v1/${density}x"
done
python3 scripts/m1/build-density-review.py .artifacts/m1-1/resolution-review-v1
```

This correction improves review sampling and presentation. It does not change the game renderer, camera or logical unit size, produce the remaining authored frames, or establish actual-match acceptance. Previously recorded clipping limitations remain technical follow-up items rather than new user-reported art objections.

## Accepted samples and complete candidate expansion

The user accepted the corrected resolution review and instructed continuation. Representative review is complete; this acceptance does not extend to newly generated frames. The rendering checkpoint remains `be55d60`, with the six-frame tools at `237d54b` and resolution review at `f2f167d`.

`prepare-full-art-batches.py` subdivides the complete worklist into 30 production boards, each with at most 12 cells. Their union is exactly native frames 0–300, including unreferenced frame 85. Built-in `image_gen` authored all boards against the original pose layout and the accepted v3 style reference. The selected local workspace is `.artifacts/m1-1/full-art-v2/`; each batch retains its native reference, exact prompt, metadata and initial output. Three batches also retain a targeted revision and its exact repair prompt:

- Death 161–163: remove the second head/body and restore a wooden rifle stock. The obvious duplicate anatomy is repaired; alignment and continuity remain open.
- Crawl 110–121: restore head/feet direction. Direction improved, but several forearms/rifles still resemble boots and phase alignment remains inconsistent.
- Paradrop/cheer 292–300: restore the raised glove instead of a second rifle. The raised arm is now present; exact fist height and phase still need correction.

These revisions are selected through explicit `selectedArt` / `selectedPrompt` entries in the local worklist. Initial outputs are preserved. Earlier square-layout, black-pixel-removal and chroma-background probes remain under `full-art-v1`, `full-art-v3` and `full-art-v4`; none is selected for the complete candidate.

### Candidate review checkpoint and result (historical)

Entry: `.artifacts/m1-1/full-art-review-v1/review.html`. It supports archived action/facing ranges, play/pause, phase stepping, arbitrary frame access, native-size display, independent density/zoom, red/blue/remap previews, contrasting backgrounds, original pose comparison and the generated cell before alpha constraints. Default display zoom is 4x with source-detail sampling. New source-detail images use the actual board density of 6x, 7x or 8x; the six accepted samples retain their 10x references. These higher densities are review-only, not added game-pack densities.

All 301 candidates have original trim anchors and even padding at 2x/4x and source-detail densities (903 exports). Conversion uses the authorized deterministic crop, green-matte extraction, premultiplied BOX resampling and original-coverage intersection. New remap extraction uses authored red cloth within a two-native-pixel dilation of the original remap area, supporting prone poses. The six accepted frames use the previous base/data files byte-for-byte, including their existing remap method. Their new batch alternatives are explicitly labeled NOT promoted.

**Result: FAIL_NEEDS_CORRECTION for complete artwork.** Coverage completeness and structural export validity are established; visual correctness is not. [The correction register](m1-1-candidate-review-issues.json) records 12 issue or inspection groups. Open defects include additional idle/death weapons, malformed prone anatomy and rifle direction, muzzle-flash phases, non-firing ammunition, copied black ground fill and clipped/displaced details. Some issue ranges are audit ranges rather than a claim that every frame in the range is defective. Frames without a specific issue are not implicitly approved.

The 4x exports retain 61.97–96.92% of original alpha-weighted occupied area. This metric includes intended silhouette differences and original black pixels; it does not measure artistic correctness. The exporter does not invent missing detail or force all original occupied pixels opaque. Black source index 12 is not globally deleted because it also occurs in character detail. The review exposes both the unconstrained generated cell and constrained export so that clipping is visible.

### Validation

| Check | Result |
| --- | --- |
| Coverage / geometry / alpha / remap | PASS_STRUCTURAL_ONLY: 301 unique IDs, 903 exports; original trim, even padding, alpha inside original coverage, valid shade/data channels and remap inside alpha |
| Accepted sample preservation | All 36 accepted base/data files across six frames and three densities remain byte-identical |
| Export provenance | 2,709 base/data/blue image hashes verified; selected input and prompt hashes recorded; no identical 4x base-image hash groups |
| Layout reproduction | All 30 native boards and initial prompts reproduce byte-for-byte |
| Browser review | PASS_REVIEW_UI_ONLY: 3,010 base/data/blue/original images decode at declared dimensions, 70 action/facing loops exercised, six density/screen-scale cases, playback/pause, raw frame 85, blue and pixel inspection; zero page errors or external requests |
| Complete-art acceptance | FAIL_NEEDS_CORRECTION; targeted repairs are partial, not approval |
| Authored-HD gameplay | NOT RUN; activation remains false |

Evidence is `candidate-review.json`, `validation.json`, `browser-check.json` and the Retina review screenshots in the current review directory. No runtime pack manifest was produced and nothing was written to runtime `hd-packs`. The engine, source archive, original shadow frames, accepted desktop bundles and skirmish behavior are unchanged by this art expansion. Runtime regression checks were not repeated because this step changes only authoring/review tools and documentation.

### Reproduction and next gate

Run from the repository root; Pillow and NumPy are required. Authoring uses the built-in image tool, not the API/CLI fallback. Each selected prompt and input/output image is retained under the batch directory. Re-running generation may produce different artwork; layout preparation and local extraction are deterministic.

```sh
python3 scripts/m1/prepare-full-art-batches.py \
  --output .artifacts/m1-1/full-art-layout-fresh
# Author the generated boards with the built-in image tool and retain each output.
python3 scripts/m1/export-full-art-review.py .artifacts/m1-1/full-art-v2 \
  --output .artifacts/m1-1/full-art-review-fresh \
  --issues docs/m1-1-candidate-review-issues.json --user-authorized-image-processing
bun scripts/m1/check-full-art-review.mjs .artifacts/m1-1/full-art-review-fresh
```

At this historical checkpoint, the proposed next gate was targeted frame repair and complete animation review in this same conversation. The user subsequently accepted the current candidate and authorized actual-match integration, recorded in the gameplay report. The general batch prompt is insufficient for ambiguous tiny hands, rifles and prone anatomy; future corrections must state those parts and phase invariants explicitly. Do not promote all 301 candidates merely because the file count is complete. Actual-match integration follows complete-art approval and must separately verify native size, team colors, original shadows, actions, selection and occlusion.
