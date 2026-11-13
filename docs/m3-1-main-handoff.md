# M3.1 accepted main handoff

The user accepts M3.1 through R8 and authorizes integration into updated local main followed by scoped cleanup. Continue in `/Users/Aone/RA2remaster/ra2-hd` on `main`. Do not recreate the task branch/worktree or start the next mission automatically. Use `bun run desktop:prepare` followed by `bun run desktop:start`; select RA2, Campaign and Soviet. The obsolete standalone review launcher is removed. The exact verification and cleanup status is in `m3-1-main-integration-20261025.json`.

Integration and scoped cleanup are complete. Only main remains as an active worktree and local branch. Fresh post-cleanup native startup, 104 related tests, 14,070 selected-file registration and exact preservation of 48,695 protected records pass. Approximately 209 GB of additional filesystem free space is observed; unique art/evidence, canonical resources, original archives, source history and actual user profiles remain preserved.

## Delivered behavior

RA2 Soviet 01 uses the original mission source, trigger/team/task-force/script execution, opening reinforcements, initial broken bridge and engineer repair, objectives, win/fail flow, language-dependent cinematic subtitles, original audio and animated score presentation. Easy, Normal and Hard apply original human/opponent handicaps, mission trigger flags and source team delays; saves and completion retain difficulty. Original, 2X and 4X remain available. Other missions and unsupported edition entries fail closed rather than displaying a playable screenshot.

Accepted presentation includes faction hover sounds/animation, reconstructed arrows, responsive campaign/loading/score backgrounds, original-style loading housing, yellow metal fill, compact native-style right-hand mission text and functional trainer layering. World coverage includes the selected neutral buildings, wooden bridge, CRUISE, TUG and PDPLANE, reused accepted actors, memorial states and the Soviet flag insignia. The original paradrop team naturally garrisons the memorial; HD mode adds the correct national insignia without changing source timing. R8 repairs boat depth rather than replacing accepted textures.

## Integration and updated-main preservation

Merge `12fe4b4e` combines accepted task tip `e8b3f79b` with main `7ae771ed`. The 103 main-only paths were reviewed: 102 stay byte-identical, while the developer route allowlist gains existing campaign/menu images. Shared conflicts preserve newer skirmish saves, trainer persistence, terrain/fountain rendering, YR loading flags, edition-aware UI, result lifecycle, naval-aircraft return repair and persistent error diagnostics.

Canonical resources receive 2,393 additive files: 2,364 immutable selected pack files and 29 campaign files. Only the expected URBAN environment selector advances to `urban-campaign-sov01-hd-r7-clean-r2`, including flag revision `m3-1-memorial-soviet-flag-r8`. All existing pack bytes remain intact. NewUrban and Desert keep updated-main `*-road-markings-v5` selections, as do main's terrain contracts and native UI backdrop metadata. The combined resource plan validates 14,070 files with zero metadata overrides.

Campaign `ScreenType` is 22, skirmish LoadGame is 23, and CampaignSaves is 24; both navigation registries retain their routes. Each game copies its submenu map so campaign routes cannot leak into a later skirmish. Separate save formats/journals and trusted campaign progress gates stay intact. Commit `c738af56` fixes a native-discovered integration defect: opening a restored campaign menu must preserve tick 4062, while skirmish still drains pending commands before pausing. Commit `1d776564` completes the normal developer entry, keeps its `RA2 HD` profile name and admits the existing public menu images.

## Issues and reusable lessons

| Observed issue | Retained resolution or future rule |
| --- | --- |
| Review URLs were unusable remotely; a package opened an unsupported campaign view | Keep offline reviews with embedded native PNGs. Test the actual user entry and edition recovery, including relocation; a review image is not gameplay. |
| Wide layouts doubled frames, repeated Alaska or displaced the map locator | Use one coherent background; preserve the original coordinate center, projection and proportions. Extend background area without adding a second subject/frame. Verify several aspect ratios. |
| Loading fill became dark, orange, dirty or hid red cables | Preserve the original housing, continuous metal surface, yellow tone and left-to-right highlight progression. Inspect actual composited alpha and layer order. |
| UI text, arrows, score panel or trainer blocked other content | Match native text density/edge offsets, isolate hover state, retain score scale/transparency, and test actual pointer input and transitions. |
| Pixel grain was mistaken for source fidelity | Follow `hd-art-standard.md` and workspace AGENTS: preserve design/palette while reconstructing clean materials and continuous antialiased lines. Inspect independent 2X/4X exports and runtime; do not silently revise accepted art. |
| GPU HD registration passed while civilian hulls were hidden | Verify visibility, depth, all placed actors and headings. The generic camera-ray reference-surface depth repair preserves pivots, shadows, sinking and textures. Registration alone is insufficient. |
| A plain red garrison flag lacked the Soviet national print | Confirm original mission timing and flag slots, then add only the insignia to the selected HD extension. Preserve alpha, poles, cloth registration and unaffected states. |
| Old campaign snapshots could revert newer main resources | Compare expected predecessor hashes and transfer additively. Keep live-main selectors/contracts; do not apply historical frozen terrain overrides during combined-main validation. |
| Restored campaign advanced one extra tick after merge | Test exact restored world/RNG/tick and continuation across native app restart. Keep the campaign pause boundary separate from skirmish command draining. |
| Historical tests depended on retired artifact folders | Keep required checkpoint fixtures in source. Use the history object index for retained provenance; do not restore hundreds of GB just to satisfy obsolete authoring-test paths. |

## Verification and remaining boundaries

Follow-up maintenance on 2026-10-25 resolves the retired-input host-test failures: 1,227 cases pass with zero failures, loading errors or skips. See `main-maintenance-and-m3-plan-20261025.md`. The original integration run below remains historical evidence; no new runtime/visual acceptance is implied.

Fresh related checks pass: 104 tests / 13,791 assertions across 31 files, entry typecheck, campaign named-save/legacy compatibility and exact restart restore, RA2/YR trainer-enabled skirmish save/restart/resave, Original/2X/4X scripted opening, 4X civilian headings/waterline and 20 retained-main native naval scenarios. The opening matches world/RNG/mission state at tick 3600, hash 1965294077; both boats lose zero pixels to water clipping. Normal main startup and a fresh isolated profile both pass with live main selections. Its 215 web files match the native gameplay matrix; the developer route allowlist contains 208 files.

The full host suite is not clean: the retained run has 982 passes, 182 failed cases and 11 loading-error modules. Every failing case name also fails a matched pre-merge source run; retired M2 source inputs and old expectations account for the recorded failures. The two old menu fixture failures are corrected and pass in the final focused run. Do not describe this as full-suite acceptance or silently repair unrelated M2 test maintenance. An initial focused run without the browser preload also failed to install the legacy Three global; the final command uses the required preload and resource root.

User visual acceptance applies through R8. Combined-main technical Mac checks are fresh. No new package or remote push is produced by integration; the historical Desktop R8 ZIP is already absent at preflight and is not recreated. Combined-main native Windows remains `NOT_RUN_ON_THIS_MAC`; no 90 FPS claim is made. The older `Trying to remove non-existent object` crash remains unreproduced, distinct from the repaired naval return stall. Real Library profiles are preserved without migration. The legacy M3.1 manual-test profile's registration points into the retired R3b test app; intentionally reusing that profile requires choosing canonical `.local` in the resource chooser. The normal main profile already uses canonical resources. A few retained locale hint strings still mention the predecessor Normal-only scope; difficulty behavior and per-difficulty persistence are tested independently.

## Evidence and next conversation

`../project-history/m3-1-accepted-main-20261025` contains verification/failure logs, protected-resource snapshots, additive-transfer pins, native build identities, source history and cleanup receipts. `Evidence/manifest.json` maps 3,486 task-artifact paths to 1,918 verified deduplicated objects. `Evidence/integration-manifest.json` locates fresh main native reports and screenshots, including failed predecessors. `Review/` keeps standalone embedded R7/R8 reviews; `Art/` exposes the final flag master/prompt. Use the history README and record reader to retrieve a specific retained input. Historical absolute task paths in earlier reports are not active dependencies.

The main planning conversation can now choose M3.2 after auditing the next original mission's events, actions, teams, transports, media, HD demand and save boundaries. Keep same-outcome fixes in this execution conversation; for a materially new accepted scope, use a new execution conversation and keep the planning/review conversation available. No next mission is started here.
