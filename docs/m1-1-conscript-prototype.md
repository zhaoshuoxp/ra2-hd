# M1.1 Conscript HD Prototype

Prepared: 2026-09-15. **COMPLETE_BOUNDED_PROTOTYPE — accepted complete art, bounded macOS gameplay and actual 4K rendering verified; the user requested completion reporting and handoff.** See the [completion and acceptance report](m1-1-completion-acceptance.md) for the final scope and untested conditions. M0 formally closed after M0.4. This task is M1.1, not a further M0 milestone. Keep any corrections to this delivered step in the same execution conversation.

Follow-up: after the complete 301-frame candidate review, the user confirmed that the effect was satisfactory and instructed continuation. [Gameplay acceptance](m1-1-gameplay-acceptance.md) records that approval, local pack binding, actual-match checks and remaining limits. Earlier candidate defects remain historical observations; the current art gate is user-accepted as reviewed.

## Scope and current result

The existing engine now has an explicitly selected Conscript override path in `ShpBuilder` / `ShpRenderable`, a separate RGBA/remap material, whole-member validation and local diagnostic/gameplay entries. A loopback-only query explicitly selects the approved pack for offline skirmish; ordinary launches and accepted desktop applications remain original by default. Vehicles, buildings and campaigns remain separate targets. The user subsequently authorized selectable high-DPI rendering up to 4K; see [4K rendering](m1-1-4k-rendering.md) for current controls and validation. No publishing or push.

Read the completed [M0.4 assessment](m0-4-feasibility.md) and its [v2 resource contract](hd-atlas-contract.example.json) together with this report. The example JSON remains the historical synthetic draft; the prototype implements a bounded Conscript subset, not every proposed aggregate, cache or production-loading feature.

The staged `ra2.mix/conquer.mix` member `cons.shp` has canvas 76 × 96, 602 total frames and 301 visible frames. Source SHA-256: `b60c5527b82a6e317e4958344443c4bbd9b2139e693f4641c470ff3f15f1f9f1`. The calibration pack covers all 301 visible frames, uses the original palette colors at 2x density, and leaves all 301 original shadow frames on the indexed renderer. **It replicates original pixels; it is not newly authored HD detail.**

## Implementation

- `SpriteUtils.logicalSize` separates legacy logical geometry from physical atlas rectangles. Offsets, even-dimension padding, align, world scale and depth folds keep their original values. Density changes only UV sampling.
- `HdSpriteMaterial` extends the existing palette material so the actual merging batch still recognizes its palette and vertex multipliers. Base texels are sRGB; remap data is unfiltered linear data. The original light/opacity/alpha-test ordering and 16 remap shades remain in use. Batch clones share immutable page maps; dynamic HD uniforms remain live.
- Overrides enter `ShpRenderable` explicitly before mesh construction. Shadows receive no override. Frame numbers and game animation code are unchanged. Geometry cache identity now includes scale, alignment, camera rotation and pack identity. Frame/page changes retain palette, lighting and transparency state.
- `resolveHdSprite` accepts only `cons.shp` bound to decoded source metadata. Selection is 4x → 2x → original, or explicitly disabled. It validates schema/source/theater, complete frames, rectangles/gutters, hashes and sizes via the reader, remap channels, transparent padding and upload failure. It discards a failed candidate's textures before retrying and returns one attempt summary per candidate, never per frame.
- Page limits are `min(2048, actual MAX_TEXTURE_SIZE)`, eight pages and 64 MiB GPU per member. This one-member prototype does not load multiple packs. The calibration 2048 × 656 base/data pair uses 10,747,904 GPU bytes (10.25 MiB), excluding retained original textures, palettes and geometry.
- `desktop/profile.mjs` exports an explicit `validateHdPack` helper with regular-file/realpath containment, bounded sizes, SHA-256 checks and exact content-identified routes. The diagnostic server consumes it. Normal desktop profile selection, protocol/CSP and the retail VFS remain unchanged; desktop HD activation is not implemented.

## Evidence and limits

The calibration evidence below used renderer ratio 1. The subsequent [4K checkpoint](m1-1-4k-rendering.md) separately validates actual 3840x2160 gameplay output with unchanged unit/UI size.

All runtime evidence below is Chrome on this macOS host, using actual WebGL draws. Windows is NOT RUN. None of these checks constitutes authored-art acceptance.

| Check | Result | Evidence / qualification |
| --- | --- | --- |
| Synthetic ordinary and merging-batch comparison | PASS | 162 cases: 1x/2x/4x, three owner colors, dark/neutral/bright light and three opacity values; exact positions, channel difference at most 1 |
| Fractional alpha / partial remap | PASS | Coverage 0/128/255 and alpha 128 with opacity 0.65; independent linear-color oracle, tolerance 1 byte |
| Complete Conscript calibration | PASS | All 301 visible frames: equal body and original-shadow positions, GPU pixel difference 0 |
| Native camera | PASS | Uses `WorldScene.createCamera`, original world scale and rotation; no production camera changes |
| Density selection / rejection | PASS | Actual local 4x request falls to complete 2x; synthetic valid 4x, invalid sources, masks, missing files, bounds and upload failure covered by tests |
| Texture and material teardown | PASS for HD allocations | All HD pages released, zero geometries and cached materials after teardown. One texture allocation remains in both the pure-original control and HD comparison until context destruction. It is not an added HD allocation; its precise existing owner is not yet isolated. |
| Tests | PASS | Latest 4K checkpoint: 30 tests, 558 assertions across M1 and existing importer/rendering/desktop boundary tests |
| Typecheck and isolated production build | PASS | Build output is `.artifacts/m1-1/build`; existing `dist` and accepted application bundles preserved |
| Original-graphics 1v3 regression | PASS, bounded | Fixed MP01T4 seed, three Normal Libya bots, speed 3, 20-second warmup then 60-second trace; final tick 1607, active match, zero errors or external requests. No new duration or outcome acceptance claim. |
| Complete authored art | USER ACCEPTED | The user accepted the current 301-frame candidate after review; the approval receipt is bound to its report hash |
| Authored-HD gameplay | PASS_BOUNDED_MAC_GAMEPLAY | Actual 4x red/blue and 2x fallback matches verify native geometry, colors, original shadows, actions, selection, building occlusion and teardown; see the gameplay report |
| Prototype completion and handoff | COMPLETE_BOUNDED_PROTOTYPE | User requested completion reporting after actual 4K screenshot review and size clarification; broader platform/manual-play acceptance is not claimed |

Measured Conscript diagnostic canvas: CSS 960 × 540; drawing buffer 960 × 540; device pixel ratio 2; renderer pixel ratio 1; GPU maximum texture side 16,384. That historical calibration used one buffer pixel per CSS pixel. **The calibration alone establishes no Retina claim; actual 4K output is separately verified in the later report.** Its native camera bounds are approximately ±2896.31 horizontally and ±1629.17 vertically.

The viewer's controls scrub the archived sequence ranges at a fixed diagnostic rate. They do not instantiate the infantry simulation or certify its event-driven timing. The application animation/rules code is unchanged. The later authored-gameplay checkpoint separately exercises native HD selection, combat actions, selection, building occlusion and both atlas pages in real matches. Sustained multi-unit HD performance, repeated pack switching and GPU context recovery remain outside that bounded evidence. The one-page calibration alone does not certify those cases.

## Local artifacts and reproduction

Run from the repository root:

```sh
bun scripts/m1/extract-conscript.ts
bun scripts/m1/make-calibration.ts
bun test scripts/m1 scripts/m0/rendering.test.ts scripts/m0/desktop.test.ts scripts/m0/import.test.ts
bun scripts/m1/run-parity.mjs
bun scripts/m1/run-conscript.mjs
bun scripts/m1/run-conscript.mjs --serve
```

`--serve` prints a loopback-only viewer URL; stop it with Ctrl-C. The calibration browser/server processes were stopped after verification. The later authored-gameplay server remains available for user review as described in its report. The viewer is an engineering diagnostic with native-size original/calibration columns, not a finished HD preview.

Ignored outputs:

- `.local/hd-packs/conscript-calibration/1/`: complete 2x calibration manifest and base/data PNGs.
- `.artifacts/m1-1/gpu-parity.json`: synthetic GPU cases and fractional-color oracle.
- `.artifacts/m1-1/conscript-render.json`: full-frame comparisons, pure-original control and disposal evidence.
- `.artifacts/m1-1/conscript-calibration.png`: native-camera diagnostic screenshot.
- `.artifacts/m1-1/original-skirmish/`: unchanged-graphics regression data and screenshots.
- `.artifacts/m1-1/tests.log`, `typecheck.log`, `build.log`: checks.
- `.artifacts/m1-1/preservation.json`: comparison with the M0.4 completion snapshot. Existing installation files, staged files, accepted applications, `dist` and normal user profile have no changed recorded file metadata; source archive hashes match.
- `.artifacts/m1-1/imagegen-attempt.md`: initial attempted art prompt and service rejection. Later successful v3 samples and exports are documented in the follow-up readiness report.

## Completed M1.1 acceptance sequence

1. DONE: verified rendering foundation saved as local checkpoint `be55d60`, explicitly marked artwork and overall acceptance incomplete.
2. DONE for representative review: the user accepted the six-frame art and corrected resolution review. Those six samples remain byte-identical in the complete candidate review. They do not independently activate an override.
3. DONE for the current art gate: the user accepted all 301 candidate frames as reviewed. The complete 2x/4x authored pack is bound to the actual original source and validated before activation.
4. DONE for bounded local integration: actual authored-HD skirmishes exercise native size, team colors, original shadows, actions, selection and building occlusion. Original-graphics regression is retained as a separate control.
5. DONE for this bounded step: actual 4K screenshots and same-frame comparisons were provided, unchanged unit/UI size was clarified, and the user requested the completion/acceptance report for handoff. Untested conditions remain listed in the completion report; no broader hands-on or platform acceptance is inferred. A different unit/building/vehicle target starts only after the user's separate instruction.
