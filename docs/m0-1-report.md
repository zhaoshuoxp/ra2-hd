# M0.1 acceptance report

Date: 2026-09-14. **Overall: PASS for the scoped M0.1 local baseline on macOS arm64.** The pinned build, isolated import, original-graphics offline 1v3, continuous ten-minute observation, separate natural result, geometry capture and restart checks pass. This is not complete RA2 1.006 equivalence, full M0 or the finished remaster.

These are historical M0.1 results. See [rendering-followup.md](rendering-followup.md) for subsequent shadow/motion fixes and aircraft validation, and [mcv-rendering.md](mcv-rendering.md) for the original VPL shading correction and its separate regression evidence. Safari stutter and exact retail pixel parity remain open. The original-graphics baseline was not a pixel-parity claim.

The first runtime blocker, `Missing rules [General]->ParadropPlane`, is resolved by the single, explicitly validated identity adapter in `src/offline/retailCompatibility.ts`. The upstream override archive was not reinstated. All 17,481 original rules entries and archived art remain unchanged at the adapter boundary. See `retail-compatibility.md` for source rationale, override triage and limitations. Historical startup-failure evidence is retained under `.artifacts/`; the current follow-up evidence is under `.artifacts/compat/`.

## Required acceptance gates

| Gate | Status | Actual evidence |
| --- | --- | --- |
| Reproducible source | PASS | Detached upstream `898d89188542a3028a232031ce1a0bdc7c605b6f`; unchanged `bun.lock`; verified frozen installation and original/final builds. `upstream-pin.json`, `.artifacts/upstream-build.log`, `.artifacts/compat/build.log`, `.artifacts/compat/environment.json`. |
| Source protection | PASS | 3,368 metadata entries, including 3,146 regular files, unchanged in size/mtime/mode/type. All five read/imported archive SHA-256 values unchanged and destinations match. No parent/source `.git`. `.artifacts/source-before.json`, `source-after.json`, `source-protection.json`. Access time is excluded. |
| Isolated import | PASS | Three core inputs and two campaign inputs only; runtime exposes only core. `.local/ra2-core-dry-run.json`, `ra2-core-manifest.json`, `ra2-campaign-manifest.json`; `.artifacts/import*.log`. No media profile executed. |
| Robust import | PASS | Eight synthetic importer tests plus actual repeat import; no conflicting overwrite, duplicate copies, malformed acceptance or overlay import. `.artifacts/all-tests.log`, `.artifacts/import-repeat.log`. |
| Core data | PASS | Required rules/art/AI/CSF/map catalog traced to archive/member IDs; 23 core containers validated, 87 map files resolved. `asset-import.md`, local core manifest. Authenticity remains unverified. This does not assert effective match behavior. |
| Offline startup | PASS | Fresh isolated browser storage reaches the menu and original-graphics map; the game does not require account, lobby server or remote assets. `.artifacts/compat/browser.json` and screenshots. Final reload checks are listed below. |
| Local 1v3 | PASS | Four local slots and three active Normal bots; 600.016 seconds continuously observed with 6,000 advancing ticks. Separate natural human defeat verified. `.artifacts/compat/runtime-acceptance.json`, `defended-8/browser.json`, `browser.json`. |
| Scale baseline | PASS | Viewport 1280x960, DPR 1; original orthographic camera, selected 4x4 GACNST foundation and selection geometry captured. `.artifacts/compat/stability-2/selected-building.png`; full geometry is in `.artifacts/compat/stability-2/browser.json` under `geometry`. |
| Local data separation | PASS | No newly tracked retail inputs/caches. Upstream binary worktree files quarantined locally; current build has no matching binary hashes or retail archive extensions. `.artifacts/separation-audit.json`. Existing upstream Git history still contains binary blobs and is not distribution-ready. |
| Handoff | PASS | Source-grounded HD contract, localization gaps, campaign counts/missing opcode lists, packaging prerequisites and one bounded next task: `next-step.md`, `campaign-inventory.json`, `hd-atlas-contract.example.json`. |

## Additional checks and limits

| Check | Status | Evidence |
| --- | --- | --- |
| Offline build | PASS | `bun run build`; `.artifacts/compat/build.log`. Bundle-size warning is nonfatal. |
| Actual offline entry type check | PASS | `bun run typecheck:entry`; `.artifacts/compat/typecheck.log`. |
| Original upstream entry type check | FAIL | 26 existing tester diagnostics before implementation; `.artifacts/upstream-typecheck.log`. Optional development/live routes are excluded from the offline entry, not repaired. |
| Repository tests | PASS | `bun test`: 17 passed, 0 failed, 67 assertions; `.artifacts/compat/tests.log`. |
| Local upstream support restore | PASS | `bun run setup:local-support`; pinned Git blobs verified in `.local/upstream-support/manifest.json`. |
| Fresh-storage/reload harness | PASS | Service process stopped and restarted; `node scripts/m0/browser.mjs` then passed in a fresh context and after reload, with identical resolved resource metadata. `.artifacts/compat/server-restart.log`, `smoke.json`, `smoke-trace.zip`. |
| Attempted external game requests on exercised paths | PASS | Playwright route capture plus JS guards and CDP WebSocket observation report zero attempts; zero workers were created. No CSP violation on final runs. The natural-result match also recorded zero external attempts, page errors and console errors. Wider gameplay coverage remains untested. |
| Local route isolation | PASS | Six excluded/private paths return the expected 404/403, including encoded `.local` and `/@fs` paths; browser manifest omits source/destination paths. `.artifacts/compat/smoke.json` -> `routeChecks`. |
| Runtime network path review | PASS | `.artifacts/network-path-audit.txt` and `.artifacts/compat/network-path-audit.txt`; default entry bypasses legacy resource importer/CDN, excludes LAN and live/test routes, removes telemetry call, denies WebRTC/WebSocket/EventSource/beacon/service-worker registration, and enforces same-origin CSP. |
| Ten-minute stable simulation | PASS | 121 samples over 600.016 wall-clock seconds; ticks 182 to 6,182, all samples Started, all four players still active, no crash/stall. Speed 0 is 10 ticks/second: the observed interval represents 400 simulation seconds. `.artifacts/compat/defended-8/samples.json`. |
| AI economy / production / attacks | PASS | All three Normal bots built refineries/harvesters, received income, produced forces and scored kills in the natural-result run. Final build counters 35/36/36, kill counters 3/1/1. Supalosa-derived bot with upstream fail-safes; not retail AI. |
| Natural match result | PASS | Normal game-end event at tick 4,409; human defeated and all three opponents survive. Final sampled tick 4,410. Game-over overlay captured without forced win, despawning or health edits. Only the human-defeat branch is demonstrated. |
| Original-graphics screenshot | PASS | `.artifacts/compat/game-attempt.png`, `run-final.png`, `defended-8/run-final.png`, `stability-2/selected-building.png`. Original archive artwork; asset density 1. |
| Full vanilla 1.006 equivalence | NOT RUN | Archived data identity is locally hashed, not authenticated against an authoritative retail reference. Adapter field preservation does not prove engine/AI semantics. |
| Complete Simplified Chinese | NOT RUN | Client zh-CN exists, archived retail text is Traditional Chinese, and fallback/font coverage remain incomplete. See `next-step.md`. |
| Windows x64 execution | NOT RUN | This machine is macOS arm64; no Windows host was used. |
| Electron / installers / HD / campaign play | NOT RUN | Explicitly outside M0.1 implementation scope. |

## Scenario fields

Map: `MP01T4.map` / South Pacific, `multi.mix`, member ID 2422373715, map digest `bc957ed8`, size 212,899 bytes, four supported slots. Human: Americans, start 1, team A. Bots: three Normal (`difficulty=4`) Africans/Libya, starts 2-4, team B. Seed inputs: game ID `0`, timestamp `1700000000000`. Credits: 10,000; short game on; crates off; superweapons on. Natural-result run: speed 3 (20 ticks/second), unit count 10. Completed stability run: speed 0 (10 ticks/second), unit count 0; normal MCVs still spawn.

The natural-result harness sends a normal deploy order to the existing human MCV and observes. The stability fixture additionally queues and normally places a power plant, barracks, refinery and eight pillboxes; it then observes without further construction. The original six-pillbox attempt also sent ineffective full-health repair requests. Those requests are recorded as no-ops, not successful paid repair, and are absent from the final fixture. Configuration and seed are fixed; input timing depends on browser scheduling, so no identical replay or deterministic state equivalence is claimed. Bot implementation/limitations and exact evidence are in `retail-compatibility.md`.

## Completed runtime observations

The eight-pillbox run completed all eleven building orders through normal production and placement (22 queued/placement inputs plus the initial MCV deploy). It then continued with no further construction or repair input. At the final sample the human had built 11, scored 82 kills and recorded 8 losses; the three AI build counters were 61/46/70 and kill counters 2/2/4. Four players remained active when the browser closed after the observation window. The natural-result gate comes from the separate unassisted run; closing a browser is not counted as a match result.

Earlier runs that ended before a full continuous sampling window are retained: unassisted speed 3 (210,249 ms), unassisted speed 0 (405,314 ms), and six-pillbox defense (587,307 ms). Their durations are not added together to pass stability. A probe failed in the geometry collector because it assumed the selection root was a Mesh; the root is an Object3D containing four LineSegments. The collector was corrected, and subsequent geometry/runtime checks passed without changing rendering code.

The final independent checker, `node scripts/m0/validate-runtime.mjs`, passes all six runtime groups. Actual archived-field validation and the 104-field override inventory are described in `retail-compatibility.md`. Source-protection and separation checks were repeated after the final game, with unchanged metadata/hashes and no newly exposed or bundled retail assets.

Remaining product gaps: the built-in bot is not retail AI; other named difficulty branches use DummyBot; RA2 1.006 authenticity/behavior equivalence is unresolved; qualifying voxel-aircraft helper rendering is untested; full Simplified Chinese, campaigns, desktop packaging and Windows execution remain pending. The next bounded task is the aircraft rendering prerequisite in `next-step.md`.

## Recorded logical geometry

The browser viewport is 1280x960 at DPR 1; the battlefield viewport is 1112x928. `OrthographicCamera` has zoom 1, rotation `[-0.5235987755982988, 0.7853981633974483, 0, YXZ]`, horizontal bounds +/-3354.8916935656143 and vertical bounds +/-2799.7657298820955. `Coords.ts`, `WorldScene.ts` and `PipOverlay.ts` are unchanged from the pin.

The selected GACNST occupies a 4x4 foundation. The actual selection object contains four visible corner `LineSegments`, spaced across 1024 world units in each ground axis (four tiles at 256 units/tile). Each bracket's local bounds are `[0,-1,0]` to `[1,0,1]` and scale is `[256,104.51156235874893,256]`; its elevated plane is y=418.04624943499573. The full vertex arrays and projected click targets are in `.artifacts/compat/stability-2/browser.json` under `geometry`. The selected-building screenshot was visually inspected. These are engine observations for future comparison, not retail-executable or HD-equivalence certification.

## Offline evidence boundary

`bun run start:offline` serves only on `127.0.0.1:4000`. Asset routes are an exact filename map with no source path in the browser manifest, directory listing, generic filesystem mount or write endpoint. Unknown local asset/support paths fail. Imported archives are read from `.local`, not included in `dist/`. All startup fetches use loopback. The fresh Playwright context blocks remote requests before transmission and records attempted URLs; the application also guards fetch/XHR and network constructors, with CSP covering resource elements. Worker creation and WebSocket creation are separately observed. Global telemetry is not initialized, and the legacy `gtag` initialization call is removed.

Development dependency/source downloads were authorized and occurred before runtime validation; they are not game-runtime connections. The browser's own background services are outside page-request tracing, so Chrome is launched with background networking/component updates disabled. The exercised ground-force game paths use only loopback. This does not establish network behavior for every untested feature or the browser process itself.

## Protection and repository state

The source installation was read as data. No executable, patcher, Wine process, CnCNet component or source-directory script was launched. No installation file was changed, renamed, deleted or linked as a writable build destination. Only the implementation repository was initialized by cloning. The source inventory and hash evidence remain ignored/local. Local archive staging used temporary copies and local atomic publication.

Implementation changes are left reviewable in the working tree; nothing was committed, pushed or published by this task. Upstream binary deletions are pending worktree changes, while the pinned upstream history/index still records those original files. License investigation remains deferred, and distribution remains outside the task.

## Verified local start

Dependencies and imported data already exist in this workspace. Run:

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun run build
bun run start:offline
```

Open `http://127.0.0.1:4000/`, choose **Offline Skirmish**, South Pacific (2-4), and three **Normal** bots. Assign the human to team A/start 1 and bots to team B/starts 2-4, then start. The tested factions are Americans versus three Libya opponents. Do not substitute the unvalidated DummyBot difficulty branches. For exact commands and repeatable setup, use the README. The current bounded follow-up is documented in `next-step.md`.
