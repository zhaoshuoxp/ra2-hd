# M0.3a menu cursor interaction

## Current amendment — 2026-09-15

**Position issue: resolved by user confirmation.** The approved continuation explicitly reports that the menu-opening position jump is now resolved. This supersedes the earlier unresolved-position wording below. It is a manual observation supplied by the user, not a newly measured automated jump-distance result. No pointer-position redesign or endurance/outcome test was reopened.

**Appearance and focused physical acceptance: PASS.** The user replied “All normal” to the current development build’s menu bitmap/hotspot, preserved position, gameplay selection/movement/attack, no-double-cursor and real application-switch/recapture checks on 2026-09-15. The freshly rebuilt desktop development entry uses the already decoded `mouse.shp` / `mousepal.pal` frame 0 as a native CSS cursor throughout the loaded game UI. The earlier coordinate and stable recovery-listener changes remain intact. The old accepted M0.3 `.app` was not overwritten and does not contain these pending changes.

### Exact source and behavior

The starting HEAD was `b8bec6e8658b416c8c4eebfddb1d722c3c66c5ba`. The reviewed completion commit is recorded in `.artifacts/m0-3a/cursor-style/final-state.json`. The acceptance build is identified by `.artifacts/m0-3a/cursor-style/build-identity.json`, which contains SHA-256 hashes of every changed source/test and every built file. That identity record has SHA-256 `67d2bd5a621cb688e9c5cf3b5820aae7827fa0818610ff2f039d318106bad163`. Runtime evidence is in `cursor-style/runtime-2/probe.json`. Electron remains pinned at **44.4.0**, on macOS arm64.

`PointerSprite.getDefaultCursorCss()` creates and caches one transparent PNG data URL per decoded sprite instance, independently of its active gameplay frame. The full original frame is 55 × 43 pixels; the visible arrow occupies X 0–21 and Y 0–16. Inspection of the actual artwork and `Pointer`'s unshifted Default position agree on hotspot **(0, 0)**. No crop, replacement art, device-pixel multiplier, or logical-size change is applied.

`Gui.initPointer()` installs the image only after the local artwork is ready. The CSS is scoped to `#ra2web-root` and its descendants, including a canvas selector that overrides the legacy stats-canvas `auto !important` rule. Menu background, buttons, sliders and other game UI use `url(...) 0 0, default`. Native dialogs, window chrome and elements outside the game root retain their system behavior. GUI destruction removes the readiness marker and CSS variable. The [CSS cursor reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor) describes image hotspots and the required keyword fallback used here.

Pointer Lock continues to hide the native cursor; the existing dynamic sprite renders gameplay selection, movement and attack states. This continuation does not change lock policy, relative movement, absolute-coordinate correction, game commands or menu pause/resume. The PNG remains in memory, except ignored diagnostic evidence. There are no new blob URLs to revoke, no extracted artwork in Git/build payloads, and no network/CSP permission changes.

### Current focused results

| Gate | Result |
| --- | --- |
| Source image and transparency | PASS: browser-decoded PNG is pixel-identical to decoded frame 0; transparency preserved; cached value stable |
| Computed menu cursor | PASS: root, game canvas, Options background, button and slider all use the same image and `(0, 0)` hotspot; outside body remains `auto` |
| Native slider behavior | PASS: drag reaches 7; hover and focus present; ArrowLeft changes to 6 |
| Resized / high-DPI window | PASS for DOM/style checks at DPR 2 and window widths 1280/1400; identical cursor image/style; physical bitmap appearance and tip alignment confirmed by the user |
| Locked dynamic sprite | PASS diagnostic state check for Default 0, Select 18, Move 31 and AttackRange 53 while locked; setting these states is not evidence of actual player commands |
| Active window focus cycle | PASS automated active-lock → window blur → foreground recapture in the second runtime; real application-switch and recapture confirmed by the user |
| Escape/recovery | Successful in the first runtime; second scripted sequence timed out with the menu subsequently open. Preserve both observations; the user subsequently confirmed the requested controls and recovery normal |
| Menu closing click | PASS automated: no new queued world order during the exercised Options/slider/return sequence |
| Build / entry typecheck | PASS |
| Relevant tests | PASS: 26 tests, 229 assertions; new cache test preserves active Move/Attack frames while generating default-frame CSS only once |
| Position behavior | User-confirmed resolved; preserved with the new style in the current manual check |
| Real cursor appearance, tip alignment, gameplay commands, no double cursor and focus recovery | PASS by current user confirmation against the identified rebuilt entry; CSS/screenshots are supporting evidence only |
| Source and asset separation | PASS: original source metadata and five archive hashes match; no retail resource in new Git paths or built payloads |
| Windows x64 | NOT RUN; no environment or Windows packaging |

The first automated style run stopped on an over-specific slider endpoint assertion (observed 6 → 5 by keyboard, rather than expected 7 → 6) and false hover at that snapshot. Its evidence is preserved under `cursor-style/runtime/`. The continued check verifies actual value change and keyboard decrement, and subsequently observed 7 → 6 with hover and focus in `runtime-2`. The second scripted Escape/recapture wait timed out before the full sequence finished; `menu-check.js` then completed the style/control/resized checks separately. Neither initial failure is relabeled as a complete automated PASS. No cause for the interrupted live input sequences is inferred.

The user tested the newly rebuilt development window and confirmed all requested checks normal. During that check only passive state observation ran; no automated mouse input or window activation competed with the user. The exact checklist and confirmation are retained in `cursor-style/manual-acceptance.json`.

Start this exact rebuilt development entry with:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun run desktop:start
```

The new macOS arm64 local development artifact is:

```text
/Users/Aone/RA2remaster/ra2-hd/.artifacts/m0-3/apps/build-1789499307505/Red Alert 2 HD.app
```

Quit the previously running normal-profile game before opening this new application. That pre-existing process was preserved; only task-owned tests were closed. Its launch smoke test passed, and every copied application payload hash matches the user-accepted build. Implementation commit: `bee6a60` (full identity in `cursor-style/app-artifact.json`). This remains an unbranded development copy (`app.isPackaged === false`), with no installer or signing claim. `cursor-style/app-smoke.json` records the actual executable and runtime. The old M0.3 application and its metadata are unchanged. Both the manual session and new-artifact session recorded zero external requests.

For a fresh rebuild use `bun run desktop:dev`. The focused physical gates are closed. The reviewed local commit, new macOS arm64 development artifact and shutdown/network records are indexed by `cursor-style/final-state.json`. The old accepted `.app` and its metadata are preserved. No signing, installer, push or publication. The next bounded planning work remains HD/campaign feasibility; no implementation of those features is part of this continuation.

## Historical first-pass report

The following record describes the earlier attempt. Its unresolved-position and no-style-change statements are superseded by the dated amendment above. Historical raw evidence remains untouched.


Prepared: 2026-09-15. **Partial correction; the original opening-position jump and system cursor appearance remain open.** The actual canvas-coordinate defect and recovery-listener lifecycle are corrected. Physical-mouse acceptance is pending and is not inferred from automated events.

## Identity and scope

Accepted source: `b8bec6e8658b416c8c4eebfddb1d722c3c66c5ba`, initially clean on `m0-2-stabilization`. The upstream pin remains `898d89188542a3028a232031ce1a0bdc7c605b6f`; Electron remains exactly **44.4.0**. The exact changed-file and diff hashes are in `.artifacts/m0-3a/source-identity.json`; `.artifacts/m0-3a/final-state.json` records the incomplete acceptance. No implementation commit was made because the physical gate is still pending. The approved plan is preserved in `.artifacts/m0-3a/approved-plan.md`.

Only `Pointer.ts`, request cleanup in `PointerLock.ts`, and focused regression tests change. Menus retain native HTML event routing. No new cursor artwork, event dispatcher, native cursor-warp helper, permission change, in-game speed control, import, engine/rule/AI change, simulation scheduling change, camera/scale change, HD/campaign feature, packaging, push or publication is included. Existing local imports and the accepted M0.3 `.app` are preserved.

## Finding and chosen behavior

The accepted build retained stale canvas metrics after its layout settled. In the reproduced window the canvas rectangle starts at `(128, 79.5)`, but cached coordinates remained `(128, 847.5)`. An unlocked menu movement at client/page `(630, 310)` therefore produced logical `(502, 0)` after clamping, instead of `(502, 230.5)`. The menu's HTML controls still worked because Chromium hit-tested them directly. The stale logical position was then retained for gameplay recapture. This is a concrete coordinate error distinct from the OS cursor restoration behavior reported by the user.

Unlocked pointer movement now refreshes the canvas metrics before translating absolute coordinates. Locked gameplay keeps its existing relative movement path and performs no additional layout query. The menu stays unlocked, retains the system cursor, and uses ordinary browser button, range-input, hover and keyboard behavior. The game sprite stays hidden in the menu and reappears when lock is actually acquired.

Recovery callbacks now have stable identities and are removed when the menu opens, lock succeeds, or the pointer is disposed. A failed request cannot leave multiple recovery callbacks or re-arm a menu click after cancellation. The low-level lock wrapper removes temporary change/error listeners for promise-only rejection and synchronous failure, and still falls back when raw movement is unsupported. World-interaction disable/enable and menu pause/resume code are unchanged.

The supplied complaint is **not completely fixed**. Opening a locked game menu still exits Pointer Lock, exposing the system cursor at its saved capture position. The game sprite's accumulated position and that capture position can differ. A CSS cursor image would not eliminate that positional difference. The [W3C draft's exit algorithm and locked-event routing](https://www.w3.org/TR/pointerlock-2/#exit-pointer-lock) explain why retaining lock would also stop ordinary HTML controls from receiving their normal mouse events. These are platform behavior constraints, not proof of a measured physical jump distance in this run.

## Before and after evidence

The Electron probes use the accepted local import, an isolated profile, the existing 1v3 fixture (`MP01T4.map`, seed `1700000000000`, lobby speed 3), and actual renderer events. They instrument state and action-queue insertion without changing the underlying orders, rules or outcomes. Event logs distinguish logical cursor position, page/client/screen coordinates, canvas/window geometry, lock state, sprite visibility, menu state, world interaction and game speed. Capture-phase snapshots can precede the pointer's own lock-change callback; settled phase snapshots are used for visibility assertions.

| Observation | Accepted baseline | Changed build |
| --- | --- | --- |
| Same menu event at `(630, 310)` | Logical `(502, 0)` | Logical `(502, 230.5)` |
| Return button position | Logical `(939, 0)` | Logical `(939, 713.5)` |
| Open via ordinary HUD while locked | Existing unlock behavior | Locked logical `(972, 27.5)`; menu unlocked, sprite hidden, world disabled |
| Native Scroll Rate slider | Drag works, logical Y incorrect | Drag reaches 7; input focus retained; ArrowLeft changes to 6 |
| Resized window | No new baseline claim | Width 1280 to 1400; canvas X 128 to 188; slider event maps to `(338, 83.5)`, drag still works |
| Original opening jump / cursor image | User-reported jump and system style | Retained; no cosmetic or full-continuity claim |

## Focused acceptance

| Gate | Result and limits |
| --- | --- |
| Ordinary HUD, Options, native slider and return | PASS in Electron automation; physical confirmation pending |
| Repeated menu transitions | PASS: eight UI cycles; no queued world orders; no recovery click listener in menu and at most one after return. These cycles exercised unlocked/denied return as well as the separately recorded locked HUD opening. |
| Focused regression tests | PASS: 25 tests / 221 assertions across `scripts/m0`; five new pointer tests include moved/scaled canvas, relative movement preservation, 20 lock/menu cycles, repeated loss, cancellation/disposal, denial cleanup and raw-movement fallback. |
| Deliberate denial | PASS for fallback visibility and cleanup: six test-only promise rejections; one request per click, one retry, no temporary DOM error/change listener growth. Native request method restored afterward; no system policy changed. |
| Recapture after denial | PASS after native Electron activation. Initial recovery attempt failed when BrowserWindow was not focused, even though Playwright reported `document.hasFocus()`. The failed attempt remains recorded. |
| Escape | PASS in the exercised Electron key path: lock released and sprite hidden. Real mouse/keyboard confirmation pending. |
| Application deactivation and recovery | PENDING. An early blur probe ran after Escape had already released lock; it does not establish release from an actively locked window. The follow-up was interrupted when the application exited, before any foreground cycle completed. |
| Menu pause and speed | PASS: paused tick stayed 2320 over a one-second sample; return restored existing internal speed `4/3` for lobby setting 3. No timing code changed. |
| Build and scoped entry typecheck | PASS (`desktop:prepare`, `typecheck:entry`). Existing build warnings remain. |
| Physical cursor continuity | PENDING observation; original opening behavior remains explicitly unresolved |
| Source / data separation | PASS: 3,368 metadata entries, 3,146 files and five archive hashes unchanged; parent/source Git absent; no retail payload in build or new Git paths |
| Windows x64 | NOT RUN; no Windows environment or artifact created |

No new natural-outcome or endurance run is required: M0.3 outcome, return, second-match and persistence evidence remains accepted. The short test match is for input behavior only. Automated `isTrusted` events do not substitute for a person observing the physical cursor.

The first Options probe attempts timed out while the live window changed state. Their precise interruption cause is not established. They remain in the command log; the later complete Options path supplies the coordinate and control evidence. The initial recovery assertion failed before native application activation. The early refocus attempt following Escape also remained unlocked; it is not counted as a recovery pass.

## Boundary and viable designs

| Design | Effect | Decision |
| --- | --- | --- |
| Refresh absolute coordinates and bound recovery listeners | Corrects the proven return-coordinate error and listener accumulation; preserves native menu controls | Implemented here; opening jump and system style remain |
| Native CSS cursor generated from existing local artwork | Could match appearance while leaving natural controls intact; cannot move the OS cursor to the logical game position | Not implemented; cosmetic-only and would not close the complaint |
| Keep lock and route a virtual cursor through HTML | Could retain visual position, but requires event targeting, hover, drag, focus, range/select behavior and cancellation support | New general dispatcher: outside M0.3a |
| Native cursor repositioning on unlock | Could align the OS cursor with the sprite, but requires platform-specific screen/DPI/focus handling and additional native integration | Explicitly outside M0.3a |
| Use absolute pointer input throughout gameplay | Avoids the lock/unlock coordinate split, but changes edge panning, confinement and general gameplay input | Broad input redesign: outside M0.3a |

Stop at this boundary rather than disguising the opening jump with cursor artwork. The next bounded planning task is HD/campaign feasibility, carrying this input limitation forward. Do not implement those features here. Windows remains deferred until a real environment is available.

## Start and local evidence

Use the changed development entry:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun run desktop:start
```

The probe launches the same `desktop/main.mjs` through the pinned Electron runtime. To rebuild first, use `bun run desktop:dev`. No preview server or external network is required. The previously accepted M0.3 `.app` has deliberately not been replaced and does **not** contain this patch. The normal desktop profile and its resource registration are untouched by the isolated probes.

Evidence is ignored under `.artifacts/m0-3a/`: `baseline.json`, `baseline-probe.mjs`, `probe.mjs`, `steps/`, `after/probe.json`, local screenshots, `tests.log`, `typecheck.log`, `build.log`, `source-protection.json`, and `separation-audit.json`. Probe command logs include failures and transient diagnostic overrides. `session.json` and `network-audit.json` record the actual exercised desktop requests; none were external. `shutdown.json` confirms that no task-owned Electron/probe processes remain. The application exited during the foreground follow-up, and the idle probe was then stopped. No reason for that application exit is inferred. The after-run trace retains phase snapshots and their last observed events; unlike the completed baseline run, its full in-memory event stream could not be read back after the page closed.

The requested physical-mouse confirmation was not received before the window exited. Do not mark this milestone PASS or reuse the older M0.3 physical confirmation as evidence for the changed code. The next action is the same short real-mouse check using `desktop:start`; no complete match or fixed duration is required. Once that gate is resolved, review and commit locally, then return to HD/campaign feasibility planning.
