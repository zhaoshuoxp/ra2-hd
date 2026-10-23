# Upstream baseline

Observed on 2026-09-14. The bounded compatibility follow-up now starts an original-graphics local 1v3 match. This is not a completed remaster; see `m0-1-report.md` for acceptance and limits.

## Source and environment

- Requested remote: `https://github.com/huangkaoya/redalert2.git`; GitHub resolves this repository to `huangkaoya/ts-redalert2`. No alternate engine or fork was merged.
- Full upstream commit: `898d89188542a3028a232031ce1a0bdc7c605b6f`, fetched from `main`. The checkout is detached at this commit; implementation changes are in the working tree. Exact fetch timestamp is in `upstream-pin.json`.
- Host: Darwin arm64, macOS Apple Silicon. Git 2.54.0 (Apple Git-157), Node 26.7.0, npm 11.19.0, Bun 1.3.14. Existing Google Chrome 153.0.8010.37 was used through locked Playwright 1.58.2. No Windows execution occurred.
- Upstream declares Bun 1.3.10; local `.bun-version` and `packageManager` pin the actually tested Bun 1.3.14. Dependency versions remain pinned by unchanged `bun.lock`. The upstream npm lock is preserved, but npm install was not used.
- `bun install --frozen-lockfile --ignore-scripts`: succeeded, 95 packages. No global packages were upgraded and no installation programs were executed.
- Existing notices are retained. License investigation is deferred as requested; provenance is not declared resolved.

## Build results

| Command | Result | Evidence |
| --- | --- | --- |
| `bun run build` before source changes | PASS; Vite completed in 888 ms | `.artifacts/upstream-build.log` |
| `bun run typecheck:entry` before changes | FAIL; 26 diagnostics in imported development testers | `.artifacts/upstream-typecheck.log` |
| `bun run build` for offline entry | PASS; bundle-size warning remains | `.artifacts/compat/build.log` |
| `bun run typecheck:entry` for actual offline entry | PASS | `.artifacts/compat/typecheck.log` |
| `bun test` | PASS; 17 tests, 67 assertions | `.artifacts/compat/tests.log` |

No baseline build fix was necessary. The final type-check entry is `src/offline/main.tsx`. The offline application does not register the optional development/live-interaction routes, so unrelated tester modules are no longer imported by this entry. Their source files were not modernized or repaired.

## Relevant implementation paths

| Area | Pinned source |
| --- | --- |
| Application / UI / routing | `src/Application.ts`, `src/Gui.ts`, `src/gui/screen/mainMenu/` |
| MIX / CSF / virtual files | `src/data/MixFile.ts`, `src/data/CsfFile.ts`, `src/data/vfs/` |
| Implicit archives / overlays | `src/data/vfs/VirtualFileSystem.ts`, `src/engine/gameRes/GameRes.ts` |
| Rules / maps | `src/engine/Engine.ts`, `src/engine/MapList.ts`, `src/gui/screen/game/MapFileLoader.ts` |
| Skirmish setup | `src/gui/screen/mainMenu/lobby/SkirmishScreen.ts`, `PregameController.ts` |
| Bot registration / adapter | `src/game/ai/thirdpartbot/builtIn/BuiltInBotAdapter.ts` |
| Bot strategy implementation | `src/game/ai/thirdpartbot/builtIn/bot/` |
| Trigger support | `src/data/map/trigger/TriggerReader.ts`, `src/game/trigger/TriggerExecutorFactory.ts`, `TriggerConditionFactory.ts` |

The built-in adapter identifies Supalosa's Chrono Divide bot as its origin, with registry version 0.6.1. It has independent strategy, production and mission controllers plus added deploy/build fail-safes. `src/game/ai/Ai.ts` only stores an INI object; loading archived `ai.ini` does not demonstrate retail AI execution. The built-in bot is not the RA2 1.006 executable AI. The Normal difficulty branch was observed building, harvesting, producing and attacking in the four-slot baseline, with a natural human defeat. Its strength and behavior have not been shown equivalent to retail. Other named difficulty branches instantiate `DummyBot` and are not covered.

## Vanilla deviations and compatibility boundary

The upstream `Engine.loadRules()` merges `rulescd.ini` and `artcd.ini` from `public/res/ra2cd.mix`. Inspection found hospital targetability changes, unit Soylent changes, elite flak damage changes, altered multiplayer defaults, animation changes, and additional engine-required configuration. `artcd.ini` also changes cameos, animation bounds and weapon offsets. Raw inspection is local at `.artifacts/upstream-overrides.json`; no retail INI payload was added to documentation.

The offline path uses archived rules/art without those merges. The first run failed with `Missing rules [General]->ParadropPlane` in `src/game/rules/general/ParadropRules.ts`. The bounded follow-up adds only this engine identity after checking the archived aircraft registry and primary weapon. All 17,481 existing parsed rules fields and all archived art remain unchanged at this boundary. See `retail-compatibility.md` and `compatibility-overrides.json` for the 104-field override triage and actual-data validation.

The later [rendering follow-up](rendering-followup.md) makes the absent optional FlyerHelper safe and validates one normally produced Harrier in Chrome. Other helper/animation paths, complete vanilla equivalence and authoritative RA2 1.006 data authentication remain unverified.

## Existing bundled binary resources

Upstream already tracks `public/general.csf` (283,411 bytes), `public/ini.mix` (1,101,817 bytes), and `public/res/ra2cd.mix` (116,667 bytes). They are potentially game-derived or mixed client/game content. These three files were moved to ignored `.local/upstream-support/`; their deletions are visible in the worktree. Only local general client text and the `ui.ini` member of the support archive are used by the offline path. `ini.mix` is retained locally for audit and is not served or mounted.

The current `dist/` contains none of these files or imported retail archives. Existing Git history still contains the upstream blobs, and the pending worktree deletions are not history removal. A future distribution/source export must address that history separately. Nothing was published, pushed or distributed.
