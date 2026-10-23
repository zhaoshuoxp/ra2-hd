# M1.4 shroud boundary, pause speed and HUD text

The user accepted the stabilized power-plant animation, then reported a grid at the explored/unexplored boundary, requested game speed in paused options, and identified the money digits as evidence that resolution changes were not improving clarity. This correction keeps the accepted animation and reference height 900, fixes shroud overlap, adds single-player pause speed, and rasterizes HUD text at the actual output density. Existing artwork, original resources and unrelated Rhino work remain preserved.

## Run and review

Run `bun scripts/m1/play-production-c.mjs` from the repository. It verifies and opens the new isolated build in Chrome; Ctrl+C closes that session. Earlier builds and evidence remain available. The [native-size review](../.artifacts/m1-4/pause-and-shroud/review-v3/review.html) shows the corrected boundary, matched money digits, actual pause-menu resolution changes and the speed slider. Use 100% browser zoom.

Status: **M1_4_ACCEPTED_AND_DELIVERED / TECHNICAL_PASS / VISUAL_ACCEPTED**. The user confirmed this task is ready for delivery. See the [completion record](m1-4-completion-acceptance.md). Retained review pages and test receipts keep their historical pending labels.

## Changes and causes

**Shroud grid.** The previous one-texel mask extension closed sampling holes, but its rectangular sprites overlapped at semi-transparent boundaries and multiplied darkness twice. Each shroud sprite now draws only its native tile diamond. Collapsing exterior rectangle corners retains the existing eight-vertex UV-update stride; frame lookup uses the same diamond UVs. Tile centers, exploration data, camera, world entities and gameplay geometry remain unchanged. The private coverage extension still prevents neutral texels leaking inside the diamond. A temporary uniform half-dark mask demonstrates the difference: the old rectangle path gives 64/255 (two contributions), while the corrected path gives 128/255 (one contribution) over all 7,137,207 tested interior viewport pixels. All six output presets at three camera offsets retain zero bright pixels in a fully covered world.

**Paused speed.** Options now contains the native seven-step Game speed slider in single-player matches. It changes the saved resume speed while the simulation remains paused, applies on Resume, and retains the selection when Options is reopened. Slowest/middle/fastest are the existing 10/20/60 ticks per second, with no rules or animation cadence changes. The control is bound to this match rather than global graphics preferences. Multiplayer and replay controls are not given an unsynchronized local speed override.

**Money digits.** The main rendering-resolution setting already changed the drawing buffer. The money display used `UiText`, whose glyph canvas stayed 168x16 pixels and was magnified with nearest sampling at every output setting. `UiText` now rerasterizes its existing font at the output-to-logical density and linearly samples the resulting glyph coverage. Font size, text alignment, color, logical geometry and click regions remain unchanged. The existing sidebar bitmap artwork is intentionally preserved. Resolution changes release the old immutable GPU texture allocation before reupload; disposal removes the output-change listener.

At the controlled 1920x1080 CSS / DPR 2 window, money textures are 135x13, 202x20, 269x26 and 404x39 for 720/1080/1440/2160-high output, respectively. Logical size stays 168x16. Auto and 2160 high both produce 3840x2160 here, so those two choices correctly look identical. An options hint explains that resolution affects image detail while window size and zoom stay fixed.

## Evidence and scope

Artifacts are isolated under `.artifacts/m1-4/pause-and-shroud/`. `check-v5/result.json` checks actual pause-menu clicks, allocation sizes, unchanged text geometry, slow/middle/fast resume, shroud coverage and overlap. The same-value money comparison recreates the previous fixed-1x glyph path using the same string and font in the actual renderer, then restores the corrected path; scene pixels outside the money display are checked for equality. The review keeps fixed display sizes and 2x screenshot density.

Targeted tests cover diamond area and update stride, native speed mapping, HD rendering/fallback, presentation, resolution, cursor and import isolation. Full natural gameplay includes construction, movement, layered occlusion, selection, damage, repair, selling, rebuilding, destruction and texture cleanup. Final checks: **44 tests / 910 assertions PASS**, entry typecheck PASS, 153-file isolated build PASS, focused pause/shroud/HUD check PASS, and full bounded natural gameplay PASS. Rapid resolution switching has zero GL errors. Text GPU storage and resize listeners release on exit. Exact preservation checks passed for all 14,372 protected entries and 2,019 prior M1.4 files.

An intermediate full regression caught a WebGL invalid-value error when a larger glyph canvas reused immutable smaller storage. The final candidate explicitly releases that storage on dimension changes; the stricter browser probe checks both capture and subsequent GL errors. Earlier failed evidence remains retained and is superseded only after the final runs pass.

No repainting, new sprite family, Rhino implementation, packaging, push or publication. Windows, physical external-panel output and long battles remain unverified. The user has accepted this bounded deliverable, including the corrected shroud and HUD text; no visual-review gate remains open for M1.4.

## Reproduce

Use fresh output directories. Build with `bun run build --outDir <fresh-build>` and serve via `M12_BUILD_DIR=<fresh-build> M12_PORT=<unused-port> bun scripts/m1/serve-power-plant-game.mjs`. Run `scripts/m1/run-power-plant-game.mjs` with `M12_ORIGIN`, fresh `M12_OUTPUT`, `M12_SHORT=1`, `M12_DENSITY=4`, `M12_CONSCRIPT=4`, and fresh `M14_PAUSE_OUTPUT` for the focused check. Omit the short/pause variables and set `M12_OCCLUSION=1` for natural gameplay. The probe uses the retained original shroud geometry from the preceding correction for its same-scene control.

Generate a review with `python3 scripts/m1/build-pause-review.py <focused-check-output> <fresh-review-directory>`. Run `bun run typecheck:entry` and the targeted tests, including `scripts/m1/pause-and-shroud.test.ts`. The final visible-browser entry can be checked with `M14_C_SMOKE=1 bun scripts/m1/play-production-c.mjs`.
