# Accepted Task E integration into local main

Status: `YURI_CAMEOS_E_ACCEPTED_AND_INTEGRATED_INTO_MAIN / C_TECHNICAL_REGRESSION_PASS / C_FINAL_VISUAL_ACCEPTANCE_PENDING`. The user's 2026-10-01 authorization supersedes Task E's historical no-main-merge restriction for this integration. No remote push, branch deletion or historical cleanup was performed. The detailed receipt is [yuri-cameos-main-integration.json](yuri-cameos-main-integration.json); the C continuation contract is [yuri-cameos-task-c-handoff.md](yuri-cameos-task-c-handoff.md).

## Verified predecessor and retained history

Main was clean at `ee4c15f490464a2d6f90fc4ec3da47a155424146`; E was clean at `cd6944def05dc4444f0e904c8eea29f6c381cdbe`. Merge commit `7ca2be9` retains both parents and the complete E history. Subsequent local commits add the resource transfer, package validation and this integration handoff. Use the final committed local main tip; the exact final checkpoint is additionally recorded in `.artifacts/yuri-cameos-main-integration-v1/final-checkpoint.json`.

Recovery evidence is `.artifacts/yuri-cameos-main-integration-v1/pre-merge/snapshot.json`, exact saved `pre-merge/ui-selection.json`, the pre-merge registration and critical source copies. The original main commit and immutable `remaining-ui-v4` pack remain available. No reset, stash, cleanup or automatic rollback was used.

Only E was merged. D, `fix/allied-animation-sidebar` and `fix/skirmish-loading-isolated` were excluded, and their uncommitted contents were not used as implementation inputs. Existing main fixes remain intact. The sidebar peer's rapid-switch flashing correction remains unmerged; this integration neither implements nor certifies it.

## Source and resource integration

The automatic `desktop/hd-profile.mjs` merge adds only E's independent `RA2_UI_RESOURCE_ROOT` selection and returned `uiRoot` to C's current implementation. C's 33 building selections, dual-density turret contracts, lossless pool/lookup-map handling, c3 Dominator resources and native bunker docking controller remain unchanged. The other E production changes propagate the UI root through `desktop/main.mjs` and `desktop/protocol.mjs`, and bind/preload/render Yuri's complete loading background through the four loading-screen files. Existing logical geometry, camera/input coordinates and gameplay rules remain intact.

Accepted E transfer validates the 55-file final supplement, 31 selected masters, 62 density exports and additive deltas. It retains 113 accepted source/export/provenance files under main's ignored `.artifacts/yuri-cameos/`. Older E applications, rejected versions and historical evidence remain preserved in the E worktree. Runtime images are copied into a newly staged catalog, never over the existing catalog.

| Resource selection | Before | After |
| --- | --- | --- |
| Revision | `remaining-ui-v4` | `yuri-cameos-e-main-v1` |
| Manifest SHA-256 | `1da8b86dccd529314d83836c990e2bf0f542397e32cd8d65bc1cd904585a08d8` | `052c1ca0294344e21b3bb4fe881aece611232000e6efc3ec2ad1306efaf3a890` |
| Entries | 430 | 474 |
| Review-only | false | false |

The current pointer is `/Users/Aone/RA2remaster/ra2-hd/.local/ui-selection.json`. The new pack is `/Users/Aone/RA2remaster/ra2-hd/.local/ui-packs/yuri-cameos-e-main-v1/`. Independent validation happened first in `.artifacts/yuri-cameos-main-integration-v1/resource-staging/yuri-cameos-e-main-v1/`, followed by publication and atomic selection replacement.

All 430 predecessor entries and menu videos are preserved. Additions are exactly 31 canonical pictures plus 12 rank aliases, followed by one Yuri loading background; aliases reuse their canonical images and existing shared rank artwork. UI limits remain 512 entries and 16 MiB. Cameos retain 60 x 48 logical geometry, 120 x 96 / 240 x 192 exports and fixed runtime 4x. Yuri loading retains 800 x 600 logical geometry with the accepted 1448 x 1086 image. World-density selection stays independent of UI density.

No existing world resource was written. All pre-existing non-UI world registrations are equal to the saved main registration. The final preservation check covers 20,906 existing `.local` and `dist` entries excluding the intentionally updated UI pointer: file size/mode/timestamp, symlinks and JSON content hashes are unchanged. Native archives were not broadly rehashed. Intentional Original SQD/YURIPR exceptions remain explicit.

## Incremental validation

Accepted earlier E/C evidence is reused. This integration performs only related checks:

- Eight loading/UI-root/bunker tests pass with 55 assertions. Three focused C resource tests pass with 310 assertions for YAPPET, NATBNK and YAGNTC at both densities and applicable theaters. Entry typecheck passes.
- A single isolated application build compiles main source `5fa62ebff13c76f1c4c2c104253e07932e529787`. Later changes affect packaging/test tools and documentation only; compiled desktop production files match current main. No rebuild follows the resource-copy correction.
- Copied-app E smoke runs one actual Yuri match, checking YABRCK/YAPOWR/INIT/LTNK and all four powers. Each image matches its accepted identity and native geometry/UV/name contract. Yuri's loading background matches the accepted SHA, HD/Original/HD works, and match entry succeeds. UI peak is 13,672,192 bytes and HD Off releases to zero; loading image reservation is 6,290,112 bytes. Earlier three-faction Force Shield evidence is reused, not rerun or claimed as a new three-faction integration test.
- C's final successful temperate 2X and snow 4X matches check native bunker arrival at the exact dock, occupied firing and evacuation; Mutator charged electrical phase, visible GENDEATH and Brute spawn; damaged c3 Dominator opening/charged/release/closure. Snow 4X additionally checks YAGGUN binding. The initial 2X session recorded YAGGUN binding before an unrelated unexplained application closure; it is not counted as a complete C action pass. Final successful world residency is 175,771,568 / 268,435,456 bytes at 2X and 613,397,628 / 1,342,177,280 at 4X, retaining C's existing budgets.
- Fresh-profile launch, with no preseeded registration or UI-root environment override, automatically discovers the copied sibling world root and separate accepted E UI root. Default world density is 4X. Signature verifies deep/strict; successful runtime reports have no page errors, and the E GL check is zero.

Fixtures disclose legal placements, passive bots and one-time native superweapon charge presets. These are focused native checks, not an organic full-tech playthrough, a new full roster matrix or hardware pressure certification. Final C visual acceptance, Windows and exhaustive physical-input/panel testing remain unclaimed.

Diagnostic attempts are preserved in `.artifacts/yuri-cameos-main-integration-v1/diagnostic-attempts.json`: a JSON/undefined comparison correction, incomplete family-relative turret copies, an omitted native radar prerequisite in the minimal E fixture, and the first C application's premature closure. Fresh successful reports are separate; earlier failed/incomplete reports are not relabeled. The raw successful E run's inherited three-faction status string is interpreted according to its explicit one-case integration scope; the harness label is corrected for future runs.

## Independent macOS review application

Folder: `/Users/Aone/RA2remaster/ra2-hd/.artifacts/yuri-cameos-main-integration-v1/delivery/RA2-HD-Main-C-E-Review-R1/`.

Open `Launch-Isolated-Review.command` or `Red Alert 2 HD Main C E Review R1.app`. Keep `RA2-HD-Editions-Resources` and `RA2-HD-Main-E-UI-Resources` beside the app. The app creates its own `Review-Profile`; existing apps, resources and user profiles remain untouched. Runtime checks use additional task-owned disposable profiles.

The independently copied world root contains 5,635 registered resources and required descriptors/family-relative dependencies; registration parity covers 3,384 HD/UI routes. First-pass copying by unique route hash missed equivalent turret files needed in the temperate Gatling and Slave Miner family paths. Packaging now includes complete selected C family/member paths, retaining dual densities and lookup maps, and reuses the exact compiled app. The package is complete for the recorded C/E main source, with E accepted and C final visual review still pending. No Desktop ZIP was requested or recreated in this integration.

Exact package, runtime, launch and preservation evidence is under `.artifacts/yuri-cameos-main-integration-v1/` and linked in the JSON receipt. Continue integration fixes in this E conversation; continue C artwork corrections and final visual acceptance in the existing C conversation, using the new main baseline and preserving the E continuation contract.
