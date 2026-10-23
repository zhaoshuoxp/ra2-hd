# M1.1 authored Conscript gameplay checkpoint

**PASS_BOUNDED_MAC_GAMEPLAY.** The user accepted the complete candidate's appearance and instructed continuation. The approved 301-frame resource is integrated into an explicitly selected local offline skirmish. The subsequent 4K review and user-requested completion/handoff close this bounded prototype step; see the [completion and acceptance report](m1-1-completion-acceptance.md). This is not Windows, packaged-application or sustained-performance acceptance.

The later user-authorized [4K rendering checkpoint](m1-1-4k-rendering.md) supersedes the pixel-ratio-1 limitation and adds the current review entry. This report preserves the earlier native-size checks. To serve its historical build explicitly, set `M11_BUILD_DIR=.artifacts/m1-1/hd-gameplay-v1/build`; the server now defaults to the newer 4K build.

## Accepted resource and activation

The approval receipt is `.artifacts/m1-1/hd-gameplay-v1/art-acceptance.json`, bound to the SHA-256 of the reviewed candidate report. Historical art observations remain in the earlier report; this receipt records the user's acceptance as reviewed, not additional repainting. The six previously accepted frames are unchanged.

`package-authored-art.py` verifies the approval binding, complete native IDs, file hashes, dimensions and geometry before packaging the accepted exports. Local pack: `.local/hd-packs/conscript-authored/1/`. Manifest SHA-256: `4255aaccb76f7f1372d34a447d9d54e9579fb5be9002a7987cd4a115833ea9a0`.

| Density | Pages | Base + data GPU bytes |
| --- | --- | --- |
| 2x | 1 | 10,747,904 (10.25 MiB) |
| 4x | 2 | 35,389,440 (33.75 MiB) |

Only `?conscript-hd=2` or `?conscript-hd=4` on loopback requests the selected pack, in a single-player game. `serve-authored-game.mjs` registers exact validated manifest/page routes and a single selection descriptor. Normal launch makes no HD request. Accepted desktop bundles, normal profiles, retail files and distribution outputs remain untouched.

Before renderable construction, the loader hashes the actual `cons.shp` bytes in the game VFS and compares all 301 decoded frame records plus theater/canvas with the complete pack. It verifies manifest/page hashes and sizes, then uses the existing whole-member 4x → 2x → original resolver. Missing or rejected data never enables partial frames. A per-match `ImageFinder` binds the override to the exact validated decoded object; only infantry rendering consumes it. The original shadow path, logical geometry, animation rules, selection bounds, camera, depth ordering and voxel rendering remain in use. Match teardown owns and releases HD textures after the renderables.

## Actual-match evidence

The test uses the normal offline game, MP01T4, seed `1700000000000`, Libya versus three Normal Libya bots, 10 starting-unit setting, 10,000 credits and speed 3. There are 14 local Conscripts at start. Movement, ground attack, cheer, MCV movement/deployment and friendly-fire combat use ordinary player commands. No units are spawned by the harness and no health, credits, rules or simulation timing are overwritten.

| Check | Evidence |
| --- | --- |
| Native size and camera | Original, red 4x, blue 4x and fallback 2x runs have equal camera bounds/rotation and zoom 1. The game canvas remains 1280×960 with renderer pixel ratio 1 on a screen scale of 2; no Retina renderer claim. |
| Frame geometry | Every run compares all 301 body and original-shadow vertex arrays using real match inputs in additional models outside the scene. All pairs match exactly. This is separate from simulation action coverage. |
| Atlas and shadow bindings | A further yellow 4x run verifies that live action traces use both atlas pages with the correct base/data pair; all 301 original shadow texture bindings remain identical. |
| Team colors | Yellow, red `(255,24,24)` and blue `(34,105,212)` are observed in actual match screenshots. Both HD density variants retain the engine owner palette path. |
| Actions | Main traces cover standing, walking, firing and cheer. Normal combat records prone frame 116, prone-fire frames 242–247, transition frame 268 and death frames 134–148. |
| Selection | The original selection overlay remains visible. A browser mouse click selects the expected Conscript ID 1370; this is automated browser input, not a physical-mouse certification. |
| Building occlusion | A Conscript moves behind a normally deployed Soviet construction yard. A synchronous body-contribution probe in the actual scene measures 49 visible body pixels versus 233 with the building hidden. All temporary visibility is restored in the same call; no simulation state changes. |
| Whole-member fallback | The browser deliberately returns 404 for a 4x page without changing stored files. The match selects complete 2x with one `missing-page` attempt and continues normal actions. The intentional 404 is retained in the log. |
| Default off | The same fixture without the query uses original materials with no HD identity or allocated HD pages. |
| Cleanup | Red/blue 4x runs release all four HD textures; the fallback 2x run releases both. The game debug reference is cleared on normal screen teardown. |
| Errors | Accepted runs have no page errors, unexpected console errors, GL errors or external requests. |

The first two blue occlusion attempts are retained as failures: the harness tested building-corner coordinates as if they were MCV deployment-center coordinates. The corrected harness finds a legal center and moves the MCV there before deploying; `game-4x-blue-v3` is the accepted occlusion run. This correction changes the test inputs, not the game rules or renderer.

Local evidence root: `.artifacts/m1-1/hd-gameplay-v1/`. `acceptance.json` summarizes the accepted cases; each case retains raw frame traces and screenshots. `review.html` provides a compact screenshot review. The initial yellow run and failed blue attempts are retained separately. The accepted yellow binding check is `game-4x-pages`.

Validation: 27 tests / 539 assertions pass, entry typecheck passes, and the isolated production build passes. The existing resolver and desktop/import boundaries remain covered. The new match-binding test verifies that the override cannot carry into another image object or another match. Build output remains under the evidence root, outside accepted `dist` and application bundles.

The screenshot review checks all 23 captures at their recorded 2560×1920 size, case/action switching, screenshot-pixel inspection and a narrow viewport without page overflow. `review-check.json` records PASS_REVIEW_UI; `review-desktop.png` records the page layout. These checks validate presentation, not additional game behavior.

## Reproduction

Run from the repository root. Packaging requires Pillow and an explicitly accepted review receipt; it refuses to overwrite an existing revision.

```sh
python3 scripts/m1/package-authored-art.py \
  --review .artifacts/m1-1/full-art-review-v1 \
  --acceptance .artifacts/m1-1/hd-gameplay-v1/art-acceptance.json --revision 1
bun --bun vite build --outDir .artifacts/m1-1/hd-gameplay-v1/build
bun scripts/m1/serve-authored-game.mjs
```

Open `http://127.0.0.1:4000/?conscript-hd=4` and choose Offline Skirmish. Choose a Soviet country to control Conscripts. Without the query, the same server uses original graphics. The local server stays available for user review; stop it when finished.

In a separate terminal, run each case sequentially with a fresh output directory:

```sh
M11_DENSITY=1 M11_OUTPUT=.artifacts/m1-1/hd-gameplay-v1/game-original bun scripts/m1/run-authored-game.mjs
M11_COLOR=1 M11_COMBAT=1 M11_MOUSE=1 M11_OUTPUT=.artifacts/m1-1/hd-gameplay-v1/game-4x-red bun scripts/m1/run-authored-game.mjs
M11_EXTENDED=1 M11_COLOR=2 M11_OUTPUT=.artifacts/m1-1/hd-gameplay-v1/game-4x-blue-v3 bun scripts/m1/run-authored-game.mjs
M11_REJECT_4X=1 M11_EXPECT_DENSITY=2 M11_OUTPUT=.artifacts/m1-1/hd-gameplay-v1/game-fallback-2x bun scripts/m1/run-authored-game.mjs
M11_OUTPUT=.artifacts/m1-1/hd-gameplay-v1/game-4x-pages bun scripts/m1/run-authored-game.mjs
python3 scripts/m1/validate-authored-game.py
python3 scripts/m1/build-gameplay-review.py
```

## Remaining acceptance limits

This evidence is Chrome on the current macOS host, in short scripted matches. Windows, packaged application integration, sustained large HD battles, context recovery and the full range of lighting/occlusion combinations are not certified. Paradrop and every simulation-facing/sequence combination were not exercised. Full-member source/geometry coverage does not substitute for those observations. Subsequent 4K review and completion are recorded in the completion report; no new unit, building, vehicle or campaign task has been started.
