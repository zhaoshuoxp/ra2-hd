# M0.1 handoff and feasibility

Historical handoff. M0 closed after M0.4; M1.1 is complete, and the 2026-09-15 current-stage amendment records [M1.2 Allied Power Plant bounded completion](m1-2-power-plant-prototype.md). The instructions below describe the earlier M0.1 handoff, not the current milestone.

Latest review: M1.2 technical checks pass; visual satisfaction remains open. Return to the existing main planning conversation with [the M1.2 decision handoff](m1-2-review-handoff.md). No next implementation is selected.

Subsequent selection: [M1.2a native-size clarity](m1-2a-native-size-clarity.md) has produced its bounded diagnostic review. User feedback: all improvements are limited and differences small. No candidate is selected; retain the current baseline and return the result to the existing main planning conversation. Further M1.2 corrections remain in the original execution conversation; no full-family revision or new content task is selected.

## Next bounded implementation task

**Profile and correct one reproducible Safari/WebKit frame stall.**

The `ParadropPlane` startup prerequisite is now isolated in `src/offline/retailCompatibility.ts`; the original-graphics 1v3 run starts. See `retail-compatibility.md` for its single addition and the unmodified archived-field check.

The aircraft prerequisite is now guarded in `PipOverlay`: an absent optional flight-helper name is not sent to the animation factory. Normal American `AMRADR` → `ORCA` production, selection, takeoff and movement passed in Chrome with original FALC geometry. Vehicle shadows and the dropped vehicle render phase were also repaired. See [rendering-followup.md](rendering-followup.md) for the actual evidence and remaining limitations.

Next, capture frame timing and normal input latency in native Safari if remote automation is already available, or use the optional `?stats=1` readout for a manual trace. Keep native Safari and Playwright WebKit results separate. Reproduce the observed WebKit long frames with a bounded CPU/GPU trace before selecting an optimization; a short average near 60 FPS does not close the stutter report. Do not silently change system automation settings.

The subsequent user-supplied MCV reference exposed the missing VPL shading path. The original local lookup table is now used by voxel materials; [mcv-rendering.md](mcv-rendering.md) records the correction, eight-orientation geometry comparison and shader tests. Exact retail pixel parity remains open, including remap ramps and rasterization. Continue the frame-stall task without replacing original models or expanding into HD. Still-discrete infantry/aircraft movement is another recorded gap. Preserve simulation speed, rules, camera, foundations and source files.

Exit criteria: identify the dominant source of the reproducible frame stalls and deliver one measured correction, or document the exact profiling blocker. Re-run the fixed offline 1v3 regression after shared renderer changes, record zero external requests, and retain failed cases separately. Do not add HD assets, rewrite AI/pathfinding, implement campaigns or create installers. The speed-6 empty-army pathfinding failure and broader vanilla provenance remain separate limitations.

## HD feasibility

| Concern | Actual source and implication |
| --- | --- |
| SHP pixels / frames | `src/data/ShpFile.ts`, `src/engine/renderable/builder/ShpTextureAtlas.ts`, `ShpBuilder.ts`, `BatchShpBuilder.ts`. Atlas insertion must not change native frame numbering or animation timing. |
| Anchors / size | `ShpBuilder` derives logical dimensions from SHP width/height and applies offsets/alignment; `src/engine/renderable/MapSpriteTranslation.ts` and building helpers handle positioning. Density must affect texture pixels only. |
| Palette / remap | `src/data/Palette.ts`, `src/engine/gfx/material/PaletteBasicMaterial.ts` and `PalettePhongMaterial.ts`. RGBA replacements need an explicit remap mask and existing lighting semantics. |
| Shadows / depth | `src/engine/renderable/ShadowRenderable.ts`, builder depth offsets and batch/material ordering. Retain original shadow frames and logical depth until a separately validated replacement exists. |
| Cache keys | SHP caches use object identity and texture/palette UUID-based material keys. Future keys must include manifest version, original content hash, density, theater, remap and frame to avoid stale 1x/2x/4x resources. |
| Vehicles | `src/data/VxlFile.ts`, `HvaFile.ts`, `src/engine/renderable/builder/VxlBuilder.ts`, `VxlNonBatchedBuilder.ts`, `VxlBatchedBuilder.ts`, `src/engine/gfx/geometry/VxlGeometryCache.ts`. VXL is geometry with separately transformed sections, not interchangeable with SHP sprites. The non-batched HVA path explicitly reads matrix frame 0. Turret/barrel orientation, rotor animation, lighting and shadows need their own assessment. |

`hd-atlas-contract.example.json` is a versioned, synthetic draft only. It separates `density` from logical canvas, anchor, offsets and geometry, keeps native frame/timing references, and defines original-asset fallback. Validate dimensions, texture rectangles, remap masks and source hashes before accepting an override. Missing or incompatible variants must fall back to original members. No HD loader or converted retail artwork was implemented.

Static scale constants are unchanged: `src/game/Coords.ts` uses 30 logical isometric tile units, 256 leptons per tile, world scale 256/30, camera alpha π/6 and beta π/4. `src/engine/renderable/WorldScene.ts` constructs the orthographic camera with YXZ rotation order. The follow-up captures a selected GACNST with a 4x4 foundation and actual orthographic camera/selection geometry at 1280x960, DPR 1; see the acceptance report and local stability evidence. This is a recorded baseline, not a comparison against the retail executable.

## Localization

Archived `language.mix/ra2.csf` is Traditional Chinese by decoded content, despite header ID 9. The pinned upstream client support CSF and `public/res/locale/zh-CN.json` provide a separate Simplified Chinese client layer; observed client locale was `zh-CN`. The retail language file was not replaced with the loose installation CSF, and no translation conversion was performed.

The existing JSON locale loader attempts the selected locale but does not implement a complete per-key English fallback chain; it continues with CSF/empty strings if loading fails. The bundled Fira Sans Condensed fonts do not provide CJK coverage, so CJK rendering depends on system fallback. M0.1 limits font URLs to the two existing local files. A later localization task must define retail-string versus client-string precedence, audited Simplified Chinese translations, English per-key fallback, a local CJK font strategy and layout checks. Campaign text completeness and font behavior in both target operating systems remain unvalidated.

## Campaign evidence

Read-only parsing of staged `MAPS01.MIX` and `MAPS02.MIX` resolves 25 candidate mission members matching the explicit Allied/Soviet mission naming probes. This is not a claim that every archive member has been identified or every campaign path is complete. `campaign-inventory.json` contains metadata and opcode lists for all resolved candidates, with no copied map payloads.

| First-mission candidate | Source | Triggers | Teams | Scripts | Task forces | Missing action IDs | Missing event IDs |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `all01t.map` | `maps01.mix` | 130 | 49 | 38 | 29 | 1, 2, 3, 4, 5, 7, 46, 47, 48, 74, 80, 100, 104, 114, 115 | 4, 33 |
| `sov01t.map` | `maps01.mix` | 132 | 44 | 31 | 29 | 1, 2, 3, 4, 5, 7, 38, 46, 47, 48, 74, 80, 88, 114, 115 | 4 |

The lists compare parsed requirements with actual switch cases in `TriggerExecutorFactory` and `TriggerConditionFactory`, not with a general Chrono Divide support claim. `TriggerReader` silently skips unknown opcodes upstream, making a successful parse insufficient evidence of playable campaigns. No retail `TeamTypes`/`ScriptTypes`/`TaskForces` execution pipeline was found in the pinned game/data source. The independent skirmish bot mission controller is not such a pipeline. See the JSON for required script opcode lists; those require implementation/semantic validation, not just enum additions. Mission win/loss, reinforcements, movies and failure-path behavior remain untested.

## Desktop packaging prerequisites

Electron wrapping is deferred. After the remaining runtime prerequisites are assessed, select and pin Electron, implement an isolated local asset bridge instead of a Vite development middleware, preserve CSP and context isolation, disable Node integration in the renderer, and package application code without retail/support archives or generated caches. Persist user imports outside application bundles. Explicitly target macOS `arm64` and Windows `x64`; exclude Intel Mac.

Test WebGL, local file access, fonts/audio, offline requests, native paths and restart on both platforms. macOS signing/notarization and Windows signing/installers are later tasks. No Electron build, installer, signing or Windows runtime validation was performed in M0.1.

## Vanilla comparison priorities

1. Keep the single verified engine identity separate from excluded overrides; validate the remaining aircraft/rendering prerequisites.
2. Establish authoritative 1.006 data lineage and compare the effective rules/mode/map layers. Current hashes only identify this local snapshot.
3. Assess the Supalosa-derived bot and upstream deploy/build fail-safes against the required AI behavior; never equate loading `ai.ini` with executing retail AI.
4. Compare the observed combat/economy and natural-result behavior with a defined reference, then validate animation bounds and weapon offsets. Keep these checks separate from future HD/simulation equivalence testing.
