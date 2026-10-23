# M0.4 HD and campaign feasibility

Prepared: 2026-09-15. **Assessment complete. SHP prototype: conditionally feasible. Vehicles: separate design required. Campaigns: substantial compatibility project, not currently playable.** This is an assessment decision, not acceptance of rendered HD artwork or a campaign mission.

## Baseline and boundaries

Checked clean starting HEAD `26921845bc6ff2cc151e1ca9f6f8fd2d5ed587f4`, branch `m0-2-stabilization`. The upstream pin remains `898d89188542a3028a232031ce1a0bdc7c605b6f`; Electron remains 44.4.0 and Three.js 0.183.2. M0.3a user acceptance in [the current report](m0-3a-menu-cursor.md) remains closed. Windows x64 is NOT RUN; Intel Mac is excluded. No duration, cursor, natural-result or persistence gate was reopened.

Work was sequential. Only assessment documents, metadata and diagnostic scripts changed. No application was launched or rebuilt. No production renderer, game, loading, rules, import, dependency or packaging behavior changed. No paid artwork job, engine migration, installer, publishing or push. Both accepted application directories were preserved:

- `.artifacts/m0-3/apps/build-1789496540021/Red Alert 2 HD.app`
- `.artifacts/m0-3/apps/build-1789499307505/Red Alert 2 HD.app`

The installation under `../Resource/Command and Conquer Red Alert II` remained read-only. Diagnostics read existing staged archives. Raw map/editor strings and catalogs are confined to ignored `.artifacts/m0-4/`; no retail payload or artwork is committed.

## Decision and next bounded task

M0 is formally closed after M0.4. The next bounded task is **M1.1: Conscript HD Prototype**, initially in a diagnostic scene using the real sprite and batching paths. First prove geometry/UV separation and RGBA/remap material parity with synthetic samples. Then apply one complete `cons.shp` visible-frame override, retaining its original shadows. Use the existing camera, frame selection, timing, offsets and logical geometry. Start at 2x; validate 4x variant selection/fallback without promising visible 4x display resolution. Newly authored detail and rendered acceptance belong to M1.1. Development, corrections and acceptance stay in the same execution conversation; buildings, vehicles and campaigns are separate targets.

The prototype must stop before art integration if indexed-to-RGBA lighting parity cannot be demonstrated. Record real canvas/drawing-buffer metrics before any Retina claim. A high-DPI renderer change, if required, is a separate bounded prerequisite with viewport/input/performance checks; it is not part of this assessment. An SHP-only success will not satisfy the later infantry/vehicle/building integration goal.

Keep a separate vehicle milestone and a separate campaign compatibility track. **Neither first mission is a small immediate implementation task.** Recommend Soviet 01 as the first eventual campaign target after infrastructure work, for its explicit multi-part objective chain and fewer teams/scripts, not because its unknown-opcode count is slightly lower.

## SHP integration trace

| Path | Actual behavior and implication |
| --- | --- |
| `Infantry.ts` → `ShpRenderable.factory()` → `ShpBuilder` | Native sequences/facings select frames. `ShpRenderable` manages separate original shadow and optional depth-fix builders. Dynamic palette, light and opacity flow through ordinary or batched builders. Preserve these callers. |
| `GameLoader` prewarm, `Building.ts`, `BuildingShpHelper`, `ShpAggregator` | Prewarm building/bib/animation aggregates before runtime; builders also collect main/turret/animation SHPs. `imageIndexes`, caller `setSize()` and `frameOffset` preserve constituent frame identity. Resolve an override against its original member before aggregation; `agg_GAPOWR.shp` is not a source-content identity. |
| `ShpBuilder.prepareTexture()` → `ShpTextureAtlas` → `TextureAtlas.pack()` | All frames become indexed bitmaps, then one packed RGBA allocation whose alpha byte stores a palette index. Odd frame dimensions are rounded up to even in atlas rectangles. There is no page cap or HD material interface. |
| `SpriteUtils.createSpriteGeometry()` | Rectangle pixel width/height set both vertex dimensions and UV subdivisions. Offsets, alignment and depth split depend on the same width. Replacing a texture with 2x pixels therefore changes geometry unless the coordinate systems are separated. |
| `ShpBuilder.setBatched()` → `BatchedMesh` / `MeshBatchManager` | Uses per-instance palette row, extra light and opacity. A new material must retain instance attributes and batching keys; bypassing batching in a viewer proves too little. |
| `BatchShpBuilder` → `MapSpriteBatchLayer` | Separate aggregated map-sprite batching path: preallocated position/UV/color arrays, default 10,000 sprites, vertex lighting and visibility multipliers. Must receive the same geometry contract; it is not the infantry builder cache. |
| `CanvasSpriteBuilder`, UI and shadow/alpha helpers | Other sprite paths exist. They are outside the first override allowlist; retain originals. A global texture replacement is inappropriate. |

Source entry points: [ShpBuilder](../src/engine/renderable/builder/ShpBuilder.ts), [ShpRenderable](../src/engine/renderable/ShpRenderable.ts), [SpriteUtils](../src/engine/gfx/SpriteUtils.ts), [TextureAtlas](../src/engine/gfx/TextureAtlas.ts), [BatchShpBuilder](../src/engine/renderable/builder/BatchShpBuilder.ts), [ShpAggregator](../src/engine/renderable/builder/ShpAggregator.ts), [Building](../src/engine/renderable/entity/Building.ts), [Infantry](../src/engine/renderable/entity/Infantry.ts).

### Original-size invariant and revised contract

[Contract v2](hd-atlas-contract.example.json) is explicitly **unimplemented and incompatible with the earlier v1 draft**. Its PNG names are illustrative; those files do not exist. It includes a synthetic descriptor hash, not a fabricated retail hash. Real packs must bind the decoded original member hash, member name, theater and native-frame metadata.

Keep four quantities separate: original canvas/anchor, original trimmed content, legacy rendered extent, and atlas pixel rectangle. Legacy extent includes the current even-dimension padding: a 23 × 17 trimmed frame currently occupies a 24 × 18 render rectangle. Removing that extra transparent extent without checking offsets would itself change baseline geometry.

For logical width `W`, height `H` and original offset, compute the current logical split `s` and all vertices/depth exactly as before. For density `d`, split the atlas sample rectangle at `s*d`; normalize UVs by physical page width/height. Preserve `align`, `flat`, camera rotation, world scale and caller depth offsets. Dividing the existing shared scale by `d` would also rescale offsets and can move the depth fold. Do not change camera projection, tile coordinates, selection bounds, foundations or simulation bounds.

The isolated CPU probe uses an asymmetric trimmed fixture and nonzero offsets/depth. At 1x/2x/4x, the proposed UV-only calculation preserves vertex arrays exactly; feeding 2x/4x pixel rectangles into the current geometry function does not. This proves a numerical separation strategy, not a rendered loader/material, batch draw or newly authored detail.

### Selection, fallback and local entry

Selection is opt-in for one immutable pack/revision at a time. Try the requested density, then lower supported HD density, then original. No folder-order selection or mixed-pack overlay precedence. Validate the complete visible animation of a resolved member before activating it. Missing pages, invalid dimensions/masks/rectangles, source hash/theater mismatch, unsupported density/color mode, incomplete frames, or allocation/decode failure discard that candidate member.

Fallback is **whole member for the game**, retaining original shadows. This avoids an infantry animation alternating sharp and original frames; the cost is rejecting a mostly complete pack. Building constituent members may differ, but each member must be complete, with explicit page/material splits and original aggregate index mapping. Do not claim that replacing a body image covers construction or damaged animations. Summarize fallback once per pack/source/theater/density/reason, with counts rather than per-frame logging.

A later local pack belongs under the isolated profile, e.g. `hd-packs/<pack-id>/<revision>/`. Extend [desktop/profile.mjs](../desktop/profile.mjs) to validate declared regular files, realpath containment, hashes and sizes; register only exact content-identified page routes for [desktop/protocol.mjs](../desktop/protocol.mjs). Fetch the manifest and pages through those routes in a future separate override resolver. Keep pack data out of the retail VFS/rules merge, Git, `dist` and application payloads. Keep existing network/CSP guards. No directory mount, source-install link, installer or expanded import UI is needed for the assessment.

## Color, lighting, shadows and memory

### Indexed versus authored RGBA

Current SHP material behavior is traced through [Palette](../src/data/Palette.ts), [PalDrawable](../src/engine/gfx/drawable/PalDrawable.ts), [TextureUtils](../src/engine/gfx/TextureUtils.ts), [PaletteBasicMaterial](../src/engine/gfx/material/PaletteBasicMaterial.ts), [paletteShaderLib](../src/engine/gfx/material/paletteShaderLib.ts), [Lighting](../src/engine/Lighting.ts) and the entity callers.

- Index 0 is transparent. Other palette entries have alpha 255. SHP atlas alpha is an index, not RGBA coverage; a normal PNG is not a drop-in replacement.
- Owner remapping replaces indices 16–31 using the 16 factors `[63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8]`, with channel calculation `floor(ownerByte/255 * factor * 4)`. Preserve both shade position and coverage; a binary team-color mask omits the shade.
- Indexed data is `NoColorSpace` and nearest sampled. Palette textures are marked sRGB. The shader samples a palette row, applies instance/uniform opacity, clamps, multiplies RGB by `1+extraLight`, clamps again and applies optional vertex multipliers. The base shader then handles alpha testing/output. Preserve this ordering; conventional Phong lighting is not the SHP path.
- Infantry/building callers derive extra light from ambient, tile/elevation/tint and effect helpers. Animation palettes and `LightingType`/`UseNormalLight` change caller behavior. No SHP per-index full-bright exemption was found in these paths; do not invent one from VPL behavior or assert complete retail lighting fidelity. VPL is a separate voxel lookup.

| Representation | Benefit | Constraint |
| --- | --- | --- |
| HD indexed texels | Reuses exact palette/remap mechanism; lowest semantic change | 256-color limit; nearest sampling needed to avoid invented indices; still needs logical geometry and page handling |
| RGBA plus remap data (leading authored-art design) | New color detail and fractional coverage; authorable in ordinary image tools | Needs a new material with proven palette/light parity; two textures and more memory; no automatic palette cycling/special effect parity |

Contract v2 proposes sRGB RGBA8 base color with straight alpha, and RGBA8 **data** with remap coverage, discrete shade 0–15, reserved lighting mode and reserved byte. Decode color to linear; use the same owner palette ramp and caller light semantics. Initially use nearest sampling for both, clamp-to-edge, no mipmaps, and two physical pixels of edge padding excluded from the sample rectangle. Linear filtering would require shade-aware sampling and new edge tests. Unsupported per-pixel lighting modes fall back. 1x materials remain unchanged when disabled.

Retain original shadow frames/materials/opacity and logical depth/order, including building layering, damage/buildup transitions and occlusion. Animated infantry needs walking, firing, prone/crawl, transitions, idle, death, paradrop and cheer coverage. Construction layers, bibs, damage/fire and attached animations require separate constituent/state tests; a static building image cannot certify them.

### Actual cache owners and proposed bounds

| Owner | Current key/lifetime | Later HD requirement |
| --- | --- | --- |
| `ShpBuilder.textureCache` / `geometryCache` | SHP object identity; frame/size/offset/depth subkey; cleared by `GameLoader.clearStaticCaches()` and GUI teardown | Include immutable source/pack/layout identity and geometry-affecting flags. Existing geometry subkey omits scale/align/camera; do not reuse it blindly. |
| `ShpBuilder.materialCache` | Texture UUID + palette UUID + transparency; usage-counted disposal | Include shader/color contract, batch mode and palette-set identity; retain per-instance values. |
| `TextureUtils.cache` | Palette hash or ordered palette-set hash; GUI teardown clears it | Share palettes, separate from page identity; no stale palette row layout after switching packs. |
| Building aggregate cache | `GameLoader` supplies per-load map, keyed by building name | Preserve constituent source hashes, theater and frame mapping. |
| `MapSpriteBatchLayer.textureCache` | Layer-owned SHP atlas map; layer disposal frees it | Bound page/material partitions; release task-owned HD textures with the layer. |
| `VxlGeometryPool` / `VxlGeometryCache` | Section-object memory cache; persistent mod + filename + section keys | A future vehicle override needs content/builder-version identity and must not reuse original geometry storage keys. |

At `P` page texels, current indexed-atlas GPU storage is approximately `4P` bytes despite carrying one index per texel. CPU storage includes source indexed frame data, packed bitmap, RGBA upload buffer and temporary copies. Proposed RGBA+data costs `8P` GPU bytes and at least `8P` decoded CPU bytes, often twice that during staging/upload, plus original fallbacks, palettes and geometry. 2x/4x cost 4x/16x pixels before packing. A 256 × 256 logical atlas would use about 0.5/2/8 MiB for two textures at 1x/2x/4x; full mip chains would add about one third, and are disabled initially.

Use `min(2048, renderer.capabilities.maxTextureSize)` per side, at most eight pages/member, proposed 64 MiB GPU/member, 128 MiB GPU/pack and 256 MiB decoded CPU/pack. These are conservative **proposed budgets**, not measured device limits. The actual Three.js capability comes from `gl.MAX_TEXTURE_SIZE`. Validate before upload; never depend on a driver resizing indexed/masked atlases. Downshift whole members or fall back when either page or byte limits fail. More pages mean more batches/draws; profile the future prototype rather than assuming an unlimited atlas.

### Display density: not measured in this assessment

No application/runtime observation was necessary for this source assessment. CSS canvas size, drawing-buffer size, device DPR, renderer pixel ratio, active game viewport and camera bounds are **NOT MEASURED**, recorded as null in `probes.json`.

Static evidence: [Renderer.createGlRenderer](../src/engine/gfx/Renderer.ts) calls `setSize()` and never sets a pixel ratio; source search found no `setPixelRatio` or `setDrawingBufferSize` call. Installed Three.js initializes `_pixelRatio = 1`. This predicts a ratio-1 buffer, but is not a live desktop measurement. [WorldScene.createCamera/updateViewport](../src/engine/renderable/WorldScene.ts) derives orthographic bounds from logical viewport dimensions. Three.js distinguishes logical renderer size from physical drawing-buffer size. [Official renderer API](https://threejs.org/docs/pages/WebGLRenderer.html#getDrawingBufferSize).

Before Retina acceptance, record `canvas.getBoundingClientRect()`, canvas width/height, `getDrawingBufferSize()`, `getPixelRatio()`, `devicePixelRatio`, game viewport and camera left/right/top/bottom/zoom in one isolated short game observation. If ratio remains 1 on a DPR-2 display, assess a separate capped-DPR change; retain CSS dimensions and camera/world geometry. A 4x source variant does not require a 4x drawing buffer.

## Future asset candidates

Metadata below comes from newly decoded staged archive members; full content hashes and all frame rectangles are in ignored `inventory.json`.

| Candidate | Actual archive/art requirements | Selection |
| --- | --- | --- |
| Conscript (`E2` → `CONS` → `cons.shp`) | `ra2.mix/conquer.mix`; 76 × 96 canvas, 602 total frames. `ConSequence` uses 301 visible frames with the second half reserved for shadow. No GI deployment sequences. | **First SHP candidate.** Complete the ordinary animation member and keep all original shadow frames. No static single-facing claim. |
| Allied power plant (`GAPOWR`) | Temperate name resolution uses `ggpowr.shp` and `ggpowr_a.shp` from `generic.mix`; buildup `gtpowrmk.shp` from `isotemp.mix`. All have 142 × 110 canvases; 6/32/50 total frames respectively. Active normal frames 0–7 and damaged frames 8–15 share the animation member. | Second SHP candidate. Small body is deceptive: aggregation, damaged/active layers, buildup/unbuild, fire and Z offsets need state coverage. |
| Rhino (`HTNK`) | Body, turret and barrel `.vxl` plus corresponding `.hva` all resolve in `ra2.mix/local.mix`. | Representative future vehicle; separate milestone below. |

`ImageFinder` tries the theater character, then generic `g`, then the original name. A raw lookup of `gapowr.shp` resolves a snow-archive member in this tree, so that name alone is not a valid temperate override identity. GI was also inspected: `gi.shp` has 744 total frames and deployment states, making it larger than Conscript for a first bounded exercise. Counts do not establish complete rendering support for every sequence.

## Vehicle path and choice

Trace: [Vehicle.createMainObject](../src/engine/renderable/entity/Vehicle.ts) → [VxlBuilderFactory](../src/engine/renderable/builder/VxlBuilderFactory.ts) → [VxlBuilder](../src/engine/renderable/builder/VxlBuilder.ts) and [non-batched](../src/engine/renderable/builder/VxlNonBatchedBuilder.ts)/[batched](../src/engine/renderable/builder/VxlBatchedBuilder.ts) variants → [VxlGeometryPool](../src/engine/renderable/builder/vxlGeometry/VxlGeometryPool.ts). The pool constructs section geometry with the monotone builder. The inspected Rhino has 4,816/1,501/155 occupied voxels in body/turret/barrel sections (46 × 34 × 12, 28 × 18 × 9, 19 × 3 × 3); each matching HVA has one matrix frame. Each builder applies section transforms, optionally `scaleHvaMatrix(hvaSection.getMatrix(0))`; neither iterates HVA animation frames. `Vehicle` applies body direction/tilt and independent turret/barrel yaw; alternate bodies, rotors and multiple turrets also exist.

[voxelPaletteShader](../src/engine/gfx/material/voxelPaletteShader.ts) chooses a normal/light-dependent VPL row, maps the original index through `voxels.vpl`, then samples the owner palette with ambient/effect adjustments. Geometry casts shadows; clipping planes, opacity, bridge render order and section transforms contribute to occlusion. Preserve these, plus original selection bounds and firing offsets; a larger VXL bounding box can change visible selection framing even if simulation rules are unchanged.

| Option | Evaluation |
| --- | --- |
| Higher-detail VXL/geometry | Preferred first vehicle experiment: retains independent part rotation, geometry shadows, depth and existing VPL/remap semantics. Increasing voxel grid density needs inverse section scale and unchanged logical bounds/HVA/FLH. Raw occupancy may grow 8x at 2x per axis or 64x at 4x; generated mesh memory depends on exposed surfaces/normals, not just occupied voxels. Measure geometry attribute/index byte lengths and construction time; share sections across instances. |
| Pre-rendered directional atlases | Plausible alternative, not a rotated SHP. Body/turret/barrel need independent facings, common anchors and part-depth composition. Combined 32 body × 32 turret directions already means 1,024 views before tilt/animation; at 256 × 256 and 8 bytes/texel this is 512 MiB before shadows/depth. Separate-part atlases reduce storage but require correct overlap/depth data. Baked lighting cannot reproduce arbitrary current VPL normals and tile lighting without additional data/material work. |

Future Rhino test: unchanged body bounds, turning body with independently aimed turret/barrel, movement, firing, owner remap, ambient changes, partial occlusion, shadow and opacity in both builder modes. Multi-frame HVA, rotors, alternate harvester/spawn bodies, multiple turrets, amphibious/submerged states, slopes/tilt coverage and aircraft are **not established** by that one vehicle. Do not remove those categories from the product requirement.

## Campaign inventory and evidence quality

[Support matrix](campaign-support-matrix.json) contains 77 requirement rows: every action/event/script opcode used by the two selected first maps plus structural dependencies. Rows include exact map trigger/script IDs and instruction indexes, parse/execution status, source hash, semantic confidence, prerequisites and a future validation case. It also includes all team → script/task-force links and source archive/member hashes. Status `implemented` means inspected bounded behavior exists; it never means retail mission compatibility.

| Candidate | Resolved source | Triggers | Teams | Scripts | Task forces | Missing action IDs | Missing event IDs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `all01t.map` | `maps01.mix` | 130 | 49 | 38 | 29 | 15 | 2 |
| `sov01t.map` | `maps01.mix` | 132 | 44 | 31 | 29 | 15 | 1 |

The prior scanner probes names and calls private `TriggerReader` methods that warn/skip unknown types. It recovers unknown numeric IDs, but does not validate mission parsing or execution. The new scanner preserves every raw action/event record, checks declared counts, allowed event arity and exact token consumption, and compares all 25 prior candidates' action/event/missing sets with the old inventory. All match; the original `campaign-inventory.json` is unchanged. Factory counts remain 49 actions and 50 events. This is a bounded audit of known filenames, not exhaustive name recovery from a hash-only MIX index.

New catalog evidence: `battle.ini`, `mission.ini` and `mapsel.ini` resolve from `ra2.mix/local.mix`. Selection and progression enumerate 24 main campaign maps. Both select `sov09u.map`; `mission.ini` has its mission entry. `sov09t.map` is different content, with no selection/progression entry or matching mission section found. Its provenance is unresolved; it is an extra unselected candidate, not a verified 25th mission or proven alternate branch. Training entries are separate and outside the old 25-name inventory. `Basic.NextScenario` values such as `GDI2A.map` are legacy fields and must not override the actual RA2 progression catalog.

Archive precedence is explicit: `retailTree` visits language, base, multiplayer, `maps01`, `maps02`; `resolveMember` and the VFS choose the first containing archive. Matrix occurrence hashes record duplicates/precedence. Both first missions resolve in `maps01.mix`; Soviet nationality does not imply `maps02.mix`.

### Why factory presence is insufficient

New direct-handler CPU probes reproduce these defects with the action/event object shape used by the factory:

- `DestroyedAllUnitsCondition` (event 9) reads the event object as an array and reverses `check(context, events)` arguments; a manager-shaped call throws at `events.some`.
- `DestroyedAllBuildingsCondition` (10) and `BuildObjectTypeCondition` (20/21) receive NaN identifiers. Similar object/array reads occur in event 11/56 and action 14, confirmed by source inspection.
- `GlobalVariableExecutor` (28/29) also reads the action object as an array; a synthetic call forwards NaN. These global actions are not required by the two first-map action lists, so this is a later campaign dependency, not an inflated first-mission missing count.
- Local set/read (56/36), trigger-enable forwarding and text-event dispatch pass isolated checks. Event 13 at zero seconds becomes true on the second call due to post-increment and strict `>`; exact retail timing remains unverified.

`TriggerManager` parses difficulty metadata indirectly but does not filter by it. Its all-conditions loop starts true: skipping an unsupported event can remove a required gate and fire a trigger early. Linked/tag repetition semantics also need tests. None of these findings was repaired in this assessment.

### Scenario-to-result dependency trace

| Area | Existing path / gap | First playable mission versus later campaigns |
| --- | --- | --- |
| Initialization and ownership | `GameLoader` → `GameFactory` merges map rules/art into skirmish setup; lobby countries/starts supply players. `MapFile` parses tiles/objects/tags, but `Basic.Player`, named `Houses`, alliances and campaign control are not constructed as a campaign scenario. `Game.createInitialMapTechnos()` explicitly skips non-neutral owners. | First mission requires house/country identity, all original initial actors, correct player control and no automatic skirmish MCV/army. |
| Teams/reinforcement/scripts | `TeamTypes`, `TaskForces`, `ScriptTypes` remain generic INI; all first-map team references resolve, but no retail typed execution pipeline was found. Bot mission classes do not consume these tables. | Need team creation/recruitment, owner, composition, spawn/transport/waypoint behavior, per-team program counter, task completion/waits, flags, loops and cancellation. Required before either first mission. |
| Objectives and text | Action 11 dispatches a label; no mission objective state model or complete mission HUD flow. | Preserve original trigger chains and objective progression. Later add full briefings/subtitles/score presentation. |
| Triggers/tags/variables | `MapFile` and `TriggerReader` create trigger records and tags; `TriggerManager` binds initial objects/cells, evaluates conditions and executes actions. Local variables use numeric keys; globals are game-owned and flawed in some handlers. | Strict preflight, correct conditions/handlers, difficulty and repeat/link behavior for first mission; global carryover for later progression. |
| Timers | `Game.countdownTimer` and timer executors exist; first maps use elapsed-time event 13 rather than countdown opcodes. | Verify delay/enable/reset tick boundaries now; inherited mission timers and snapshot restoration later. |
| Success/failure | First-map action IDs 1/2 are skipped. `Game.update()` uses skirmish defeat/alliance end; ForceEnd (69) merely ends a game. | Separate campaign result policy must follow original mission triggers, including mission-specific failure, without elimination substitution. |
| Transition/save | No campaign progression controller or full mission snapshot/restore found. Geometry caches/preferences are not a savegame. | Diagnostic load needs neither. A playable first mission can validate outcomes before intermission carryover, but a durable campaign product needs save/load of world/orders, teams/script PCs, RNG, triggers/targets, variables, timers, objectives and progress; test save before and after each objective. |

Primary local sources: [MapFile](../src/data/MapFile.ts), [GameFactory](../src/game/GameFactory.ts), [Game](../src/game/Game.ts), [TriggerReader](../src/data/map/trigger/TriggerReader.ts), [TriggerManager](../src/game/trigger/TriggerManager.ts), [executor factory](../src/game/trigger/TriggerExecutorFactory.ts), [condition factory](../src/game/trigger/TriggerConditionFactory.ts). Unknown numeric opcode names remain null in the matrix; no meanings were borrowed from a different game/expansion.

### Unsupported-instruction policy proposal

Before enabling Play, perform a lossless, fail-closed campaign preflight: validate all required instructions, parameter forms, team/script references, actor types, house bindings and selected difficulty. Any missing or semantically unverified required instruction blocks “playable” status with a concise dependency report. Do not silently skip an instruction, remove an objective, replace a script, or relabel skirmish as campaign. Do not assume a disabled trigger is unreachable; forced and linked activation must be considered. An explicit diagnostic load may inspect such a map, with its incomplete status visible and campaign completion/progress disabled. Keep current parser behavior unchanged until a separately authorized implementation.

### Resource and language path

Campaign archives are already staged by the isolated `ra2-campaign` profile, but [loadRetail.ts](../src/offline/loadRetail.ts) loops over `ra2-core` only and [desktop/profile.mjs](../desktop/profile.mjs) currently registers three core files. Later add optional validated campaign manifest/routes for exactly `maps01.mix` and `maps02.mix`, then campaign catalog/map resolution with the same precedence. Keep maps out of the skirmish catalog until an explicit campaign path exists. Do not expose the original installation or CnCNet/Yuri overlays.

Media is separate: the existing importer declares `theme.mix`, `movies01.mix`, `movies02.mix`, but this assessment neither imports nor plays them. Future work must validate and register only selected media archives, inventory briefing/intro/win/lose references, and evaluate the existing audio/video decode paths. Core `audio.bag` loading and EVA/sound events are not proof that all campaign speech/music/video/subtitles exist or play offline.

The staged `ra2.csf` declares **zh-TW**, with 4,479 parsed labels and three duplicates. All text-action label references in the two maps resolve ignoring case (24/14 distinct raw spellings); that establishes only lookup presence. Briefing, loading text, mission names, speech, video and subtitles need their own coverage matrix. Full Simplified Chinese remains separate, unverified product work. Proposed fallback: exact selected locale label, then validated base archive label with disclosed fallback; unresolved required objective text blocks localized acceptance. No additional packs or translations were imported.

### Recommended first mission and acceptance

Choose **`sov01t.map`**, after the infrastructure above. Its four objective building checks (event 57, building indexes 131–134, triggers `08696820`, `086919B0`, `086958C0`, `08692CF0`) set local flags 1–4. Trigger `08691C50` requires all four flags and enables `0A301C50`; that delayed trigger invokes success action 1. Failure trigger `0A1153EC` combines events 9/10 for house 13, enables `0A115A1C`, then invokes action 2 after a delay. This provides meaningful independent objective and failure acceptance, while exposing the house/condition defects directly. These associations come from raw map references; they are not a runtime success claim.

Allied 01 has a destruction-based success chain (`07506C5C` event 10 → `075F22EC` action 1), several failure paths including tagged loss/capture, more teams/scripts, and additional unknown event 33. Soviet 01 still requires scripted reinforcements, patrols, production, presentation and difficulty behavior. Neither is practical as a menu-only or map-import-only step. Do not pick the unselected `sov09t.map` simply because it has fewer missing IDs.

## Staged work and uncertainty

Relative effort is an engineering estimate, not a schedule or authorization.

| Stage | Relative effort / uncertainty | Exit evidence |
| --- | --- | --- |
| SHP synthetic geometry/material parity, then Conscript prototype | Medium; material parity and batching are main risks | Same vertices/anchors/frame timing; remap/ambient/opacity/shadow cases; complete-member fallback; bounded memory; real display metrics before Retina claim |
| Separate high-DPI renderer prerequisite, if needed | Small–medium code change; medium integration risk | Measured buffer/CSS ratio, unchanged world viewport/hit mapping, acceptable frame cost |
| Rhino geometry prototype | Medium–large; normal/VPL/transform fidelity | Independent part facing and shadows with original bounds, batching and memory evidence |
| Campaign diagnostic load | Medium; scoped data/preflight path | Complete lossless requirements/house/team graph and explicit blocked status; no playable claim |
| Campaign execution foundation | Very large; high semantic uncertainty | Deterministic houses, team/script VM, condition/action conformance, initialization and result policy tests |
| Original Soviet 01 playable | Large after foundation; high uncertainty | Meaningful original objectives, reinforcements and failure, difficulty cases; no script edits to manufacture success |
| Both full campaigns, persistence and localized media | Much larger cumulative work; very high uncertainty | All catalog missions/transitions, save/load, carryover, text/audio/video/subtitles and per-mission outcome coverage |

Retain the current engine. The campaign gap changes scope and cost; it does not authorize a new engine search or migration. Stop after this assessment and recommendation.

## Validation and local evidence

Commands run from the repository root:

```sh
bun scripts/m0/assess-feasibility.mjs
python3 scripts/m0/campaign-support-matrix.py
bun scripts/m0/feasibility-probes.mjs
```

- Staged scan PASS: 25 prior candidate sets unchanged, exact raw action/event token consumption, 49/50 factory cases, first-map team/script/task-force links resolve. No full `MapFile` campaign initialization or mission execution was attempted.
- Contract/CPU probes PASS for the stated numeric invariants and isolated working handlers; identified broken handlers remain REPRODUCED defects. There is no GPU, rendered-art, Retina or campaign-play PASS.
- JSON and changed diagnostic syntax/bundling checks are recorded in `.artifacts/m0-4/validation.json`. No production rebuild or repetition of unchanged game tests was required.
- Preservation snapshot/result: `.artifacts/m0-4/protection-before.json`, `protection-after.json`, `protection-result.json`. Compare production file hashes, staged import hashes, both accepted application payloads, current `dist`/desktop files and the normal `~/Library/Application Support/RA2 HD` profile. Installation metadata excludes access time; staged source archives also receive content-hash checks. No task-owned game process was started.
- Raw inventory, catalog extracts, scan logs and CPU results: `.artifacts/m0-4/inventory.json`, `inventory-run.log`, `probes.json`, `probe-run.log`. The old inventory/history and accepted applications remain intact.

Reviewed changes are committed locally; final commit identity and clean-worktree evidence are recorded in `.artifacts/m0-4/final-state.json`. No push.
