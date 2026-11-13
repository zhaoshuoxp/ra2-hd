# Yuri menu logo and v0.5 delivery

The complete Yuri menu badge is rebuilt from the user reference and replaces the Red Alert 2 badge in both HD and Original UI modes. The authored design keeps the silver swept wings, small gold Command & Conquer and red/gold YURI'S REVENGE lettering. The compositor uses a clean radar plate and suppresses the baked retail RA2 badge with a feathered source-space exclusion. Failed video retains the clean radar sweep and badge. The existing RA2 menu assets remain exact.

The public release is `0.5`; the Mac bundle and application package report `0.5.0`. The frozen runtime is `88ac426b84723bc4a0451c221e6a43b35704791b`, source digest `93fde77f621a537b4e1c0a74ce3265fa611e869c7f1daa5eafda53eb918aa28a`. Final receipts and documentation follow that commit without changing the signed app. The [movie acceptance](hd-movies-user-acceptance-20261112.json) records the user's explicit approval on 2026-11-12. All 136 accepted movies and all 16,444 selected game-resource files remain byte-identical to r4: 51 downloaded full-screen films, 83 retained HD radar films and two library-only exceptions. New-logo user visual acceptance remains pending.

## Deliverables

- Complete app: `/Users/Aone/RA2remaster/RA2-HD-Mac-v0.5-20261112/Red Alert 2 HD.app`.
- Desktop ZIP: `/Users/Aone/Desktop/RA2-HD-Mac-arm64-v0.5-20261112.zip` (13,366,380,602 bytes), SHA256 `6fdf923635ce22dd018de0fd0f23e3969a4753c6435747602638e1bae62f1412`.
- [Self-contained menu review](../.artifacts/yuri-menu-logo-20261112/Yuri-Menu-v0.5-Review.html), with native menu captures and both exports.
- [4X badge PNG](../public/res/presentation/menu-yuri-logo-r1-4x.png), [2X badge PNG](../public/res/presentation/menu-yuri-logo-r1-2x.png), [transparent authored master](../art/yuri-menu-logo-20261112/yuri-logo-master-r1.png) and [clean radar plate](../public/res/presentation/menu-yuri-radar-clean-r1.png).

Quit the old app before opening v0.5. The `RA2 HD Movies Review 20261111` profile is retained, preserving existing settings and saves. The complete app includes all 26 RA2 campaign/training maps and fourteen YR maps. Its signed bundle includes the movie acceptance record and embedded menu review. The prior app, Desktop ZIP and independent movie pack remain retained. Signing is ad hoc with deep/strict verification; notarization is unperformed.

## Authoring and verification

Built-in imagegen authored the 2172x724 RGBA badge and 1672x941 clean radar plate. Both 960x320 (2X) and 1920x640 (4X) exports derive independently from the same sufficiently resolved master. The [provenance](../art/yuri-menu-logo-20261112/provenance.json) pins the supplied reference, source masters, exports and composition. The final prompt set is [badge prompt](../art/yuri-menu-logo-20261112/logo-prompt.txt) and [clean-plate prompt](../art/yuri-menu-logo-20261112/radar-clean-plate-prompt.txt). The built-in tool path was used.

Typecheck and five focused tests with 38 assertions pass. One uninterrupted full host run passes 2,150 cases across 322 executions with no failures, skips, load errors or process errors. Current-source native checks cover both editions, three viewports, three retail radar positions, actual 2X/4X exports, HD/Original UI, forced video-error fallback, Options return and the v0.5 footer. Native captures were inspected for silhouette, text, edges, old-logo removal and RA2 preservation.

The Desktop ZIP passes every inventory entry's decompressed bytes, mode and symlink target, real extraction and strict signing. Its extracted app passes four fresh native scenarios: menu/logo/version/lifecycle, RA2 actual movies/radar/save/restart, YR actual movies/radar/save/restart and both-edition movie-library scrolling/captions/release. The package version, acceptance record, 15/60 fps counts and all game-resource hashes also pass. Windows and physical 8/16 GiB targets remain untested.

Scoped cleanup removes only the verified current-task extraction fixture after all runtime checks pass. Source masters, reference/prompts, protected artwork/selectors, five unrelated YR scripts, accepted movies, prior deliveries, real profiles and compact evidence remain preserved. Fresh post-cleanup registration hashes all 136 selected movie routes. The [final JSON](yuri-menu-logo-final-20261112.json) pins the technical, preservation, actual-ZIP and cleanup evidence.

Continue same-outcome logo review and corrections in this execution conversation. New milestones require explicit scope. Work remains on canonical local main without remote push or publication.
