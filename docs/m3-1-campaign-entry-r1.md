# M3.1 campaign entry repair R1

The retained delivered app reproduces the reported blank unavailable campaign page when Campaign is opened in Yuri's Revenge. Switching the same app to RA2 permits Soviet 01. The screenshot alone does not prove which edition or executable the user opened.

Runtime `83a4d9b2d27d154fee876432ce4e3d08d32183c7` fixes entry and recovery only. The dedicated R1 Mac app opens RA2 faction selection directly. Clicking the Soviet emblem on Normal plays the original introduction and enters Red Dawn. The Load button restores a manual save. Campaign under Yuri's Revenge now explains the edition difference and provides two working RA2 entry buttons. A consumed startup route preserves Back and abort behavior.

All 14,004 bundled resource files match the preceding delivery. The accepted interface, statue/flag, roads, original map, gameplay, bridge scripts and save format are unchanged. The accepted base remains `bc0e41defd68250d0ed40686b4b1c51b345b5800`. The original source ZIP and accepted offline review retain their hashes. Other apps and profiles are untouched.

Five focused cases / 47 assertions and entry typecheck pass. Both the staged app and the app extracted from the actual Desktop ZIP pass nine entry cases, including window sizes, 3840 x 2160 application fullscreen, both edition recovery buttons, Original/HD reentry, original video/audio, HD loading, and a fresh Normal mission which accepts real keyboard commands. The original opening creates both broken bridges; the assisted opening reaches input unlock at tick 1395. Page, console, resource and GL checks are clear. Default-profile direct startup passes; its manual slot was empty and stayed empty, so this check does not claim migration of an existing save. This is bounded entry verification; prior matched full-mission, save/reload and engineer-repair evidence remains the gameplay baseline.

Two observer failures remain under `.artifacts/m3-1/campaign-entry-r1/native-stage-r1` and `native-stage-r2`, each with its exact harness. They concern the fullscreen API and inspecting tick zero before the first turn. The packaged application is unchanged across those attempts and the passing final runs.

Desktop delivery: `/Users/Aone/Desktop/RA2-HD-M3.1-Mac-arm64-20261023-R1.zip` (5,705,323,481 bytes; 14,536 entries). SHA-256: `042fc46991b963e13a9e5fdae189b8ae1f3e18b1c990466da832a6727a027574`. The actual Desktop archive passes all file hashes, links, modes, relocated extraction and strict deep signing checks. Open **Red Alert 2 HD M3.1 Campaign R1.app**, then choose the Soviet emblem with Normal difficulty.

Technical Mac/package validation is complete. User manual testing of R1 is pending. Native Windows is NOT_RUN_ON_THIS_MAC. No main integration, cleanup, remote push or publication occurred. Continue same-outcome manual feedback in the existing execution conversation. Full pins and raw evidence are in [the receipt](m3-1-campaign-entry-r1.json).
