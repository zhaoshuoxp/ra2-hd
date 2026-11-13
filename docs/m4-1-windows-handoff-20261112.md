# M4.1 checkpoint for Windows M4.2

M4.1 delivers a Mac checkpoint with the stable 60 FPS target **not passed**. The exact committed runtime source is `32c0f11b4118a0f0dac091afff909cc3ec17afaa`, also pinned as `runtimeSourceHead` in the final verification record and embedded `M4.1-Checkpoint.json`. Use that full commit as the M4.2 base. Later Mac documentation-only commits do not change the frozen runtime. No Windows performance result or development package is produced in this stage.

## Confirmed target and required live capture

The user confirms Ryzen 7 5800H, RTX 3070 Laptop and 2560x1600. Probe actual Windows version/build, RAM, GPU/driver, Electron/Chromium, display refresh/scale/framebuffer, graphics backend, AC/battery and power mode before timing. Thermal state, actual VRAM, GPU duration and presented-frame counters must be marked unavailable if the host cannot measure them reliably. Mac M2 results do not establish Windows performance.

Keep 4X HD, actual native 2560x1600 output, high shadows, current camera/UI scales, seven Brutal AI and unmodified native simulation. Original/2X controls are diagnostic. Preserve existing Windows fixes and the reverted state of unproven AI/C10 changes. Keep Mac runtime edits serialized while the Windows checkpoint is being optimized.

## Source and resource identity

The Mac source baseline is `be4e59ff1764ba8ef92c50e1080ce1a6c5e45cf3`. The retained runtime optimization is the fixed-layout native VXL vertex merger; it preserves exact output bytes and retains the generic fallback. HD edge sharing was withdrawn. Read the [Mac report](m4-1-mac-performance-20261112.md) and [measurement contract](m4-1-measurement-contract.md).

The selected payload is 16,444 files / 17,689,836,587 bytes. Reuse files already on Windows only after SHA256 comparison against `.artifacts/m4-performance-20261112/storage/selected-hashes.json`, whose digest is `fe938de7f3fb61ba41fa85537e5c905e4d1fa6468df1c0a1d0b8212c4871c0ac`. The current resource-plan identity is `.artifacts/m4-performance-20261112/resource-plan.json`: 17,002 routes, 212 selections, twelve layers, zero overrides. Prepared registration contains 448 members/1,189 pages, index digest `f993e5c0c3e235e0fdaf57bb74b8590eaac7992f30529763e003885d540ad9b1`. Movie selection keeps all 136 accepted identities, manifest digest `cc4ab6015567a7055f89177ebbbc9d8aa196aefede5f06409efa367dd72cc11a`.

A future requested export should include source/lockfile, these small manifests/hashes, the current required resources and compact evidence. Exclude Mac apps, histories, recordings, authoring duplicates, real profiles, caches and unrelated working files. The Mac delivery matches all 16,444 canonical selected SHA256 entries, with zero portable metadata differences. Do not copy absolute Mac registration paths into Windows.

## Reproduce the workload

Install the pinned Bun dependencies and native Windows Electron dependency from the lockfile, then build the desktop allowlist. Run from the checkpoint checkout with a selected imported resource root. Use new output directories. The harness launches Electron through the platform's installed executable and uses the OS temporary directory; it never selects a real user profile.

```powershell
bun install --frozen-lockfile
bun run desktop:prepare
node scripts/m4/benchmark.mjs --runtime=C:/RA2/ra2-hd --resources=C:/RA2/resources --out=C:/RA2/evidence/yr-sustained --edition=yr --scene=sustained --phase=measure
node scripts/m4/benchmark.mjs --runtime=C:/RA2/ra2-hd --resources=C:/RA2/resources --out=C:/RA2/evidence/ra2-dense --edition=ra2 --scene=dense --phase=measure
node scripts/m4/benchmark.mjs --runtime=C:/RA2/ra2-hd --resources=C:/RA2/resources --out=C:/RA2/evidence/yr-overload --edition=yr --scene=overload --phase=measure
node scripts/m4/benchmark.mjs --runtime=C:/RA2/ra2-hd --resources=C:/RA2/resources --out=C:/RA2/evidence/profile --edition=yr --scene=sustained --phase=profile --seconds=25
```

RA2 Long March is `mp27t8.map`, SHA256 `64674a3d16a321207b1edb6e223ca87690d50ee0e293aea0c56de5b1f9b98aa4`; confirm the exact report identity before comparison. YR uses `xmp27t8.map`, SHA256 `75b4de164c19e39a040285ff0dd0db983ae88f7f750da02e2a2b407832f33146`. The timestamp seed is `1700000000000`, solo speed tier 2 (67.5 nominal ticks/s), one human/seven Brutal AI with no team, initial 392/44 or overload 776/44. Sustained uses 100,000 initial credits/player, native MCV deployment, tank/infantry queue orders at tick 120 and human attack-move every 450 ticks. Placement and input hashes/lists remain in each report.

The fixed camera path, simulation-throughput accounting, every frame interval and per-second counts are implemented in `scripts/m4/scene.mjs`, `benchmark.mjs` and `statistics.mjs`. Use the unchanged 120-second contract and tolerances. Check `COMPLETE` and the separate performance gate; technical run completion is insufficient for acceptance. Compare baseline/candidate at matching thermal/power/load conditions and interleave repeats when gains are small. Preserve outliers and failures. Keep profiler/GL/query/screenshots and other heavy work outside formal timing.

For deterministic image checks, use `--phase=explore --static=1 --density=4` and repeat at density 2. Those diagnostics fix the separate visual random seed and paused world animation clock. They do not run a live battle or establish FPS. Compare decoded RGBA samples at matching tick/camera, resource publication and output; do not loosen thresholds to hide uncontrolled visual phases.

## Remaining hotspots and return requirements

The Mac profile attributes substantial work to scene updates, render submission/binding validation and simulation, with first-use native VXL cache misses. The new merger reduces measured mesh-build CPU work; broad steady load remains below target. The separate GPU timer capture fails an elapsed-window sanity check, so shadow/overdraw claims remain hypotheses. The storage prototype is standalone: smaller deflate chunks add read/decode/integrity cost and are not selected for runtime adoption.

The actual extracted Mac ZIP measures 51.36 / 50.49 callbacks/s in the sustained scenario, with a later frozen-code check at 51.18. The initial ZIP run includes a 1.02-second frame. All raw results remain, and no package-only explanation is established. A native diagnostic confirms the new app path and zero generic geometry clones across scratch builds; loaded mesh output hashes match. Keep executable/package provenance explicit in Windows comparisons, and validate the actual delivered build after any source-level improvement.

Retain exact geometry, shadows/alpha/remap, complete-family publication and bounded caches. Any new batching or scheduling experiment needs its own matched measurement and invalidation/lifecycle proof. A simulation change additionally needs a repeatable full-state comparison at comparable ticks. Reuse current fixtures and accepted content, then cover relevant bridge/slope/visibility/turret/deploy/animation paths, both-edition campaign/media, save/full process restart, victory/next/menu and release across consecutive matches.

Return the exact base commit, committed change series or verifiable bundle/patch, changed-file list, lock/build identity, raw performance records, hardware/settings, correctness results and resource hashes. Return changed resource payloads only when necessary. M4.3 must validate the actual integrated commit on Mac and then the same integrated build on Windows. A pre-integration Windows result cannot certify a later combined build. No push, publication or cross-chat transfer is implied by this document.
