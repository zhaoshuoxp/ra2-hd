# Windows return report: dense-scene performance and building buildup — 2026-10-11

This report is for the main development project and its agent. It covers:

- the root causes found on the target Windows machine;
- the exact code changes and how to integrate them into `main`;
- the evidence for each change;
- detailed, code-level guidance for the work that remains.

Read §1–§3 before integrating, and §5 before starting the remaining work.

- **Base:** `main` `bc581b1c3c871199ac568939723324e4cfce6b2c` (cumulative C1–C9).
- **Branch:** `fix/windows-dense-rendering`.
- **Application commits:** `ecd426e`, `fb353fd`, `f17e896`. The other commits on the branch change docs only.
- **Playable candidates on Windows:**
  - `RA2-HD-Windows-ViewCulling-Candidate-v1` (source `f3536f6`);
  - `RA2-HD-Windows-ViewCulling-Candidate-v2` (source `f17e896`, recommended).
- **User feedback:**
  - v1 plays correctly and feels clearly better.
  - v2 (adds the buildup fixes) was tested in actual play on Windows with no problems reported.
  - The user's target of 90+ FPS in dense late play is **not** reached (§5.3).

---

## 1. Summary

| Problem | Root cause | Status | Measured effect (Windows, same scene) |
| --- | --- | --- | --- |
| Low FPS in dense play, worse as units/buildings accumulate | View culling was a no-op; every object on the map was traversed, batched, shadowed and drawn every frame | **Fixed** (`ecd426e`, `fb353fd`) | Dense scene 28.4–34.6 → 55.5–63.9 FPS (mean 31.9 → 59.7) |
| Slowdown that grows with match length, plus a memory leak | The octree index was created deferred and never updated; every unit movement linearly scanned an ever-growing pending list, including destroyed objects | **Fixed** (`fb353fd`) | Simulation time per frame 7.7 → 3.4 ms |
| Latent stale positions after culling | Three 0.183 `matrixWorldAutoUpdate = false` neither prunes traversal nor preserves the dirty flag | **Fixed** (`fb353fd`) | 0 stale matrices in 601,326 on-screen checks |
| Building (and every other) animation not smooth, running slow | `Animation.update` dropped the fractional remainder on every advance | **Fixed** (`f17e896`) | Buildup 850–1060 ms → 797–829 ms (nominal 800); step median 36–39 → 31–32 ms |
| HD art switching from original to HD mid-buildup | An HD family finishing loading after the buildup began was applied immediately | **Fixed** (`f17e896`) | No mid-sequence swaps in 96 buildups |
| HD buildup "inconsistent with the original" | **Art data:** several HD buildup sequences use a different construction order/pacing from the original frames | **Open: art pipeline** (§5.1) | Per-family table in §4.3 |
| ~86 ms hitch and 2 skipped frames on construction-yard deploy | Full-map passability island flood-fill in simulation | **Open: game logic** (§5.2) | Same in HD and Original |
| 90+ FPS in dense late play | Render submission is about 7 ms for about 360 draws; whole-map renderable updates; simulation | **Open: structural** (§5.3) | Currently about 60 FPS at 2560×1600 |

None of the fixed causes are Windows-specific code paths. They are single-thread renderer CPU costs. A Ryzen 7 5800H has roughly half the single-core speed of an M5 Pro, so the same over-budget frame drops to 25–30 FPS on Windows and still feels acceptable on the Mac. **The fixes therefore benefit the Mac too**, but Mac regression has not been run (§3.4).

---

## 2. Root causes in detail

### 2.1 View culling did nothing

- `src/engine/gfx/FrustumCuller.ts` (removed) set `visible` on `@brakebein/threeoctree` **internal octree nodes**. The library never reads that flag, and `OctreeContainer.cullChildren` discarded the result. No scene object was ever hidden.
- The HD and batched meshes set `frustumCulled = false`, so Three's own per-object test did not cull them either: `MergedSpriteMesh`, `HdSpriteEdges`, VXL `FrameLayer`, `BatchShpBuilder`.
- As a result, every unit, building, tree, overlay and smudge on the whole map went every frame through:
  - the explicit scene matrix pass (`updateSceneMatrices`);
  - `MeshBatchManager` collection, grouping and geometry upload;
  - the shadow-map pass;
  - render-list projection;
  - main-pass draw submission.

  `Vehicle.updateRhinoHd → VxlUnitRenderer.update` HD pose/uniform work also ran for every vehicle on the map.

### 2.2 The octree was deferred, never updated, and scanned linearly

`OctreeContainer.factory` created `new Octree({ undeferred: false, ... })`. In threeoctree:

- `add()` only appends to `objectsDeferred` in deferred mode, and nothing ever called `tree.update()`.
- `RenderableManager.onObjectPositionChanged → container.updateChild(renderable)` ran `tree.remove(obj); tree.add(obj)` on every position change of every moving object. `remove()` falls back to `indexOfPropertyWithValue(this.objectsDeferred, 'object', object)`, a linear scan.
- Destroyed objects were never removed from `objectsDeferred`.

Measured in a long Windows match: 6,358 deferred entries, of which 6,296 were destroyed objects; 0 objects were actually in the tree. Once culling was fixed, `onObjectPositionChanged` became the #1 self-time hotspot at 9.8% of all CPU, and it grew with match length.

### 2.3 Three 0.183 `matrixWorldAutoUpdate`

In Three 0.183, `Object3D.updateMatrixWorld(force)` with `matrixWorldAutoUpdate === false`:

- still visits every child;
- clears `matrixWorldNeedsUpdate` without recomputing the object's own `matrixWorld`.

So that flag cannot be used to skip culled subtrees. A unit that moved while off-screen and then stopped would reappear at a stale root matrix. The first-round patch relied on this flag; it was replaced in `fb353fd` (§3.1).

### 2.4 Animation clock

`src/engine/Animation.ts` `update()` computed `framesToAdvance = floor(deltaTime * rate)` and then set `this.time = time`, discarding the fraction. As a result:

- Frame steps quantize to whole render frames: 17–62 ms for a nominal 32 ms.
- Every animation runs 12–30% slow.

This was identical in HD and Original modes.

### 2.5 Mid-buildup HD swap

The `Building` HD bind callback (`imageFinder.bindBuildingHd(..., hd => ...)`) applied `setHdOverride(hd)` to all sprites immediately. At match start the GACNST family could finish loading during a deploy, so the deploy switched from original to HD art partway through.

---

## 3. The code changes (what to integrate)

### 3.1 View culling: `src/engine/gfx/ViewCulling.ts` (new)

- **`ViewCuller`: padded orthographic view test.**
  - `begin(viewportWidth)` captures the camera view, `combined = view⁻¹ × container.matrixWorld`, half extents and world-per-pixel.
  - `containsPosition(p, extraPx)` projects the renderable root's **local** position with two dot products and compares it against the padded half extents. It deliberately ignores the root's `matrixWorld`, which may be stale while culled.
  - Margins: `VIEW_CULL_PADDING_X = 360` px and `VIEW_CULL_PADDING_Y = 300` px, plus `(foundation + 1) × 60` px for buildings. These cover shadows, tall art and the first scrolled frames.
- **Culled flag combined with game visibility.** `setViewCulled(object, culled)` installs, once per root, an accessor on `visible`: the getter returns `intended && !culled`, and the setter stores `intended`. Cloak, garrison and destruction code keep writing `visible` as before, and their values survive culling. Three's `projectObject`, the shadow pass, `traverseVisible` (and therefore `MeshBatchManager` and hover picking) all honour the getter.
- **`installCulledMatrixTraversal(root)`.** This replaces `updateMatrixWorld` on the container root only. It mirrors Three's implementation but skips culled children. When `force` is true it marks a skipped child `matrixWorldNeedsUpdate = true`, so the child recomputes correctly once restored. Dirty flags are never consumed while culled.
- **`viewCullExtent(renderable)`** returns `undefined` (never cull) for:
  - roots without a `gameObject` or without `setPosition` (effects and transient anims);
  - aircraft, because their altitude and shadow offset reach far from the root.

  Buildings get the foundation-based extent. A building whose `rangeCircleWrapper` is visible is never culled (checked per frame).

### 3.2 `src/engine/gfx/OctreeContainer.ts` (rewritten), `RenderableContainer.ts`, `RenderableManager.ts`

- The octree and `FrustumCuller.ts` are removed. `cullChildren()` and `updateChild()` remain as no-ops so existing callers stay valid: `RenderableManager`, `TransientAnim`, `DrainAnimationPlugin`, `MindControlStatusPlugin` and `scripts/m0/rendering.test.ts`. The constructor keeps its `(tree, frustumCuller, camera)` signature and ignores the first two arguments.
- A flat per-renderable cull table is maintained in `add`/`remove`, holding the root object, cached position `Vector3`, culled state, extent and an is-building flag. `remove` always un-hides the root.
- `cullRenderables(viewportWidth)` runs **every frame** from `RenderableManager.onCameraUpdate`, which `WorldScene.update` dispatches each frame after the camera update and before `updateSceneMatrices`/batching. It only calls `setViewCulled` on state changes. On restore it calls `renderable.onViewCullRestore?.()` in the same frame.
- `RenderableContainer.children` changed from `private` to `protected`.

### 3.3 Renderable hooks and animation

- **`Vehicle.ts`.** `updateRhinoHd(viewCulled)` still binds and constructs HD layers at spawn, so scrolling never builds layers. Only `unitVxlHd.update()` and `rhinoHd.update()` are skipped while culled. `onViewCullRestore()` runs `target.updateMatrixWorld(true)` and then a full `updateRhinoHd()`.
- **`Building.ts`.**
  - Animation *state* always advances, because it drives gameplay transitions, sounds and removal. Only `sprite.setFrame(...)` is skipped while culled. `onViewCullRestore()` re-applies frames for animations that are not STOPPED or NOT_STARTED.
  - The HD bind callback is deferred while `currentAnimType` is BUILDUP or UNBUILD (`pendingBuildingHd`). It is applied at the start of the next `setAnimation` to a non-buildup type.
  - `Building.update` is otherwise deliberately unchanged.
- **`Animation.ts`.** After advancing, `this.time += framesToAdvance / rate * 1000`, which carries the remainder. In PAUSED state it still resets `this.time = time`, so resuming does not burst.
- **Micro-optimizations** (correct but not measurable on their own, about 0.4 ms total):
  - `ShpBuilder.getGeometryCacheKey` caches the static key suffix, guarded by a snapshot of every input, including fields callers mutate directly (`flat`, `shadowCoverage`, `embeddedShadow`, `hdOverride`, `align`, camera rotation).
  - `MeshBatchManager.getBatchKey` caches per mesh in the same way.

### 3.4 How to integrate into main

The return folder contains `fix-windows-dense-rendering.bundle` (range `bc581b1..fix/windows-dense-rendering`) and the patch series `0001`–`0007`.

```bash
git fetch /path/to/fix-windows-dense-rendering.bundle fix/windows-dense-rendering:windows-return
git log --oneline bc581b1..windows-return
git switch main && git merge --no-ff windows-return   # or cherry-pick ecd426e fb353fd f17e896
```

If `main` has moved, the most likely conflict areas are:

- `Building.ts` (bind callback and the animation loop in `update`);
- `Vehicle.ts` (`updateRhinoHd` and the end of `update`).

The changes there are small and local.

**Required checks on Mac before accepting:**

1. `bun test`: the same 25 pre-existing failures as `bc581b1`, plus the new tests passing (`view-culling`, `animation-clock`, `shp-geometry-key`, and the existing `static-octree-matrices`).
2. Type checking with `tsconfig.build.json`.
3. Native Mac play.

Visual checks to make on Mac. The user reported no problems in general Windows play of v2; these points have not been confirmed individually:

- long shadows at screen edges;
- minimap camera jumps (objects restored in the same frame);
- cloaked/garrisoned units entering the view;
- building range circles;
- aircraft at the edges;
- buildup cadence.

**One test was changed:** `scripts/m1/yuri-units/feedback-r11.test.ts` encoded the old drifting clock. At 7.5 fps, frame 1 is due at 133.3 ms, so at 180 ms the frame fraction is 0.35 (0.70 at double speed), not 0.30/0.60.

**Windows build hygiene learned here:**

- Check out with `core.autocrlf=false`. CRLF changes the copied text assets.
- With LF, a Windows build of `bc581b1` reproduces all 144 JS chunks byte-identically to the frozen C9 source-mapped bundle.
- The profile validator (`fs.realpath`) rejects junctions and symlinks for resource folders.
- `tools/stage-candidate.mjs` is a Node port of `stage-candidate.py` for hosts without Python. Under Electron-as-Node it must set `process.noAsar = true`.

---

## 4. Evidence

The scenario for all measurements:

- Machine: Ryzen 7 5800H, RTX 3070 Laptop (driver 32.0.15.9597), native fullscreen 2560×1600 at DPI 1.5, 165 Hz, "Beast" power plan.
- Game: YR, `xmp27t8`, 7 brutal AI plus an observer, HD 4X, shadows 3. AI credits were topped up to build a dense late scene (≈7.7–8.7k scene nodes; the user's own trace had ≈10.1k).
- Method: a CDP harness running the shipping runtime with an isolated profile. A/B comparisons alternate 10 s windows in the **same match** with identical scripted camera motion.

### 4.1 Performance (dense scene, ticks ≈49k–56k)

| Build | FPS (10 s windows) | Frame median | Frames > 33 ms / 10 s | Draws | Simulation per frame |
| --- | --- | --- | --- | --- | --- |
| Baseline C9 `bc581b1` | 28.4–34.6 | 27.8–33.8 ms | 51–163 | 734–794 | 6.2–9.4 ms |
| Candidate v1 (built `f3536f6`) | 55.6–63.9 | 14.5–16.2 ms | 8–15 | 444–481 | 2.7–3.5 ms |
| Candidate v2 sources (`f17e896`) | 54.1–61.0 | 15.1–16.7 ms | 10–18 | 443–477 | 3.0–3.6 ms |

v1 and v2 are equal within scene variance; v2's gains are in animation quality.

Correctness checks:

- **Matrix staleness:** every on-screen object's world matrix compared with a forced fresh recompute, each frame, while units and the camera moved. 0 stale in 601,326 checks.
- **Pixel parity:** frozen simulation, full 2560×1600 `readPixels` at 3 views. Repair-vs-baseline differences stay within baseline-vs-baseline animation noise; one view was byte-identical.
- **Stability:** 0 page exceptions and 0 console errors over a whole candidate session.

### 4.2 Buildup timing (96 AI buildups per run)

| Mode | Duration (nominal 800 ms) | Step median / min / max (nominal 32 ms) | Mid-sequence art swaps |
| --- | --- | --- | --- |
| C9 HD 4X | 850–1063 ms | 30–39 / 12–28 / 41–83 ms | 1 (GACNST) |
| C9 HD off | 797–1004 ms | same pattern | — |
| v2 HD 4X | 797–829 ms | 31–32 / 5–26 / 34–59 ms | 0 |

### 4.3 HD buildup art versus original (same session, same pose)

Two kinds of comparison were made:

- **Contact sheets:** each buildup frame rendered with the HD override and then with it removed.
- **Silhouette alignment:** background-subtracted building masks, comparing HD frame *i* with original frame *j*.

The HD frame count equals the native count for all 28 families, and the last frame matches the finished building. The construction order and pacing differ for:

| Family | Finding |
| --- | --- |
| GACNST | HD frames 0–4 hold the MCV vehicle pose while the original unfolds the tower. HD frame 5 jumps to a flat pad. Tower/crane appear about 6 frames late. |
| YAWEAP | HD frame 0 shows a small plate that vanishes in frame 1 (flicker). HD frames 1–5 are empty ground while the original pad grows. The hangar rises first in HD and last in the original. HD silhouette area stays at 0.05 until frame 4, then reaches 0.85 by frame 11; the original grows steadily. |
| GAWEAP | HD walls are complete by frame 5 (about original frame 9). HD then idles while the original catches up; the roof arrives late. |
| YATECH | HD builds most of the tower by frame 8 and barely changes in the second half; the original builds steadily. |
| NAPSIS, NALASR, NAWEAP, GATECH, YABRCK | Minimum same-index silhouette IoU of 0.31–0.56; pacing differs. |
| GAPOWR, NAPOWR, NAREFN, GAAIRC | Track the original closely (mean IoU 0.79–0.94). |

Silhouettes stop changing once the outline is complete, so long descending runs in the alignment data are an artifact. Use the contact sheets for the final judgement.

---

## 5. Remaining work: how to fix

### 5.1 HD buildup sequences (art data)

The right fix is in the HD authoring pipeline (not in Git). **Generate each HD buildup frame from the matching original `…MK` SHP frame**, i.e. upscale or re-render frame *i* from original frame *i*. Do not progressively reveal the finished HD building. Then re-run the contact-sheet and silhouette tools (`windows-buildup-evidence-20261011/harness`) and require per-frame correspondence. Also fix the YAWEAP frame-0 flicker. Re-export only the affected families' buildup members and keep the coverage contracts intact.

A code-side mitigation, if re-authoring is delayed, adds **pacing only, not construction order**:

1. Add an optional per-family buildup frame map (native frame → HD frame) to the building coverage contract, e.g. `allied-building-coverage.json` / `soviet-building-coverage.json` / `yuri-building-coverage.json`, keyed by the buildup member.
2. Apply it in `aggregatePowerPlantHd` (`src/engine/renderable/builder/resolvePowerPlantHd.ts`). When composing `frames[offset + i]` for the buildup member image, use `override.frames[map[i]]` instead of `override.frames[i]`. Keep `map` monotonic non-decreasing, ending at the last frame.
3. Compute each map with the silhouette tool: for native frame *i*, choose the first HD frame whose area fraction reaches the original's. Then review the contact sheet by eye. GACNST's problem is internal motion, which silhouettes do not capture.
4. Add a contract test that every map has the native length and ends on the final frame.

### 5.2 Construction-yard deploy hitch (simulation)

`Terrain.computePath` → `computePassabilityGraph` handles invalidated tiles incrementally (`updatePassability`), but then calls `computeIslandIds(graph)`, which flood-fills the **whole map** (`floodIslandId`). It costs about 3% of CPU in steady dense play, and an ~86 ms spike when a construction yard deploys.

Options, both of which must keep **identical results** because pathfinding feeds lockstep simulation:

- compute island ids lazily, only inside `getIslandIdMap`, and only when the cached map is stale;
- recompute islands only for the connected regions touched by the invalidated tiles (union/split of affected components).

Validate with a recorded-replay determinism test comparing path results before and after on the same seeds.

### 5.3 Toward 90+ FPS (structural)

Current dense frame ≈16.6 ms at about 60 FPS:

| Area | Share |
| --- | --- |
| Render submission | 43–46% |
| ↳ main-pass draws | ≈29% |
| ↳↳ per-draw `setProgram` (uniform uploads, `refreshMaterialUniforms`) | ≈17.5% |
| ↳↳ attribute setup | ≈7% |
| ↳ `projectObject` | ≈8% |
| ↳ shadow pass | ≈4% |
| Renderer update | ≈30–34% |
| ↳ whole-map renderable `update()` | ≈15% |
| ↳ `MeshBatchManager` | ≈8.6% |
| Simulation and AI | ≈19–20% |

About 360 world draws remain. Most HD sprites form **single-sprite batches**, because the batch key includes `material.uuid` and each HD building sits on its own texture page. Each therefore draws a body plus `hd-sprite-edge` coverage passes; about 76 of the edge draws per frame are single quads. The observer HUD adds about 67 text quads in the UI scene, which normal play does not have.

In order of expected value:

1. **Fold HD edge coverage into the body pass.** `HdSpriteEdges` adds separate coverage draws per batch, and `MergedSpriteMesh.updateHdBodyVisibility` hides some bodies, leaving only the edges. A single shader pass with blended coverage would remove roughly a quarter of all draws. This needs pixel-parity validation against the current output; the earlier C-series pixel harnesses apply.
2. **Atlas HD pages** (or use texture arrays) so building and environment sprites from different families share materials and actually batch in `MeshBatchManager`.
3. **Reduce per-instance material clones on HD VXL.** Each `FrameLayer` clones three materials (batch, depth, translucent) per unit, plus the native "hidden" material (`colorWrite=false`), which still issues main-pass draws. Sharing materials and moving per-unit values (palette, extra light, gattling/disc phase) into instanced attributes or a uniform buffer would cut `setProgram` cost. Keep shadow casting in mind: Three's shadow pass skips objects whose material has `visible = false`.
4. **Whole-map renderable updates.** Renderable `update()` still runs for every map object. Only skip presentation-only parts while culled, as done for VXL pose and building frames. Never skip state that drives gameplay, sounds or removal.
5. **Move simulation and AI to a worker.** This is the largest refactor, worth about 3 ms per frame plus spikes.

Do not repeat these: disabling all descendant matrices; more shader preloading; draw-skip of non-writing passes based on sparse scenes; the C10 matrix policy.

---

## 6. Tools and harness

| Path | Content |
| --- | --- |
| `windows-view-culling-evidence-20261011/harness` | CDP driver (`driver*.js`), runtime A/B injectors (`page-cull.js`, `page-v4.js` mirrors the final culling source), frame probe, matrix-staleness check, draw breakdown, CPU-profile source-map resolver |
| `windows-buildup-evidence-20261011/harness` | Buildup frame probe, contact-sheet and silhouette alignment tools |
| `windows-view-culling-evidence-20261011/run*` | Raw logs, results, screenshots and CPU profiles |
| `windows-buildup-evidence-20261011/` | Contact sheets, silhouette data, raw buildup timing for C9 HD, C9 Original and v2 |

Run notes for Windows hosts:

- Electron's Node can be used as `ELECTRON_RUN_AS_NODE=1 "Red Alert 2 HD.exe" script.js`.
- Launch the game with `--remote-debugging-port=9333 --disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`. Without these, an occluded window pauses the game.
- Use an isolated `RA2_DESKTOP_USER_DATA` profile.
- For source-mapped profiles, build with `bun --bun vite build --sourcemap` into a separate copy of the package with real (not linked) resource folders.

---

## 7. Status and limits

- **User-verified on Windows:**
  - Candidate v1 is correct and feels clearly better.
  - Candidate v2 (`f17e896`) was tested by the user in actual play on the target Windows machine, with no problems reported. **v2 is the recommended integration point.**
- **Not yet verified:**
  - Mac regression. Run the checks in §3.4 on Mac.
  - The specific visual checks in §3.4 have not been separately confirmed, beyond the user's general Windows play test.
- The original completion and diagnostic packages are unchanged.
- No push or publication was made.
