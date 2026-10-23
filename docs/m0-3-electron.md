# M0.3 minimal Electron desktop entry

Prepared: 2026-09-15. The bounded desktop functional gates pass on this Apple Silicon Mac. A newly reported menu cursor continuity issue remains documented below; it is inherited input behavior, not a claimed fix. Windows x64 execution is **NOT RUN**.

## Identity and scope

- Accepted baseline: `41b31fea3c69c23d125638f2893b11ba0a5f3d26`, branch `m0-2-stabilization`, initially clean.
- Implementation: `783c7d9c9b82cbedf9ca3b57d628b0e5c5a6b3c5`.
- Upstream pin remains `898d89188542a3028a232031ce1a0bdc7c605b6f`.
- Electron **44.4.0**, selected from the registry's stable `latest` tag and pinned exactly in `package.json` and `bun.lock`. Observed bundled Chromium **152.0.7977.78**, Node **24.21.0**.
- Host: Apple M2, macOS 26.6.2; development Bun 1.3.14 and Node 26.7.0. Playwright remains 1.58.2.

The approved plan is preserved in `.artifacts/m0-3/approved-plan.txt`. There is no minimum play duration. Natural defeat with a functioning results screen satisfies the outcome gate; human victory is not required. Existing game logic, Normal bots, camera, logical dimensions, VPL, shadows, locale resources and the active absent-menu-video guard remain unchanged. No importer rerun, source installation execution, HD, campaign, installer, signing, updater or publishing work was performed.

The version-matched [Electron protocol documentation](https://github.com/electron/electron/blob/v44.4.0/docs/api/protocol.md) and [security guidance](https://github.com/electron/electron/blob/v44.4.0/docs/tutorial/security.md) were read and retained locally. The application uses a standard, secure scheme on its actual window session, sandboxing, context isolation and restricted navigation/IPC. CSP bypass is not enabled.

## Start the application

The local macOS arm64 development artifact is:

```text
/Users/Aone/RA2remaster/ra2-hd/.artifacts/m0-3/apps/build-1789496840279/Red Alert 2 HD.app
```

Open that `.app` locally. It contains the Electron runtime and explicitly selected application files; the game data stays outside it. The artifact's executable was exercised by the desktop acceptance harness, including resource registration and relaunch. This is an unbranded development copy retaining Electron's vendor launcher identity; the runtime reports `app.isPackaged === false`. Some early diagnostic case names say “packaged”; they refer to the `.app` artifact, not a release package. No application signing/notarization or installer was produced.

The actual developer start command was also launched independently of Playwright:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun run desktop:start
```

For a rebuild followed by launch, use `bun run desktop:dev`. To regenerate a separate arm64 development artifact, use `bun run desktop:app`; its exact new path is printed and saved in `.artifacts/m0-3/app-artifact.json`. The existing browser preview workflow remains `bun run start:offline` after a build. The desktop application does not use that preview service.

On a fresh dependency installation, run `bun install --frozen-lockfile` and `node node_modules/electron/install.js` before `bun run desktop:dev`. Electron's exact runtime download is a development dependency step, not an application network request. No download or terminal server is required while the `.app` runs.

The current Mac's normal desktop registration has already been created at:

```text
/Users/Aone/Library/Application Support/RA2 HD/resource-registration.json
```

It points to the existing repository `.local` folder. Settings live in the application's `persist:ra2-offline` session under the same user-data root. Ordinary Chrome/Safari profiles are untouched and are not automatically migrated. On macOS, closing the window retains the application for normal Dock activation; use **Quit (Cmd-Q)** to quit the application and its helpers.

If the external data is moved or registration is missing, the app displays a local profile-selection page. Select the existing `.local` folder containing `ra2-core-manifest.json`, `assets/ra2` and `upstream-support`. In the macOS chooser, Go to Folder can locate this hidden folder. Selecting the original installation or an incomplete directory gives an error and does not import, move or alter it.

## Resource and offline boundaries

`desktop/main.mjs` creates its own window and registers `ra2://game/` on the window's persistent session before navigation. It has no game HTTP server. The renderer's actual origin was observed as `ra2://game`, with `isSecureContext === true`; this does not rely on Node's opaque `URL.origin === "null"` for custom schemes.

`desktop/profile.mjs` validates the existing core manifest and SHA-256/length of all three archives on launch. The renderer still performs its original hash and structural validation. Only the two consumed support files are exposed; their manifest entries must match the pinned upstream commit and expected hashes. Manifest destination/source paths are never used as route targets. Real-path checks reject symlink files and path escapes.

| Route | External local source |
| --- | --- |
| `/local-assets/manifest.json` | Sanitized core manifest containing only schema, virtual names, lengths, hashes and validation status |
| `/local-assets/ra2.mix` | `.local/assets/ra2/ra2.mix` |
| `/local-assets/language.mix` | `.local/assets/ra2/language.mix` |
| `/local-assets/multi.mix` | `.local/assets/ra2/multi.mix` |
| `/local-support/general.csf` | Existing pinned upstream UI locale support |
| `/local-support/ra2cd.mix` | Existing pinned UI support container; the renderer still mounts only its approved client UI content |

The staged support `ini.mix`, campaign archives, loose root CSF/icon overrides, Yuri and CnCNet paths are not routed. Unknown routes return errors instead of arbitrary file access, a generic network fallback or an imported installation tree. Built application files are served only from a generated explicit file list. Data files remain external to the application bundle.

The shared URL policy validates scheme, host, port and credentials explicitly. It rejects foreign schemes/hosts and opaque `blob:null` URLs while permitting app-owned blobs. The main session independently blocks non-application requests. External navigation and new windows are denied; only the game window's local pointer-lock/fullscreen permissions are allowed. Node integration is disabled, context isolation and renderer sandboxing are enabled, and the narrow preload exposes only a directory-chooser invocation. The IPC handler validates the main frame, origin and missing-profile state; it accepts no arbitrary path or shell command from the renderer.

CSP, COOP and COEP are retained, including the inherited `unsafe-eval` allowance, which still causes Electron's development CSP warning. No warning suppression or CSP bypass was added, and no comprehensive release-security claim is made.

## Acceptance results

| Gate | Result | Actual evidence / limit |
| --- | --- | --- |
| Independent desktop start | PASS | Electron window displayed the menu at `ra2://game/`; no Vite preview service was started during M0.3. Direct `desktop:start` also initialized the normal app-specific registration. |
| Existing resources | PASS | Core/support hash checks, existing renderer structural validation, expected VFS mounts and asset density 1. |
| Offline operation | PASS for exercised behavior | Successful game-session trace contains 265 allowed application requests and zero denied/external attempts; renderer attempts and runtime errors are empty. Intentional security probes are separate evidence. |
| Real desktop input | PASS functionally | User confirmed selection, drag selection, movement, attack, map movement, Escape release and ordinary click reacquisition. Native pointer events were also recorded. Menu cursor continuity remains a known limitation. |
| Existing visuals/audio | PASS within observation | User confirmed unit appearance, shadows and sound. Orthographic camera, zoom 1, original rotation and logical viewport were recorded. No broad VPL/performance suite was repeated. |
| 1v3 skirmish | PASS | Established speed-3 fixture, one human and three Normal opponents, unchanged resources/rules. |
| Natural ending | PASS, fresh Electron evidence | Natural defeat/results observed at 198.528 seconds in the earlier run and 204.697 seconds in the complete lifecycle run. These are measured observations, not duration targets. |
| Return / second match / restart | PASS | Complete run returned from results to lobby, then home, started a second match, quit and relaunched with identical registration and saved map/host options. |
| Missing / invalid profile | PASS | Isolated `.app` profile showed the useful missing-data screen; invalid selection did not save registration; valid existing profile loaded; relaunch reused it. Native chooser results were substituted by the test, not a manual file-picker acceptance. |
| Main/renderer boundaries | PASS for tested cases | Foreign host, private path, unlisted archives, external session request, popup, navigation and invalid bridge context refused; valid local blob fetch succeeded. |
| macOS window lifecycle | PASS | Close window, activate application and reopen menu exercised; normal app quit/relaunch tested. |
| Data separation | PASS | Artifact payload exactly matches 162 allowlisted files including metadata/notices; hashes match; no retail archive extensions or private data trees found in the `.app`. |
| Existing checks | PASS | Build, scoped browser-entry typecheck, 27 tests / 126 assertions, zero test failures; script syntax and diff checks passed. |
| Windows x64 | NOT RUN | Portable path/runtime design is preparation only. No Windows host or execution evidence. |

The successful lifecycle fixture is `MP01T4.map`, seed `1700000000000`, speed 3, 10 starting units, 10,000 credits, Americans at start 0 and three Normal Libya bots at starts 1/2/3 on team 1. The observer issued an ordinary MCV deploy when an MCV remained, then observed the match; it did not grant resources, change health, weaken opponents or force an outcome. Manual orders were permitted and are distinguished from scripted actions. The pointer-specific diagnostic is a separate brief menu-transition check, not a new outcome or endurance result.

The complete lifecycle run ended at tick 4484, final tick 4485, with the human defeated and all three opponents still active. Results reached the existing lobby through Continue; the existing Back control returned home. A second match reached running state. After quit/relaunch, map `MP01T4.map` and the exact serialized host options, including speed 3, matched; the registration file was unchanged. The user separately confirmed results and exit worked.

The source commit fields in early probes name baseline HEAD with a dirty implementation worktree. The successful gameplay run exercised the product implementation subsequently saved in `783c7d9`; later changes to that observer only improved diagnostic phase/failure capture. The final `.app` records `783c7d9` and was used for the successful boundary/relaunch checks. Final report commit and repository state are recorded in `.artifacts/m0-3/final-state.json`.

## Reported menu issues and remaining limits

**Game speed location:** the user observed only Scroll Rate in in-game Options. `GeneralOpts.tsx` has that inherited map-panning control; game speed belongs to the pregame lobby's `LobbyForm.tsx`. The `.app` test confirmed the game-speed slider is present and enabled before launch. In-game speed adjustment was not added. Set game speed on the right side of Offline Skirmish before starting a match.

**Cursor jump and system cursor in Options: OPEN UX ISSUE, inherited behavior.** The user reported the pointer returning to the picture center and switching from the game cursor to the system cursor. Source inspection shows `GameScreen.initGameMenuEvents` explicitly calls `pointer.unlock()` when the menu opens, and `Pointer` hides its sprite whenever lock is inactive. These files are unchanged from M0.2a. A brief Electron probe observed locked/visible game cursor before opening the menu, unlocked/hidden game cursor in the menu, and restored lock/game cursor after returning and clicking. No page errors occurred. Logical game pointer coordinates were not reset by menu unlock in this probe; the exact physical center jump is user-reported, not an automated screen-coordinate measurement.

The [Pointer Lock exit specification](https://www.w3.org/TR/pointerlock-2/#exit-pointer-lock) restores the system cursor to its location when locking began. That explains why an unlock can appear to jump back to the center when capture began there. It does not prove an Electron-only regression. Keeping a continuous game cursor across HTML option controls would change input/menu behavior; it was not silently introduced into this wrapper milestone. This issue is not marked fixed, and the functional input pass is not a claim of vanilla menu-cursor fidelity.

The first startup experiment exposed an application readiness wait issue, corrected by initializing inside the ready callback. A negative URL test caught `blob:null` accidentally being resolved as a relative path; the policy now requires an absolute inner blob URL. Electron's new Node type dependency exposed browser timer type conflicts; the scoped browser typecheck now explicitly uses browser/Vite ambient types instead of implicitly importing Node globals. No game timer implementation changed.

Historical diagnostic failures remain available: `play/result.json` stopped because the observer assumed an MCV still existed; `play-2/result.json` retains a valid natural result but a failed home-menu wait because Continue actually returns to the lobby; the first boundary run retained a Playwright pending-navigation timeout after intentional cancellation. The corrected observers completed the required paths without changing gameplay or menu routing. No old FAIL was rewritten to PASS.

This task does not prove exact vanilla 1.006 behavior, retail AI equivalence, complete Simplified Chinese, human victory, campaigns, HD, native Safari, Windows, or a measured performance improvement. The previously reported speed-6 pathfinding failure remains historically preserved and not claimed repaired. The user experience acceptance of Chrome is not attributed to a measured M0.2 optimization.

## Evidence, protection and handoff

All runtime data is ignored under `.artifacts/m0-3/`. Key records are:

- `smoke/result.json`: initial desktop menu, actual origin, renderer isolation and VFS evidence.
- `manual-acceptance.json`, `play-2/live-observation.json`: user-confirmed physical input/visual/audio observations and native event records.
- `play-3/result.json`, `play-3/game-session.json`, initial/results screenshots: complete outcome, return, second match and persisted restart.
- `boundaries-2/result.json`, `boundary-session.json` and screenshots: `.app` registration, denial cases, speed control, relaunch and macOS activation. Deliberate denial traffic is not gameplay traffic.
- `options-pointer/result.json`: inherited menu unlock and gameplay cursor restoration.
- `app-artifact.json`, `app-separation.json`: exact application path, source, explicit payload list and hashes.
- `tests.log`, `typecheck.log`, `app-build.log`, `source-protection.json`, `separation-audit.json`, `shutdown.json`: verification and cleanup.

Source protection again matched 3,368 metadata entries, including 3,146 regular files, and all five imported archive hashes against the original snapshot/manifests. Access times are excluded. The original installation and its parent were not initialized as Git repositories. The source installation was not modified, reimported or executed. Current build/Git separation checks found no retail payload; pre-existing upstream Git history still contains binaries and is not a distribution-ready clean history.

Only this task's test applications were stopped. Ports 4000/4001 had no listeners, and task-owned Electron processes/helpers were checked after shutdown. The direct CLI launch was stopped administratively after verification; normal application quit/relaunch evidence comes from the successful lifecycle and `.app` checks. The user's normal browsers and their data were preserved.

The next bounded task should use an actual Windows x64 host for desktop smoke validation when available. The menu cursor continuity issue is a separate, now-concrete input/UI task to review before changing pointer semantics. Campaign/HD feasibility remains later work; no such implementation was started here.
