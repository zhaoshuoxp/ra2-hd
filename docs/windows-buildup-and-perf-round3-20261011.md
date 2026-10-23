# Building buildup animation and performance round 3 — 2026-10-11

Branch `fix/windows-dense-rendering`, commit `f17e896`. Candidate `RA2-HD-Windows-ViewCulling-Candidate-v2`. Evidence is in `windows-buildup-evidence-20261011/` beside this checkout.

## Buildup findings

The capture method recorded every rendered frame of 96 AI buildups per mode: YR, `xmp27t8`, 7 AI plus observer, native 2560×1600.

Contact sheets were made in one session at the same pose. Each buildup frame was rendered with its HD override and then with the override removed, for a direct HD-vs-original comparison. Silhouette alignment uses background-subtracted building masks and compares IoU between HD frame *i* and original frame *j*.

### Engine-side causes (fixed)

1. **Animation clock dropped its fractional remainder.** `Animation.update` set `this.time = time` on every advance. As a result:
   - cadence followed the render rate: 17–62 ms steps for a nominal 32 ms frame;
   - every building animation ran 12–30% slow;
   - HD and Original modes were affected identically.

   The fix carries the remainder; pauses still resume without a burst.

   Candidate v2 measurements:
   - buildup duration 797–829 ms against 800 ms nominal (was 850–1060 ms);
   - step median 31–32 ms (was 36–39 ms).
2. **HD family swap mid-buildup.** A building family that finished loading after a buildup had started switched from original to HD art partway through. This was observed on GACNST deploys at match start. The swap is now published when the buildup/unbuild sequence ends; in v2 no mid-sequence swap occurs.

### HD art sequence divergence (not fixed; art data)

HD buildup frames cover every native frame (HD coverage equals frame count for all 28 families), and the last frame matches the finished building. However, several HD sequences follow a **different construction order or pacing** from the original frames:

| Family | Observation |
| --- | --- |
| GACNST | HD frames 0–4 hold the MCV vehicle pose while the original unfolds the tower; HD frame 5 jumps to a flat pad; the tower/crane appear about 6 frames late. |
| YAWEAP | HD frame 0 shows a small plate that vanishes in frame 1. HD frames 1–5 are empty ground while the original pad grows. The hangar rises first in HD and last in the original. Silhouette area: HD stays at 0.05 until frame 4, then catches up to 0.85 by frame 11. |
| GAWEAP | HD walls are complete by frame 5 (about original frame 9); HD then idles while the original catches up, and the roof arrives late. |
| YATECH | HD builds most of the tower by frame 8 and barely changes in the second half; the original builds steadily. |
| NAPSIS, NALASR, NAWEAP, GATECH, YABRCK | Low minimum silhouette IoU (0.31–0.56) against the same-index original frame; pacing differs. |
| GAPOWR, NAPOWR, NAREFN, GAAIRC | Track the original closely (mean IoU 0.79–0.94). |

The HD buildup art and its frame mapping come from the authoring pipeline, which is not in Git. Correction options:

- re-author those sequences against the original frame timing; or
- add a per-family frame-retiming table (native frame → HD frame), applied in `getBuildingHdOverride`. This would only fix pacing, not construction order.

Remaining non-HD issue: construction-yard deploys at match start skip 2 frames during an ~86 ms simulation hitch. That hitch is the full-map passability island flood-fill (`Terrain.computeIslandIds`); changing it touches lockstep-deterministic game logic.

## Performance round 3

Profile of the current code in the dense scene (about 60 FPS, ≈16.6 ms per frame):

| Area | Share |
| --- | --- |
| Render submission (Three per-draw setup: `setProgram`/uniforms/attributes) | ≈43–46% |
| Renderer update | ≈30–34% |
| ↳ whole-map renderable `update()` | ≈15% |
| ↳ sprite batch rebuild | ≈8.6% |
| Simulation and AI | ≈19–20% |

Draws are about 360 in the world scene. Most HD buildings and sprites form single-sprite batches because each sits on its own texture page, so each draws a body plus edge-coverage passes. Another ~67 draws are observer-mode HUD text quads that do not appear in normal play.

Changes made this round:

- Off-screen buildings skip sprite frame uploads; state still advances.
- Cached `ShpBuilder` geometry-key suffix and `MeshBatchManager` batch keys, guarded by input snapshots.
- Cull loop keeps position and state per entry.

The targeted functions dropped as expected:

- cull loop: 3.0 → 1.9%;
- `Building.update`: 5.5 → 4.3%;
- sprite `setFrame`: 1.9 → 0.8%.

Overall FPS did not measurably change: 54–61 vs 53–63 FPS, within scene variance.

Reaching 90+ FPS in this scene would require structural work:

1. Fold the HD edge-coverage passes into the body pass, and share materials across instances to reduce per-draw state changes.
2. Atlas or array HD pages so building sprites can batch.
3. Move simulation and AI off the render thread.

Each needs its own visual-parity validation.

## Validation

- Type checking passes.
- Full `bun test` fails the same 25 tests as baseline `bc581b1`, which depend on ignored authoring data.
- New tests pass: `animation-clock`, `shp-geometry-key`, `view-culling`. The `feedback-r11` gas-interpolation expectation was updated to the corrected phase (0.35/0.70 instead of 0.30/0.60).
