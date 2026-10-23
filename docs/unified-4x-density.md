# Allied and Soviet atlas density

Follow-up: [True 4x regeneration](true-4x-regeneration.md) fills the 24 previous complete-family density exceptions from adequate or newly authored masters. The findings below remain historical evidence for the initial density upgrade.

The user accepted the residual shadow correction at `81101f0`, then authorized a hardware-gated density upgrade for Allied and Soviet units and buildings. Prefer genuine master re-exports; keep a complete accepted family at its previous density when any required artwork lacks 4x sampling. Do not enlarge 2x artwork to label it 4x. Work is local; no publication or Windows validation is implied.

## Resource decisions

All renderers now request complete 4x families. Missing variants fall back atomically to the complete accepted 2x family. Atlas density changes UV sampling and texture allocation, not native frames, camera, geometry, foundations, pivots, animation timing, weapons, or shadows.

New master-derived 4x exports cover SPY, ADOG and its jump member; Allied GAGAP, GAWALL, GAPILL, GAAIRC/AMRADR, GASPYSAT, ATESLA, GADEPT, GAOREP, GAWEAT, GAROBO, NASAM, and snow GAPOWR; Soviet NALASR, NAFLAK, TESLA, NAIRON, NAYARD, NAINDP and NABNKR. Applicable snow families use the accepted snow transfer. Existing complete NAHAND, NAREFN, NAWEAP and NACNST 4x variants are enabled, including snow re-exports. Existing eligible Soviet infantry and vehicle variants remain the artwork source. NASAM, NALASR and NAFLAK turrets use raw masters with the accepted registration and semantic remap masks.

The following complete families retain their accepted 2x resources:

| Group | Exceptions | Reason |
| --- | --- | --- |
| Allied infantry and dolphin | E1, GGI, JUMPJET, CLEG, SNIPE, TANY, GHOST, DLPH | At least one required action master has fewer than four source pixels per native pixel. The audit records each deficient frame. |
| Allied buildings | GAPILE, GACSPH, GACNST, GAWEAP, GATECH, GAREFN, GAYARD | Normal, damaged, or construction masters fail the 4x sampling guard. |
| Grand Cannon | GTGCAN | The 315-degree turret master is insufficient; retain the entire building/turret family. |
| Soviet buildings | NARADR, NADEPT, NATECH, NANRCT, NACLON, NAPSIS, NAMISL, NAWALL | Accepted registration measures roughly 2.03–3.64 source pixels per native pixel. |

Existing Original exceptions SQD/SQDG and guarded YURIPR remain unchanged. Existing CARRIER 4x artwork includes previously accepted modest master enlargement in some headings; this work preserves it and does not claim newly recovered detail. Original shadow/electrical-effect masks and categorical remap masks remain semantic data, not new authored detail.

Source audits, immutable resource selections and failed intermediate diagnostics are under `.artifacts/unified-density/`. Registration `registered-v3.json` and allocation `storage-inventory-v3.json` describe the final selected resources. `resource-verification.json` verifies 336 unchanged native contracts and 858 unchanged predecessor atlas files. Accepted mechanical corrections and paint masks are reapplied during Soviet export; accepted packs are never edited.

## Bounded allocation

The test machine is an Apple M2 with 10 GPU cores and 24 GB unified memory. ANGLE uses Metal; WebGL reports a maximum texture dimension of 16384. Atlas pages remain at most 2048 pixels per side, without mipmaps. Measurements account for actual lossless pooled texture storage; these are not physical VRAM counters.

The shared world allocation cap is 768 MiB. Both eager buildings and demand-loaded buildings/units consume that same cap. Whole-family rejection remains mandatory before GPU upload. Ordinary members retain eight pages and ordinary building families retain a 64 MiB pooled cap. Only the source-validated 4x `ngyard_d.shp` crane permits sixteen pages; only the complete losslessly pooled 4x NAYARD family permits 128 MiB. Its offline decoded-PNG pooling estimate is 114.22 MiB; the browser runtime reports 68.38 MiB after its actual decode/pooling path. Runtime allocation is the enforced value. Unpooled decoding retains its previous 64 MiB guard; pooled decoding is bounded by page count and 2048-pixel page dimensions.

The accepted baseline passed a 4K mixed scene with 64 vehicles and eight buildings plus additional 256/512 MiB texture-storage probes. Baseline HD storage was 206.82 MiB. Candidate v2 reached 337.29 MiB with no demand fallback, GL error or context loss; its synchronized render p95 with an additional 512 MiB was 10.34 ms. These paused measurements include CPU rendering and GPU completion; they are not GPU-only time or live gameplay FPS. Later candidates add genuine 4x infantry and the shipyard and require their own final runtime evidence.

Two intermediate candidates correctly failed review: v1 had a second hard-coded 256 MiB demand cap; v2 still forced SHP units to request 2x. Both limits are corrected, and the failed evidence remains recorded. The first shipyard candidate also exposed the independent 64 MiB family limit; the narrow measured exception above addresses it without removing the shared cap.

## Soviet shadow inspection

The accepted shared VXL correction already covers Soviet vehicles: a bridge-only native depth occluder must receive explicit `false` on ordinary ground. No second shadow rewrite is needed. The accepted-package pressure scene checked 48 HD instances from HARV, SMCV, HTK, APOC, TTNK and DTRUCK; their old depth masks were false. The HARV same-frame diagnostic exactly matched forced mask removal and reproduced the defect when legacy visibility was restored. Evidence: `soviet-shadow-harv-v1` and `pressure-4k-v1`.

## Validation and delivery

The final local candidate is `.artifacts/unified-density/candidate-package-v5/RA2-HD-4X-Candidate`, including its sibling resources. Open `Red Alert 2 HD Offline Trainer R1.app` there. The app name preserves the existing wrapper; this change is the atlas-density upgrade. The self-contained review is `.artifacts/unified-density/Unified-4X-Review.html`, with machine-readable results in `final-summary.json`.

| Final 4K case | HD allocation | Median live frame interval | 95th percentile |
| --- | --- | --- | --- |
| RA2 temperate | 487.95 MiB | 16.62 ms | 18.85 ms |
| RA2 snow | 506.87 MiB | 16.67 ms | 19.23 ms |
| YR temperate | 514.68 MiB | 16.70 ms | 19.04 ms |
| YR snow | 536.17 MiB | 16.66 ms | 18.60 ms |

All four cases verified changed building bindings and 4x infantry, advanced simulation, and recorded no GL errors, context loss, or unexpected demand fallback. The heavier fixture contains 72 units and 26 buildings, uses 531.58 MiB of accounted HD textures, and retains all 48 checked Soviet vehicle HD bindings. Adding 512 MiB of diagnostic texture storage yielded 8.75 ms synchronized-render p95 with no errors. These are bounded M2 checks, not universal GPU support or an unrestricted battle benchmark. A concurrent system query reported 67% memory free according to macOS `memory_pressure`; that is a system metric, not dedicated VRAM.

The first expanded pressure fixture overlapped buildings and vehicles, causing native translucent-state Original fallback; its timing was rejected. `final-pressure-4k-v2` separates them and requires real HD activation before timing. The final parking probe completed four native ORCA/BEAG landings on the 4x snow GAAIRC, with four distinct pads and visible HD layers. Direct screenshots were inspected without sharpening or enlargement.

Validation: 43 focused tests / 1,289 assertions, entry typecheck, immutable isolated build and package, source/atlas hash verification, and SPY/ADOG/ADOGP CPU resolution against both retail editions. Windows is NOT_RUN. Prior full acceptance matrices were not replayed. Technical validation is separate from user visual acceptance. Existing A/B, Soviet, UI, trainer, missile, and parking acceptance is preserved; only changed density dependencies and focused affected scenes are checked. Continue corrections and review of this density result in the current execution conversation.

## Saved density option and Soviet filtering follow-up

The subsequent user-authorized change adds a saved 2x/4x game option, default 4x, and corrects the Soviet VXL/Conscript forced footprint. See [HD density options and Soviet sampling audit](hd-density-options-and-soviet-clarity.md) for current behavior, adaptive 256/768 MiB limits, focused runtime results and the latest review/package. The tables and candidate paths above remain the historical 4x-upgrade evidence. All accepted resources and complete-family exceptions remain unchanged.
