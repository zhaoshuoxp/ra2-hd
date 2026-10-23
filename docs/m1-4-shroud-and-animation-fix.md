# M1.4 unexplored-terrain and power-plant animation corrections

The user subsequently accepted this power-plant animation. A reported boundary grid, paused speed control and money-text clarity are addressed in the [next bounded correction](m1-4-pause-options-and-shroud.md); the existing launcher now opens that newer build. This report and its preserved evidence describe the preceding correction.

The user reported bright horizontal/vertical speckles throughout unexplored terrain and excessive movement of GAPOWR's central machinery. The corrected isolated build closes black-mask sampling gaps and anchors building structure to existing reference frames while retaining local fire/glow variation. **TECHNICAL_PASS / ANIMATION_VISUAL_REVIEW_PENDING.** Reference height 900 and accepted production C remain active. No source artwork or exported pack was overwritten; Rhino implementation and its independent review status remain intact.

## Run and review

From the repository root, run `bun scripts/m1/play-production-c.mjs`. This now verifies and launches `.artifacts/m1-4/followup-visual/build/` in an isolated Chrome profile with both existing 4x packs. Ctrl+C closes the owned browser/server. The historical production-C build and evidence remain preserved.

Open the [fixed-size before/after review](../.artifacts/m1-4/followup-visual/review-v2/review.html) at 100% browser zoom. It includes actual unexplored terrain and eight matched phases for each normal/damaged cycle. Controls play at 150 ms per phase for inspection; the playable build retains native timing. Damaged comparisons are render-only controls, separately backed by natural damage/repair/destruction gameplay regression. Each animation crop is 420x320 CSS pixels from an 840x640 output crop at the confirmed 900-high presentation. Images never shrink to fit.

## Causes and corrections

**Unexplored terrain — REPRODUCED.** Original shroud sprites are raster diamonds with neutral-white palette index 254 outside the diamond. Fractional presentation sampling exposed gaps throughout the tiled mask. Constant black on the same geometry eliminated speckles, distinguishing mask coverage from mesh cracks or HD soft edges. A private derived shroud atlas extends only exterior neutral texels by one original texel and samples within frame texel centers. Interior gradients, logical geometry and exploration state remain unchanged. Display coverage is conservatively wider by one native mask texel at the diamond exterior. This correction applies only to shroud.

**Central machinery — REPRODUCED.** Exported authored active frames themselves change metal caps, pipes and structure between phases. For the exact reviewed active manifest `8a678cc4ff5eb91558c1c0cb48abe5c20cf0d7ec3c52205eaff1421c799b1316`, load-time policy `stable-structure-effects-v1` derives runtime pixels from existing frames: normal structure uses frame 0; damaged structure uses frame 8. Coverage and remap are fixed to those references. Existing phase RGB varies only in the common warm emissive interior of the upper core/tubes, excluding silhouette, rims, team panels and lower machinery, with an inward feather. This is bounded compositing without new painting or material/shader changes; it suppresses structural drift without manufacturing new animation artwork.

Both reference frames remain pixel-identical in actual before/after full-scene rendering. The 4x normal/damaged effect masks contain 1,195/1,042 texels; 2x masks contain 242/201. Processing occurs once at load, with no new GPU pages or per-frame image processing. Runtime identity carries the policy suffix. Future manifests are unaffected; validation/upload failure retains complete-family fallback. Body, buildup, indexed shadows, other effects, native timing and simulation rules retain their prior behavior.

## Validation

All evidence is under `.artifacts/m1-4/followup-visual/`.

| Check | Result |
| --- | --- |
| Full-cover actual framebuffer, six presets x three camera offsets | PASS: corrected bright pixels 0 in all 18 cases; old path reproduced up to 319. Excludes two output pixels at viewport border; bright means any RGB channel greater than 3. |
| Actual 4x runtime cycle textures | PASS: zero lower-structure, alpha or remap changes; local light variation remains. Original lower-structure differences total 142,186 normal and 133,844 damaged texels across phases. |
| Matched before/after scenes | PASS: same tick, camera, size, density, models and units; GL errors 0. |
| Rendered temporal residual | Outside effects, at most 16 isolated pixels differ by one 8-bit channel step between atlas positions. This measured rounding residual is recorded; exact framebuffer equality across all phases is not claimed. |
| Natural gameplay | PASS_BOUNDED_GAMEPLAY: construction, moving infantry, selection, layered occlusion, damage, repair, selling, rebuilding, destruction, resolutions and cleanup. |
| Fallback | PASS: rejected 4x building pages select complete 2x family with correction active; rejecting both densities restores original family. Conscript remains 4x. |
| Automated checks | 42 tests / 890 assertions PASS; entry typecheck PASS; isolated build PASS, 153 files. Existing chunk-size advisory only. |
| Review page | PASS: 34 images, both eight-phase controls, fixed CSS sizes at 1440- and 600-wide windows, no external requests. |
| Final visible-browser entry | PASS: default C and corrected animation active; 1200x828 CSS / 2400x1656 buffer / DPR 2 / logical height 900; no page errors or external requests. |
| Preservation | All 14,372 protected entries match, including retail resources, packs, earlier milestone evidence including M1.3c, apps, dist and normal profile. All 1,711 earlier M1.4 files retain their hashes. |

Evidence: `fixed-v1/result.json`, `fixed-game-v1/result.json`, `review-v2/pixel-checks.json`, `review-v2/browser-check.json`, `gameplay/result.json`, `fallback-2x/result.json`, `fallback-original/result.json`, `tests.log`, `typecheck.log`, `build.log`, `build-identity.json`, and preservation JSON files. The incomplete `review-v1` stopped on strict zero-difference assertion; `review-v2` explicitly reports the observed one-step residual.

Windows, physical external-panel checks, long battles, and subjective animation amplitude remain **UNVERIFIED / REVIEW_PENDING**. This is not new full-art acceptance. Continue feedback in this task because it is the same M1.4 correction; stop before further art, Rhino work or packaging.

## Reproduction

Use fresh output directories to preserve evidence. Run `bun run typecheck:entry` and targeted tests including `scripts/m1/visual-corrections.test.ts`, then `bun run build --outDir .artifacts/m1-4/followup-visual/build-fresh`. Serve using `M12_BUILD_DIR` and `M12_PORT` with `scripts/m1/serve-power-plant-game.mjs`.

For the comparison run `scripts/m1/run-power-plant-game.mjs` with local `M12_ORIGIN`, fresh `M12_OUTPUT`, `M12_SHORT=1`, `M12_DENSITY=4`, `M12_CONSCRIPT=4`, and fresh `M14_CORRECTION_OUTPUT`. The old-mask control reads retained `diagnosis/result.json`; original active pages are fetched and verified against manifest hashes. Generate with `python3 scripts/m1/build-visual-corrections.py <comparison-output> <fresh-review-directory>` and validate with `bun scripts/m1/check-visual-corrections-page.mjs <fresh-review-directory>`.

For natural gameplay omit `M12_SHORT` and the correction hook; set `M12_OCCLUSION=1`. For short fallback runs set `M12_REJECT=4 M12_EXPECT_DENSITY=2` or `M12_REJECT=all M12_EXPECT_DENSITY=1`. `M14_C_SMOKE=1 bun scripts/m1/play-production-c.mjs` checks the final visible-browser entry and exits automatically.
