# Project maintenance

Start with the [current control-status delivery and cleanup](mind-control-final-20261005.md), its [receipt](mind-control-final-20261005.json), [integration history](main-integration-20261005.md), [lessons](rendering-and-resource-lessons.md) and [history index](project-history-index.md). Canonical development remains `/Users/Aone/RA2remaster/ra2-hd` on local main. Keep current resources under `.local`; preserve imports, retail data, user saves/profiles and the selected immutable prepared contract.

## Build and launch

Use the pinned Bun/dependencies. Run relevant tests and `bun run typecheck:entry` after runtime edits. C `contracts.test.ts` requires its own process/edition; do not combine it with suites that initialize a different singleton edition. Reuse accepted reports for unchanged paths and run the affected mechanisms from [rerun triggers](rendering-and-resource-lessons.md#evidence-reuse-and-rerun-triggers).

Use new output names; never overwrite an accepted build:

```sh
node scripts/editions/build-review.mjs .artifacts/<new-task>/build-v1
node scripts/editions/package-mac-test.mjs .artifacts/<new-task>/build-v1 \
  .artifacts/<new-task>/package-v1 <unique-delivery-name> \
  --app-title='<unique-app-title>' --require-prepared
```

Copy the complete package with `ditto` to its unique delivery destination; verify its receipt entries/signature and run the copied launcher with an isolated profile. Never infer current packaged activation from a source catalog or a READY menu. [Current delivery](mind-control-final-20261005.md#final-verification-and-delivery) records the actual validated application. World caps are 256/1280 MiB at 2X/4X, prepared CPU 128 MiB and separate UI 16 MiB.

## Historical material and recovery

The unified archive is `/Users/Aone/RA2remaster/archives/2026-10-05-final-cd`. The user explicitly added the previous `archives/2026-09-24-accepted-integration` to consolidation: its original evidence, source bundles and unique contents are preserved here; verified source duplicates are removed. Its historical PASS/FAIL labels remain unchanged. The small input closure for two legacy snow exporters is retained at `.local/archive-compat/soviet-snow-20260924`, with exclusive-copy/hash and input-reading evidence in `legacy-exporter-dependencies.json`. Current main and the combined app have no runtime dependency on the removed archive path.

`inventory.json` names every retirement root, size, Git tip and reason; per-root `manifests/*.jsonl` retain exact paths, SHA-256, modes, symlinks and file attributes. Read `archive-receipt.json`, `verification.json`, `cleanup-ledger.json`, `ownership.json` and `relocation-index.json` before recovery or further deletion. Versioned [maintenance receipt](project-maintenance-20261005.json) summarizes the completed result. To recover the former archive, use root ID `archive-2026-09-24-accepted-integration` and an optional prefix such as `snapshots/ra2-hd-buildings-m1-6c/.artifacts/m1-6c`; the original 2026-09-24 bundle is an ordinary preserved object in that manifest. No original evidence was relabeled or discarded.

Files are stored once by SHA-256 under `objects/`. There are no writable cross-worktree hardlinks. All unique masters, prompts, masks, exporters, reports, rejected material, screenshots, meaningful recordings and profiles are retained. Superseded portable ZIP containers are represented by exact member bytes, hashes, modes, symlinks and ZIP metadata in `zip-manifests/`; their original compressed byte hash is historical, and a regenerated container will not necessarily share it. This avoids retaining every ZIP plus its extraction. Trace/source archives keep their original compressed bytes. The two exact original accepted rollback ZIPs remain under `/Users/Aone/RA2remaster/rollback/`: C/LUNR `c048f6f` and D/R12. These retain their original ZIP byte identities. The current combined copied app remains the runnable delivery.

Restore only what is needed into a new destination; never restore over main or an accepted package:

```sh
python3 scripts/integration/consolidate.py restore \
  --root-id ra2-hd-yuri-units \
  --destination /Users/Aone/RA2remaster/recovery/d-art-material \
  --prefix .artifacts/yuri-units/source-v2
git worktree add /Users/Aone/RA2remaster/recovery/d-source \
  9aba6cd06f24901df52bc54c9bcb46f6d91ca68f
```

Omit `--prefix` for a complete archived root; expanded portable ZIPs restore into `<zip-name>.restored-contents/`. Symlinks retain their recorded targets: restore linked peer material or select a new isolated resource root deliberately before running recovered code. Source is also recoverable by cloning `source-before-cleanup.bundle` into a new directory; it was verified before retirement. All Git branch refs remain retained. Archival manifests contain source files too, but a restored snapshot has no active `.git` pointer. Use a fresh worktree for development.

Archive integrity and bounded restoration must pass before source deletion. A clean integrated branch and no active process references are required for retirement; no force-removal is permitted. Main, current runtime roots, retail/import sources and unrelated Desktop/home data are excluded. If ownership or uniqueness becomes uncertain, record an exact `HOLD_UNKNOWN` path/size/reason and retain it. Recheck registration and retained delivery content after cleanup. Volume availability and `st_blocks` are separate measurements: APFS shared extents and background activity prevent equating directory totals with reclaimed physical space. No Trash-emptying is authorized.

This conversation remains responsible for integrated user testing and incremental fixes. Preserve historical PASS/FAIL/pending labels and record later repairs or acceptance separately. The current final marker's Windows native execution remains pending; earlier Windows user acceptance does not establish execution of the new package.

## Completed consolidation

The [versioned receipt](project-maintenance-20261005.json) records 116 exact archived/removed roots: ten clean integrated worktrees, five superseded task outputs, 100 obsolete main packages/portable ZIPs, and the user-added September archive. All 151,959 unique objects passed SHA-256 verification; 711 bounded file/mode/link/rollback-member restorations passed. Generated restoration copies were subsequently removed as verified duplicates; the original objects, proof and dispositions remain. All Git refs and verified source bundles remain recoverable. No `HOLD_UNKNOWN` decisions are pending and no Trash was emptied.

The unique object payload is about 71.46 GiB. Retired roots summed to about 595.72 GiB of file allocation accounting, which includes APFS sharing and repeated hardlink accounting. Observed volume availability increased from 917,504,000,000 to 1,323,008,000,000 bytes, approximately 377.66 GiB. These coarse volume values include background/APFS effects; they are not an exact private-block release measurement. Consult the exact ledger and before/after files for retained directory allocation.

After cleanup, main and copied resource registration both pass with all 4778 selected file bytes unchanged. The retained copied delivery's 5480 entries, symlinks and strict ad hoc signature pass again; its private profile remains present. Runtime source paths/content match the previously validated `ba7a6d2` binary, so the focused native acceptance is reused. The final main HEAD/cleanliness is recorded separately in `.artifacts/main-integration-20261005/final-main-state.json`, avoiding a self-referential commit hash in versioned documentation.

## Final feedback cleanup

The [final control-status receipt](mind-control-final-20261005.json) supersedes the historical BA7 runnable delivery with the independent A6 Mac/Windows Control-Fix packages. It adds `maintenance-control-final-v1` and `maintenance-control-final-v2` to the existing archive without rewriting its earlier history. These runs preserve and retire 108 exact old outputs, verify 5,803 distinct referenced objects and 388 bounded restorations, and leave no held roots. The old BA7 and intermediate C31 copied applications are recoverable from the supplemental manifests; final A6 deliveries and all Desktop ZIPs remain present.

Use `scripts/integration/maintain-artifacts.py restore` for v1 and `.artifacts/mind-control-final-20261005/fixed-blue-native-art/supplement-maintenance.py restore` for v2. Exact example root IDs and fresh recovery destinations are in the [final recovery instructions](mind-control-final-20261005.md#completed-archival-and-cleanup). Restored files may receive new macOS provenance; original extended attributes remain recorded. Current source selections, final copied bytes/modes/links, Mac signature, active registration and all retired-root absences pass after cleanup. The final main state is `.artifacts/mind-control-final-20261005/final-main-state.json`.
