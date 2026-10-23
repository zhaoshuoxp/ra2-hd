# M1.4 — Resolution-independent presentation and existing HD review

Implementation and technical review are complete for the measured macOS Chrome environment. **DISPLAY_CONTRACT_PASS / PRESENTATION_900_USER_CONFIRMED / C_VISUAL_ACCEPTED / PRODUCTION_C_INTEGRATED. WINDOWS_NOT_RUN / PHYSICAL_DISPLAY_UNVERIFIED.** The user explicitly confirmed retaining the 900-high presentation on 2026-09-17, including its use as the presentation reference for later Rhino work. The scale decision does not authorize Rhino implementation. The user subsequently accepted C's visible improvement for the reviewed Conscript/GAPOWR cases in the [sampling and soft-edge experiment](m1-4-sampling-and-soft-edges.md), completing that visual-selection gate. The subsequently authorized [production C integration](m1-4-production-c.md) supplies the new runnable build and bounded state regression. M0 stays closed, historical M1.1 acceptance and GAPOWR review history remain intact, and Rhino's independent accepted target/rejected runtime status is unchanged. The [bounded source/export/game fidelity check](m1-4-fidelity-check.md) remains the retained diagnosis.

## Run and review

For the current production C build, use `bun scripts/m1/play-production-c.mjs`; see [its report](m1-4-production-c.md). The commands and comparisons below retain the original M1.4 build as a control.

After the bounded fidelity check, the user selected a harness-only [sampling and soft-edge experiment](m1-4-sampling-and-soft-edges.md). Its [A/B/C review](../.artifacts/m1-4/edge-review/review-v1/review.html) and `bun scripts/m1/play-display-edges.mjs` are the latest comparison entry. C is visually accepted for those reviewed cases and has subsequently been integrated in the new build; the launch command below retains the original renderer.

From `/Users/Aone/RA2remaster/ra2-hd`:

```sh
bun scripts/m1/play-display-review.mjs
```

This verifies the isolated build's saved SHA-256 inventory, starts a new loopback preview, opens a disposable Chrome profile and prepares a playable scene with both existing 4x assets. Wait for the terminal's `M1.4 playable fixture ready` message. It deploys the original MCV, produces GAPOWR through normal rules and adds eight diagnostic cross-faction Conscripts. Retail faction production rules are unchanged. Manual review uses the actual browser window and its backing density, without the automated test's viewport/DPR emulation. Resize or fullscreen the browser on your Mac, leave browser zoom at 100%, and inspect **Options → Rendering resolution**. Auto, 1080p, 1440p and High must preserve apparent object/UI size and map coverage. Ctrl+C stops this task's browser and server; the normal player profile remains untouched. `M14_PORT=4035` selects another unused port.

For a browser-only entry without the prepared scene:

```sh
bun scripts/m1/serve-display-review.mjs
```

Open [the M1.4 build with both HD switches](http://127.0.0.1:4034/?power-plant-hd=4&conscript-hd=4). Both switches are required; omitting them intentionally retains original art. A normal skirmish obeys faction restrictions, so use the first command for the combined Conscript/GAPOWR fixture. This is a fresh browser production build under `.artifacts/m1-4/build`, not a previous M1.2a build or an updated Electron application.

The [self-contained review](../.artifacts/m1-4/review/review.html) separates sampling quality from artwork quality. It embeds its images, works without JavaScript or external requests, and includes direct full-scene/crop PNG links. Crops have explicit 660×450 CSS dimensions; small windows scroll without shrinking them. Full scenes display at 1920×1080 CSS pixels. The 1080p / 1440p / High crop sources are respectively 660×450 / 880×600 / 1320×900 pixels, at ratios 1 / 4:3 / 2 output pixels per CSS pixel. Crop origin and display size match within each comparison. No synthetic enlargement or diagnostic 2× camera is presented as sampling evidence.

The overall game/UI scale is user-confirmed. The original review and [matched fidelity comparison](../.artifacts/m1-4/fidelity/review-v5/review.html) retain the evidence preceding the user's acceptance of C. Automated checks alone do not establish aesthetic satisfaction; the subsequent explicit user decision closes the bounded visual-selection gate. The subsequent production integration is recorded separately in this execution task.

## Baseline and preservation

The planning prompt cited `5a5695b` and uncommitted Rhino files. Live inspection instead found HEAD `25b15ad` with a clean worktree; the Rhino camera diagnostic had already been committed. This implementation preserves those subsequent commits and edits no Rhino source, script, artwork or report. The initial preservation record includes only this task's newly created snapshot script as untracked. No reset, stash, clean, reimport, push or publication occurred.

**PASS_EXACT_EQUALITY:** `preservation-before.json` and `preservation-after.json` cover the original installation/archive hashes, staged resources, all 64 HD-pack entries, prior M1 evidence/artwork, accepted app bundles, normal `dist`, support files and normal player profile. `build-identity.json` inventories all 153 isolated build files (5,582,138 bytes). Imported retail resources and HD derivatives remain outside Git and the build payload; the existing allowlisted loopback routes serve them separately. No Windows executable, Wine/CnCNet, campaign, vehicle change, art generation, installer or packaging was used.

Historical reports reviewed: M1.1 completion and 4K rendering; M1.2 prototype and review handoff; latest M1.2a native-4K camera diagnostic. The latter proved same-tick native rendering with a harness-only 2× camera and used an older retained build. Its camera changes also changed map coverage; neither that scale nor that old build is used to certify M1.4.

## Coordinate and preset policy

`src/gui/Presentation.ts` centrally defines `REFERENCE_HEIGHT = 900`. For usable CSS content W×H, after existing safe-area padding is removed, the presentation is `(900W/H)×900` and the uniform display scale is `H/900`. Thus 16:9 is 1600×900 and 16:10 is 1440×900. Actual reference HUD dimensions are subtracted before world projection: the tested Allied HUD occupies 168 horizontally and 32 vertically, leaving 1432×868 or 1272×868. Vertical world span and isometric orientation remain constant; horizontal coverage changes symmetrically about the camera center until the existing map-boundary clamps apply.

The root lays out DOM and game UI in reference coordinates and transforms them uniformly into the display rectangle. The WebGL canvas directly allocates the chosen output dimensions, with renderer pixel ratio equal to display scale times output pixels per CSS pixel. It never renders a fixed 1600×900 final image for enlargement. World geometry, SHP frames/anchors, meshes, collision/pathfinding, weapon offsets, animation speed, shadows and gameplay remain unchanged. DOM text stays browser-rendered.

`CanvasMetrics` maps actual page coordinates relative to the current canvas rectangle into presentation coordinates. Pointer Lock relative movement uses the same scale conversion. Ordinary mouse events use page coordinates because browser `offsetX/Y` already account for ancestor transforms and would otherwise be scaled twice. Debug click helpers also return correctly transformed display coordinates. Edge detection and scroll rates remain in presentation coordinates, independent of output density. The original native menu arrow/hotspot and locked dynamic sprite are retained; native cursor images scale with the presentation, subject to Chrome's 128-pixel cursor bitmap limit at very large CSS windows. This browser limit does not affect unit/HUD scaling or pointer targets.

Serialized preset keys are unchanged. Old viewport-size preferences remain readable and serializable but no longer constrain layout; the competing viewport selector is removed. A single reference calibration governs presentation.

| Key | Product label | Output policy |
| --- | --- | --- |
| `native` | Auto (window density) | Actual usable CSS size × measured `devicePixelRatio`, once |
| `original` | Window size (1x) | One output pixel per CSS pixel |
| `720p` | 720p (720 high) | 720 output rows, aspect-preserving width |
| `1080p` | 1080p (1080 high) | 1080 output rows, aspect-preserving width |
| `1440p` | 1440p (1440 high) | 1440 output rows, aspect-preserving width |
| `4k` | High (2160 high) | 2160 output rows, aspect-preserving width |

All policies respect hardware `MAX_VIEWPORT_DIMS`/`MAX_RENDERBUFFER_SIZE`, an 8192-side ceiling and a 16,777,216-pixel main-buffer allocation ceiling. These bound the main color/depth allocation, not total GPU memory including HD atlases and existing shadow targets. The options panel reports measured effective dimensions and, when limited, requested dimensions; detailed cap reasons are exposed in `renderer.outputMetrics`/canvas metadata. Auto is not falsely labeled full native when capped. Common Retina heights above 2160 are supported. Integer buffer dimensions are assigned exactly to avoid floating-point truncation of 3456 to 3455; per-scene GL viewport rounding remains below one render pixel.

Resize/fullscreen changes refresh layout and metrics. Renderer frames also detect backing-density changes without requiring a CSS resize, covering monitor migration. Browser zoom can change both CSS size and reported DPR; all automated baselines start in a fresh 100%-zoom profile. Browser emulation and a verified application buffer do not certify the final physical panel/compositor image.

## Technical evidence

Environment: macOS 27.0 (26A428), Apple Silicon, Chrome 153.0.8010.53. Automated emulated sizes/DPRs are explicitly separate from physical hardware validation. Runtime measurements include actual drawing-buffer dimensions and every observed world draw's `VIEWPORT` and `FRAMEBUFFER_BINDING`. The world renders directly to the default framebuffer at the expected reference-world viewport times render ratio; no hidden low-resolution world intermediate was observed.

Final evidence: `.artifacts/m1-4/game-v8/result.json` and `capture-v8/result.json`; 10 display conditions × 6 presets = 60 measured samples. Sampling/artwork captures share tick 644; the damaged pair shares tick 1364 (health 45.733%). Walking and firing flags are observed in their actual action captures. All ten allocated HD textures release on teardown, and the game reference clears.

At fixed CSS size/DPR, all six presets have identical presentation dimensions, HUD mesh bounds, projected object bounds, camera position/projection/orientation, visible world span, tick/frames, HD identity and pointer targets. Matrix captures freeze the game loop; same-aspect changes preserve normalized object size and reference coverage. Aspect changes preserve vertical coverage and uniform scale. UI rectangles include sidebar top, radar, card, power gauge and command buttons. Camera center stays exact in the sampled positions; map-edge clamping remains the existing policy.

| CSS content | DPR (emulated) | Measured Auto buffer |
| --- | --- | --- |
| 1920×1080 | 1 | 1920×1080 |
| 1920×1080 | 2 | 3840×2160 |
| 2048×1152 | 1.25 | 2560×1440 |
| 2560×1440 | 1.5 | 3840×2160 |
| 3840×2160 | 1 | 3840×2160 |
| 3840×2160 | 2 | 5461×3072, allocation-limited from 7680×4320 |
| 1512×982 | 2 | 3024×1964 |
| 1728×1117 | 2 | 3456×2234 |
| 1600×1000 | 1.5 | 2400×1500 |
| 800×600 | 1 | 800×600 |

At 1920×1080 CSS, Window/720p/1080p/1440p/Auto/High produce 1920×1080, 1280×720, 1920×1080, 2560×1440, 3840×2160 and 3840×2160. At 1600×1000 CSS, High is 3456×2160, not a stretched 3840×2160. Complete 4x art stays active at every output preset.

The static review also passes at 1440- and 600-wide windows with JavaScript disabled and no external requests. The browser exercises real mouse movement and force-attack targeting, menu selection, effective-output labels, saved settings after reload, 800×600 menu usability, fullscreen entry/exit, mouse selection, drag selection, edge scroll, sidebar production, placement preview, minimap click, Pointer Lock acquisition/loss/reacquisition and focus recovery. Relative-motion arithmetic is tested with explicit synthetic movement events while actual browser Pointer Lock is active; it is not a physical-mouse test. The minimap test temporarily opens radar visibility in the diagnostic harness, then removes that override. Production placement and combat remain native. Manual user input and physical display validation remain pending.

Targeted tests cover layout/aspect/camera math, Retina/output limits, invalid settings, input transforms, lock recovery, menu cursor, existing Conscript/GAPOWR HD bindings/family fallback, and importer isolation. **36 tests / 839 assertions PASS; entry typecheck PASS; isolated production build PASS.** Existing resolution tests retain strong expected-coordinate assertions and now use the new reference dimensions. The browser run checks no unexpected page/console/GL errors or external requests, then exits the match and verifies HD texture release. Test-owned browser/server processes are closed after capture. The delivered visible-browser launcher was smoke-tested through fixture readiness and graceful Ctrl+C exit (`manual-smoke-v2.log`, `PLAYABLE_SESSION_CLOSED`, exit 0); neither review port remains listening. Its owned child processes are isolated from terminal signals so teardown completes before exit.

## Existing HD and controlled comparisons

Conscript uses complete `conscript-authored/1`, manifest SHA-256 `4255aaccb76f7f1372d34a447d9d54e9579fb5be9002a7987cd4a115833ea9a0`. Temperate GAPOWR uses its complete body/active/buildup family (`ggpowr.shp`, `ggpowr_a.shp`, `gtpowrmk.shp`), with all resolved manifest/source identities in the runtime report. Both report density 4 and empty fallback attempts. Original shadows, remap, layered activity/damage and shared effects are retained. There is no new artwork, sharpening, lighting, material default or asset-density change.

The sampling triplet uses one frozen tick with the same existing HD, frames, owner, lighting, geometry, display size and camera. The artwork pair replaces only the visible HD bodies with native indexed builders using the exact same logical source/settings at High output, then restores the full HD PNG byte-for-byte. This harness-only substitution does not activate any partial production pack. A second original/HD pair covers damaged GAPOWR. Actual idle/walk/fire and buildup observations are representative regressions, not renewed certification of every frame.

Early diagnostic failures are retained. The first browser launch was sandbox-blocked and retried with authorized local execution. The first Retina test exposed a one-pixel floating-point allocation loss, which was corrected. Frozen artwork restoration initially left deferred batch removals undrained; the harness now drains the normal render queue before capture/restoration. A locked-resize probe initially sampled before the browser resize event reached the application; it now waits for the measured display rectangle before asserting relative movement. The first minimap probe retained selected infantry and therefore issued a command instead of panning; the corrected test clears selection. None of these failures is counted as final acceptance or addressed by relaxing invariance assertions.

Conscript and GAPOWR HD texture reports total 72,351,744 bytes (about 69 MiB), unchanged across sampling presets. A 3840×2160 main color/depth buffer has a nominal 63.3 MiB budget at eight bytes per pixel; actual driver allocation/compositor cost can differ. The report records instrumented render/finish wall time and live GL object counts at each setting, including allocation/warmup overhead. At the fixed 1920×1080 CSS condition, instrumented Window/720p/1080p/1440p/Auto/High samples measured 7.07/2.82/2.42/2.11/3.48/2.18 ms respectively. These are short diagnostic costs, not isolated GPU timings or a long-battle performance claim.

## Changed files and reproduction

Production changes are limited to `Application`, `Gui`, the central presentation helper, `RenderResolution`/`Renderer`, `CanvasMetrics`, pointer input/native cursor scaling, display-coordinate debug click helpers and the existing graphics options UI. No world renderer geometry or camera implementation, HD resolver, shader, pack, Rhino file or gameplay rule changes. Test changes add the M1.4 capture/input/review/launcher/preservation scripts, adapt the existing resolution assertions, and add one opt-in M1.4 hook to the existing power-plant fixture. README/AGENTS current-stage amendments link this report without rewriting historical visual decisions.

```sh
bun --bun vite build --outDir .artifacts/m1-4/build
bun scripts/m1/serve-display-review.mjs
# In another terminal, use fresh evidence directory names:
M12_ORIGIN=http://127.0.0.1:4034 M12_SHORT=1 M14_MENU=1 \
  M12_OUTPUT=.artifacts/m1-4/game-fresh M14_OUTPUT=.artifacts/m1-4/capture-fresh \
  bun scripts/m1/run-power-plant-game.mjs
python3 scripts/m1/build-display-review.py .artifacts/m1-4/capture-fresh .artifacts/m1-4/review-fresh
bun scripts/m1/check-display-review.mjs .artifacts/m1-4/review-fresh
```

Keep the delivered build identity unchanged for manual review. A freshly rebuilt variant needs a fresh reviewed build inventory before using the identity-checking launcher. Full runtime JSON, source/build identities, targeted logs and preservation snapshots are under `.artifacts/m1-4/`. Local commits include only this task's reviewed code/tests/documentation; no resources, generated art or evidence payloads are committed.
