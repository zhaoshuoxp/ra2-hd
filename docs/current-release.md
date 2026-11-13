# Current main release

The user designated current main as the sole maintained version and paused performance work on 2026-11-13. This maintenance packages current production behavior without artwork, gameplay or resource-format changes. Public version remains 0.5.

## Scope and qualifications

Both editions retain their accepted offline skirmish, campaigns, HD assets/UI, saves, trainer and movie flows. The 40 campaign/training maps and 136 HD movie identities retain existing acceptance. Source-cue/caption timing, pristine-executable AI/RNG/particle/trajectory equivalence and every-difficulty victory are not newly certified by packaging. Intentional Original SQD artwork and the distinct legacy RA2 YURIPR qualification remain; YR Yuri Prime uses its accepted HD family. Existing empty/invisible source objects are not missing visible artwork.

Performance changes through M4.3 are retained. The M4.3a shadow instance experiment remains OFF. Sustained Mac off/on averages were 53.446/53.642 callback FPS, with overlapping ranges; no reliable gain was established. All ten formal windows failed stable 60 FPS. Latest static and 70 dynamic image controls passed, while an earlier two-scanline sidebar difference remains unresolved. The new package does not represent a new performance or visual acceptance.

Windows performance work is paused. A new Windows x64 package receives static assembly/integrity checks on Mac; native Windows execution is unverified. The historical Windows full suite had resource/setup failures, and no passing native Windows suite is claimed.

## Retention and distribution

Keep canonical main, selected resources, original installations/downloads, unique authoring sources, real profiles and compact current evidence. Retire obsolete process reports and redundant old builds after validating the replacement. Git history remains available. Source-dependent documents and useful regression fixtures are retained.

Desktop delivery includes a complete single-app Mac ZIP, a Windows portable full ZIP, small platform program ZIPs and shared resource parts. Full packages already contain resources. Program packages require all shared resource parts extracted to one `GameResources` directory. Existing game profiles are external to the application and are not copied into packages.

GitHub `zhaoshuoxp/ra2-hd` receives source only through its existing snapshot history. Its public visibility is unchanged. No game-data upload, Release or Drive upload is included. Verification and retention details are recorded below and in `current-release.json`.

## Verification and maintenance

The final host scan passed 2,173 cases across 329 file/edition executions, with zero failed cases, loading errors, process errors or skipped cases. Type checking and the production build passed. The first cleanup scan exposed missing campaign recipe/proof dependencies; 124 required JSON inputs (690,116 bytes) were restored, and the complete scan was rerun. No assertions were disabled to obtain a pass.

The frozen runtime originates at `31eb06115c683f30755b64e374e8e7ce423b255e`; package metadata records packaging commit `1c907dc68026150bf26df062e2f058e0c561b4da`. Later maintenance commits update tooling, fixtures and documentation only. All 1,694 runtime source-file hashes remain identical. The embedded README reflects the packaging snapshot; the current repository README describes the completed campaigns and HD movies.

Native Mac checks passed actual RA2 2X and YR 4X matches, relocation, profile persistence and program-only startup with shared resources. Both full ZIPs were actually extracted and checked against their file inventories; the extracted Mac app passed strict signature verification. Every archive payload passed hash and CRC checks. Local signing is ad hoc, without Developer ID notarization.

The selected 16,444 resource files, 245 real profile files and five unrelated working files were verified unchanged. The five files remain outside this maintenance commit. Obsolete process documents were retired while current source/test dependencies remained. Unique authoring inputs were deduplicated into `.local/source-art/retained-masters`; its index preserves their origins. Compact checks, failed attempts and distribution receipts remain under `.artifacts/main-final-20261113`; obsolete review applications and reconstructable staging are removed after replacement validation.

The authoritative local development checkout is canonical `main`. The only final application delivery is `/Users/Aone/Desktop/RA2-HD-v0.5-20261113`. Use the full package directly, or combine one program package with all twelve matching resource parts. The two approaches contain the same selected game resources.

The Desktop delivery retains ZIP files only. The loose app acquired Desktop file-provider/Finder metadata again after relocation, causing strict signing verification to fail; that reconstructable duplicate was removed. The complete Mac ZIP passed actual extraction, hashes and strict signing. Install its single app into Applications. Two Bun automation launches timed out with sandbox-resource warnings; after clearing extended attributes, Node successfully launched the same delivered copy from the project directory. These attempts changed both runner and metadata, so their individual contribution is not established. No runtime flags or game code were changed.

The old history/artifact quarantine (65,894,404,036 logical bytes) and both obsolete application directories (36,203,462,275 logical bytes) were removed. Logical totals are not a measurement of physical APFS space reclaimed. Only current main remains as a branch/worktree. Replacement archives and compact evidence remain; no full historical resource archive was created.
