# Retail compatibility adapter

Date: 2026-09-14. This bounded follow-up separates the startup prerequisite from the upstream override archive. It does not establish complete RA2 1.006 equivalence.

## Applied change

`src/game/rules/general/ParadropRules.ts` requires `General.ParadropPlane`, a name lookup absent from the staged archived rules. `src/offline/retailCompatibility.ts` supplies `PDPLANE` only when that field is absent and the archived aircraft registry contains `PDPLANE` with primary weapon `ParaDropWeapon`. Missing or inconsistent prerequisites fail explicitly. An existing explicit field is preserved. No aircraft statistics, weapon values, multiplayer defaults or art entries are changed.

The adapter clones the input and declares version `ra2-offline-compat/1`, included in the engine's mod hash. Browser diagnostics expose its version and applied field names. The engine continues to bypass wholesale `rulescd.ini` and `artcd.ini` merges. The local support route still exposes only client text and `ui.ini`.

Two synthetic tests verify immutability, original-field equality, the single addition, existing configuration and missing prerequisites. The actual staged-data check (`bun scripts/m0/compat-validate.ts`) compares all 17,481 entries in 1,192 sections, removes the one addition and requires byte equality of the parsed serialization. Archived art is unchanged. See `.artifacts/compat/rule-invariance.json`; this proves data preservation at the adapter boundary, not complete simulation semantics or retail authenticity.

## Override triage

`docs/compatibility-overrides.json` inventories all 104 fields found in the pinned support archive's two override files. It contains metadata only. Original values remain in ignored `.artifacts/compat/override-audit.json`.

| Triage class | Fields | Disposition |
| --- | ---: | --- |
| Engine identity | 1 | Explicit adapter above |
| Balance/default or rendering fix | 23 | Excluded |
| Online setting | 1 | Excluded |
| Rendering adaptation | 15 | Deferred |
| Object registry change | 1 | Deferred |
| Animation registry change | 9 | Deferred |
| Art timing, offset, cameo or voxel change | 54 | Excluded |

These are conservative field-level triage labels, not semantic equivalence certifications. In particular, art changes can affect animation timing and weapon placement. Adding all entries merely because some are needed by this engine would conceal those differences.

The subsequent [rendering follow-up](rendering-followup.md) guards the absent optional `AudioVisual.FlyerHelper` name before calling the animation factory. A normally produced American Harrier now passes selection, takeoff and movement in Chrome without adding rules/art aliases. Other aircraft, engine animation aliases and exact retail visual parity remain unverified.

## Other startup prerequisites

`loadRetail.ts` now returns a local `GameResConfig`, so the game loader can safely query its source. `GameLoader.ts` bypasses festive-asset loading and uses the statically imported bot implementation without a SystemJS package lookup. No remote fallback was added. `SkirmishScreen` accepts an optional timestamp through its existing debug entry to reproduce a scenario seed; ordinary UI starts still use `Date.now()`.

Normal AI (`AiDifficulty.Normal`, numeric 4) creates `BuiltInBotAdapter`: the upstream Supalosa-derived implementation, registry version 0.6.1, with upstream deployment/build fail-safes. The other named Easy/Medium/MediumSea/Brutal branches create `DummyBot` in this pinned source. Only Normal is covered by this baseline. Loading retail `ai.ini` does not make this bot retail AI.

## Runtime evidence

The initial successful run used `MP01T4.map` from staged `multi.mix`, map digest `bc957ed8`, seed inputs `['0', 1700000000000]`, and four occupied slots. Player 1 was Americans at start 1/team A; three Normal bots were Africans (Libya) at starts 2–4/team B. Speed was 3 (20 ticks/second), credits 10,000, starting unit count 10, short game enabled, crates disabled. The harness deployed the player's existing MCV through the normal order API and otherwise observed. Map, slots and RNG seed are fixed; browser scheduling controls the deployment tick, so this is not a byte-identical input replay or a determinism comparison. The harness now records the issued deployment tick on reruns. It did not create objects, alter health, force defeat or invoke game end.

At tick 4,409 the normal game-end event fired after the human was defeated; the final sample was tick 4,410 (294 seconds of simulation). The final AI build counters were 35/36/36 and kill counters 3/1/1. Snapshots show power plants, barracks, refineries, harvesters and infantry; credits rose after spending, and losses/kills accompanied attacks. `.artifacts/compat/run-final.png` shows the natural game-over overlay. This match ended before ten wall-clock minutes and is the natural-result evidence, separately from the stability run.

The no-defense speed-0 follow-up also ended naturally, at tick 4,169 (final sample 4,170; 405,314 ms observed wall time). That run is preserved in `.artifacts/compat/stability-2/` and does not pass ten-minute stability. The first defended scenario used a finite queue of one power plant, barracks and refinery plus six pillboxes. This recorded run also issued full-health repair requests, which `ToggleRepairAction` correctly ignores; paid repair was not exercised. Those ineffective requests were removed from the reusable sequence. This six-pillbox run ended naturally at tick 6,014 (final sample 6,015) after a 587,307 ms continuous sampling window; it is not counted as a ten-minute sampling pass. The subsequent `scripts/m0/defense-sequence.mjs` fixture requests eight pillboxes instead. Production completion is identified by new object IDs so combat losses cannot be mistaken for a failed placement. It has no enemy-driven strategy, resource grant, health edit or forced result. Input actions and their simulation ticks are recorded locally, including the ignored repair requests in this historical run.

The eight-pillbox run passed a 600.016-second continuous observation window (ticks 182-6,182), with all four players still active. The final runtime checker also passed after an actual server restart and fresh-storage/reload checks. See `m0-1-report.md` for the complete geometry, network and protection results. All raw gameplay imagery, traces, console excerpts and staged game data remain local and ignored.
