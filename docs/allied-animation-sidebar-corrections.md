# Isolated Allied animation and sidebar corrections

| Classification | Scope |
| --- | --- |
| NEW_CONTENT | Rigid Prism head projection in both theaters/densities; stationary GI fortress in all 48 deployed attack slots; updated offline review and independently copied Mac package |
| AFFECTED_SHARED_PATH | Original repair: UiArtSpriteBuilder, UiArtPage and SidebarCard. Current feedback: additive Prism/GI selection pins only; no new production TypeScript changes |
| REUSED_ACCEPTED_EVIDENCE | HQ r5, accepted A/B art outside the affected parts, construction, superweapons, native shadows, R2–R6, trainer, density/filtering/camera contracts and sidebar checks |

Status: `ALLIED_ANIMATION_SIDEBAR_CORRECTIONS_ACCEPTED_AND_DELIVERED / NOT_MERGED`. Base: `ee35fcf04de2d24c1bce2ee7497e4156483b21f1`. Branch: `fix/allied-animation-sidebar`. Worktree: `/Users/Aone/RA2remaster/ra2-hd-allied-corrections`. On 2026-10-01 the user confirmed that validation passed for the latest delivered package. The acceptance receipt is `docs/allied-animation-sidebar-acceptance.json`; it pins the delivered runtime, resource selections and ZIP receipt. This closes the human review gate for the three correction groups without authorizing main integration or another task.

The preceding feedback found HQ basically fixed, GI firing improved with residual fortress movement, and rejected Prism r5 because its crown deformed instead of rotating. The accepted follow-up selects Prism/GI r9 and preserves HQ r5 and the sidebar correction.

The first delivery, reproduction, sidebar implementation and earlier failed attempts are preserved in `docs/allied-animation-sidebar-first-delivery.md`, `docs/allied-animation-sidebar-corrections.json` and the original ZIP receipt. The delivered technical ledger is `docs/allied-animation-sidebar-feedback-r2.json`. Its historical pending-review fields and the embedded review remain unchanged; the new acceptance receipt supersedes that gate. Accepted resources, apps, profiles, failed exports and retained archives remain intact.

## Current corrections

GI is E1 / `gi.shp`, with idle 292–299 and deployed attack 315–362. The previous r6 fix changed only flash slots. Non-flash sandbag surfaces still differed, compositing retained old edges behind transparent reference pixels, and the warm-color flash mask selected yellow bag highlights. Each facing now uses its accepted idle fortress. A shaped stationary region clears the previous pixels before composition, while distinct upper-body/gun poses remain. Muzzle restoration is confined to its native footprint; original embedded ground pixels and separate native shadows retain their per-slot coordinates. All 48 attack slots change. Idle, deployment, undeployment, walking and every other slot remain byte-identical in both densities.

ATESLA resolves GAPRIS: ACTIVE `ggpris_b.shp` / `gapris_b.shp`, normal loop 0–7 and damaged 9–16; SPECIAL charge `*_a.shp`, normal 0–9 and damaged 10–19. The rejected r5 export warped rows of a single crown picture. The new export projects accepted front, side and top material samples onto a rigid eight-petal component. One fixed axis, scale and geometry per health state produces changing visible faces and depth occlusion; there is no per-frame row stretching or translucent structural substitute. The damaged component uses a fixed lean and attachment. A repeating 45-degree petal period is inferred from the raster references; the original 3D model and exact source yaw values are unavailable. This narrowly reconstructed moving part uses accepted materials and is included in the user's final acceptance.

The fixed neck is registered separately from the rotating petals. Snow and damaged masters have different material coordinates, and snow's whole-building registration placed old petal tails lower; those tails are excluded from the stationary neck. Native charge light remains separate above solid material. Body/base and construction member manifests remain unchanged. HQ stays on r5 with its accepted ring registration and three scan views. The sidebar source, UI artwork and previous cold/warm/rapid-switch evidence are unchanged by this continuation.

## Selection and preservation

Prism temperate/snow and E1 select `animation-r9`; HQ remains `animation-r5`. Source/logical contracts, native frame counts/offsets/timing, Original/2X/4X selection, one-texel filtering, owner coverage and 0–15 shade channels remain preserved. World limits remain 256 MiB at 2x and 1,280 MiB at 4x; UI remains separately budgeted at 16 MiB. No rules, input, camera, trainer, terrain, faction roster or shared loading implementation changes are selected.

The ledger records 42 currently selected correction files, 10,900,253 bytes, including family/member manifests and both density atlases. These are independent worktree-local files and independent copies in the app package. Transfer only missing hash-pinned resources during a later authorized integration. The complete test app contains 2,552 selected resource files, with hash and inode separation checks.

Task-local export and verification tools: `scripts/allied-corrections/feedback-resources.py`, `prism-rotor.py`, `feedback-verify.py` and `verify-resources.py`. Additive pins: `desktop/allied-building-coverage.json` and `desktop/allied-unit-contracts.json`. Runtime, offline review and packaging helpers remain under `scripts/allied-corrections/`.

## Focused evidence

| Case | Result |
| --- | --- |
| Published GI stationary surfaces | 96 frame/density cases; zero differing opaque fortress samples outside the native muzzle footprint; unchanged other actions and native ground controls |
| Published Prism cycles | Eight theater/density/health cases; eight distinct moving phases, identical fixed collar pixels, bounded last-to-first cycle transition |
| YR dry 4x Prism | Complete native 0–7 cycle, damage, power off/on, normal/damaged charge and matched Original/HD captures |
| RA2 dry 2x Prism | Same affected native paths with actual copied-resource bindings |
| Snow 4x and 2x Prism | Both separately exported theaters observed, including damage/power and charge |
| YR 4x GI | All 48 native deployed attack frames observed in a legal clear arena; idle/fire/end/undeploy and real HD binding |
| RA2 2x GI | Failing 327–332 and opposite 351–356 observed; same native transitions and real HD binding |
| Offline review | 32 synchronized groups; new 3840 × 2160 Prism clip playback, no external requests, page errors or overflow |

Native folders are `.artifacts/allied-corrections/feedback-yr-4x`, `feedback-ra2-2x`, `feedback-yr-snow-4x`, `feedback-ra2-snow-2x`, `feedback-yr-4x-gi-full-r2` and `feedback-ra2-2x-gi-control`. The ledger records actual selected identities, frames, states and allocation. GI source is `gi.shp`, native deployed action 29, opacity 1, with separate and embedded native shadow handling retained. The controlled fixtures use legal placement and native orders; they do not certify a natural campaign or physical display/input acceptance.

World allocations: dry 4x 587,620,964 / 1,342,177,280 bytes; dry 2x 178,403,964 / 268,435,456; snow 4x 618,980,536 / 1,342,177,280; snow 2x 208,121,352 / 268,435,456. Selected resource/source/logical/padding/remap preservation validation passes. Focused building/unit contracts passed five tests with 228 assertions; the subsequent GI pin reran its two contracts with 12 assertions. Entry typecheck from the last production TypeScript change is reused; this continuation changes resources and task-local evidence tools. One final isolated app build is reused across the native checks.

Failed intermediate exports remain unselected. Early rigid previews revealed the damaged axis and snow material registration mismatch; r7/r8 remain retained. The GI support smoothing initially missed a few edge samples and was corrected before r9. A coast-side native sweep legally relocated several targets to the same side, so it was insufficient for complete facing coverage. A first clear-arena timer sweep missed frame 341 and retained a FAIL receipt. The final renderer-frame sweep extends each direction to 2.5 seconds and explicitly asserts all 48 frames; no animation frame is forced. The secondary clear-arena case asserts both six-frame controls.

## Review and launch

Runtime source: clean `dae53b4df9651378375a3b96ab285ebfbfaa89eb`, following the core correction commit `52b5e98`. Later commits contain evidence/package workflow and documentation. The signed app and copied resources were actually loaded from their packaged root.

- Offline review: `/Users/Aone/RA2remaster/ra2-hd-allied-corrections/.artifacts/allied-corrections/review-feedback-r2/Allied-Corrections-Review.html`.
- Launch: `/Users/Aone/RA2remaster/ra2-hd-allied-corrections/.artifacts/allied-corrections/mac-feedback-r2/Launch Allied Corrections.command`.
- App: adjacent `RA2 HD Allied Corrections.app`; resource root: adjacent `RA2-HD-Editions-Resources`; independent profile: adjacent `Trainer-Review-Profile`.

The review compares the actual Desktop version the user tested (Prism r5 / GI r6) with current r9, plus Original native pixels. It includes all eight GI facings in both densities and normal/damaged Prism rotation/charge in both theaters/densities. Historical before clips and unchanged HQ/sidebar evidence are identified as reused. No local server is required. The newly authorized ZIP also embeds this same self-contained review.

## Integration boundary

The delivery-time read-only audit found canonical main at `ee35fcf` with active C edits, including HD material/filtering/sampling and serialized resource helpers. At acceptance, main has advanced to `0370e9b41d4736a0b80bbe35d2552b3f3a39a4a4` and still has uncommitted C work. This task has not written its source/resources/profiles, run builds/tests there, changed its branch, used its ports or stopped its processes. Compatibility with C's current branch remains unverified; isolated technical results and user acceptance do not establish combined compatibility.

At later explicit integration, use C's stable committed checkpoint, retain its current catalogs/masks/densities and reconcile only the repair's source changes and selected pins additively. Never replace its newer registries with complete older files. Recheck the affected renderer/resource consumers and a small actual-HD sample after reconciliation. Do not merge now. Continue any corrections to this accepted outcome in this same chat; no new chat is created.

## Desktop test delivery

Delivered `/Users/Aone/Desktop/RA2-HD-Allied-Corrections-dae53b4-macOS-arm64.zip`, 2,219,044,772 bytes; SHA-256 `e4c4e6531311b7bc98d51e0154014530adabf0fc70918436a141faaaf8c73c43`. The original Desktop ZIP remains preserved. The new archive includes the independent app/resources, physical-newline relocatable launcher and the self-contained 32-group review; it contains no old settings, saves or test profiles.

All 3,016 staged files/links passed archive hash, symlink, executable-mode and CRC checks. The Desktop copy matched the complete source hash. A fresh extraction from that actual Desktop ZIP passed deep strict signature verification, real launcher startup, its own adjacent-resource registration, and actual GI/HQ/Prism HD bindings in YR 4x and RA2 2x. Receipt: `docs/allied-animation-sidebar-zip-feedback-r2.json`. Extract the entire folder and double-click `Launch Allied Corrections.command`; choose density before starting a match. The user accepted this delivered version on 2026-10-01. The task-local archive remains retained; no build, test rerun or replacement package was needed to record acceptance.
