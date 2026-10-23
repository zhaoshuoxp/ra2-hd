# Offline built-in trainer (Task F)

Status: `OFFLINE_TRAINER_ACCEPTED_AND_INTEGRATED_INTO_MAIN`. The user approved the delivered review on 2026-09-24. See [acceptance and main integration](offline-trainer-acceptance-and-integration.md); frozen pre-acceptance receipts remain unchanged. Human acceptance is separate from automated evidence. Only Task F is selected; A–E are not started.

## Baseline and reference

The clean integrated checkout was `m0-2-stabilization` at `c6cbe578d9895d744ca5797a69c59e3dea9ed305`, including `5369148` (accepted YR units), `777e70d` (Boris, Iron Curtain and repair) and `c6cbe57` (missile pose). The old branch named `main` was not checked out. Existing dual-edition gameplay, accepted M1.6/M1.7/M1.8 assets, reference height 900, production C and resource budgets remain the baseline. Historical dormant-Yuri UI statements do not describe this runtime.

Behavior reference: [RedAlert2Trainer revision 486720cfa7603ba849ae7f75b1f72ec2f196b242](https://github.com/zhaoshuoxp/RedAlert2Trainer/tree/486720cfa7603ba849ae7f75b1f72ec2f196b242/RedAlert2). Its `RedAlert2/app.py`, `RedAlert2/engine.py` and root `README.md` were downloaded read-only into ignored reference evidence. Only the RA2/YR controls were considered. No Windows injection code, process attachment, executable, patch addresses, Ares/CnCNet integration or global OS hooks are used.

## Feature matrix

All rows apply to RA2 Allied/Soviet and YR Allied/Soviet/Yuri, with native Original fallback where HD assets are absent. Parameters persist separately per edition; effects never persist across matches. The UI is localized through `public/res/locale`.

| Reference control / handler | Native command and semantics | Lifetime / toolbar group | Evidence |
| --- | --- | --- | --- |
| Connect/detach, `connect` | Options master, default OFF. One `TrainerController` for menu and paused Options. | Persisted preference; no automatic effects | Preferences, native OFF/paused Options |
| Set/add, `change_money`, commands 1/2 | `credits {mode,value}`; integer 0–10,000,000; reject overflow on add | Completed one-shot / Economy | Credit boundaries, queue, native set/add |
| Minimum money, `feature('money')` | `effect minimum`; enforce configured floor on simulation ticks for local player only | Sustained / Economy | Minimum/removal/AI neutrality |
| Extra power, `feature('power')`, command 8 | `effect power`; integer bonus 0–100,000. Native power-change/low/restore notifications. Blackouts and disc drain remain independent. | Sustained / Economy | Native supply/removal/blackout tests |
| Heal, command 3 | `heal` selected living spawned local technos via `healToFull`, health/power notifications retained | Completed one-shot / Targets | Native HP and independent health events |
| Protect/unprotect/clear, commands 4/5/7 | `protect`, `unprotect`, `clearProtection`. Separate object-reference set, checked at `HealthTrait.inflictDamage`. No edits to native invulnerability. | Match-only set / Targets | Own/enemy/stale identity/owner cleanup; independent Force Shield |
| Capture, command 6 | `transfer`; explicit target mode accepts a visible hovered enemy/neutral techno. `Game.changeObjectOwner` drives native traits/events. Transport passengers and garrison occupants transfer with their carrier/building. Individual slaves detach from their former master before transfer. | Completed one-shot / Targets | Native owner registries/supply; side-effect fixtures |
| Reveal, command 10 | `reveal`; native local `MapShroudTrait.revealMap`. Reveals terrain once, does not grant radar or detect cloak/disguise; gap generators still operate. No fog toggle. | Completed one-shot / Build-map | Native shroud; no snapshot restoration |
| Buildings, `feature('buildings')` | `effect construction`; local structure/defense queue pays remaining cost in one tick if affordable. Native placement and construction animation remain. | Sustained / Build-map | Ready queue, native payment/cancel/refund |
| Unit time, `feature('units')` | `effect production`; 1–120 simulation seconds, rounded up at 15 ticks/sec. Caps native build time, never slows shorter items. Existing progress/price/exit/spawn/cloning path retained. | Sustained / Build-map | Intermediate progress, native spawn, removal/no rewind |
| All tech, `feature('tech')`, command 9 | `effect technology`; bypass country/owner, tech-level ceiling, building prerequisites and stolen-tech gates. Use only the edition's existing producible catalog with nonnegative TechLevel and nonzero BuildLimit. Retain physical factory type, land/naval category, airfield slots, positive/negative build limits and disabled-superweapon match option. | Sustained / Build-map | Country/stolen/native-factory/edition gates |
| Placement, `feature('placement')` | `effect placement`; bypass adjacency only in preview and authoritative worker. Preserve occupied cells, terrain, bounds, explored tiles, foundation, water/land and other rules. | Sustained / Build-map | Remote valid footprint and occupied invalid footprint |
| Ready, command 11 | `ready`; iterate actual owned eligible powers. Keep powered/paused/warped availability, active effects and native targeting stages. Create no power or edition content. | Completed one-shot / Powers | Base powers and all five YR-specific types |
| No cooldown, `feature('super')` | `effect recharge`; repeat readiness only when native eligibility permits and previous effect is no longer active | Sustained / Powers | Repeated reset/recharge, active-effect/power locks |
| Disable all, `disable_all` | `reset`; immediately clear effects/protection/queued commands/targeting without changing master preference | Idempotent cleanup / bar | Reset, paused cancellation, completed one-shots retained |
| Topmost/process table | Not applicable to an in-game toolbar; selection and protection count shown through native selection/context | No external window/process UI | Interface review |

“All technology” treats captured-factory country affinity as a bypassed availability gate: any owned compatible physical factory can produce eligible content. It does not award permanent stolen-tech flags, alter country, edit shared rules, add absent expansion entries or fabricate factories. Returning OFF restores the original gates for new orders; it does not rewind already paid production. Native factory loss still revalidates queues and refunds as usual.

Protection applies to ordinary health damage only. Native forced destruction, selling, crushing, temporal removal, conversion or transport-loss mechanics can still remove an object. Object references plus session generation prevent recycled numeric IDs from inheriting protection. Ownership change removes protection immediately; destruction/unspawn is pruned on the next tick, and session disposal clears all references. OFF/reset never clears Iron Curtain or Force Shield.

## Command, pause and replay boundaries

The typed dispatcher validates master, live offline skirmish session, immutable edition, session generation, current local human actor, living targets and numeric ranges. It refuses spectators, AI actors, defeated/ended games, network/LAN contexts, stale sessions and playback (which never binds a trainer session). Pending target arrays are copied and revalidated at application time. At most 64 commands are pending; selection batches are bounded to 512.

One-shots and effect changes enter a separate bounded queue consumed at the beginning of the next native game update. Paused controls display pending status and never call game update. OFF and reset perform only the supported cleanup transaction, including native power recalculation; they never advance simulation or restore whole-game snapshots. Edition switching reloads the document and its edition-scoped storage; `LocalPrefs` supplies the namespace exactly once. There is no new save/load system. New match, exit, disposal and edition change discard session effects and queued actions.

Replay policy is explicit: the first applied trainer command marks the current replay invalid. Automatic saving is skipped and `Replay.serialize` refuses it, also preventing alternate save routes. Merely enabling the master or cancelling an unapplied queue leaves ordinary replay recording intact. Reset/OFF cannot make a previously modified replay valid. The UI and localized help disclose this limit; deterministic trainer playback is not claimed.

The legacy FreeMoney/BuildCheat/ToggleShroud bindings remain configurable but route through the same controller. The dev-mode auto-enable and writable `cheats` console registration are removed; the historical global `speedCheat` is inert in production. Existing development diagnostics already expose the game object; the trainer diagnostic entry uses the same validated dispatcher and is not a second gameplay UI.

## Input and layout

The optional overlay host implements `OptionalToolbarSlot`: a 30-logical-pixel bar, no reserved viewport area, popovers for actions/parameters and no DOM controls or pointer interception while OFF. It sits above the existing bottom command bar and left of the sidebar. Popover interaction retains selection, suspends panning/keyboard dispatch and hands off the pointer through the existing desktop cursor mechanism. Explicit capture uses the native world-interaction mode; right-click cancels.

Mouse access covers every command. Default bindings are Ctrl+Shift+1..0 for add credits, supply, heal, protect, target capture, reveal, buildings, technology, placement and clear protection. Every exposed action can instead use an available Ctrl+Shift+digit or remain unbound. Conflicts are detected against both trainer bindings and existing game bindings without replacing user shortcuts. No Cmd+Q/W, Option character combinations, Fn keys or numeric keypad is required. Text/number/select editing, IME composition, repeats, dialogs, pause menus and unfocused application windows do not dispatch trainer hotkeys.

## Evidence and delivery

Work and failed intermediate checks remain under `.artifacts/offline-trainer/`. `protected-before.json` records baseline `.local`, normal `dist` and accepted resource manifests; the final receipt will compare them without replacing assets. Isolated builds reuse the edition build recipe and package resource checks. No Desktop copy, ZIP, Windows build, push, new art or A–E implementation is included.

Windows and physical human input/panel/speaker checks are `NOT RUN` / `UNVERIFIED`. Native scripted simulation, fixture screenshots, automated UI events and user acceptance are separate evidence categories. Continue corrections and acceptance in this execution task; do not create a new task automatically.

## Verified matrix and evidence categories

The representative countries are Americans (index 0), Africans (index 5) and YuriCountry (index 9). Each row below passed in the newly packaged Mac application. Temperate uses MP23T4 / XMP23T4; snow uses MP12S4 / XMP12S4.

| Edition / faction | Temperate | Snow |
| --- | --- | --- |
| RA2 Allied | Full feature semantics, queues, ownership, powers and input | UI, selection, economy, protection, placement and reset smoke |
| RA2 Soviet | Full feature semantics, queues, ownership, powers and input | UI, selection, economy, protection, placement and reset smoke |
| YR Allied | Full feature semantics, queues, ownership, powers and input | UI, selection, economy, protection, placement and reset smoke |
| YR Soviet | Full feature semantics, queues, ownership, powers and input | UI, selection, economy, protection, placement and reset smoke |
| YR Yuri | Full feature semantics, queues, ownership, powers and input | UI, selection, economy, protection, placement and reset smoke |

- Focused suites: 162 tests, 2,711 assertions, 37 files, zero failures. This includes 18 trainer tests, existing edition/UI/production-clock/desktop checks, civilian ownership, garrison, presentation, Rhino shadows and unit registration/animation. Entry typecheck, isolated production build and whitespace checks pass. The deterministic OFF comparison covers native production/payment and damage frames against an absent trainer; it is not an end-to-end replay checksum claim.
- Full native cases cover successful commands, invalid values and identities, OFF/reset/removal, native queue pause/resume/cancellation/refunds, no funds, low power, factory loss, blocked delivery and five game speeds. AI queues retain their native rate. Health and native invulnerability remain independent. Shared base rules are unchanged.
- Ownership fixtures cover carrier/passenger consistency, controlled units/controllers, captured factories and power. YR additionally covers Industrial Plant, Bio Reactor, Robot Control, individual slaves, Slave Miner workers, bunker defenders/evacuation and Cloning Vats with native production events.
- Actual owned-power fixtures activate five RA2 and ten YR power instances twice each. YR includes Psychic Dominator, Genetic Converter, Psychic Reveal, Spy Plane and Force Shield. Active-effect cleanup and Force Shield's native blackout remain authoritative.
- Lifecycle evidence covers queued actions in real paused Options and the first resumed tick, reset/OFF cancellation, restart through the existing native reset diagnostic, menu return/new match and RA2 -> YR -> RA2 reloads. Preferences stay separate; effects and stale session references do not survive. Main and paused Options use the same master.
- Automated UI checks cover old/new shortcuts, remapping/conflicts, repeats, IME events, editable numeric focus, invalid drafts, selection retention, actual mouse target capture, target cancellation on OFF, cursor/input release and fullscreen controls. The regular bar is 30 logical pixels high. At a 1280 x 927 window, the 1080p/1440p/4K presets produce 1491 x 1080, 1988 x 1440 and 2982 x 2160 buffers, with the same tick, logical viewport, camera and bar dimensions and no GL errors. These are height-based sampling presets preserving the window aspect ratio, not physical-panel measurements.

Native simulation evidence uses controlled actors, factory placement and explicit simulation steps in the validation harness. AI planning is suspended; pre-existing AI production is temporarily paused for the isolated credit-neutrality assertion and restored afterwards. Separate simultaneous production checks exercise native AI queues. Stalled factory delivery is tested by disabling outgoing-unit movement, then removing that blocker through native destruction; the test does not assert that a cancelled exit task automatically resumes. Production UI actions never advance the simulation secretly.

The focus guard check supplies a false renderer focus state and dispatches a DOM key event. Native blur/hide/secondary-window attempts retained document focus in this automation environment, so real application switching remains UNVERIFIED. Context fixtures reject LAN, non-single-player and spectator states and an absent session. ReplayScreen never binds a trainer session; serializer and save guards reject modified recordings. There is no deterministic trainer playback implementation or new save/load system.

## Accepted-feature regressions

The package validator runs from `/private/tmp` with fresh profiles and discovers only the companion resource directory. Both original Bering snow maps pass all 18 applicable Soviet building family/member checks, actual HD bindings and normal/damaged captures, plus guard/promotion, Conscript/Rhino or YR roster checks, debris/weapon-loop feedback, positive/negative lamp GPU probes and pause-to-score timing. Both editions pass native V3/Dreadnought flight direction and repair/Iron Curtain checks; YR also passes Boris designation and cancellation. Native civilian entry/exit passes five cycles in each edition on MP01T4 / XMP01T4.

Retained failed attempts are diagnostic evidence, not PASS results. A real trainer teardown ordering issue was fixed before the final build: cleanup now precedes game disposal and sidebar updates are scoped to their live session. Harness corrections isolate existing AI expenses, remove a deliberately stalled factory blocker, place building-freeze fixtures after combat checks, wait for asynchronous HD bindings and keep the Boris target alive through capture latency using fixture-only health. The visual assertions remain strict; no artwork, lighting, weapon or missile implementation was changed.

## Delivery identity and launch

The runtime is built from clean implementation commit `cc2adeafb475031739d1f937387394d522d461f0` on `m0-2-stabilization`. Subsequent changes only finalize documentation and validation tools. All 22 changed runtime source/configuration paths are hash-checked against that implementation commit. The frozen build is `.artifacts/offline-trainer/build-final/`; the ad-hoc signed Apple Silicon application is:

`.artifacts/offline-trainer/package-final/RA2-HD-Offline-Trainer-R1/Red Alert 2 HD Offline Trainer R1.app`

Open the app directly and keep `RA2-HD-Editions-Resources` beside it. The default isolated profile is `Trainer-Review-Profile` in the same package folder; direct launch/profile selection and automatic resource discovery pass without a registration override. Enable the trainer in Options, enter an offline skirmish and use the bottom groups. Preferences start OFF separately in each untouched edition. No Desktop copy, archive or Windows package is required.

The package contains 1,214 resource files and 1,685 immutable inventory entries, including symlinks. The runtime profile is excluded from that immutable inventory. The accepted UI selection remains `remaining-ui-v4`. All 9,395 protected baseline files remain byte-identical, including accepted `.local` resources, normal `dist` and resource receipts. Exact hashes and paths are in `protected-before.json`, `runtime-source-verified.json`, `package-final/package-receipt.json` and the final receipt under `.artifacts/offline-trainer/`.

Build identity SHA-256: `415c38e521ae958665c92d9e704109f3c57ac95b3dd6d4cc4efd9482bfb82a4e`. Package receipt SHA-256: `f08f69cab9ce1eb3a85a2b40fe38175c4dc0ade7e6b8245971cb6619dda3d717`.

The self-contained review is `.artifacts/offline-trainer/offline-trainer-review.html`: embedded screenshots/results, exact delivery identity and one combined manual acceptance checklist. No web server is needed. The authoritative matrix is `matrix-complete/matrix.json`; package regressions are in `package-validation-v2/result.json`, visual/flight regressions in `visual-ra2-v2/` and `visual-yr-v2/`, and evacuation in `civilian-ra2/` and `civilian-yr/`. The final receipt records the actual final source HEAD and the distinct frozen runtime HEAD.

Human acceptance of the delivered functional/UI scope is complete. Physical mouse/keyboard/IME/application switching, panel readability and speakers remain UNVERIFIED; Windows is NOT RUN. Continue any corrections to this accepted trainer in the same execution task. A–E have not started, and nothing is pushed or published.
