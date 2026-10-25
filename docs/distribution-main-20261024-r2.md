# Updated-main desktop delivery and showcase - 2026-10-24

The delivered runtime is clean main `9ab3c54441bf21b6872da0c7f63937a4e577fb31`, including the YR loading-country-flag repair. Relative to the preceding save-enabled baseline `344f04be`, runtime changes are confined to the four loading-screen files recorded in `docs/loading-flags-main-20261024.md`. This delivery does not modify gameplay, canonical art, resource selections, actual user profiles or the independent M3.1 campaign worktree.

## Desktop outputs

`/Users/Aone/Desktop/RA2-HD-v0.2-20261024-R2` contains the self-contained Apple Silicon `Red Alert 2 HD.app`, complete Mac and Windows ZIPs, two program-only ZIPs and seven common private resource ZIP parts. `INSTALL.txt`, `SHA256SUMS.txt` and `DELIVERY.json` describe installation and exact payload identities. Complete packages include their resources; the seven resource parts are needed only with a program-only package. No user saves or test profiles are distributed.

`/Users/Aone/Desktop/RA2-HD-Showcase-4Panel-20261024` contains the 4320 by 4320 PNG, high-quality JPEG and a small preview. The upper-left panel directly extracts and composites canonical 4x RGBA atlas frames and explicit owner masks: Allied blue, Soviet red, Yuri purple. It includes three construction yards, Allied and Yuri power plants plus the Soviet nuclear reactor, Prism Tank, Apocalypse Tank, Floating Disc, deployed Guardian GI, Conscript and Yuri Prime. It is not a gameplay screenshot. Published 4x sprite detail is finite; presentation enlargement does not recover absent higher-resolution mother-art detail.

The other panels use newly captured 3840 by 2160 current-main gameplay and UI, native-pixel detail crops and canonical cameo PNGs. The isolated fixture staged units legally and disabled AI planning; combat continued through native simulation and weapons. These are real engine captures of a staged scene, not evidence of a new natural-match acceptance. No AI repaint appears in the delivered composition. Final panels, source identities and composition scripts are in `../showcase-20261024`.

## Verification and boundaries

- Seven focused distribution/save tests with 40 assertions, entry typechecking and the isolated production build pass. Unchanged prior save-restoration and loading-flag acceptance evidence is reused.
- Complete Mac RA2 2x and YR 4x matches, application relocation, settings persistence and program-only shared-resource startup pass without page errors.
- The actual Desktop application starts successfully from an isolated profile and locates only its internal resources.
- All eleven ZIPs pass full payload SHA-256, CRC and applicable symlink/mode checks. All Desktop copies and every application payload member match their verified sources. The resource closure contains 13,978 files.
- The clean Mac application passes deep strict ad-hoc signature verification. Desktop synchronization reattaches `com.apple.FinderInfo` to the app root, making the strict Desktop metadata check fail. A recursive audit found that sole offending attribute; complete payload hashes and non-strict deep signature verification pass. Removing the attribute did not persist. Preserve this diagnostic separately from the successful clean-package and native-startup results; the ZIP bytes are unaffected. No Developer ID notarization is claimed.
- Windows Electron matches its official checksum; x64 structure, paths and icons pass static checks. Native Windows remains `NOT_RUN_ON_THIS_MAC`.
- A fresh comparison against the prior protected baseline verifies 26,095 unchanged canonical-resource, original-installation and real-profile files, with no missing files.

## Backup and cleanup

The private `zhaoshuoxp/ra2-hd` backup continues its separate source-snapshot ancestry. Its committed tree is checked against canonical main; local history and upstream origin are preserved. No public Release or Drive upload is performed.

Task-only assemblies, downloads, isolated profiles and the temporary private checkout are retired after verified Desktop delivery and backup. Preserve final Desktop outputs, canonical resources, installed development dependencies, actual saves, Git history and the independent M3.1 worktree. Do not recreate full obsolete resource archives. Compact receipts, failed metadata-check logs, source inventories and native evidence remain under `../project-history/distribution-20261024-r2`; `github-backup.json` and `final-cleanup.json` record final identities and measurements. Logical retired bytes are not asserted to equal APFS physical space recovered.

Continue package or showcase feedback here. Continue campaign work in its existing M3.1 execution conversation.
