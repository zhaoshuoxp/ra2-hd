# M4.1 Mac performance checkpoint

The 4X/native/high-shadow 60 FPS target remains **NOT PASSED**. This checkpoint supplies reproducible native workloads, a measured native-mesh optimization, exact resource identities, a standalone storage prototype and a complete Mac review application. User play/visual acceptance remains pending. Windows performance has not been tested.

## Runtime and environment

Work started on canonical local main `be4e59ff1764ba8ef92c50e1080ce1a6c5e45cf3`. The signed application source is `32c0f11b4118a0f0dac091afff909cc3ec17afaa`, with runtime source digest `3594ea4188f0f7782a87c7583afef1cf640a58258a0ed586fc04b16afcb618c1`. Frozen code inventories and source-file hashes bind the tested production output to its implementation; later evidence-tooling/documentation commits do not rebuild the app.

The actual host is MacBook Air Mac14,2, Apple M2, eight CPU cores, ten GPU cores and 24 GiB unified memory. macOS is 27.2.1 (26B131), arm64. Native Electron 44.4.0 uses Chromium 152.0.7977.78 and ANGLE Metal on Apple M2. The external DELL S2722QC provides 1920x1080 logical points at scale 2, a **3840x2160 framebuffer**, and 59.9967003 Hz. The built-in Retina display remains attached. AC power uses low-power mode 0. Per-run thermal states remain in the evidence; some retired-candidate runs reached `fair` and cannot support a small causal improvement claim.

Read the [fixed measurement contract](m4-1-measurement-contract.md). All formal windows use production builds for 120 seconds, seven live Brutal AI, native simulation/production/pathfinding/combat, unchanged zoom/UI size, density 4, native output and shadows 3. There is no real heavy skirmish save in the five protected profiles, so these are explicitly artificial native workloads. Dense starts with 392 units/44 buildings; overload starts with 776/44. Sustained adds initial funds and native production orders, retaining ongoing movement and fire beyond initial attrition. Five-second counts, placements, commands, map hashes and every callback sample are retained.

## Results and measurement limits

The [machine-readable evidence](m4-1-mac-performance-20261112.json) retains every formal run, per-second callback FPS, 1% low, nearest-rank p50/p95/p99/max intervals, raw and tolerance-adjusted below-target time, low-bin ranges, all stalls of at least 50 ms, CPU costs and native tick deficits. It also lists exploratory failures and diagnostic runs. Raw arrays and CPU profiles remain in `.artifacts/m4-performance-20261112`; they are not replaced by a favorable aggregate.

All 26 retained formal runs fail the fixed callback/simulation gate. The final frozen-code series starts each formal workload at `nominal`; the final sustained repeat ends at `fair`, with the other final scenarios ending at `nominal`. The two fresh interleaved sustained baseline/final pairs are shown separately. Earlier dense/overload baseline runs also started and ended at `nominal`. No small macro FPS gain is established.

| Scene | Baseline FPS | Final FPS | Final 1% low | Final p50 / p95 / p99 ms | Final max ms | Simulation throughput |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| YR dense | 55.40 | 55.51 | 15.64 | 16.84 / 26.60 / 35.10 | 606.79 | 97.20% |
| RA2 dense | 55.51 | 55.43 | 16.44 | 16.84 / 27.81 / 35.00 | 520.82 | 97.00% |
| YR overload | 47.50 | 47.87 | 11.43 | 17.36 / 37.82 / 49.25 | 706.89 | 90.82% |
| YR sustained A | 52.88 | 53.04 | 14.44 | 17.18 / 29.44 / 38.21 | 595.38 | 95.67% |
| YR sustained B | 53.34 | 53.08 | 14.69 | 17.17 / 29.07 / 38.91 | 588.23 | 95.55% |

| Final scene | Below-60 time: raw / tolerance | Stalls >=50 ms | Longest low interval | Missed requested ticks |
| --- | --- | ---: | --- | ---: |
| YR dense | 62.08% / 56.23% | 19 | 0–31 s | 227 |
| RA2 dense | 62.36% / 56.13% | 21 | 0–27 s | 242 |
| YR overload | 71.48% / 67.13% | 53 | 0–55 s | 743 |
| YR sustained A | 65.51% / 61.85% | 27 | 0–38 s | 351 |
| YR sustained B | 65.60% / 61.80% | 25 | 0–38 s | 360 |

All intervals and complete-bin sequences remain in the JSON. Dense/overload attrition eventually lightens the load: final YR dense ranges from 392 to 88 units, RA2 dense from 392 to 56, and overload from 776 to 99. Sustained retains 236–392 units and grows from 44 to 128–129 buildings; sampled moving/firing maxima are 121–125 / 23–25, with up to 14–18 simultaneous projectiles. The initial tick-zero count includes no movement before native orders execute. A light late interval cannot establish sustained-heavy acceptance.

The actual Desktop-ZIP app receives two additional full sustained measurements: **51.36 and 50.49 callbacks/s**, 1% lows 12.07 / 14.27, p95 30.08 / 30.22 ms, worst frames 1020.83 / 580.24 ms and nominal simulation throughput 94.18% / 94.76%. Both start at `nominal`; the repeat ends at `fair`. An interleaved frozen-runtime check also falls to 51.18 callbacks/s and ends at `fair`. Code, selected resources, backend, output, density, shadows, world budget and native mesh output hashes match. A short actual-app path diagnostic records the extracted `Resources/app` and zero generic clone calls across the scratch builds, confirming the specialized path executes. The smaller later scores remain in the evidence; no package-only cause or steady FPS gain is established. Later scratch timings also vary, so the earlier clean matched native pair bounds the CPU attribution. These residual stalls and run-condition variation remain limitations of this checkpoint.

The sampler measures main-thread requestAnimationFrame cadence. Actual presented-frame count, reliable asynchronous GPU elapsed time and actual VRAM are **unavailable**. CPU render time includes submission and synchronous driver work. The separate GPU timer-query capture reported a sum exceeding its nonoverlapping observation window; those values are retained as unreliable and are excluded from GPU conclusions. New diagnostic tooling explicitly rejects that condition. Process working sets and renderer geometry/texture counts do not substitute for VRAM.

Each report records launch-to-ready and match loading separately. Final launch-to-ready spans 21.44–23.46 seconds and match loading 11.48–12.76 seconds; these are not startup-gain claims. Fresh processes/profiles have cold application caches; OS/driver caches are not flushed. Initial in-battle mesh creation, atlas preparation/upload and effects remain inside formal timing. Later warmed sections remain in the raw per-second record. Final sampler means span 0.0039–0.0054 ms/callback, maxima 0.63–0.83 ms including five-second counting. The 100,000-call timer calibration takes 10.17–10.55 ms after timing. Profilers, screenshots, GL counters, scratch-mesh diagnostics, static controls, builds, tests and storage/compression work run outside formal windows.

The existing animation loop advances its wall-time cursor when its bounded catch-up budget is exhausted. Reports therefore expose requested versus executed ticks and elapsed nominal deficits; these missed opportunities are not a queued backlog. This implementation leaves cadence and catch-up policy unchanged. A callback improvement with slower simulation would still fail acceptance.

## Retained optimization

The CPU profile locates synchronous native VXL cache misses in `VxlGeometryPool.get` through `VxlGeometryMonotoneBuilder.build` and the project's generic `BufferGeometryUtils.mergeVertices`. Generic welding accounts for approximately 272 ms of sampled self-time in the 25-second diagnostic, alongside meshing and substantial scene/render/simulation costs.

`mergeNativeVxlVertices` specializes only the builder's fixed plain Float32 position/normal/color layout with Uint32 indices. It reads typed arrays directly, reserves compact owned outputs and maps each original quantized attribute hash to the first encountered index. It preserves the project's truncation toward zero, wrapped integer behavior, signed-zero samples, color/normal seams, attribute order, index order and constructor count. Unknown layouts retain the original generic implementation. The generic utility, art bytes, object/game rules, workers, tick order and cache budgets are unchanged.

The interleaved warm Bun diagnostic retains all sixteen blocks after four declared warmup blocks, with three complete builds per block. Total complete-build time for `disk.vxl` changes from 1030.11 to 648.55 ms, `mtnk.vxl` from 573.82 to 341.06 ms, and `mtnktur.vxl` from 228.60 to 138.49 ms: approximately 37%–41% lower. Welding self-time drops approximately 44%–48%. These CPU results use a different JavaScript runtime from Electron and establish no battle FPS or cold-cache percentage.

The first matched native Electron diagnostic independently confirms the effect on twelve actual loaded sections. A scratch native pool uses each frozen production builder with matching input SHA256 values; all output attributes and Uint32 indices hash identically. The sum of twelve per-section warm means changes from 193.66 to 117.46 ms, **39.35% lower**. First scratch use, two warmup builds and all eight retained builds remain separate. This sum is a CPU workload metric, not one game frame. Parsed inputs are warm, and no live geometry/cache or simulation state is changed. The sustained production window improves only from 52.88 to 53.04 callbacks/s in this pair; broad steady costs remain.

The second native pair also matches all twelve inputs and output hashes: 182.78 to 117.39 ms, 35.77% lower. Its candidate ends the formal window at `fair`, so the first nominal/nominal pair provides the cleaner attribution. Retain the byte-preserving CPU improvement; do not present it as an established steady battle FPS gain.

## Investigated and withdrawn candidate

The HD coverage experiment shared edge binding geometry while retaining per-card sorting/picking. Four-camera in-process controls passed exact 4X/2X pixel parity after fixing a diagnostic ownership error: disposing temporary views had incorrectly retired borrowed GL buffers. That failure, the repair and the original differences remain in the artifact directory.

Two rounds of formal comparison failed to show a robust benefit. The nearest nominal sustained pair changed from 52.6442 to 52.7103 callbacks/s; 1% low changed from 13.9988 to 13.9771 and mean submission from 5.61324 to 5.60777 ms. Other changes were small, mixed or thermally mismatched. The production change and its added tests were withdrawn; the compact patch and evidence remain. The final renderer uses the accepted coverage implementation.

## Correctness and lifecycle

Native reference tests compare every position/normal/color byte, Uint32 index, serialized packet and bound against the original merger for real DISK, tank body and turret sections, including smooth normals and worker output. Fixtures exercise quantization boundaries, wrapped hashes, signed zero, seams, compact ownership, empty meshes and generic fallback. Existing worker cancellation, preparation/publication, picking, shadow, bridge, slope, remap, transparency, animation, deploy/repack and cache tests remain applicable.

Static controls freeze tick zero, simulation/RNG, camera, interpolation and world animation clock, with visual random draws separated from UUID allocation. All four repeated 4X views and all four 2X views match baseline/final RGBA exactly: 33,177,600 bytes per comparison, zero different bytes. The camera exits and reenters view. Earlier unseeded captures are retained as an invalid deterministic comparison because terrain variants consume a separate visual random source. The first controlled 2X pair differed only in 793 sidebar bytes within a 137x2-pixel highlight; repeating with the pointer normalized removes that difference at the unchanged zero-byte threshold. The controls do not change formal workload rules.

The full host suite passes 2,158 cases across 325 executions, with zero failed cases, loading/process errors, skips or omitted files. Entry typecheck and production build pass. The signed complete app passes five native scenarios: both-edition menu/logo exports/radar fallback; RA2 and YR HD opening/radar/captions/audio, named save, full process restart, source continuation, Original/codec fallback and release; RA2 source Allied03 victory/report/score/public Continue into Allied04; and YR source Soviet06 ending narration/score/public Continue into Soviet07. Victory checks use accepted source-command routes/checkpoints. They do not re-establish every mission or difficulty.

The new app is `/Users/Aone/RA2remaster/RA2-HD-Mac-M4.1-20261112/Red Alert 2 HD.app`. The single complete-app Desktop ZIP is `/Users/Aone/Desktop/RA2-HD-Mac-M4.1-20261112.zip`: 13,517,472,341 bytes, SHA256 `f104b4a72cb70e075431b576175408839be9b7fd8b0a41071301ee62b6a268ac`. Fresh actual extraction verifies every one of 17,028 entries, file hashes, Unix modes, relative symlinks and deep strict signature. The app has 18,071,615,683 logical bytes; all 16,444 selected game resources match canonical hashes with zero metadata differences. The default review profile is isolated as `RA2 HD M4.1 Review 20261112`; existing saves/settings are preserved. Public version remains 0.5, package version 0.5.0.

The [final verification record](m4-1-final-verification-20261112.json) pins current native and ZIP evidence. Observer `build` hashes in the legacy movie test describe root `dist`; its `packagedApplication` field and the complete delivery inventory identify the actual tested app. Prior M3 acceptance still covers unchanged artwork and forty original missions. New application play/visual acceptance remains pending.

## Resource storage assessment

The selected runtime inventory remains **16,444 files / 17,689,836,587 bytes (16.475 GiB)**. Its SHA256 list is `.artifacts/m4-performance-20261112/storage/selected-hashes.json`, digest `fe938de7f3fb61ba41fa85537e5c905e4d1fa6468df1c0a1d0b8212c4871c0ac`. The movie manifest remains `cc4ab6015567a7055f89177ebbbc9d8aa196aefede5f06409efa367dd72cc11a`; the prepared index remains `f993e5c0c3e235e0fdaf57bb74b8590eaac7992f30529763e003885d540ad9b1`. All 136 accepted movie identities remain selected.

| Runtime category | Files | Bytes |
| --- | ---: | ---: |
| Original imported archives | 7 | 678,717,862 |
| Registration metadata | 16 | 36,627 |
| Environment | 8,537 | 1,510,640,615 |
| HD packs | 3,775 | 1,825,085,376 |
| Movies/audio metadata and payloads | 198 | 5,857,378,830 |
| Music | 28 | 77,844,635 |
| Prepared HD | 1,191 | 2,850,846,213 |
| Terrain | 566 | 2,984,154,737 |
| UI | 359 | 37,530,932 |
| Original-import metadata | 3 | 400,962 |
| Campaign | 1,764 | 1,867,199,798 |

This inventory covers runtime selection. Original installations/downloads, authoring masters, provenance and development inputs remain separately retained. Baseline and final both report the same 1,610,612,736-byte world budget; terrain and environment actually use density 4 with no fallbacks in the recorded match. Prepared HD keeps its 128 MiB cache, 16 MiB entry bound and four coalesced in-flight loads. The first final sustained run reports a 134,150,800-byte cache peak, below 134,217,728 bytes. Returned page copies protect ownership, mutable consumers and cross-match disposal.

The standalone prototype supplies independent 1 MiB chunks, SHA256 for encoded/decoded chunks and whole files, raw or lossless deflate with raw fallback, virtual identities, independent 2X/4X reads, cross-chunk ranges, cancellation, one active request and an 8 MiB LRU. Decoded results are owned; corrupt metadata/payloads fail admission. It requires no whole-pack extraction and is not connected to runtime selection or movie playback.

Six representative terrain/prepared/PNG/movie files occupy 31,907,931 bytes scattered, 31,916,529 bytes indexed raw and 9,796,560 bytes compressed. Warm four-pass read-plus-integrity means are 19.57, 53.85 and 100.75 ms respectively. The chunk readers perform additional integrity work; all wall timings include final whole-file verification. First reader passes are retained, but the preceding inventory hash scan warmed the OS cache. These are not physical cold-disk measurements. Preparation, upload and first-frame wait are unavailable for this unintegrated prototype. Cumulative Bun-reported RSS high-water values, sampled every 5 ms, after the three modes are 172,300,240, 173,463,504 and 173,676,496 bytes; they are not isolated per-mode peaks. The original `peakOwnedBytes` field (22,675,456 bytes) is a buffer estimate, with codec/V8/caller-retained memory excluded, and the current tool names it explicitly as an estimate.

The smaller compressed sample does not establish FPS or startup benefit. **Retain the current storage format.** A later adoption proposal needs bounded background decode/preparation, cold/warm first-use and peak-memory tests, direct seek/stream preservation and both-platform validation.

## Next measured work

Final sustained A averages 5.71 ms CPU update, 5.53 ms render submission and 5.08 ms simulation per callback: 16.33 ms combined work before remaining callback/presentation delay. Overload averages 6.48 / 6.79 / 4.78 ms, or 18.05 ms combined. Separate final frozen views record 476 / 652 draws and 1.26 / 1.56 million triangles; these are snapshots, not full-window averages. The sampled profile also identifies repeated binding/attribute validation as a substantial submission cost. This explains why faster occasional mesh construction cannot supply steady headroom.

Larger gains need a bounded structural experiment with independent attribution: combine adjacent compatible submissions while preserving render-list order, coverage, depth and ownership; identify remaining synchronous `VxlGeometryPool.get` misses that should use existing worker preparation; and profile `GameAnimationLoop.tickGame` callers before changing any scheduling. Existing flat culling, explicit matrices, prepared-page ownership and shader warming already remain active. GPU overdraw/8K shadow work remains a hypothesis until a reliable GPU measurement is available. No AI frequency, tick policy, effect count, density, resolution or memory-cap reduction is authorized as an acceptance shortcut.

Keep the accepted v0.5 app and independent movie ZIP until user acceptance. Its old Desktop ZIP was already absent at task start. Keep the new review app, one new Desktop ZIP and compact evidence; cleanup of task duplicates follows explicit acceptance. Same-goal performance feedback stays in this execution chat. Return this checkpoint to the main planning chat for M4.2; no Windows development package, remote push, release or cross-chat message is produced by this task.
