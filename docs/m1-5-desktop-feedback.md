# M1.5 desktop feedback revision

The user confirmed the original five corrections and requested [R3 fullscreen/loading/speed follow-ups](m1-5-r3-fullscreen-loading-speed.md). This R2 report remains historical evidence.

Status: `NATIVE_DESKTOP_CHECKS_PASS / VISUAL_ACCEPTANCE_PENDING`. The user reported the delivered Mac app runs successfully, with five display/UI/speed defects. They also reported less visible aliasing on their 2560×1600 Windows laptop than on their MacBook Pro; changing the old Mac rendering preset did not remove the jagged outline. This observation does not isolate panel density from platform, output scaling or sampling differences.

## Changes

- One Resolution control selects actual physical-pixel window sizes or full-screen native output. Rendering follows the window backing size automatically. macOS uses borderless full screen without a Spaces transition; Alt+F works through the same trusted native interface. Display choice is stored separately in the existing M1.5 profile; HD preferences and resource registration remain intact.
- Offline startup now loads the original checked/unchecked PCX images from the verified retail VFS. Previously the HTML inputs retained their values while their CSS image variables were unset.
- The highest single-player speed requests 120 simulation ticks/second, twice the previous 60. Lower settings, multiplayer and replay mappings remain unchanged. Paused Options use the same single-player mapping. No unit, weapon or economic rules change.
- Pregame menus use the whole viewport. Text, controls and previews scale uniformly; existing decorative panels extend horizontally to the available aspect ratio. The UI sprite batch now applies UI scale, matching HTML controls. World billboard geometry and the 900-high battlefield presentation stay unchanged.
- Original Conscript palette colors resolve before coverage filtering, including team colors. The HD Conscript silhouette uses a native-pixel-width coverage reconstruction; opaque interior detail retains its previous sampling. Both use the existing sorted coverage passes and frame bounds. No artwork, atlas, masks or imports change. This smooths sampling edges; it does not create missing source detail or establish visual acceptance.

## Scope and preservation

The prior delivered application, all three Desktop ZIPs and all 61 registered external resource files were compared with their previous SHA-256 receipts and remain unchanged (`.artifacts/m1-5/feedback/preservation.json`). Tests use isolated profiles. No existing profile was reset or migrated; no publication, new artwork or campaign work occurred.

## Validation and delivery

Final application: `.artifacts/m1-5/build-2026-09-20T00-53-27-731Z/Red Alert 2 HD M1.5.app`. Runtime implementation: `90e9671`; the adjacent `implementation-binding.json` binds recorded runtime inputs and full-bundle bytes to that commit. Electron remains 44.4.0, macOS arm64. Build with `bun run desktop:unified`; normal `dist` remains untouched.

| Check | Result / evidence |
| --- | --- |
| Entry typecheck | PASS (`.artifacts/m1-5/feedback/typecheck.log`) |
| Automated regressions | PASS: 100 tests, 19,219 assertions across 28 files (`feedback/tests.log`) |
| Actual window / output sizes | PASS: 1920×1080, 2560×1440, native 3840×2160 fullscreen; no output cap |
| Original checkboxes | PASS: actual original retail checked/unchecked images differ and follow input state |
| Menu size | PASS: viewport-filling panels, uniformly scaled controls; screenshots in both native runs |
| Game speed | PASS: Original 59.95 → 120.28 tick/s; HD 59.96 → 119.91 tick/s over five-second measurements |
| Conscript rendering | PASS: frozen-frame before/after captures at 1080p and 4K, Original and HD, no script/WebGL errors; visual satisfaction pending |
| Saved display / shortcut | PASS: 2560×1440 restored in a second process; invalid mode rejected; Alt+F fullscreen round trip |
| Three-match teardown | PASS: after each exit, 11 geometries / 26 textures / 2 programs; Rhino references disposed, game cleared, no script/WebGL errors (`.artifacts/m1-5/ui-1789865952451/result.json`) |
| Artifact binding | PASS: 1,336 runtime/build inputs match `90e9671`; 434 bundle entries, 164 payload files and 153 allowlisted web files verified |
| Preservation | PASS: 433 old bundle entries, 61 registered resource files and three old Desktop ZIPs match previous receipts |

Final-app graphics evidence: `.artifacts/m1-5/feedback-original-1789865758556/` and `.artifacts/m1-5/feedback-hd-1789865818479/`. Each contains `result.json`, menu/options screenshots, full frozen-frame comparisons and `conscript-4k-before.png` / `conscript-4k-after.png` crops. These comparisons change shader sampling only while the simulation is stopped; they do not repaint images. Display persistence: `.artifacts/m1-5/display-persistence-1789865874741/result.json`.

Native-size 4K crop comparisons: [Original before](../.artifacts/m1-5/feedback-original-1789865758556/conscript-4k-before.png), [Original after](../.artifacts/m1-5/feedback-original-1789865758556/conscript-4k-after.png), [HD before](../.artifacts/m1-5/feedback-hd-1789865818479/conscript-4k-before.png), [HD after](../.artifacts/m1-5/feedback-hd-1789865818479/conscript-4k-after.png).

The test desktop exposed native 3840×2160 output at DPR 2. This does not establish an equal-panel comparison with the user's MacBook Pro or Windows laptop. The prior Windows package has user-reported testing; this revised Windows package remains `NOT_RUN` by the agent.

Desktop delivery:

- `/Users/Aone/Desktop/RA2-HD-M1.5-R2-macOS-arm64.zip` — 130,276,743 bytes; SHA-256 `8aca16c1e8501e2f349d7e7121ed696d814f335a0bcc2a9b07e23face0d0c6fa`.
- `/Users/Aone/Desktop/RA2-HD-M1.5-R2-Windows-x64-portable.zip` — 159,398,325 bytes; SHA-256 `abfdd30cda1ed1a5e97e98de780a64d4767e3721e9c30d8144cd6e83e66a7df1`.

Mac ZIP integrity, symlinks and executable permissions passed. Windows ZIP contents, pinned Electron checksum and x64 PE headers passed; Windows runtime remains unverified for R2. Receipts: `.artifacts/m1-5/feedback-transfer-r2/transfer.json` and `desktop-copy.json`. Unzip into a new folder, launch the included app/EXE, and reuse the previously delivered external resource directory. Do not replace an existing portable `UserData` folder. No new resource download/import is needed. iCloud sync completion is `NOT_VERIFIED`.

 Historical failed checks are retained separately: the first harness assumed a menu debug renderer, another assumed an English Back label, and native macOS Spaces fullscreen did not complete in the automation environment. The final implementation uses the validated borderless fullscreen mode instead.

Final hands-on acceptance is required for menu sizing, perceived fastest speed and Original/HD Conscript outlines on the user's MacBook Pro. Windows packaging is an updated portable test delivery; a Mac-host test does not certify the Windows runtime. Keep corrections and acceptance in this task.
