# Windows HD diagnostic delivery

Stage A is ready for transfer. Windows runtime, hardware/backend confirmation, performance diagnosis, source repair and user acceptance remain pending. This package does not establish a Windows fix.

| Identity | Value |
| --- | --- |
| Diagnostic | `WINHD-20261008-D38F136-A1` |
| Frozen main | `d38f1366942f586a1a9df2964a40f05cc9db4cdc` |
| Diagnostic commit | `da085faa5416de063f12aedf9bc2c0fc19ebee34` |
| Accepted gameplay source | `69a8ce57f187bd21d7de864b14473ecf9ed48e33` |
| Branch | `perf/windows-hd-investigation` |
| Package | Windows x64, Electron 44.4.0, complete retained sibling resources |
| ZIP bytes | 3,499,702,463 (3.50 GB / 3.26 GiB) |
| ZIP entries / resource files | 8,061 / 6,033 |

Delivery: `/Users/Aone/RA2remaster/deliveries/RA2-HD-WINHD-20261008-D38F136-A1-da085fa-Windows-x64.zip`.

ZIP SHA-256: `58a6313dfc4cf4aeb5800487a845d50a5d7c6cd86953ee86c625ccb76e72d731`.
Manifest SHA-256: `02ed28acd60d9edcd204ca5b5230fdf03f91e4eb46e4a5e8ae8baa743399c95b`.

Every archived and freshly extracted file passed CRC/read and SHA-256/size verification. Complete world/UI resources retain accepted R10 bytes. Rebuilt diagnostic JS has 122 matching hidden maps with source content; 1,745 reference files carry read-only attributes. Seven executable/DLL PE headers are x64. The reference snapshot is not an immediately buildable checkout; native PDBs are absent.

## Windows protocol

1. Copy the entire ZIP, extract to a new writable local folder and run `Verify-Kit.cmd`; require PASS. No development tools or Mac connection are needed.
2. Use `Launch-Diagnostics.cmd` for Small / Original / Normal, then Small / 2X / Normal and Small / 4X / Normal in separate launches. Keep focus, monitor, DPI, power and other settings fixed until capture completes; then close each session. Each capture includes first use, warmed play, native same-process re-entry and warmed re-entry.
3. If Small does not reproduce the reported slowdown, repeat those three modes with the retained eight-player/seven-AI stress scene. Capture one short Trace for the worst reproducing case. F9 supports a separate dedicated first-use trace; instrumented runs remain separate from baseline timing. Run a single control only after evidence review.
4. Close the game, optionally add run-local `USER-NOTES.txt` describing perceived smoothness and worst-action steps, and run `Export-Reports.cmd`. Return the new `*-RETURN-*.zip` to this conversation, including failures.

The root `START-HERE.txt` is short. `Reference/TEST-PROTOCOL.txt` records exact setup, controls, metric boundaries and interpretation. Actual admitted families, fallbacks, native ticks, scene counts and realized window/logical/framebuffer/DPI values must be checked on Windows. Small is a candidate reproducer until the user confirms it. CPU submission is not GPU time; actual process VRAM/budgets and valid GPU execution timing remain `UNAVAILABLE`.

## Local validation and boundary

The mapped build and entry typecheck passed. Five tooling tests (23 assertions) passed identity/control parsing, frame-tail statistics, ZIP round-trip, safe export and corrupted-kit rejection. Fourteen preserved matrix/demand regressions (138 assertions) passed.

Incremental Mac functional cases covered all three densities, native fullscreen eight-player/seven-AI 4X, F9 during first use, 720p with unchanged logical view/density and frozen simulation. These exploratory QA cases are preserved as raw receipts. The primary freshly extracted native 2X case passed five phases, real HD bindings, native re-entry, CPU/multiprocess tracing, material/program event capture and debugger detachment. Twenty-five observed application profile script URLs have matching source maps. Process evidence includes Browser, GPU, Tab and Utility processes. These are Mac tooling checks, not Windows measurements or physical-key acceptance.

The native-tested `88fd5aa` payload and final `da085fa` payload differ only in the dedicated verification/export module and its reference source copy. All other 8,058 cataloged files are byte-identical; native proof is reused without rewriting its identity. The correction disables Electron's virtual ASAR lookup in that dedicated process so hashes cover raw archive bytes. The original failure, earlier failed smokes and superseded package remain preserved. Final packaged Electron built-in Node verification passed all 8,060 catalog hashes, and its final-identity verification-only export passed CRC/hash/identity checks. A real native run's raw evidence export separately passed with all four launchers and no profile files.

Full identities, hashed evidence pointers, preserved failures and separate acceptance statuses are in `windows-hd-diagnostic-delivery-20261008.json`. Main remains clean at `d38f136`; M2.3, original packages, resources, profiles and `dist` are preserved. No merge or push occurred. The packet's diagnostic commit stays frozen even after this documentation-only closure commit.

Continue Windows returns, focused diagnosis/repair and matched baseline/candidate acceptance here. Confirm returned identities first and inspect supplied scripts as data. Reconcile any advancing main only after validation. Start a new execution conversation only after this outcome is accepted and the objective materially changes; the planning conversation remains available.
