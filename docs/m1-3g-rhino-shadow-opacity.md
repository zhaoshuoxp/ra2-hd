# M1.3g follow-up — translucent Rhino shadows

Status: `SHADOW_OPACITY_RUNTIME_PASS / SHADOW_OPACITY_VISUAL_ACCEPTED`.

The user explicitly confirmed that the reported shadow problem is fixed. This closes the visual gate for this correction. The separate receipt `.artifacts/m1-3g-shadow/visual-acceptance.json` identifies the accepted build and verifies all 89 delivery evidence files and 153 build files. Historical review media, HTML report and delivery receipt remain unchanged.

The user reported that `warped / hd` and `cloaked-own / hd` retained a conspicuously dark shadow beside and through the translucent hull. Starting checkout: `edd41ac`, clean. Concurrent Conscript edits subsequently appeared and were preserved; the delivered build is isolated from them using a tracked baseline snapshot plus only the two Rhino renderer files. Source and output identities are saved separately. This correction stays in the existing Rhino task and preserves the accepted artwork and reference height 900.

## Cause and correction

Native VXL geometry still casts the Rhino's shadow. Its visible material opacity changes to 0.5 during warp or friendly cloak, but an ordinary depth shadow map ignores that opacity. The authored body faded while the native projected silhouette remained fully opaque.

The HD Rhino now owns a private shadow-depth material during translucent states. It applies a fixed light-map coverage pattern shared by the body, turret and barrel, so overlapping sections do not accumulate independent opacity. The existing PCF shadow filter produces a lighter projection. There is no temporal randomness, global shadow-opacity change, new shadow artwork or receiver replacement. Native geometry, transforms, terrain/bridge receivers and clipping remain in place.

Fully opaque HD and Original use their exact prior depth materials. Turning HD off or disposing the Rhino restores those references; the private material is disposed with the vehicle. The three native caster flags are untouched. The shared batched-caster path cannot use a per-Rhino depth override safely, so translucent Rhino uses complete-original fallback on that path. The measured Chrome/WebGL2 path uses individual VXL meshes and remains HD. This does not claim new support for batched transparency or airborne blob-shadow attenuation.

## Native-size comparison

Left: previous HD shadow behavior. Right: corrected HD shadow. Both render the same paused native state at identical camera, geometry and output density: 1920 × 1080 buffer/CSS, DPR 1, renderer ratio 1, logical 1600 × 900, camera zoom 1. Each column is an unscaled 400 × 200 framebuffer crop with labels outside the pixels. The before control restores only the original shadow-depth material; the artwork renderer and native state are identical.

![Before and after: warp, friendly cloak, detached shadow, normal and restored](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g-shadow/review-final/comparison.png)

The elevated diagnostic separates the projection from the hull. Relative to a no-caster control, measured linear-light shadow darkening is approximately 59% of its previous value at native opacity 0.5. This is filtered coverage, not a claim of exactly 50% darkness at every edge pixel. Normal and restored HD captures are pixel-identical before/after; Original captures are pixel-identical in all five checked states.

## Actual runtime video

The following paired video renders Original and corrected HD at the same native animation time. It includes warp, restoration and destruction. Each side is an unscaled 400 × 268 crop, with a separate label strip. This is a controlled renderer/state fixture; the ramp/bridge clip uses actual native movement orders.

<video controls preload="metadata" width="800" height="300" src="/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g-shadow/review-final/states.webm"></video>

<video controls preload="metadata" width="640" height="360" src="/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g-shadow/review-final/movement.webm"></video>

## Run and validation

From the repository root:

```bash
bun scripts/m1/play-rhino-shadow-game.mjs --states
```

Use the Warp and Own cloak controls with HD selected. Without `--states`, the launcher opens the ordinary game with Original as the initial default; select Options → Rhino HD (local pack) → HD. The launcher checks the pinned isolated build, uses a disposable Chrome profile and owns its loopback server. Existing game/app bundles and the earlier state launcher remain unchanged.

- TypeScript entry check, isolated production build and 63 M1 tests / 18,918 assertions: PASS.
- Five before/after states: unchanged camera/native transforms, exact Original restoration, exact full-opacity HD parity, zero GL errors and zero browser console errors.
- Private shadow material disposal and original material restoration: PASS; all 16 artwork references return to zero.
- Full state regression: 18 Original/HD pairs, native ramp/bridge movement, enemy-cloak hiding, warp/iron effects, explosion/temporal removal and completed sinking/disposal.
- Evidence: `.artifacts/m1-3g-shadow/check-final/`, `state-regression-final/`, `review-final/` and the pinned build identity. The portable HTML report embeds its images and both videos.
- Protected payload comparison: all existing artwork, optional pack, prior M1.3g and other milestone evidence, original/imported resources, application bundles, `dist` and user data remain unchanged. Independent Conscript work added a new `.artifacts/m1-1/state-validation/` tree; the preservation receipt reports those additions separately, requiring all pre-existing entries to remain exact.

The reviewed native PCF shadow-coverage correction is visually accepted. Shadow-quality presets, physical external 4K, long battles and packaged applications are not newly certified. No artwork, gameplay rule, camera scale, production-C setting, other asset or desktop packaging changed. Keep any later Rhino corrections in this same task because they concern the same accepted asset. This acceptance starts no further implementation and does not broaden other milestone acceptance. No push or publication.
