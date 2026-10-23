# M1.5 unified HD desktop application

The historical desktop correction is [M1.5 R3](m1-5-r3-fullscreen-loading-speed.md), including stable first fullscreen entry, full-viewport loading and five solo speeds, retaining the R2 display, checkbox and Conscript corrections. The current [R5 speed adjustment](game-speed-r5.md) uses 22.5/45/67.5 default/90/112.5 ticks per second. The original delivery below remains historical evidence.

Status: `DESKTOP_CORE_CHECKS_PASS / NATIVE_INPUT_CHECK_PENDING / USER_ACCEPTANCE_PENDING`. Windows: `NOT RUN`. This is a runnable local development deliverable; full technical and user acceptance are not yet claimed.

M1.5 builds one independent local macOS Apple Silicon application from the current source. It combines the accepted Conscript and temperate GAPOWR artwork, opt-in normal-game Rhino, production C and the final M1.4 reference-height-900, shroud, paused-speed and HUD corrections. It does not add artwork or broaden asset-specific visual acceptance.

## Source and build

The verified starting checkout was clean `1937026ed0061d0e186698ebf38ba27034a7d49d` on `m0-2-stabilization`. The integration checkpoint is `602d06c29108a3a1104f8842a253a45edc4f9d9a`; the pathfinding correction is `1ea2a33cba96815283d025731f71647aeb91e254`; the final runtime checkpoint is `7ab7527d421f928f7df1dd754f843a6eafb72234` (menu mask teardown). Electron remains pinned at 44.4.0. Build from the repository with:

```sh
bun run desktop:unified
```

The command writes a fresh dated directory under `.artifacts/m1-5/`, prints the application path, and records `source.json`, `source.patch` and `artifact.json`. The source snapshot distinguishes its parent HEAD from uncommitted implementation content. Web, application payload and full bundle inventories include SHA-256 hashes. Normal `dist`, previous milestone builds and apps are untouched. The bundle loads its payload relative to itself; the runtime does not require a terminal server or Chrome.

Delivered application:

`/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-5/build-2026-09-19T06-12-29-587Z/Red Alert 2 HD M1.5.app`

Double-click this application in Finder. Equivalent direct launch from outside the repository:

```sh
open '/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-5/build-2026-09-19T06-12-29-587Z/Red Alert 2 HD M1.5.app'
```

The adjacent `artifact.json` preserves the original build-time status and complete inventory; `implementation-binding.json` verifies the later implementation commit rather than relabeling the earlier build. The bundle contains 163 application payload files, including 153 allowlisted web files; 433 full-bundle file/symlink entries were verified. It was built after `1ea2a33` and before `7ab7527`; all 1,333 recorded runtime/build inputs match `7ab7527` byte-for-byte. Earlier build `build-2026-09-19T05-29-58-714Z` remains historical and lacks the pathfinding correction.

The output is a local Electron development bundle. No installer, signing, notarization, updater or public release is included. The runtime's actual packaging and architecture observations are recorded separately from the target label.

## External resources and graphics

The application uses `~/Library/Application Support/RA2 HD M1.5` for registration and preferences. It reads the old `RA2 HD/resource-registration.json` when the new profile has no registration, validates the existing external import, and writes only the new profile. Old settings are not migrated or overwritten. If no valid import is registered, choose the existing `ra2-hd/.local` folder through the local selection screen. The original retail installation is never mounted or imported again.

Options contains independent Original/HD controls for Conscript, Power Plant (temperate) and Rhino. New profiles retain Original defaults. Conscript and GAPOWR changes take effect next match; Rhino retains live switching. Rendering resolution remains independent. The product shows concise availability or original fallback; detailed paths, hashes and selection failures remain in local diagnostics.

Conscript and GAPOWR resolve complete members/families with 4x -> 2x -> Original fallback. Rhino keeps its accepted eight-heading, independent-part, remap-mask contract and complete-original unsupported-state fallback, including translucent batched casters. An unavailable family cannot disable another valid family. No new density variants or artwork are inferred.

Pinned external identities:

| Resource | Accepted identity |
| --- | --- |
| `conscript-authored/1` manifest | `4255aaccb76f7f1372d34a447d9d54e9579fb5be9002a7987cd4a115833ea9a0` |
| `power-plant-authored/1` family | `31b76d8632f470e41886aaf2987c3df618370f1b25ea80725d044e450f94b2d2` |
| `rhino-authored/1` manifest | `eceed284e84a7ab121a3f10789509ec6fcf933e498ea75adc5796640e4d46294` |

GAPOWR retains the accepted `stable-structure-effects-v1` runtime policy. The latest source also includes Conscript bridge coverage/paradrop shadow corrections and Rhino native pose, special-state and translucent-shadow restoration. See [Conscript state validation](m1-1-state-validation.md), [Rhino gameplay](m1-3f-rhino-gameplay.md), [Rhino states](m1-3g-rhino-states.md), [Rhino shadow acceptance](m1-3g-rhino-shadow-opacity.md), and [M1.4 delivery](m1-4-completion-acceptance.md).

The trusted `ra2://game/` origin serves only fixed, validated manifest/page/mask routes and explicitly allowlisted application files. Canonical-path checks reject symlinks and traversal; manifest identity, size and content hashes fail closed. Renderer Node access remains disabled, with sandbox, context isolation, web security, navigation and preload restrictions retained. Optional HD failures still permit original-graphics play. No automatic downloads occur.

The application is self-launching but depends on external user-provided retail/support files and optional HD packs. These are excluded from Git and the app payload, as are fixture scripts, raw artwork, evidence, registration files and user profiles.

## Verification and acceptance

Desktop checks below use the actual bundled Electron executable, launched with working directory `/private/tmp` and disposable profiles. Playwright operated ordinary menus, construction queues and game orders; it also read existing diagnostics. No fixture script is in the product payload. These checks are automation, not manual play.

| Check | Result and evidence under `.artifacts/m1-5/` |
| --- | --- |
| Runtime identity/security | `arm64`, Electron `44.4.0`, `app.isPackaged=false`; sandbox/contextIsolation/webSecurity enabled, nodeIntegration disabled. `smoke-1789795869934/result.json` records the initial bundle; the final gameplay receipt independently records arm64/44.4.0, cwd and packaging state. The final bundle was also opened via macOS Launch Services (`open`) from `/private/tmp` for user review. |
| Normal Soviet game | PASS, `gameplay-1789798645580/result.json`: one human and three Normal AI on separate hostile teams, MP01T4, seed 1700000000000, credits 10000, ordinary starting-force setting 10. This is a four-way game, not a 1v3 coalition. Normally constructed NAPOWR, NAHAND, NAREFN and NAWEAP, then produced four E2 and one HTNK. |
| Conscript/Rhino rendering and combat | PASS: sampled 15 Conscript and three Rhino, all using HD; 596 moving and 85 firing observations, including new Rhino 2337 Cannon projectiles and independent turret facing. Normal result at tick 6359 was defeat. `soviet-produced.png`, `results.png` and result JSON retain evidence. GL errors: zero. |
| Allied GAPOWR lifecycle | PASS in the subsequent normal Allied match: construction and active appearance, ordinary GI force-fire damage to 0.2667 health, repair to 1.0, then native sale. `allied-plant.png`, `plant-damaged.png`, `plant-repaired.png`. Built object 1439 records the actual aggregated SHP and active/buildup HD override identities in the build step. No faction rules changed. |
| Result/menu/next match | PASS: defeat screen, Continue, lobby and menu, then Allied game, Quit/Continue/menu and an Original-only game. The final harness completed all transitions itself. The earlier passing pre-teardown-fix receipt `gameplay-1789797180506` needed a supplementary ordinary Continue click after its second match; its separate `score-continuation.json` remains preserved. |
| Settings | PASS: three ordinary HD controls, full quit/relaunch retained `1,3,1024x768,native,1,1,1`; after switching all controls to Original the next game reported both SHP densities 1 and Rhino disabled. Repeated live Rhino toggles restored the same units. |
| Bridge/special-state probe | PASS, `states-1789797442748/result.json`: normally initialized E2/HTNK were teleported to real retail high-bridge tiles and assigned controlled cloak/warp states. Bridge order 2 versus ground/under-bridge order 0; friendly opacity 0.5, hostile hidden; shadow restoration and explicit removal/disposal passed. This is supplementary controlled evidence, not natural acquisition of those abilities. |
| Optional/retail fallback | PASS, all six cases in `fallback-1789797393703/result.json`: no HD; damaged 4x pages to complete 2x; both SHP densities damaged to Original while Rhino stays valid; corrupt Rhino to Original while SHP stays 4x; missing/invalid retail to the selection flow. Test data is a disposable copy under `external data é`; accepted data was untouched. |
| Routing | PASS: narrow manifest/page/mask routes and MIME types, rejected unknown identities and symlink escapes, independent family fallback. `registration-*` result and automated boundary tests. |
| Offline/errors | Passing gameplay/state sessions have no uncaught renderer errors or renderer termination; session audits show zero unexpected outbound attempts. Fault tests intentionally produce rejected-route/missing-page 404s; these are separate from unexpected errors. Baseline music/legacy filename warnings remain. `session-audit.json`. |
| Source tests/build | PASS: 96 tests, 19,197 assertions, entry typecheck and isolated production/app build. `tests-v4.log`, `typecheck-v3.log`, `build-v3.log`. |

The bridge/fault-injection desktop runs used the preceding `build-2026-09-19T05-52-43-092Z` bundle. Its runtime differs from the final bundle only by the four-line menu-mask disposal correction. Those unaffected rendering and routing paths were not rerun; the final bundle has its own gameplay and three-match UI/cleanup checks.

The effective Conscript path is the SHP builder's HD override; GAPOWR uses its validated body/active/buildup family and `stable-structure-effects-v1`. Rhino uses the existing native VXL/HVA unit builder plus independent HD body/turret parts. In this Electron sample the native Rhino meshes were **not batched**, despite `WEBGL_multi_draw` being available. Friendly translucent HD therefore used per-unit shadow materials and restored native materials afterward. The accepted whole-original fallback for unsupported translucent batched casters remains in source/tests; no broader GPU-path certification is inferred. The unchanged paradrop path reuses the prior accepted Conscript evidence rather than rerunning all historical ticks.

### Display and input evidence

At fixed CSS area 1279.992 x 927 and DPR 2, all three captures used the same tick, 900-high logical presentation, camera matrix/position, viewport, projected unit points and selected HD identities. Values below are actual output, not filenames:

| Output preference | Drawing buffer | Renderer ratio | Credits text raster |
| --- | --- | --- | --- |
| 1080p | 1491 x 1080 | 1.2 | 202 x 20 |
| High (2160-high) | 2982 x 2160 | 2.4 | 404 x 39 |
| Auto/native | 2560 x 1854 | 2.06 | 347 x 33 |

These aspect-preserving buffers do not claim a physical 3840 x 2160 panel. Native screenshots are `ui-1789798381385/same-scale-{1080p,4k,native}.png`. Resize to 1120 x 820 kept logical height 900. Actual clicks selected the expected unit; drag selected 19 units; edge movement changed the camera; sidebar clicks queued a power plant and activated placement. Paused speed changes kept the tick stopped, resumed with the selected speed, and produced no GL error. The menu's asset cursor/hotspot declaration, readable HUD and retained shroud appearance were inspected in actual desktop captures; physical hotspot feel remains for the user.

Pointer Lock and native fullscreen are **UNVERIFIED** in this automation session. Pointer Lock returned `WrongDocumentError`; Electron reported a visible but unfocused native window and `isFullScreen=false`, even after activation attempts. `window-state-live.log` independently records macOS frontmost application `com.apple.loginwindow` while the M1.5 test app is inactive. This supports a native session/focus limitation but does not prove the application has no input defect. Security restrictions were not weakened. These checks require an unlocked, interactive desktop and must not be counted as technical PASS yet.

### Preservation and bounded lifetime

`preservation-before.json` and `preservation-after.json` match exactly across 35,314 inventoried entries. Imported `.local`, accepted packs/artwork, retained application/evidence trees, normal `dist` and the old `RA2 HD` profile were hashed; the source installation was inventoried by metadata with SHA-256 for ra2.mix/language.mix/multi.mix. Existing top-level non-directory artifact entries were listed as roots but are not covered by recursive content hashes; no command wrote those files. No import, updater, Windows executable, publication or push ran.

Both normal matches released SHP textures and all 16 Rhino parts (zero references, disposed), and cleared the game. The final normal-game run returned to menus with 33 textures/3 programs after Soviet play and 36/3 after Allied play; faction/UI caches differ. A same-faction three-match probe then held textures at 30 and programs at 8 after repeated resolution/Rhino controls. The initial lifetime check failed because geometry counts increased 15 -> 16 -> 17. A focused rendered-geometry probe isolated the pause-menu mask, whose geometry and material were not owned by the menu teardown. `menu-lifetime-reproduction.log` first reproduces the missing disposal; `7ab7527` adds the narrow owner-dispose subscription. The final application passed three consecutive matches in `ui-1789798381385/result.json`: **13 geometries, 30 textures and 6 programs after every return to menu**, with all Rhino parts disposed and game state cleared. This sample uses a Dummy opponent solely for input/lifetime testing, not AI/outcome claims. It does not certify prolonged or large battles.

A normal desktop skirmish reproducibly reached `toId is not defined in this graph: 64_97`. The error remained after the automation prechecked its movement targets. `Terrain.computePath` could select a radial fallback absent from the current passability graph: an unavailable island label could compare equal to another unavailable label. The bounded compatibility fix requires candidate graph membership before selecting that fallback. No movement cost, terrain passability, speed, weapon or faction rules change. Two regression cases first reproduce the exception, then verify reachable fallback and safe no-path behavior. The final corrected suite passes 96 tests / 19,197 assertions; entry typecheck and a fresh isolated bundle pass. The initial failed runtime and failing reproduction logs remain preserved.

The first launch attempt under the restricted command sandbox failed before application startup. The explicitly authorized desktop launch outside that command sandbox succeeded with a disposable profile. An older M0 depth-clear unit test lacked the browser DPR stub introduced by M1.4; the fixture was corrected, without changing the renderer. Failed receipts remain preserved. Earlier setup attempts included a fast 1v3 coalition defeat before production completed, a Dummy-AI scene unsuitable for outcome evidence, and a sampling attempt whose new tank was destroyed too early. These are not the passing normal-game receipt. The final-bundle attempt `gameplay-1789798463071` naturally reached defeat at tick 6449 with no renderer error, but its harness read the next screen's controller during transition and failed; the harness now waits for controller installation. That failed receipt is retained separately.

### Reproducing the checks

From the repository, pass the adjacent `artifact.json` to `node scripts/m1/desktop/{smoke,gameplay,ui,states,fallback,audit-artifact}.mjs` (one script at a time). These scripts create fresh evidence directories and disposable profiles. `check-registration.mjs` needs no argument; it alters copied packs only. The normal-game harness uses existing development diagnostics to issue ordinary game orders, not a fixture payload. One-off recovery helpers are retained only in the ignored evidence directory. `bun test scripts/m0 scripts/m1` and `bun run typecheck:entry` cover source checks. The final artifact audit preserves earlier failed audit attempts rather than overwriting them.

### Final user gate

On the unlocked Mac desktop, launch the linked app, open Options, and choose HD for the three available families. Confirm startup, selection/sidebar placement, pointer lock after switching away and back, fullscreen/resize and the current Conscript/GAPOWR/Rhino appearance. If resource selection appears, choose `/Users/Aone/RA2remaster/ra2-hd/.local`. This is the final hands-on gate explicitly required by the M1.5 brief; no additional approval is required for routine integration work.

Final hands-on startup, controls and current appearance remain `USER_ACCEPTANCE_PENDING`. Only explicit user confirmation permits `M1_5_ACCEPTED_AND_DELIVERED`. Windows is NOT RUN; Intel Mac is excluded; physical external-panel output, prolonged large battles and public distribution are not certified. This milestone integrates representative HD families, not every game asset.

Continue M1.5 corrections and acceptance in this task. Stop here before new artwork, campaigns or another platform.

## Authorized transfer follow-up

On 2026-09-19 the user requested Desktop ZIPs for personal iCloud transfer and an install-free Windows test package. See [transfer packages](m1-5-transfer-packages.md). The Mac application above remains unchanged. Windows packaging is now authorized and has static validation; Windows runtime and the remaining M1.5 hands-on gate are still unverified. This does not mark M1.5 accepted.
