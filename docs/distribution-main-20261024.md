# Current-main desktop distribution - 2026-10-24

The requested baseline is `344f04be`, including the integrated skirmish fixes and persistent saves. The delivered runtime is `976548ca`; its `src`, `public` and `desktop` trees are unchanged from that baseline. Only distribution tooling and installation instructions changed before the build.

## Delivery

The Desktop destination is `/Users/Aone/Desktop/RA2-HD-v0.2-20261024`. It contains a complete self-contained Apple Silicon `Red Alert 2 HD.app`, full Mac and Windows ZIPs, two program-only ZIPs, common private resource ZIP parts, installation instructions and SHA-256 manifests. All parts extract into the same `GameResources` directory and work with either platform program. The complete packages already contain those resources.

The selected resource closure contains 13,978 files. User profiles and saves are excluded from the packages. Normal saves/settings stay in the existing per-user `Red Alert 2 HD` application-data directory, outside the app; each native test used a disposable profile.

## Verification

- Seven focused distribution/save tests, 40 assertions, entry typechecking and the production build passed.
- Native complete Mac RA2 2X and YR 4X matches, relocation, persistent settings and the program-only shared-resource launch passed with no page errors.
- Native YR 4X save/load with trainer state passed: save at tick 883, restart, exact restored simulation state, matching 600-tick continuation and successful resave. The script used legal game commands and stepped native simulation; this is not a new manual long-session acceptance.
- All archive members are checked against SHA-256 inventories, ZIP CRCs and required symlink/mode metadata. Desktop copies are checked again. The final Desktop app also passed a fresh isolated-profile native startup using its internal resources.
- The Windows Electron 44.4.0 archive matches the official checksum. x64 PE structure, icon relocation and package paths passed static checks. Native Windows is `NOT_RUN_ON_THIS_MAC`; no new FPS claim is made.
- Mac signatures are local ad-hoc signatures, without Developer ID notarization.

## Packaging correction

The former packager pinned an obsolete runtime. It now requires a clean current-build receipt and verifies every input before assembly. An initial full-inventory comparison failed because component-wise Path ordering differs from string ordering. The complete file sets matched; comparison now keys both complete hashed inventories by path. The failed log and input receipt are retained, and the final runtime was rebuilt from the corrected committed tooling.

## Cleanup and source backup

The earlier large cleanup was already complete. This pass retired five reproducible cache directories containing 13,548,090 logical bytes; the immediate free-space measurement did not change. Canonical resources, original installation and real user-profile hashes passed for 26,095 files. The independent M3.1 campaign worktree and its deliveries remain outside this task.

After delivery verification, task-only assemblies, test profiles, downloads and the temporary GitHub checkout are retired. Compact receipts, screenshots, hashes and logs remain under `/Users/Aone/RA2remaster/project-history/distribution-20261024`; cleanup measurements and private GitHub backup identity are recorded there. No full historical resource archive is added.

The private backup uses `zhaoshuoxp/ra2-hd` with its existing separate snapshot ancestry. Its committed source tree is checked against canonical main; upstream origin and local history stay unchanged. No public Release or Drive upload is part of this task. See the retained `github-backup.json` and `final-cleanup.json` for final identities and measurements.

Continue delivery corrections in this conversation. Continue M3.1 development in its existing independent campaign conversation and worktree.
