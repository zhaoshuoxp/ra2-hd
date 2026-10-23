# Test maintenance, 2026-10-20

Work started from local main `84a0b34809a860de09162337bdc2d157faa16e81` on isolated branch `maintenance/test-fixtures-20261020`. This change concerns tests and test tooling only. Production runtime, resource selectors, accepted artwork and the frozen Windows development ZIP are outside the mutation scope.

## Test entry points

Run from the repository root with the existing Bun dependencies installed:

```sh
bun run test:source
bun run test:integration --resource-root /path/to/imported/.local
bun run test --resource-root /path/to/imported/.local
bun run typecheck:entry
```

`RA2_TEST_RESOURCE_ROOT` is the equivalent environment setting for individual `bun test` commands. It points to the real imported `.local` directory, not the repository or a symlink farm. It defaults to the checkout's `.local` only for direct individual tests. The aggregate integration/full modes require an explicit root. No profile registration is changed. On Windows, pass the resource directory as a quoted command argument.

`--output /path/to/evidence` selects the output folder (default `.artifacts/test-suite`). `raw.log` retains child output and exact commands; `summary.json` separates passed cases, failed cases, loading errors, skipped cases, process errors and omitted files. Bun's loading errors are already included in its fail total and are subtracted before reporting failed cases. Unexpected skips make the aggregate run fail. A source-only result is explicitly partial, never full-suite acceptance.

The runner discovers tests under `scripts` and `src/test`, including `.test.mjs` files. Resource-dependent files are listed explicitly in `scripts/test-support/integration-files.json`; mixed logic/integration files belong to that integration set in their entirety. Add new resource-dependent files to that list. All tests run in separate processes. Yuri building contracts run twice, with `C_TEST_EDITION=yr` and `ra2`; no cached edition modules cross those boundaries. The shared browser preload installs the production THREE compatibility facade for the life of each child process. The four repaired renderer files also initialize before dynamic production imports when run individually.

Every child uses a task-owned temporary root, removed in `finally`. Destructive registration tests copy only the required small families. No test registers resources through symlinks. The source-only mode omits private resource integration explicitly; required integration inputs never silently become skipped tests.

## Results and boundaries

The documented full entry point ran once: **589 passed, zero failed cases, zero loading errors, zero skipped and zero process errors**, across 145 files / 146 processes (Yuri contracts run in both editions). Source-only: **445 passed**, with all 29 resource/mixed files explicitly not run. Entry typecheck passed. This is Mac Bun test acceptance, not Windows compatibility, native rendering, performance, physical-input or fresh artwork acceptance.

The final review strengthened the RA2 Yuri rejection case by removing an early return and changed Rhino discovery to use its registered route. Only those affected scopes were rerun: Yuri RA2 **3 pass / 809 assertions**; Rhino **4 pass / 81 assertions**. Totals are unchanged. The original full output is retained rather than rewritten. Entry typecheck excludes test files; Bun executed all test files.

Historical baseline: 491 passed, 31 skipped, 11 failed cases and nine loading errors (20 total failures). The separately printed nine errors are not additional failures. Historical predecessor failures did not establish working functionality. The accompanying [JSON ledger](test-maintenance-20261020.json) maps every original failure/loading error and all 31 skipped cases to cause, repair, executed result or retirement. There are no remaining current-scope failures or coverage gaps identified by this maintenance work.

## Repairs and retained coverage

- Five stale fixtures now cover LUNR availability, HD density migration/round-trip/off, the real SCHP finder interface, AMCV bridge-depth traversal, and complete miner fallback in a small temporary copy with guaranteed cleanup.
- Four renderer files initialize the production THREE facade before loading particle consumers. Each passed individually; the aggregate isolates file and edition caches.
- Retail rules and inventory checks use the imported archives with real edition/member precedence, validate archive hashes and receipt provenance, and independently parse original frame geometry. Both editions' sequence maps and fixed-facing differences are checked. No original archive or extracted rule dump was added.
- Rhino prototype hashing uses a standard deterministic SHA-256 vector. The four-/sixteen-part proof adapters are script-only prototypes, not production imports; their unrelated geometry, heading, state and disposal tests remain. Current production Rhino is resolved through desktop registration and checked against runtime identity, all sixteen image/mask pairs and six original VXL/HVA sources. Retired images are not recreated or relabeled as accepted art.
- Environment and terrain checks resolve hash-verified current selectors, require the eleven named waterfalls/flag control and `m2-3-set23` slope group, and retain source admission, 2x/4x, corruption, group atomicity, budget and disposal coverage. A cancellation-during-upload test verifies release before publication. The separate environment test also no longer needs `prepared-native-v2/source.json`.
- Restored NAPOWR checks exercise current pooled storage, original 67-frame geometry, exact texture and index-map byte accounting, density fallback, budget rejection before upload and release. Soviet family reservations are conservative minima rather than exact repaint sizes; actual allocations, independent sources, complete density and the 256 MiB combined cap remain asserted. Engineer sharing follows the accepted exact-image alias; foreign images remain rejected. TERROR follows the accepted owner-r3 authored-paint mask contract while preserving native shadow and neutral-skin checks. See [owner-mask contract](owner-color-rotor-correction.md) and `sharedAlliedUnitHd.ts`.

Of the 31 historical skips, **29 are migrated and executed**. Two old SHAD intermediate-version delta comparisons are **retired**, not counted as passes: belly-r1 to rotor-r2, and rotor-r2 to rear-mount. Current pinned complete SHAD manifest/atlas bytes, all 24 frame corners, both rotor densities, body attitude, spin independence and exact rear-mount height/offset remain covered in the helicopter tests. SQD/YURIPR resource-format checks do not change their shipped Original guards or claim gameplay acceptance.

## Evidence and preservation

- [Full raw output](test-maintenance-20261020/full/raw.log) and [machine summary](test-maintenance-20261020/full/summary.json).
- [Source-only raw output](test-maintenance-20261020/source/raw.log), [typecheck](test-maintenance-20261020/typecheck.log), [final Yuri RA2](test-maintenance-20261020/final-yuri-ra2.log), [final Rhino](test-maintenance-20261020/final-rhino.log).
- [Missing-import diagnostic](test-maintenance-20261020/missing-input.log) intentionally exits nonzero with an actionable setup error. Failed intermediate focused receipts remain alongside the final evidence.
- [Before full verification](test-maintenance-20261020/preservation-before-full.json) and [after verification](test-maintenance-20261020/preservation-after.json): canonical main remains clean at the starting commit; the 14,230-entry resource metadata inventory and frozen Windows ZIP size/mtime/inode remain unchanged. This is a metadata preservation check, supplemented by resource hash validation in integration tests, not a claim of a second whole-ZIP hash.

No production source or desktop selector changed. No main merge, push, package rebuild, gallery, resource backup or original rule dump was produced. Temporary test resources were removed. Dependencies use an ignored link to the existing installation; resource registration uses a real explicit root. The independent M2.4 task was active and advanced its own branch / added airport-marking scripts during this work; this task did not write there and does not claim its state remained stationary.

## Integration and lessons

The local maintenance commit can later be cherry-picked onto a reviewed clean main. Inspect any intervening changes first, then run the full command above with canonical resources and `bun run typecheck:entry`. No artwork transfer or Windows package regeneration is necessary for this source/test change.

Prefer current selectors plus independent original parsing over historical review exports. Keep required-input failures visible, account for every pooled texture and index map, initialize before importing compatibility consumers, and isolate cached edition state. Keep historical visual-delta acceptance separate from current regression checks. A skipped check is never a pass; Bun's separate error line must not be double-counted.

Continue corrections and acceptance in this execution chat. Windows MCV deployment and 90+ FPS optimization stay in the existing Windows chat.
