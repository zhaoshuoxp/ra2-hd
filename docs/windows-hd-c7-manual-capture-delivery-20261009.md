# C7 Manual Capture M1 handoff

The user reports fewer hitches in C7 but low sustained smoothness during later manual play. Normal automatic measurements average 59.11/61.67 loop FPS on a 165 Hz Windows display, with about 14 ms of update plus submission work per frame. No application-side 60 FPS cap was found. Capture the missing manual interval before choosing another source performance repair; see `windows-hd-c7-windows-results-20261009.md` and its exact metric receipt.

The user confirms disabling HD and starting a new match, with no visible improvement in smoothness. This follows the full-application boundary documented by `HdOptions` and raises the priority of shared engine work, simulation and Windows presentation. FPS and actual resource bindings remain unmeasured, so the observation does not establish equal Original/HD rates or a specific engine defect. No option/restart clarification remains pending. Capture the missing manual interval with the existing companion; no replacement kit is required. Actual binding and matched frame measurements must establish any quantitative Original comparison. Do not change material selection within a measured phase or treat different late-match states as a matched control.

## Delivered artifact

`RA2-HD-C7-Manual-Capture-M1-9041bb7.zip` is 7,056 bytes with five members. Source checkpoint is `9041bb736d46e597ca21c1c739b73cd89ce59e72`; ZIP SHA-256 is `92c7534c69c29e5b9a64edd92d034f894613aaec42c01c3f8755b86e6588edf3`, and companion manifest SHA-256 is `7707e8318f549ab85db9496abde703019aeb2f7cff92df0157c0b3a0cad85c04`.

Identical, fully checked copies are at `/Users/Aone/Desktop/RA2-HD-C7-Manual-Capture-M1-9041bb7.zip` and `/Users/Aone/RA2remaster/deliveries/RA2-HD-C7-Manual-Capture-M1-9041bb7.zip`. Every CRC and member passes; a fresh Desktop extraction matches all five trusted member bytes. The original complete C7 kit `RA2-HD-WINHD-20261008-D38F136-C7-3ab266e-Windows-x64` is reused. No 3.5 GB replacement is needed.

The companion pins the original C7 manifest, original probe and its own files. Before any timing, it verifies the kit and creates an independent copy of 73 exact official Windows runtime files, 385,513,417 bytes. Its packaged entry imports the original application and art in place. It substitutes only the exact diagnostic installation string once, then restores the main-process API. The manual F8 and late F9 branches omit forced camera movement and end-of-sample camera reset; the four automatic branches retain their original behavior. Manual camera mode and start/end positions are recorded. The game source, rendering, shader checks, sync, frame limits, resolution, rules, assets and allocation limits are unchanged. `USER-NOTES.txt` exports exact companion provenance.

## Verification

The actual companion entry passes copied packaged Mac execution with all 8,122 C7 catalog files verified, eight players/seven AI, real HD binding and advancing native ticks. Four automatic phases retain their exact recorded bytes after F8 and F9. F8 is uninstrumented; F9 is a separate instrumented phase. Native camera movement survives multiple frames and each phase's end without a route override or reset. All six phases are valid, with no errors. The CPU profile and multi-process trace capture; GL/material hooks restore and the debugger detaches. The original C7 exporter retains all six phases, provenance and trace; CRC/hash/safe-extraction validation and analysis pass. The 3-second F8 smoke uses the same duration argument as the Windows 15-second sample; F9 runs eight seconds in both.

The Windows runtime staging function also passes exact pre/post-copy hashes on the Mac host. These checks establish tool behavior and Windows package-byte integrity, not native Windows execution, Windows FPS, Windows visual acceptance or physical-input acceptance. Raw evidence, archive receipts and bounded test details are pinned in `windows-hd-c7-manual-capture-delivery-20261009.json`. Earlier C7 QA is reused for unchanged game rendering.

## Windows capture

Extract the new `C7-Manual-Capture-M1` folder inside the existing complete C7 folder, beside `Red Alert 2 HD.exe`. Open `Capture-Manual-Play.cmd`. After the automatic test completes, continue the same match until the low-rate feeling appears. Press F8 once and continue normal play/scrolling for 15 seconds. After its completion title returns, press F9 once while the same condition persists and continue for eight seconds. Wait for the completion title, close, run the original C7 `Export-Reports.cmd`, and return its new RETURN ZIP. The exported F8 interval determines Normal sustained FPS; instrumented F9 identifies work and waits. Trace startup/collection overhead is excluded from Normal FPS.

Keep the low-rate match and actual graphics mode stable during capture. The original C7 launcher still uses an automatic route for F8/F9; this companion launcher preserves manual input. Existing reports, profiles, original source, resources, runtime and ZIPs remain available. There is no source performance candidate C8 in this handoff.

Main remains clean at `d38f136`; the independently advancing M2.3 checkout and dirty work are preserved. No main merge, push or release occurred. Windows sustained manual-play acceptance remains open. Continue this execution conversation for the returned capture, focused repair and acceptance.
