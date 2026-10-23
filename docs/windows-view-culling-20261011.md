# Windows dense-scene slowdown: missing view culling and a dead octree — 2026-10-11

## Root causes

All three causes are renderer-main-thread CPU work and are not Windows-specific code paths. The Ryzen 7 5800H's single-core throughput is roughly half of an M5 Pro's, so the same over-budget frame drops to 25–30 FPS on Windows and still feels acceptable on Mac.

1. **No effective view culling.** `FrustumCuller.cull` set `visible` only on `@brakebein/threeoctree` internal nodes, which the library never reads, and the result was discarded. HD and batched meshes also set `frustumCulled = false`. As a result, every unit, building, tree and overlay on the whole map went through the matrix pass, sprite batching, the shadow pass and the main pass every frame. HD VXL pose work ran for every vehicle as well.
2. **The octree index grows forever and is scanned on every move.** The octree is created with `undeferred: false`, so `add` only appends to `objectsDeferred`, and nothing ever calls `tree.update()`. Every position change (`RenderableManager.onObjectPositionChanged` → `updateChild` → `tree.remove`) does a linear scan of that list. Destroyed objects are never removed from it. In one long match it held 6,358 entries, 6,296 of them dead objects, and 0 objects were actually in the tree. This became the single largest self-time hotspot (9.8%) once culling was in place. The cost grows with match length, and the list also leaks memory.
3. **Three 0.183's `matrixWorldAutoUpdate = false` does not prune traversal.** It still visits every descendant and consumes the root's dirty flag without recomputing it. The first-round matrix skip that relied on this flag was therefore ineffective, and it could leave a unit that had moved while off-screen drawn at a stale position.

## Repair (branch `fix/windows-dense-rendering`, commits `ecd426e`, `fb353fd`)

- `src/engine/gfx/ViewCulling.ts`:
  - Padded orthographic view test using two dot products per object.
  - A culled flag combined with the game's own `visible` through an accessor, so cloak, garrison and destruction visibility are preserved.
  - `installCulledMatrixTraversal`: the container's `updateMatrixWorld` skips culled roots and keeps their dirty flags. A forced pass marks them dirty so they recompute when restored.
  - Margins: 360 px horizontal and 300 px vertical, plus `(foundation + 1) × 60 px` for buildings. Aircraft, visible range circles and non-positioned renderables are never culled.
- `OctreeContainer`:
  - The octree and `FrustumCuller` are removed. `updateChild` and `cullChildren` remain as no-ops for existing callers.
  - A flat per-renderable cull table is maintained in `add`/`remove`. Removal un-hides the object.
  - `cullRenderables` runs every frame from `RenderableManager.onCameraUpdate`, after the camera update and before the scene matrix pass.
- `Vehicle`: HD binding and construction still happen at spawn. Only the per-frame VXL/Rhino pose update is skipped while culled, and `onViewCullRestore` catches up matrices and pose in the same frame.
- Simulation, native renderable `update()` and resources are unchanged. `Building.update` is deliberately not skipped while culled because it drives animation completion, sounds and removal.

## Windows native evidence (this machine)

Hardware and configuration:

- Ryzen 7 5800H, RTX 3070 Laptop (driver 32.0.15.9597), "Beast" power plan.
- Native fullscreen 2560×1600 at DPI 1.5, 165 Hz.
- Unchanged C9 shipping package `bc581b1`, isolated profile.
- YR, `xmp27t8`, 7 brutal AI plus observer, HD 4X, shadows 3.
- AI credits topped up to build a dense late scene.

Method:

- The repair logic was injected at runtime through CDP and compared in the same match: alternating 10 s windows with a 2 s settle and identical scripted camera motion.
- `harness/page-v4.js` mirrors the final source line for line.

Final fresh dense run (`run4-final`, ticks 49k–56k, 5 rounds each):

| | Baseline | Repair |
| --- | --- | --- |
| Mean loop FPS | 28.4–34.6 | 55.5–63.9 |
| Frame median | 27.8–33.8 ms | 14.6–16.4 ms |
| p95 | 39.1–45.8 ms | 22.7–28.4 ms |
| Frames > 33 ms per 10 s | 51–163 | 5–8 |
| Renderer update median | 8.3–9.6 ms | 5.2–6.0 ms |
| Render submission median | 13.1–14.7 ms | 6.8–7.9 ms |
| Simulation per frame (mean) | 6.2–9.4 ms | 2.7–3.3 ms |
| Draws | 734–794 | 446–491 |
| Ticks per second (target 67.5) | 59–63 | 65–67 |

Later in the same long match (ticks 78k–98k, as AIs were eliminated and the octree list kept growing): baseline 30–49 FPS, repair 68–126 FPS.

Validation:

- **Matrix staleness:** each frame, every on-screen object's world matrix was compared with a forced fresh recompute while units and the camera moved. Result: 0 stale entries in about 550k checks with the repair.
- **Pixel parity:** frozen-simulation full 2560×1600 `readPixels` at 3 views. Repair-vs-baseline differences fall within baseline-vs-baseline animation noise.
- **Tests:** `scripts/integration/view-culling.test.ts` (new) and `static-octree-matrices.test.ts` (existing) pass against the real Three 0.183.2 build using Node type stripping and a minimal `bun:test` shim.

Evidence (logs, CPU profiles, results, screenshots, harness) is in `windows-view-culling-evidence-20261011/` beside this checkout.

## Built candidate (`RA2-HD-Windows-ViewCulling-Candidate-v1`)

Build and test (Bun 1.3.14 from the official release, SHA-256 verified; `bun install --frozen-lockfile` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`):

- Type checking (`tsconfig.build.json`) passes.
- Full `bun test` matches baseline `bc581b1` exactly. Baseline: 429 pass / 25 failing test names. Candidate: 434 pass with the same 25 failing names; the extra 5 passes are the new tests. Those 25 failures depend on ignored authoring data that is not in Git.
- Reproducibility check: building untouched `bc581b1` on this machine gives all 144 JS chunks byte-identical to the frozen C9 source-mapped bundle. Non-JS text files also match once the checkout uses LF line endings (`core.autocrlf=false`).

Packaging:

- Application source `f3536f6` was built with `scripts/editions/build-review.mjs`.
- Staging used `tools/stage-candidate.mjs`, a Node port of `stage-candidate.py` with the same checks. All 6,107 frozen runtime/resource files were verified by hash. The manifest is `candidate-manifest.json`.

Native Windows run of the built candidate (`run5-built-candidate`; nothing injected, same automated dense scene and probe):

- 55.6–63.9 FPS over 8 windows at ticks 49k–55k. Baseline at the same ticks in `run4-final` was 28.4–34.6 FPS.
- Frame median 14.5–16.2 ms; frames > 33 ms per 10 s: 8–15; draws 444–481.
- 0 page exceptions and 0 console errors for the whole session.
- Matrix staleness: 0 stale in 601,326 checks.

## Not yet done / remaining cost

- Not yet verified:
  - shadows at screen edges under long-shadow lighting;
  - minimap camera jumps;
  - Mac regression;
  - the user's own play feel.
- Remaining per frame at about 60 FPS in the dense scene:
  - render submission ≈7 ms for ≈460 draws, about a quarter of which are HD sprite edge-coverage passes;
  - renderable `update()` for the whole map ≈5.5 ms, `Building.update` being the largest;
  - simulation and AI ≈3 ms.
