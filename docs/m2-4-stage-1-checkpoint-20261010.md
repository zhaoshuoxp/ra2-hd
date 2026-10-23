# M2.4 catalog and native loading checkpoint

Status: unified catalog and incremental Mac native validation passed; four original archive structure failures and one rule classification remain open. SNOW representatives are delivered for direction review. M2.4 remains incomplete.

The task branch starts at main `a5d7b86c3721511ec6c054a52dd3cdb0f7450c02`. Historical `a3259d9` is evidence, not a reset target. The isolated worktree is `/Users/Aone/RA2remaster/ra2-hd-m2-4-theaters`. Main, accepted packages, source archives, maps and peer Windows work remain untouched.

## Scope and source identity

The imported catalog has 298 declarations and 417 inventoried entries. The official skirmish allowlist contains 305 edition/source entries: 213 selected catalog sources and 92 alternate or archive sources, representing 234 unique map byte streams. Counts by theater are TEMPERATE 161, SNOW 91, URBAN 32, DESERT 13 and NEWURBAN 8. LUNAR has no scoped official map. Cooperative, campaign and custom sources are excluded by the audited allowlist; removing the legacy mode filter does not admit arbitrary files.

`src/offline/officialSkirmishCatalog.json` records archive/member identity, source SHA-256, original declared mode labels, label provenance, runtime alias and actual starting-location capacity. An undeclared archive source has an empty original mode list rather than an invented standard label. Archive variants have distinct hash-based aliases. Runtime admission verifies every map against the imported archive before replacing the catalog atomically. Source maps are never rewritten.

## Unified skirmish path

The existing lobby exposes one standard entry. Each admitted official map uses `mpbattle.ini` and existing user options; legacy teamgame, megawealth, meatgrind and duel labels no longer reject maps. The native loader forces the admitted mode to 1 and rejects combatant counts exceeding actual starts. After map rules merge, only `MultiplayerDialogSettings` is restored from the standard rules/options merge. Naval restrictions, object overrides, oil amounts, terrain, lighting, triggers and placements survive. Native evidence covers the actual standard mode, economy, technology, construction, options and alliances.

One ambiguity is pending user classification: `mp13s4mw.map@a4f07f9b9271` forbids seven initial unit types and has no catalog mode declaration. Its original overrides are preserved while the explicit question is pending. Four structural failures remain visible in the audit: three archive versions refer to missing tile 22 and one archive source has no starting locations. These are not classified as unsupported legacy modes.

## Header-only TMP slots

`mslop13.des` and `mslpx13.ubn` are identical 20-byte files, SHA-256 `808c00e695adebfe465f7e11420e23d8b5e0992eb2aa824567ca00a19864f8cf`, with header `[1,1,60,30]` and one zero image offset. The decoder now recognizes only an exact header/table-only, all-zero image table as empty slots. Image indices and tile-set numbering remain intact. An actual reference to an empty slot raises a named error. Truncated and nonzero invalid offsets still fail. Longer accepted zero-offset contact resources retain their existing decoding behavior.

The XCC reader treats zero table indices as absent tiles: [primary format implementation](https://raw.githubusercontent.com/OlafvdSpek/xcc/master/misc/tmp_ts_file.cpp). No scoped official map references these two empty tile numbers. Original DESERT and NEWURBAN matches now pass in the copied Mac app, including standard maps and former-mode variants. These were scanner-wide initialization blockers, distinct from missing HD resources.

## Preserved resources and evidence

The task resource root independently clones 7,091 registered files from main, with hashes checked and no replacements. It preserves environment `environment-m2-3-oil-paired-drive-complete-v31`, terrain `temperate-m2-3-gameplay-feedback-v12`, accepted faction/UI/prepared assets and current world/UI/CPU budgets. This is a resource-isolation receipt, not fresh visual acceptance. The accepted M2.3 handoff is reused for unchanged assets; Windows status remains NOT_RUN for M2.4.

Evidence resides under `.artifacts/m2-4`: `baseline-resource-clone.json`, `source-audit-v3/audit.json`, `inventory-v4/inventory.json`, `native-evidence-v3.json`, focused test logs, typecheck logs and source-pinned `snow-native-v1`. Snow representative masters retain builtin imagegen prompts, input hashes and output provenance in `snow-representatives-v2`; their selected registration and native validation pass, while visual direction remains pending. Source extraction is generalized per theater while retaining the existing TEMPERATE default.

The 305 edition/source entries represent 234 independent source files and byte streams, with 376 declared mode variants and 31 sources without catalog mode declarations. The unified menu offers 304 maps; 301 have successful native loading evidence (191 new checks, 110 directly verified accepted records). Three selectable archive versions fail on the missing native `hyte01.tem` tile; one zero-start archive source remains documented without inventing starts. Native loading is not HD completeness or visual acceptance. The machine ledger and detailed mode adaptation table are in `checkpoint-2-v3`.

An additional native check on former teamgame `tourofegypt.map` loads 7,500 credits, selected initial-unit count, two allied players and one enemy through existing lobby preferences. Standard technology/construction and the user's disabled quick-game/superweapon/MCV-repack/bridge-destruction options survive. Removing the enemy base retains the game while enemy units remain; removing its remaining combat assets invokes native defeat and victory. Controlled fixtures are disclosed; this is not a full natural-match claim.

Next checkpoints: SNOW direction review and complete production; URBAN; NEWURBAN/DESERT; coverage and affected-path regression; final isolated Mac delivery. Main integration waits for the user's visual acceptance. No push or publication is authorized. Continue this execution conversation for the current batch's feedback and remaining M2.4 work.
