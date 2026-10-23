# Isolated RA2 import

The importer reads only explicitly selected top-level archive filenames. It never executes, repairs, renames or writes into the installation. The installation path is supplied at invocation and stored only in ignored manifests.

## Commands

With `RA2_SOURCE` set to the installation directory:

```sh
bun run import:ra2 --source "$RA2_SOURCE" --dry-run
bun run import:ra2 --source "$RA2_SOURCE"
bun run import:ra2 --source "$RA2_SOURCE" --profile ra2-campaign
```

The first command writes `.local/ra2-core-dry-run.json` but creates no asset copies. The second writes `.local/ra2-core-manifest.json` and stages files in `.local/assets/ra2/`. Repeating it leaves identical destination files in place. Campaign import was executed for read-only feasibility analysis of the staged copies; campaign files are not exposed by the runtime server. Media import is implemented as a separate profile but was NOT RUN.

| Profile | Only accepted source names, case insensitive |
| --- | --- |
| `ra2-core` | `ra2.mix`, `language.mix`, `MULTI.MIX` |
| `ra2-campaign` | `MAPS01.MIX`, `MAPS02.MIX` |
| `ra2-media` | `THEME.MIX`, `MOVIES01.MIX`, `MOVIES02.MIX` |

Ambiguous case collisions fail. Source root symlink traversal and selected-file symlinks are rejected; this intentionally rejects internal symlinks as well as escaping ones. Output directory symlinks are rejected. Source and destination trees must be separate. Other files, including loose CSF/INI/fonts/cameos, Yuri archives, CnCNet content, WDT, expansion archives, executables, saves and custom maps, are excluded without being deleted.

## Validation and copying

`src/offline/retail.ts` shares the actual engine MIX and CSF parsers with the browser. `MixFile` now fails on truncated headers/indices, duplicate IDs and member/data bounds violations rather than swallowing errors. Encrypted archive headers use the upstream Blowfish code. CSF uses the upstream decoder with strict signature/bounds failures and explicit parsed/duplicate-label accounting. Duplicate CSF labels are distinct from duplicate MIX IDs: three case-normalized CSF label repetitions were observed and retained with the engine's existing last-value behavior.

Nested traversal uses explicit RA2 container identities from the engine's archive-loading/theater paths, bounded at depth four and 128 containers. Every opened container's complete member index is checked. Unknown member IDs are retained as unidentified; their names or types are not guessed. Unknown members are not recursively interpreted as archives. The local manifest lists all 23 validated core containers. This establishes structural readability of mounted containers, not authenticity or complete semantic validation of every game asset.

The complete selected profile is parsed and required core members resolved before any archive copy. Every destination conflict is checked before copying. The importer hashes the source before/after the copy and the destination afterwards, writes a unique temporary copy, and atomically publishes it with a create-if-absent local hard link before removing the temporary name. This link is between local output files, never into the installation. A racing conflicting destination fails instead of being overwritten. A multi-file import interrupted partway can leave verified completed files; rerunning reuses them. The manifest is atomically renamed only after verification completes.

Manifests retain original filenames, virtual filenames, source path, size, SHA-256, profile, destination, structural validation and copy result. SHA-256 verifies snapshot/copy consistency; retail authenticity and exact 1.006 lineage remain **unverified**.

## Observed core resources

| Resource | Resolved owner | Member ID | Bytes |
| --- | --- | --- | ---: |
| `rules.ini` | `ra2.mix/local.mix` | `0xf025a96c` | 541,915 |
| `art.ini` | `ra2.mix/local.mix` | `0xf91b2c8b` | 245,825 |
| `ai.ini` | `ra2.mix/local.mix` | `0x9e11e49a` | 84,972 |
| `ra2.csf` | `language.mix` | `0x7f6fbcdf` | 283,368 |
| `missions.pkt` | `ra2.mix/local.mix` | `0xfc4ae02c` | 15,979 |

The manifest is the canonical machine-readable source for IDs. The archived CSF declares language ID 9; decoded content identifies Traditional Chinese (`zh-TW`), with 4,479 parsed labels / 4,476 unique normalized keys. Bounded samples are kept only in `.artifacts/feasibility.json`. The loose root CSF was never read.

The archived map catalog resolves 87 map files in `multi.mix`. One four-slot candidate is `MP01T4.map`, ID 2422373715, catalog range 2–4 players. The compatibility follow-up played this map with one human and three Normal local bots. Rules/art/AI ownership is established; `retail-compatibility.md` describes the single engine identity addition and runtime evidence. Retail authenticity and full behavior equivalence remain unverified.

## Runtime boundary and tests

`src/offline/loadRetail.ts` fetches exactly three core archives and a sanitized hash manifest from loopback routes. It rehashes and validates the bytes before constructing a fresh VFS. No original installation path is sent to the browser. No browser folder handle, persisted mod directory, loose override scan or CDN loader is used. `MapFileLoader` fails on missing local maps instead of downloading them.

The only upstream support member mounted is `ui.ini`; the offline mode catalog is a small authored descriptor pointing to archived `mpbattle.ini`. Upstream `rulescd.ini`, `artcd.ini` and modified mode overrides are not mounted. Client text is separately served from the pinned upstream support CSF. `bun run setup:local-support` verifies/restores support files from the pinned local Git object without placing them in the public build.

Eight synthetic importer tests cover missing inputs, ambiguous case, truncated/duplicate/out-of-bounds MIX data, malformed nested archives, malformed CSF, excluded overlays, dry run, repeat import, conflicting output, source/output symlinks and required-map absence. No retail fixtures are committed. Actual dry-run, import and repeat-import logs are in `.artifacts/import*.log`.
