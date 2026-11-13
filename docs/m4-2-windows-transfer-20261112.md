# M4.2 Windows test and development transfer

The user requested a complete Windows portable game and development checkpoint on Desktop. The frozen M4.1 game source is `32c0f11b4118a0f0dac091afff909cc3ec17afaa`; its sustained Mac callback averages are 50.49–51.36 FPS. Stable 60 FPS remains unachieved. Exported source adds portable Windows benchmarking and transfer tooling, without changing game logic or accepted resource bytes.

## Transfer contract

- Target hardware: Ryzen 7 5800H, RTX 3070 Laptop, native 2560×1600, 4X HD and high shadows. Measure actual Windows behavior before choosing optimizations.
- One shared `GameResources` tree contains the 16,444 selected runtime files. Development binds `source/.local` to this tree with a Windows junction.
- The ready portable app launches offline with isolated `UserData`. Pinned Windows x64 Electron 44.4.0, Node 26.13.0 and Bun 1.3.14 are verified against official published SHA256 values. First development setup requires Git for Windows and network access for frozen dependencies.
- `source/` is a shallow local main checkpoint preserving the original commit identity, with no remote. The five unrelated uncommitted Mac diagnostic files are excluded; the tracked script remains at its committed version.
- `TRANSFER.json`, resource hashes and a complete file manifest pin the export. `Run-Benchmark.cmd` tests the portable executable. `Refresh-Portable.cmd` updates that payload only after source changes are committed.
- `Create-Return.cmd` exports commits after the exact base, a binary patch, compact evidence, application identity and only changed resources. The Mac integration must inspect the return and independently validate the combined candidate.

Read `scripts/m4/windows-transfer-prompt.txt` for the complete Windows task and fixed acceptance gate. Do not reduce quality, simulation throughput or the stress workload to obtain a passing number. Source edits do not update the initial portable app until refreshed.

## Validation and boundaries

Transfer tooling is checked on the Mac. Packaging must verify all resource hashes, official executable hashes and x64 PE architecture, clean exported Git state, Windows-safe names, complete ZIP extraction and every extracted file hash. This is static packaging evidence; Windows native startup, dependency installation and performance remain `NOT_RUN_ON_THIS_MAC`. The final delivery receipt records the actual exported commit, archive path, byte count and SHA256.

Preserve M4.1 Mac and v0.5 baselines, real saves/settings and the five unrelated working files. No remote push, publication or change to gameplay/artwork is included. Only this task's verified duplicate staging/extraction data may be retired after delivery.

## Tooling checks

Nine targeted tests pass with 135 assertions across Windows/Mac/source runtime layout, unsafe transfer paths, the existing cadence gate and the unchanged native vertex merger. A small synthetic repository verifies a shallow exact-base export, a new commit, bundle verification and fetching into the original repository. The first bundle experiment used raw object endpoints, which advertised no reference; the exporter now uses `BASE..HEAD`, and the round trip passes.

The staged transfer verifies 25,701 manifest files. All 298 shared frozen application files match the Mac payload exactly; changes are restricted to package metadata and the Windows distribution entry, with the Mac cursor helper omitted. Relocated registration passes with 17,002 routes, 212 selections, twelve environment/terrain layers and zero metadata overrides. The exported source has one commit and no remote; the four untracked YR scripts are absent and the fifth script uses its committed contents. No game runtime source was changed.

The stage uses the exact source checkpoint `61a4bbbe75cb12bfbb4cd605b09dbbf39ae9f6bd`. Later main commits may document delivery only. The archive and delivery receipts remain under `.artifacts/m4-2-transfer-20261112/`.

## Verified delivery

- Desktop ZIP: `/Users/Aone/Desktop/RA2-HD-M4.2-Windows-20261112.zip`.
- Desktop execution prompt: `/Users/Aone/Desktop/M4.2-Windows-Codex-Prompt.txt`.
- Desktop setup instructions: `/Users/Aone/Desktop/M4.2-Windows-README-FIRST.txt`.
- SHA256 sidecar: `/Users/Aone/Desktop/RA2-HD-M4.2-Windows-20261112.sha256`.
- ZIP size: 13,813,942,207 bytes (13.81 GB / 12.87 GiB); uncompressed inventory: 18,604,485,478 bytes plus its file manifest.
- ZIP SHA256: `e1f27c1f34ab3713903ecb48136e5fb6f57cf836658334ad1d2f8beae6507b85`.
- All 25,702 ZIP entries were actually extracted and verified against their hashes. The extracted source checkout is clean.

Open the extracted `source` directory in a new Windows execution conversation and paste the prompt. Verify the package before development setup; run the initial game offline through `Start-Game.cmd`. First dependency setup needs Git and network access. On completion, copy the generated return archive and SHA256 sidecar back for main integration and matched-platform regression checks.

The existing native Mac results and accepted artwork are unchanged. Windows startup/performance are not yet tested. Neither this archive nor the tooling checks establish the stable 60 FPS goal. The Mac working tree retains exactly the five pre-existing unrelated YR files; they remain uncommitted. The final desktop bytes are independently verified. Temporary staging and full verification extraction are retired after delivery, with the scripts and compact receipts retained.
