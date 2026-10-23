# Task C conversation: accepted work and integration handoff

Date: 2026-10-05. Status: `CONVERSATION_ACCEPTED_HANDOFF_READY`. The user approved the delivered result and requested this report for the main conversation to handle branch integration. This report covers the complete conversation, including the later explicitly requested cameo and Lunar Infantry additions. It does not authorize starting another milestone.

## 1. Integration decision first

At this audit, `/Users/Aone/RA2remaster/ra2-hd` is clean on local `main` at `e62c450300bbefa29905ee8cf65cb9c8d492b563`. All implementation and resource deliveries described below already belong to that local main. Do not merge old C branches again or restore their historical catalogs. The new acceptance and handoff documents are being committed only on `fix/lunar-infantry-hd-20261004` in `/Users/Aone/RA2remaster/ra2-hd-lunar-infantry-20261004`, leaving their integration to the main conversation.

The companion [machine-readable snapshot](task-c-conversation-handoff-20261005.json) records live branch ancestry, all 33 selected C family paths/hashes, current UI/prepared pins and the delivery identity. Snapshot hashes are observations, never reset targets. The latest [Lunar Infantry final acceptance](lunar-infantry-final-acceptance.json) closes the remaining complete-animation review. Earlier [R8 acceptance](yuri-buildings-feedback-r8-acceptance.json) and [shared-cameo acceptance](shared-cameos-acceptance.json) remain valid. Historical reports retain their original pending/failed labels and are superseded by these later decisions, not silently rewritten as successful original runs.

## 2. Complete Yuri building production

Task C began from accepted main `3e251383f7f59d2d0525e4c25987fb83f6715f82`. It audited 17 native identities, 102 theater cells and 136 distinct SHP sources, including 5,398 source slots and 118 zero-extent slots. Native eligibility yields 16 applicable identities across six theaters, represented by 33 selected entries and 32 distinct member/aggregate groups. YADEPT stays explicitly excluded at native TechLevel 15; it was not removed from the audit denominator or made buildable.

Every applicable family has complete independent 2X and 4X resources, owner-color material data, original slot/trim/aggregate geometry, construction/damage/reverse states and native shadows. Building rules, foundations, logical camera/input coordinates and native timing are preserved. Gatling and Slave Miner include separately registered turret dependencies at both densities. NAPSIS and NACLON reuse accepted artwork through YR-specific source/geometry contracts, preserving accepted RA2 resources.

| Family | Delivered role | Current selected revision |
| --- | --- | --- |
| GAFWLL | Citadel wall connections and damage | `c1` |
| NACLON | Cloning Vats | `c1` |
| NAPSIS | Psychic Sensor | `c4-feedback-r4` |
| NATBNK | Tank Bunker, including separate New Urban source | `c5-feedback-r5-horizontal-v6` |
| YABRCK | Barracks | `c4-feedback-r4` |
| YACNST | Construction Yard | `c4-feedback-r4` |
| YAGGUN | Gatling defense and turret | `c8-feedback-r8-sphere-v2` |
| YAGNTC | Genetic Mutator | `c4-feedback-r4`, retaining the building arc correction |
| YAGRND | Grinder | `c8-feedback-r8-idle-rotor-v2` |
| YAPOWR | Bio Reactor | `c4-feedback-r4` |
| YAPPET | Psychic Dominator | `c4-feedback-r4`, retaining articulated hinges |
| YAPSYT | Psychic Tower | `c4-feedback-r4` |
| YAREFN | Stationary Slave Miner/refinery | `c4-feedback-r4` |
| YATECH | Battle Lab | `c4-feedback-r4` |
| YAWEAP | Ground/air factory | `c4-feedback-r4` |
| YAYARD | Naval yard | `c4-feedback-r4` |

The three initially stretched representatives, YAGGUN-TURRET-0, YAPPET-OPEN and YAREFN-TURRET-0, were corrected from unequal-axis fitting to uniform proportions. Gatling edge haze was removed. Production used adequate high-resolution masters and native-coordinate mechanical composition. Heavy C sprites use lossless four-pixel pooling and independently reconstructed owner data, with lookup textures charged to existing budgets. Whole-family publication/fallback remains atomic; no frame dropping or enlarged memory cap was used to make production fit.

The initial complete batch checked actual native actions including building/crane production, reactor occupants/power, bunker occupancy/fire/exit, recycling/refund, mind control, staged Gatling fire and air targets, cloning, ground/air factory deployment, miner packing/redeployment/slaves, naval production/repair, superweapons, detection and Force Shield. Native destruction and distinct damaged actions were checked separately. See [the full batch record](yuri-buildings-hd-batch.md) for exact evidence and disclosed fixture boundaries.

## 3. Repairs and final accepted behavior

| Reported issue | Diagnosis and delivered correction | Final evidence |
| --- | --- | --- |
| Map-selection content moves upward | Delayed `scrollIntoView()` scrolls the document/ancestors by roughly 4–4.5 CSS pixels. A local list reveal helper now changes only the map list's scroll offset, preserving root/canvas/menu anchors. No global translation, page-scroll reset or fullscreen workaround. | `ee35fcf`; [map report](map-selection-layout-fix.md), plus actual Desktop fullscreen/windowed R6 checks |
| Dominator top mechanism incomplete | Rebuilt four independently articulated shoulder/elbow claws, hub and supports; repaired damaged-state clipping against native trims. | `ee4c15f`, retained in later revisions; [initial feedback](yuri-buildings-feedback.md) |
| Genetic Mutator lacks purple arcs while open | The request concerns the building, not the target's mutation effect. Continued neutral purple/white electricity through raised opening and release/retraction, fading to no arc at closed rest; repaired edge-remap leakage. | `d82c4bd`; [building electricity report](yagntc-building-electricity-fix.md) |
| Reactor empty state full or horizontally cut | Three separate curved half-full liquid surfaces with clear upper glass; occupancy fills them, evacuation restores half-full. Approved architecture and owner panels retained. | `feb7656`; [R4](yuri-buildings-feedback-r4.md) |
| Construction looks like the whole texture slides upward | Reworked 13 construction families with fixed foundations/facades and local moving caps, unfolding panels, cranes and extending mechanisms. Native order, timing, reverse playback and empty slots retained. | R4, 52 changed family/theater/density export cells |
| Gatling jumps at construction completion | Completion uses the actual same-density live turret at the correct mount; raised lower mechanism is rendered as a child in the shrinking final native construction buffers and reverse sell slots. | R4/R6, retained by R8 |
| Gatling receiver too low and apparently off-center during rotation | Added a neutral lower bearing and raised the receiver nine logical pixels. Original-mode native VXL/HVA turn recordings identified projection behavior; final R8 uses eight measured complete spherical receiver-envelope centers on one fixed pedestal axis, translating receiver and owner mask together without rescaling. | `072eef9`, `f74bcf9`, final `c8fb137`; [R8](yuri-buildings-feedback-r8.md) |
| Dominator briefly reopens after retracting | Native frame 19 is an endpoint guard. Closing now uses the complete closed pose instead of wrapping through modulo-19 animation selection. | R4; closed/rest pixel equality at both densities/theaters |
| Tank inside Bunker misplaced or excessively obscured | Entry previously completed at the first occupied foundation tile. It now reaches the native dock, turns the hull to native strips, then occupies. Rebuilt HD empty/occupied art from the supplied Original reference; separated front/rear rising guards and repaired rear-wall depth while restoring cached geometry on updates, exit and disposal. | `ee4c15f`, R4, `4f0489e`; [R5](yuri-buildings-feedback-r5.md) |
| Raised Bunker walls have the wrong stripes/spikes | Raised exterior walls carry metallic spikes rooted in the vertical wall and extending horizontally outward. Lowered floor hazard stripes remain. Normal/damaged and three source groups are covered. | `0e3a8d9`; selected `c5-feedback-r5-horizontal-v6` |
| Slave Miner stretches while building/packing/redeploying | Compact yaw keys use uniform scale and translated native phase registration instead of independent width/height fitting. | R4 native production, packing, mobile and redeploy checks |
| Grinder outer mechanisms ignore perspective | Replaced flat image movement with four world-space hinge axes, stationary mounts and projected rigid facets. Solid brass crusher heads with beveled teeth use depth/occlusion and axial rotation, following the supplied Westwood concept reference. | R5/R6; final solid-head runtime `508a0ad` |
| Grinder central studded shaft does not rotate at idle | R7 added a separate central solid rotor; R8 recognized native idle slots 0–10 as a loop and restored rotation before and after intake, including normal/damaged return states. | Final R8 |
| Grinder gains non-owner-colored paint after recycling | The idle image had classified an overlapping painted rear rim as neutral. R8 derives that region's material data from matching body coordinates; green/cyan runtime checks pass after intake and return. | Final R8, 11 idle slots per theater/density |
| Building shadows can cover actor color | Ground-shadow blending runs after terrain/overlays and before actor color, without depth writes, across static/dynamic SHP and the VXL terrain receiver. | R5 draw-order and HD/Original fixture checks. Exact reported R4 body occlusion was not reproduced; no universal occlusion guarantee is claimed. |
| Most Soviet buildings revert to Original on city maps | R4 temperate/snow tests did not reproduce it. R5 reproduced 12/17 Original buildings in a Yuri Urban match while 17 units stayed HD. Demand admission allowed only Temperate; dry-theater admission now uses existing source/geometry/family guards for Urban, New Urban, Desert and Lunar. All 17 buildings and 17 units then bind HD in the tested city scene. Cache registration was healthy. | `4f0489e`; R5 dry-theater and roster evidence |
| Selecting a controlled target shows no control arc | Controller-owned link maps include a target if its controller or that target is selected. Source+target produces one arc, deselection/release/destruction removes it, and existing visibility restrictions remain. | `c8fb137`; Psychic Tower and Yuri infantry native checks/tests |

R5–R7 alignment and motion candidates are historical iterations. Their technical passes do not supersede the user-accepted R8 appearance. Original comparison recordings use this client's original retail rendering with HD disabled, not the Windows Westwood executable. Final Gatling HD uses eight discrete views; hidden Grinder rotation speed is not certified as an exact continuous native angular clock.

The initial Grinder intake also lacked a receiving-building animation consumer. `UnitRecycleEvent` gained an optional recycler reference, WorldView notifies the building, and the renderer selects the existing normal/damaged SPECIAL sequence while hiding ACTIVE during intake. Refund, removal, orders and timing remain native. Packaging was corrected to preserve family-relative turret dependencies even when route hashes share resources; the packaged lookup-map reader retains `/map.png` so eligible 4X pools do not incorrectly fall back to 2X.

## 4. Additional user-requested shared icons

After accepting R8, the user explicitly requested Allied/Soviet icon audits in both RA2 and Yuri's Revenge. These are additions from this conversation, separate from the previously accepted peer Task E work.

The RA2 audit covered 87 eligible rules and 117 relevant references: no HD omission with an existing ordinary native source. The YR audit covered 92 rules and 127 references: nine canonical images and four veteran aliases were missing. Added subjects are Battle Fortress, Guardian GI, Robot Control Center, Robot Tank, Battle Bunker, Boris, Industrial Plant, Siege Chopper and Spy Plane. Battle Fortress, Guardian GI, Boris and Siege Chopper include veteran aliases.

Both editions also declare a missing native Harrier veteran cameo (`falcuico.shp`). The fallback now retains that declared identity while borrowing the existing normal native frame; HD adds the accepted base and standard rank overlay. Existing native veteran pictures are not replaced. This gives 14 new/completed catalog identities: 474 to 488, preserving every predecessor entry and image. Runtime UI remains fixed 4X and independent of world density; standalone 2X and 4X exports are supplied.

Four actual Desktop scenarios cover RA2/YR Allied/Soviet, normal/rank/power bindings, native geometry/UVs, dynamic labels, HD Off/On, UI limits and 16 rapid category switches per scenario. Sixteen focused tests / 88 assertions and entry typecheck passed. User acceptance is recorded separately. See [shared cameo report](shared-cameos-coverage.md) and [receipt](shared-cameos-coverage.json). Runtime source is `4804ab4`; integration/evidence tip is `ec23131`.

## 5. Final addition: Lunar Infantry

The separately requested LUNR addition delivers all 435 visible slots at 2X and 4X, covering 305 distinct native poses in 31 reference batches. Native 435 shadow slots, 94 × 116 logical canvas, trims, RocketeerSequence and Lunarlaser remain unchanged. Detached propulsion parts in air-death poses register independently. New normal `lunricon.shp` and veteran `lunruico.shp` add two entries to the UI superset, bringing it to 490.

LUNR retains native TechLevel 11 and prerequisites. Controlled match insertion and disabled actual-sidebar display fixtures establish rendering, not ordinary skirmish buildability or campaign implementation. No full Task D production was started here.

Both actual extracted Desktop densities pass native flight, laser damage, blue/green/blue owner changes, air death, every visible renderer frame, normal/veteran cameos and zero page/GL errors. The 4X run also passes HD Off/On and old allocation release. Actual pooled LUNR allocation is 4,527,616 bytes at 2X and 15,499,264 bytes at 4X. Eight focused tests pass; the two LUNR contract tests additionally read the actual imported SHP. Entry typecheck passes. See [delivery](lunar-infantry-delivery.json), [report](lunar-infantry-hd.md) and [final acceptance](lunar-infantry-final-acceptance.json).

## 6. Current delivery and immutable resource pins

Latest complete package, verified to exist again on 2026-10-05:

- ZIP: `/Users/Aone/Desktop/RA2-HD-Main-Lunar-Infantry-R1-20261004-c048f6f-macOS-arm64.zip`.
- Bytes: `3267335396`; SHA-256: `56d17fdbe20e2989da73a5175dfa3e9180d7158dfcff33807a0c70433507d0a5`.
- Extracted folder: `/Users/Aone/Desktop/RA2-HD-Main-Lunar-Infantry-R1-20261004-c048f6f-macOS-arm64`.
- App: `Red Alert 2 HD Lunar Infantry R1.app`; full review: `Lunar-Infantry-Full-Review.html`; standalone exports: `Lunar-Infantry-Exports/2x` and `/4x`.
- Compiled runtime: `c048f6f18c4251c0d46fb6d99b416cdc29e2982e`. Later `e62c450` and this closure change verification/documentation, not compiled runtime behavior.
- Archive/extraction previously verified all 6,213 file/link/mode entries and the strict signature; actual Desktop profiles use that package's own copied world/UI roots. This handoff rechecks existence/size and live pins, without repeating the entire archived-byte or gameplay matrix.

Current resource authority is main's selected catalogs and `.local`, not a historical review folder. UI selection is `lunar-infantry-ui-v1`, 490 entries, manifest `a8cf998c042066c05c119a6392e9b703ccd03622d89030e1dbf45089cd90ca18`. It contains all accepted 474 E-era and 488 shared-cameo-era entries. Never restore an older selection pointer.

Prepared contract: `a330f2dd15fef0fcf43af8bc1a8640ac183e6d9680a106990f91a196b9622604`, with 459 registered building bindings and 1,224 selected pages. Unit packs are intentionally excluded, so LUNR does not require regenerating the accepted building payloads. Building revisions do require matching immutable prepared indexes/proofs/payloads and fallback PNGs. Retain the validated Electron preparation path.

LUNR family: `hd-packs/lunar-infantry-family/1/family.json`, hash `85a3f1b904063107edf63aa29a828794f965dc408e3434982fbb0a5281013afa`; member: `hd-packs/lunar-infantry-authored/1/manifest.json`, hash `1fa4038cfd853bb0d46a5cfbb63ad168e4b233de5437446eb034e42ce2901477`.

Ignored data are not transferred by Git. On another checkout/machine, explicitly copy missing selected immutable world families, family-relative turrets/maps, current UI pack, versioned prepared index/proof and referenced binaries from verified main or the complete package. Verify destination conflicts by hash; do not overwrite whole `.local` trees or active pointers from an older branch. Preserve independent UI/world roots and native imported data. Main already has the needed resources in this workspace.

## 7. Branch and commit map

| Branch or checkpoint | Relationship to observed main | Meaning |
| --- | --- | --- |
| `ee35fcf`, `0370e9b`, `ee4c15f` | Already included | Map fix, full C batch, early hinge/dock correction |
| `fix/yagntc-building-arc-20261001` at `18f8163` | Ancestor | Building arc correction/delivery |
| `fix/yuri-feedback-r4-20261001` at `53043ea` | Ancestor | R4 corrections/delivery |
| `fix/yuri-feedback-r5-20261001` at `3795e36` | Ancestor | R5 through accepted R8, including horizontal Bunker spikes |
| `fix/shared-cameo-coverage-20261004` at `ec23131` | Ancestor | Accepted shared icon completion |
| `fix/lunar-infantry-hd-20261004` at pre-closure `e62c450` | Equal to main before this closure | Accepted LUNR delivery; this branch now receives the new documentation-only handoff commit |
| `task/e-yuri-cameos-hd` at `cd6944d` | Ancestor | Accepted peer E contribution, retained as an integration dependency |
| `fix/allied-animation-sidebar` at `3b4202a`; `fix/skirmish-loading-isolated` at `c8134d7` | Ancestors | Peer Allied/sidebar/loading improvements already integrated; not new work claimed by this report |
| `task/d-yuri-units-hd` at `9aba6cd` | Not an ancestor | Separate task and acceptance record; main conversation must assess it independently |

Core C milestones: Mutator `d82c4bd`; R4 `feb7656`; R5 `4f0489e`; horizontal spikes `0e3a8d9`; R6 lower bearing/solid teeth `072eef9`/`508a0ad`; R7 original-motion correction `f74bcf9`; accepted R8 `c8fb137`; R8 delivery `3795e36`. The historical intermediate packages do not override the final accepted selections.

## 8. Main-conversation integration procedure

1. Read this report, its JSON snapshot, current `AGENTS.md`, and any separate branch's own latest handoff. Recheck `git status`, worktrees, main HEAD and active resource selectors. User acceptance here closes this conversation's scope only.
2. Inspect `git log main..fix/lunar-infantry-hd-20261004` and `git diff main...fix/lunar-infantry-hd-20261004`. At the recorded baseline, only acceptance/handoff documentation remains. If unchanged and clean, a fast-forward merges that closure. If main advanced, reconcile only the remaining documentation additively; never reset or restore older source/catalog files.
3. Do not cherry-pick all historical C fixes or recopy old packs over current resources. They are already ancestors. Preserve the 33 C selections, 490-entry UI superset, current prepared contract and accepted Allied/Soviet dependencies when integrating other branches.
4. Keep independent ignored resources explicit. Audit selected family/member/turret/map hashes, UI selection and prepared compatibility against the combined catalogs. Preserve 128 MiB prepared CPU, 256/1280 MiB world 2X/4X, and separate 16 MiB UI caps; do not increase limits as an integration workaround.
5. Reuse accepted evidence. Run only checks affected by actual merged differences; this documentation-only closure requires no new game build or full historical acceptance matrix. A later runtime/resource combination needs a fresh appropriately scoped build and actual copied-package in-match checks before being called delivered.
6. Preserve all apps, ZIPs, profiles, raw/rejected masters, failed diagnostics and worktrees. No cleanup, push, publication or automatic inter-conversation messaging occurred here. Handle a remote merge only if separately authorized.

Primary evidence roots: main `.artifacts/yuri-buildings/` and `.artifacts/map-selection-layout/`; `ra2-hd-yagntc-arc-20261001/.artifacts/yuri-buildings/mutator-arc-v1/`; `ra2-hd-yuri-feedback-r4-20261001/.artifacts/yuri-buildings/feedback-r4/`; `ra2-hd-yuri-feedback-r5-20261001/.artifacts/yuri-buildings/feedback-r5/`, `feedback-r6/`, `feedback-r7/`, `feedback-r8/`; `ra2-hd-shared-cameos-20261004/.artifacts/shared-cameos/`; and `ra2-hd-lunar-infantry-20261004/.artifacts/lunar-infantry/`. These are siblings under `/Users/Aone/RA2remaster/`. Exact native/package/archive receipts remain linked from each milestone document.

## 9. Acceptance and remaining boundaries

The delivered conversation scope is user accepted. Technical Mac evidence and final user visual acceptance are recorded separately and are both complete for the selected result. Windows execution, exhaustive physical display/input coverage, exact continuous VXL rotation parity and unsupported campaign implementation remain unclaimed. Earlier failed/unreproduced diagnostics retain their stated boundaries. No new task starts from this acceptance.

Hand this report to the existing main/planning conversation for integration coordination. Continue here only if a concrete correction to this accepted delivery is requested; a materially different milestone should use its own execution conversation.
