# Isolated skirmish loading optimization

The accepted Allied correction app repeatedly decoded and validated 312 HD PNG
requests before entering a temperate YR match. Its 4X preparation also repooled
the Soviet shipyard even for an Allied player. The measured world registration
gate took 23.41 seconds at 4X and 21.09 seconds on a repeated entry.

This branch starts from committed main `0370e9b` and merges the accepted Allied
correction branch `3b4202a`. Task C's uncommitted work remains excluded. Source,
selected resources, dependencies, app builds, test profiles and evidence belong
to the isolated `ra2-hd-skirmish-loading` worktree. Main is not merged or built.

The optional prepared layer stores the existing resolver's validated output,
including its exact Electron canvas decode, derived 2X pixels, pooled lookup
textures and categorical owner masks. It is pinned by a compiled index hash;
every payload is hash-checked before use. Missing or corrupt prepared resources
retain the original independently validated PNG path. Every match owns fresh
textures. A CPU cache retains at most 128 MiB, including admitted pending data.

Initial buildings and the construction yards of initial MCVs prepare before
entry. Other complete building families share the existing bounded demand
queue. Native production queue changes request preparation during construction;
real renderers take over speculative leases, and cancellation/teardown releases
them. Native rules, credits, queue timing, geometry, shadows and accepted artwork
remain unchanged. Existing 2X/4X world and UI texture budgets remain unchanged.

Preprocessing has verified 446 selected source manifests across the two edition
contracts, generating 1,233 pages (2,813,797,148 bytes). Every output texture,
including independent Yuri remap pools, round-trips byte-identically with its
validated runtime representation. The selected source PNGs remain unchanged.
The final prepared index is pinned in `desktop/prepared-hd-contract.json`.

The 46 focused tests pass with 11,030 assertions. They cover cache bounds,
in-flight clearing, corruption fallback, texture ownership, pooled masks,
complete-family budgets, renderer lease transfer and native queue observations.
Entry type checking passes. Historical art acceptance records remain immutable;
packaging does not imply new visual or Windows acceptance.

## Packaged native validation

Runtime source: `69d8e3c2b3c8bb9f37def39b05c9cafebad89e3e`. Each row measures
the normal start-game request to world-scene registration, with independent test
profiles. The second entry reuses the same application process and map. Native
prerequisite fixtures are installed after this timing gate.

| Edition / artwork | First entry | Same-process second entry |
| --- | ---: | ---: |
| YR / Original | 3.66 s | 4.28 s |
| YR / 2X | 3.76 s | 4.41 s |
| YR / 4X | 4.55 s | 4.73 s |
| RA2 / 2X | 3.45 s | 3.69 s |
| RA2 / 4X | 3.89 s | 3.78 s |

The previous accepted app took 11.80 s at YR 2X and 23.41 s at YR 4X;
its repeated 4X entry took 21.09 s. The final 4X preparation interval fell
from 19.419 s to 0.836 s on first entry, and from 16.098 s to 0.381 s on
repeated entry. Original rendering still spends its time in native map and
scene construction; this change does not claim to accelerate that path.

Repeated 2X entry reuses all 15 prepared pages; repeated 4X reuses 23 of 25.
Two large pages bypass cache admission to avoid flushing smaller reusable
pages. Cache residency is 36.61 MiB at 2X and 78.33 MiB at 4X in these cases,
with no eviction loop. The 128 MiB cap remains enforced. HD PNG requests during
the timed entry fall from 312 to zero; validated native VXL resources still use
their existing loading path. World allocations stay within their density caps.

Controlled prerequisites followed by native production/placement orders verify
AMRADR 4X, NAWEAP 4X, AMRADR Snow 2X and YAPOWR 4X. Family preparation completes
in 133–380 ms while construction is still active; first observed building
render frames bind complete HD at the requested density. NAYARD 4X preparation
finishes in 469 ms at 5.2% native construction progress, then cancels through the
native queue action. No build rules, credits or completion speed are altered.
Sampled background long tasks reach 101–135 ms in two cases; zero microstutter
is not claimed. All four cases pass allocation checks and report no page errors.

Raw evidence belongs to `.artifacts/skirmish-loading`: `isolation.json`,
`preparation.json`, `tests-final-r3.log`, `typecheck-final.log`, `timing.json`,
the ten `native-*-r2` timing reports/CPU profiles, and four `production-*`
reports. Packaged resources are independent copies; accepted PNG bytes and
the Allied animation-r5/r9 selections remain pinned.

## Integration boundary

Canonical main advanced independently to `8062c92` during validation. Those
later Task C changes are excluded from this branch and package. Main resources,
builds, profiles and processes were not changed by this task. A later integration
should regenerate prepared payloads against the final selected catalog in an
isolated resource root. Changed member hashes naturally retain PNG fallback.
The branch remains local and unmerged. Continue loading-test feedback in this
execution conversation; a new milestone requires a separately selected scope.

## Desktop delivery

The verified ZIP is `/Users/Aone/Desktop/RA2-HD-Loading-Optimized-69d8e3c-macOS-arm64.zip`
(3,291,828,647 bytes; SHA-256 `ca84ba689b721e66d692043ebdd979fb35028a45b91f216eafff900be901cd62`).
It contains the signed app, 4,820 independent selected resource files, a
relocatable launcher and English startup instructions. Test profiles and saves
are excluded. Archive verification checks 5,285 file/link entries, CRCs, bytes
and executable modes. The Desktop copy matches the verified archive hash.

The actual Desktop ZIP was extracted into a new task-local directory. Its real
`Launch Loading Optimized.command` registers that extraction's sibling resources
and creates a new portable profile. Native matches from that extraction bind
the accepted GI, GAAIRC/AMRADR and ATESLA body/active members in YR 4X and RA2 2X.
The copied bundle's signing verification passes. Evidence is retained in
`desktop-delivery.json`, `delivery-r1/archive-receipt.json` and
`desktop-zip-runtime-r1/result.json` under this task's artifact directory.

Status: `TECHNICAL_VALIDATION_AND_DESKTOP_DELIVERY_COMPLETE / USER_LOADING_REVIEW_PENDING`.
No push, merge, main build, shared-resource overwrite or C-process action was
performed. Extract the ZIP, open the launcher, and enter skirmish twice in the
same application to review first-entry and repeated-entry loading.
