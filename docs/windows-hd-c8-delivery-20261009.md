# C8 Windows HD delivery and continuation — 2026-10-09

The restored C7 M1 Windows report validates the user's later manual-play slowdown: 21.35 mean game-loop FPS, with scene-update and drawing-submission medians of 17.525 and 19.345 ms. The separate late trace identifies sustained renderer-thread CPU work, including world-matrix traversal, without new shader compilation or linking. C8 removes one confirmed source of unnecessary matrix work. Copied Mac mechanism, native rendering, pixel preservation and diagnostic checks pass. The complete Windows x64 candidate is verified and on Desktop; its Windows performance and user acceptance remain pending.

## Delivery identity

- Desktop: `/Users/Aone/Desktop/RA2-HD-WINHD-20261008-D38F136-C8-5721aa5-Windows-x64.zip`.
- Preserved original: `/Users/Aone/RA2remaster/deliveries/RA2-HD-WINHD-20261008-D38F136-C8-5721aa5-Windows-x64.zip`.
- ZIP: 3,500,042,357 bytes; 8,134 members; SHA-256 `f95e02000de6f7406e26bcaa006e5c67dc185c3a87347fcd9d4d61193f55ae29`.
- Manifest: `f480c99fd8e4a52a81b4f40d10f1a6a372d956fb58f96ee7e7aa62a46cc1bad0`; 8,133 catalog entries.
- Shipped source checkpoint: `5721aa57d3785a8fbc9c8aad5adf9a4172bbe3af`; focused repair: `0bd0dc6ad829b4cf9e7d535218a555d17bca1e45`. All 288 build/map files, 205 executable application files and 6,033 resource files match the native-tested candidate exactly. Later changes at the shipping checkpoint contain QA/reference records, not a new rendering revision.
- Frozen R10 world/UI inventory SHA-256: `071134520e28ebf9bff42137117d8aac62b24b22c0e1fef269920a35d3672dbc`. World 2X/4X limits remain 512/1,280 MiB; prepared CPU/UI limits remain 128/16 MiB. No M2.3 assets enter this kit.

## Cause, repair and limits

The incoming return `WINHD-20261008-D38F136-C7-RETURN-2026-10-10T05-06-27-875Z.zip` is preserved with SHA-256 `01c855138057b95811b0ce0f590845f19d4714c534455866bf97195bc6e2bd67`. Both runs, every member, the frozen C7 manifest and M1 provenance pass validation. The earlier Normal run is byte-identical to the previously accepted return. Two extra F9 requests are rejected after the process's first trace; they do not invalidate the preceding Normal manual sample or the captured trace. Historical missing-file and failed-analysis receipts remain preserved. See `windows-hd-c7-manual-windows-results-20261009.md/json` for the measured sample and attribution.

The Normal manual interval has 320 measured intervals over 15.015 seconds, tick 9,453 to 10,356, 1,420 median draw calls and 10,065 scene nodes. These data support the reported sustained slowdown. They do not establish an explicit 60 FPS cap or a measured Original-versus-HD comparison. Drawing submission includes CPU/native-call work and possible waiting; it is not measured GPU execution. The profiler startup is excluded from game-stall attribution.

The only application increment above C7 is `src/engine/gfx/OctreeContainer.ts`. Its static identity wrapper no longer recomposes its unchanged local matrix every frame. That recomposition previously dirtied the wrapper and forced descendant world-matrix multiplication. Descendant automatic updates and dirty flags, translated scene roots, animation, shadows, picking and batch ownership remain active. This work is independent of texture density and can also benefit Original rendering and Mac; Windows gains cannot be inferred from Mac timing.

A copied immutable C7 Mac runtime at native tick 9,571 confirms the mechanism. Changing only the wrapper flag reduces matrix products from 11,822 to 4,747 at the manual camera, with exact world-matrix parity. Frozen A/B/B/A scene-update medians are 10.420/10.905 ms before and 8.625/8.675 ms after. Two other cameras also reduce matrix work. These are frozen Mac controls, not Windows gameplay FPS or a high-refresh promise. Other drawing, uniform, simulation and matrix costs remain.

## Completed validation

All 15 focused/shared tests (149 assertions) and entry type checking pass. Native copied packaged C8 passes stress 4X, Small 2X and Small Original, each with four valid native phases. Nine same-state full-output pixel controls have zero differing bytes and exact world matrices. Original has no HD bindings. Built-in F8/late F9 preserve live camera input, retain earlier automatic rows and restore the debugger after tracing. The initial QA export-deadline failure is retained; the successful rerun only increases the harness wait and changes no game source. See `windows-hd-c8-native-validation-20261009.json`.

The final ZIP passes all member CRCs and full fresh-extraction/catalog verification. The actual fresh final payload completes four valid uninstrumented Mac stress 4X phases with native tick advances 198/201/199/203 and zero errors. Its locally exported return also passes frozen identity, hashes, safe extraction and phase validation. This fixture's actual platform is `darwin-arm64`; a legacy analyzer's Windows-labelled status does not establish Windows execution. Desktop matches the sealed original by full SHA-256, size and all member CRCs. No profiles or diagnostic runs are shipped; test runs exist only in owned testing/extraction directories. The pristine assembly and delivery original were never launched.

Main remains clean at `d38f1366942f586a1a9df2964a40f05cc9db4cdc`. The full 13-path D38-to-C8 source patch passes `git apply --check` without application. The M2.3 peer independently advances and was last read at clean `2bf54b1252b3a6fb1741e82c5e45f51667f9b882`; it is untouched. No main merge, remote push or publication occurred. Bounded identities and receipts are recorded in `windows-hd-c8-delivery-20261009.json`.

## Next Windows run and acceptance

1. Extract the whole C8 ZIP into a new local folder and run Verify-Kit.cmd. Keep the same machine, display and power settings.
2. Run Launch-Diagnostics.cmd with eight players, 4X and Normal. Keep the game focused and let all four automatic phases finish.
3. Continue the same match manually for about two minutes. When the reported slow feeling occurs, press F8 once and keep scrolling/playing for its 15-second sample. Wait for capture completion, close the game, run Export-Reports.cmd and return the new ZIP with smoothness/loading/visual feedback. No M1 companion is needed; leave F9 out of this first comparison.

Retain the existing C7 automatic and pre-profile manual baseline. Independently advancing manual scenes require tick, camera, actor, binding and hardware/output comparison; they are not strict same-state A/B samples. Deliverability requires valid Windows capture, acceptable sustained scrolling/combat/manual-play and loading feedback, no new visual defects, and preserved source/resource checks. C8 is a delivered diagnostic candidate; Windows performance, physical input and final user acceptance remain open. Continue this execution conversation for the same repair and acceptance. Begin a new conversation only after acceptance with a materially changed objective.
