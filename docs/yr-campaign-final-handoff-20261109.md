# M3.3 accepted Yuri campaign handoff

The user accepted the complete r6 result on 2026-11-09 and requested canonical-main closeout, cleanup and a handoff to the main conversation `RA2HDguieline`. All seven Soviet and seven Allied YR missions are implemented and user accepted. The combined app also retains the 26 accepted original RA2 missions. [Explicit acceptance](yr-campaign-final-acceptance-20261109.json) and the [current task table](yr-campaign-current.json) supersede earlier pending labels within this scope.

## Runtime and source

The frozen accepted runtime is `3cc718033e04a46344b463405d485b78988d8181`. Commit `9d5a1b5e` implements the final pause/castle/Lunar/source-red feedback; `3cc71803` preserves the approved tank shape and corrected projected bearing; `18566fda` records the verified r6 delivery. Later closeout documentation does not rebuild or replace the signed app. All work remains on local `main`; source history and the five unrelated pre-existing working-tree files are preserved. Publication remains local only.

Fresh YR launches use interpreter48. Existing saves retain their recorded policy; the rendering and pause-display corrections do not change simulation state or journals. The tank fix preserves accepted textures and exact level vertices, removes screen compression/shear, and applies the closest native projected rotation to complete hull/turret components. The user explicitly approved the demonstrated thickness and revised direction before complete acceptance.

The pause screen shows only source objectives. Soviet07 retains its original 87 collapse slots, native trim/pivots, separate shadows and timing while using coherent HD masonry. Independent 2X/4X state/clock checks and actual r5 ZIP Kirov destruction/original victory are retained; r6 preserves every one of those resource bytes. Lunar uses the exact prior r1/r2 material selection. Original `cgtime01.shp` palette entries 106/107 establish that the time machine has fixed red details outside ownership indices 16–31. Accepted statue/bridge, old Snow/construction and unit paint remain in use.

## Retained delivery

- Signed application: `/Users/Aone/RA2remaster/RA2-HD-YR-Campaigns-Mac-20261109-r6-final/Red Alert 2 HD.app`.
- Offline 59-image review: `Campaign-Review.html` in the package and inside the app. SHA256: `25c78ebf2efe44d0872fbce9613e61ced0152a5e67f53e996ffe7d53f9395e0b`.
- [Verified r6 delivery record](yr-campaign-feedback-delivery-20261109-r6.json) pins inventory `a3d7c4377abbb2cb3e0d0f9c5d46e03fc596b2c9bb28d0c152476c2da591ff1c` and source digest `9cdb549d9133005e9d531731221058bceedcfb1f99037f62848731df4b166503`.
- The delivered ZIP had 16,871 entries, 7,886,858,982 bytes and SHA256 `5579cd1acb3a7bfe19c268041d81d7f15d02e45acc581bf2b75df750a743d291`. The Desktop ZIP and review were already absent at cleanup start. They were not deleted or recreated by cleanup; the final signed app, embedded review and exact receipts remain.
- Canonical resources remain under `.local`. The previously recorded `~/Library/Application Support/RA2 HD Campaign Review 20261102` path was absent at cleanup start. The five existing real Library profiles, saves and settings remain exact and were not reset or migrated; QA uses isolated profiles.

## Verification and qualification

The accepted r6 source passes all 2,201 host cases across 320 executions, with no failures, loading/process errors, skips or omissions. Typecheck passes. Native source checks cover original Moon movement at 2X/4X, all eight MTNK/LTNK bearings and both signs of pitch/roll for every displayed hull/turret component, the source objectives-only pause, and the full castle state family. The actual r6 ZIP passes complete extracted bytes/modes/symlinks/signature and native 2X/4X Moon plus pause checks. The offline review passes all embedded images, controls and both viewport sizes. All 16,306 selected game-resource entries and the selected resource plan match r5 exactly: 16,866 routes, 211 selections, twelve theater layers and zero metadata overrides.

The table retains the independent source45 goal/restart qualification. Each row also has source media, a meaningful named save/process restart, applicable failure checks and three-difficulty initialization. Later policy repairs have targeted/native supported-play controls. User acceptance does not add full victories at unlisted difficulties or establish pristine retail executable RNG/AI, scheduling, trajectories, dormant branches or every natural gameplay pose. Installed source includes CnCNet patches. The earlier exact Allied04 overflight and Allied06 bridge-stall user routes were not independently reproduced; user acceptance closes their retest status while that evidence boundary remains historical. Native Windows and physical 8/16 GiB targets remain unrun on this Mac.

| Mission | Theater | Verified winning difficulties | Named restart | Applicable failure | User acceptance |
| --- | --- | --- | --- | --- | --- |
| sov01umd.map | NEWURBAN | easy-normal-hard | Pass | Pass | Accepted |
| sov02smd.map | SNOW | normal | Pass | Pass | Accepted |
| sov03umd.map | NEWURBAN | easy | Pass | Pass | Accepted |
| sov04dmd.map | DESERT | easy | Pass | Pass | Accepted |
| sov05umd.map | NEWURBAN | easy | Pass | Pass | Accepted |
| sov06lmd.map | LUNAR | easy | Pass | Pass | Accepted |
| sov07tmd.map | TEMPERATE | easy | Pass | Pass | Accepted |
| all01umd.map | NEWURBAN | easy | Pass | Pass | Accepted |
| all02umd.map | NEWURBAN | easy | Pass | Pass | Accepted |
| all03umd.map | NEWURBAN | easy-normal-hard | Pass | Pass | Accepted |
| all04dmd.map | DESERT | easy | Pass | Pass | Accepted |
| all05umd.map | URBAN | easy | Pass | Pass | Accepted |
| all06umd.map | NEWURBAN | easy | Pass | Pass | Accepted |
| all07smd.map | SNOW | easy | Pass | Pass | Accepted |

## Cleanup and maintenance

The cleanup receipt is `../project-history/yr-campaign-accepted-20261109/Cleanup/execution.json`. It records 192 retired directories and two superseded ZIPs, 253,569,255,255 logical bytes and a measured free-space increase of 192,107,601,920 bytes. Logical removal differs from physical recovery because of hard links and shared storage. All 180,909 protected files retain exact content, modes and recorded links. The original installation, canonical `.local`, accepted V56/r6 apps, prior history, live runtime source and real user profiles are preserved.

The new history root retains 172 cache-free profile archives from the retirement pass and one additional post-cleanup QA profile archive, 44 historical resource-override records, old delivery metadata and all remaining raw authoring/evidence. Its 2,301 artifact aliases preserve existing live test/input paths. New diagnostics should use fresh output names; historical alias targets are retained evidence. Earlier package/application paths are retired provenance. Source recipes and immutable selected resources remain authoritative; old manifests and overrides support research without restoring complete historical applications.

Fresh post-cleanup verification passes all 2,201 host cases across 320 executions, entry typecheck, exact selected registration, both accepted app deep strict signatures and an isolated ordinary Moon movement run in the retained r6 app. All 2,301 compatibility aliases resolve, all 1,688 runtime source files match the accepted source, the five unrelated working files match their pins, and all 245 file/link records in the five real profiles remain exact. The completed new QA profile is archived without caches and removed. Post-cleanup verification is recorded in `../project-history/yr-campaign-accepted-20261109/Cleanup/post-cleanup.json`. Final documentation commit, source ancestry and the exact remaining worktree status are recorded in that history root's `final-main.json`.

Return this completed milestone to the main planning conversation. Continue same-outcome repairs in `M3.3 YR Campaign` if needed; a materially new milestone should receive a new explicit execution scope. No next feature, branch, worktree, agent, push, Release or upload starts automatically.
