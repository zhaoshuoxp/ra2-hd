# Original-graphics rendering follow-up — 2026-09-14

Scope: the bounded aircraft rendering prerequisite, plus the reported Safari stutter, missing shadows and simplified-looking MCV. The engine pin, retail import profile, rules/art, camera and logical footprints remain unchanged. No HD pipeline, campaign implementation, installer or online mode was added.

**Result: PASS WITH LIMITATIONS for the bounded rendering follow-up.** Vehicle shadows, vehicle visual smoothing, normal Harrier flight and the two-minute ground regression pass. Safari stutter and exact MCV visual parity remain open; neither is declared solved. Machine-readable results: `.artifacts/rendering/acceptance.json`.

## Changes

- `WorldScene` now updates the shadow camera projection after assigning its map-scale frustum. Previously the stored bounds changed while the projection retained the tiny Three.js default frustum. Changing shadow quality also disposes the old render target so the new size actually takes effect.
- `MapSurface` supplies upward terrain normals for the shadow shader and does not write depth for its transparent overlay. `Renderer` explicitly enables depth writes before clearing each scene's depth buffer.
- `WorldScene` and `OctreeContainer` forward the render phase to their children. `Vehicle` already implements velocity-based visual extrapolation, but the phase was dropped at both containers. The phase calculation now accounts for the existing rounded tick scheduler and is clamped to one tick. Simulation scheduling, input processing, movement speed and world positions are unchanged. This restores the existing vehicle presentation path; it does not implement full interpolation for infantry, aircraft or every effect.
- `PipOverlay` creates the optional flight helper only when a helper name exists. Archived RA2 has no `AudioVisual.FlyerHelper`; passing its absent name to the animation factory was invalid. The original aircraft model, selection brackets and shadows remain the presentation path. No helper alias, art member or retail rule override was added. Configured helper names still use the existing factory.
- The optional `?stats=1` offline entry displays browser FPS, observed simulation ticks/s and the p95 frame interval. It only reads counters; it makes no requests and does not modify simulation or input queues. Its tooltip explains the distinction from network and click-to-photon latency.

## Measurements and evidence

All runs use local imported resources, a fresh browser profile and blocked external requests. Headless browser timings are short controlled measurements, not proof of long-match performance or native Safari responsiveness.

| Check | Result |
| --- | --- |
| Chrome before changes, speed 3, 1v3 | About 60 FPS; 400 logic ticks in 20.007 seconds. Render CPU mean 1.44 ms, p95 2.02 ms. |
| Chrome after depth/shadow/phase fixes | About 60 FPS; 400 logic ticks in 20.012 seconds. Render CPU mean 1.73 ms, p95 2.19 ms. |
| Vehicle motion after fixes | During 245 adjacent moving frame pairs, logical position held for 164 pairs while visual position held for zero. The one sampled command took 30.13 ms from normal action-queue insertion to processing. This is not hardware click-to-photon latency. |
| WebKit 26.0, Playwright build 2248, initial comparison | About 59.85 FPS; p95 frame interval 18 ms, worst 37 ms in the default 20-second sample. One sampled command took 35.46 ms in the local queue. This intermediate comparison preceded final depth verification. |
| Final WebKit with frame readout | Default: about 59.53 FPS, p95 18 ms, worst 97 ms; shadows off: about 59.95 FPS, worst 40 ms; low shadows: about 58.82 FPS, worst 214 ms. Each phase is 20 seconds. These separate time windows do not establish shadow quality as the cause of stalls. |
| Final WebKit movement/readout | 244 moving frame pairs: 163 logical holds, zero visual holds. Sampled local action queue time 40.84 ms. The visible readout worked; no page/console errors or external attempts. Shadow target changed from 8192² to 2048² when selecting Low. |
| Native Safari 26.6.2 | WebDriver session rejected because Allow remote automation is disabled. No setting was changed. WebKit is a separate test browser, not a native Safari pass. |
| Frozen shadow toggle, successful runs | Chrome: 1,985 world-view pixels darkened by more than 20 summed RGB levels; WebKit: 1,984. Both have 560 darkened MCV-region pixels and zero changed sidebar pixels. Each on/off pair shares the same simulation state; numeric evidence is in `shadow-toggle.json`. |
| Final ground 1v3 regression | 120.031 seconds, ticks 361–2702, all four players active. AI production counts reached 18/19/19; the human recorded one kill. Original 4×4 construction-yard foundation, selection brackets, camera and seed verified. No page/console errors, external attempts, WebSockets or workers. This is a two-minute regression, not a repeated ten-minute or natural-result certification. |
| Full tests | 21 passed, 0 failed, 87 assertions. Entry typecheck and production build passed. |
| Resource protection | Original installation metadata and five archive hashes match the pre-M0.1 snapshot; no parent/source Git directory. Separation audit passes. |

Local evidence is under `.artifacts/rendering/`: `before/`, `projection-fixed/`, `depth-fixed/`, `webkit-first/`, `model-audit.json`, test/build logs and source-protection reports. Intermediate runs are retained for diagnosis, not treated as final acceptance.

## Aircraft acceptance

The American fixture uses normal MCV deployment, `GAPOWR`, `GAREFN`, `AMRADR`, then one `ORCA` (Harrier). The first aircraft was observed at tick 3162. It was selected, took off and followed a normal Move order; the captured flight samples span ticks 3199–3380. Its FALC mesh has 6,925 vertices, casts shadows, and is not a placeholder. Selection brackets remained visible; the root anchor followed the simulation position as elevation rose from 1.72 to 14.35 tiles. No optional flight-helper animation was instantiated. There were zero page errors, console errors or external requests. Evidence: `aircraft-americans/probe.json` and `aircraft-selected-flight.png`.

Two unsuccessful runs are retained separately. `aircraft-webkit/` used speed 6 with no starting army and hit an upstream handled pathfinding error, `toId is not defined in this graph: 58_96`, before human deployment completed. No pathfinding or AI workaround was added. `aircraft-chrome/` initially requested `GAAIRC`; archived rules forbid that headquarters for Americans, so the fixture stalled and eventually lost its yard. That was a test-fixture error, corrected to the normal American `AMRADR` branch without changing faction restrictions.

The verified Harrier path is a bounded Chrome aircraft render pass, not coverage of every aircraft, animated rotor, HVA frame, landing, attack, paradrop or terrain/ramp shadow interaction. Infantry/aircraft position interpolation and exact retail shading remain separate gaps. Final WebKit covers ground rendering and timing; successful aircraft production has not been rerun in native Safari or WebKit.

## MCV model investigation

Follow-up: the user supplied an original-game eight-facing reference. [mcv-rendering.md](mcv-rendering.md) records the subsequent VPL shading correction and its own acceptance evidence. The observations below describe the earlier decoder-only investigation.

The Allied MCV uses archived `mcv.vxl`, not the missing-resource placeholder. Its `DUMMY01` section is 77×29×33 voxels with 21,119 occupied voxels. The existing mesh has 58,263 vertices and 37,256 triangles. No model simplification or replacement was added in this task.

`scripts/m0/model-audit.ts` independently follows each VXL span's offsets and compares every decoded coordinate, palette index and normal index with the engine reader for MCV, Soviet MCV, heavy tank, medium tank, ORCA asset, FALC and paradrop plane. All seven match. The buildable `ORCA` unit uses `FALC` artwork. The audit records source hashes, bounds and HVA section/frame metadata locally; no model payload is written to project documentation. The format cross-check used the primary [OpenRA VXL reader](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Cnc/FileFormats/VxlReader.cs) as a reference only; the engine remains Chrono Divide-derived.

This rules out a missing model or voxel loss in these tested local files. It does not prove pixel parity with the retail executable. The mesh/Phong lighting path, HVA transforms, normals, palette shading and the supplied archives' broader vanilla provenance still need a defined visual reference. The MCV appearance report is therefore **investigated, not declared fully fixed**.

## Reproduction

Start from the existing imported checkout:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun run build
bun run start:offline
```

Open `http://127.0.0.1:4000/` and reload the page to load the rebuilt application. Use Offline Skirmish, South Pacific, Americans versus three Normal Libya bots, team A versus team B, speed 3 and ten starting units for the established fixture. Keep shadows enabled in graphics options. No reimport is needed for this rendering change.

Use `http://127.0.0.1:4000/?stats=1` to inspect frame pacing in native Safari. Around 60 FPS with 20 ticks/s at speed 3 distinguishes display refresh from simulation cadence; sustained low FPS or large p95 intervals indicate frame delivery stalls. These counters alone cannot establish input latency. Remove the query to hide the panel.

Run browser probes sequentially while the server is running:

```sh
M01_OUTPUT=.artifacts/rendering/depth-fixed node scripts/m0/render-probe.mjs
PLAYWRIGHT_BROWSERS_PATH=.local/playwright M01_BROWSER=webkit M01_STATS=1 \
  M01_OUTPUT=.artifacts/rendering/webkit-final node scripts/m0/render-probe.mjs
M01_SCENARIO=aircraft M01_OUTPUT=.artifacts/rendering/aircraft-americans \
  node scripts/m0/render-probe.mjs
M01_DURATION_MS=120000 M01_OUTPUT=.artifacts/rendering/ground-regression \
  node scripts/m0/compat-browser.mjs
bun scripts/m0/model-audit.ts
bun test
bun run typecheck:entry
node scripts/m0/validate-rendering.mjs
```

The locally downloaded WebKit archive passed `unzip -t`; Node's installer stalled during extraction, so the same downloaded build was extracted into ignored `.local/playwright/webkit-2248`. No dependency version or lockfile was changed. A fresh machine may use Playwright's normal WebKit installer instead. Windows x64 remains untested.

The validator uses the retained `depth-fixed/` Chrome measurement, `webkit-final/`, `aircraft-americans/` and `ground-regression/` evidence directories. Use those output names when replacing the corresponding measurements. Screenshot comparison metadata is retained separately in `shadow-toggle.json`.
