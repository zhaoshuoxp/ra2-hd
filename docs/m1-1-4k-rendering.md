# M1.1 selectable rendering resolution

**PASS_BOUNDED_MAC_4K. This prototype step is complete for the documented scope.** After the screenshot review and equal-size clarification, the user requested completion reporting and handoff to the main planning conversation. See the [completion and acceptance report](m1-1-completion-acceptance.md) for the final scope and retained limits. The user explicitly authorized rendering up to 3840x2160, choosing higher detail while preserving unit and UI display size.

## Result and controls

The main menu now exposes **Options**. Its graphics section starts with **Rendering resolution**: Auto, Original (1x), 720p, 1080p, 1440p and 4K. Auto follows display pixel density, capped at 4K. A selected preset fits the existing aspect ratio within its stated maximum; 1920x1080 logical pixels produce exactly 3840x2160 at 4K, while a 1280x960 logical viewport produces 2880x2160 without stretching. Hardware viewport/renderbuffer limits can lower the output further. The existing viewport-resolution control continues to govern layout/view area separately. Graphics controls remain selectable in fullscreen, persist when leaving Options and survive a page reload. The options panel now scrolls within its bounds.

The renderer changes only drawing-buffer sampling density. CSS size, camera, sprite geometry, scene viewport coordinates and unit bounds remain logical pixels. Mouse mapping and map-edge detection now use explicit logical canvas dimensions. Both normal resize and renderer recreation reapply the selected density. The high-DPI application default is Auto; isolated renderer diagnostics keep Original unless explicitly configured. No authored art, retail archive, accepted desktop bundle or normal `dist` output was changed.

## Evidence

Local root: `.artifacts/m1-1/4k-gameplay-v1/`. The final HD case is `hd-4k-v3/result.json`; the original-graphics control is `original-4k/result.json`. Both use the ordinary MP01T4 1v3 fixture and complete with PASS_BOUNDED_GAMEPLAY, no page/console/GL errors or external requests, and clean HD texture teardown.

| Check | Observed result |
| --- | --- |
| UI selection and persistence | 4K selected through the actual menu, then retained after returning and reloading |
| Fullscreen | Rendering preset remains selectable in actual browser fullscreen |
| Same-frame output | Original: 1920x1080; 720p: 1280x720; 1080p: 1920x1080; 1440p: 2560x1440; Auto and 4K: 3840x2160 on the tested DPR-2 display |
| Geometry and size | All six density snapshots have identical tick, frame, camera bounds/zoom, body vertices, logical dimensions and selection target |
| Input | Browser mouse selects Conscript 1370 after switching to 4K; right-edge scrolling moves the camera; unit tests cover all four edges and CSS-scaled coordinates |
| Resize | Switching to a 1280x960 viewport yields 2880x2160, preserving aspect and logical dimensions |
| Art paths | Authored 4x and original graphics both run at 4K; the HD run still verifies all 301 body/shadow geometry pairs and actual atlas-page bindings |
| Review delivery | Raw same-frame WebGL PNGs plus an enlarged comparison; static review embeds its image and displays with JavaScript disabled |

The first 4K attempt failed because the restricted offline home menu had no Options entry. The entry was added using the existing options route. The second match passed; the final match additionally verifies the bounded scrollable menu and fullscreen selection. Earlier failed evidence is retained.

`hd-4k-v3/same-frame-4k.png` is the raw 3840x2160 game drawing buffer, not a browser-upscaled image. Its paired `same-frame-original.png` uses the same HD art at the prior 1x rendering density. `4k-closeup-comparison.png` shows the same logical crop at 9x display magnification with nearest sampling. This enlargement adds no information; it exposes the different pixel counts in the two actual outputs. `review.html` embeds this comparison without JavaScript or neighboring-image dependencies. Neither comparison substitutes original art for the HD character.

Validation: 30 tests / 558 assertions pass, entry typecheck passes, and the isolated production build passes. New tests cover 4K and hardware bounds, legacy preference migration, saved rendering presets, CSS-scaled mouse coordinates and all four scroll edges. The old native-size gameplay report is historical evidence at renderer ratio 1; this report supersedes that rendering limitation.

## Reproduction

```sh
bun --bun vite build --outDir .artifacts/m1-1/4k-gameplay-v1/build
bun scripts/m1/serve-authored-game.mjs
```

Open `http://127.0.0.1:4000/?conscript-hd=4`, choose **Options → Rendering resolution → 4K**, then return to Offline Skirmish. The server remains loopback-only. `M11_BUILD_DIR` and `M11_PORT` can select an isolated build/port for testing.

Use fresh output folders when rerunning evidence:

```sh
M11_CHECK_4K=1 M11_COLOR=1 M11_MOUSE=1 M11_OUTPUT=.artifacts/m1-1/4k-gameplay-v1/hd-fresh bun scripts/m1/run-authored-game.mjs
bun scripts/m1/build-4k-review.mjs .artifacts/m1-1/4k-gameplay-v1/hd-fresh
```

## Limits

This is a bounded Chrome/macOS check, not Windows, packaged-application, prolonged 4K combat or GPU-context-recovery acceptance. Browser fullscreen and high-DPI output are exercised; a physical external 4K monitor is not certified by browser automation. Units keep their original logical size. 4K output increases available image samples; it does not promise that all detail from a 4x atlas is visible at every display scale. Existing low-resolution map/UI assets remain low-resolution artwork.
