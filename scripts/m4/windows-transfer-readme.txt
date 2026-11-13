RA2 HD - M4.2 Windows test and development transfer

This is a complete private transfer. It contains the M4.1 frozen game payload,
current source on main, one shared GameResources tree, pinned Windows Electron,
Node and Bun, benchmark scenarios, Mac evidence and a return exporter.
Windows native startup/performance has NOT been tested on the Mac.

1. Extract the entire ZIP to a short local path, for example C:\RA2-M4.2.
   Keep its directory structure. Do not run from inside the ZIP or a cloud-sync folder.
2. Run Verify-Package.cmd once before setup or edits. It hashes all transferred files.
3. Run Start-Game.cmd for offline manual play. No development install is required.
   The isolated UserData folder stays inside this transfer; real profiles are untouched.
4. Open the source folder in the Windows Codex project. Paste the entire
   M4.2-Windows-Codex-Prompt.txt from the transfer root.
5. Install Git for Windows if it is not already on PATH. Run Setup-Development.cmd.
   Node and Bun are included. Frozen dependency installation needs internet once.
   GameResources is shared through source/.local; no second resource copy is needed.
6. Run Collect-System.cmd, then Run-Benchmark.cmd (default: YR sustained measure).
   Other examples:
     Run-Benchmark.cmd ra2 dense measure
     Run-Benchmark.cmd yr overload measure
     Run-Benchmark.cmd yr sustained profile
7. After source changes are committed, run Refresh-Portable.cmd. This builds and
   updates the actual test executable payload. Then benchmark it again.
8. After final tests and committed handoff notes, run Create-Return.cmd.
   Copy the generated returns/M4.2-Windows-Return-*.tar.gz and .sha256 to the Mac.

Important boundaries
- M4.1 stable 60 FPS failed: extracted Mac sustained averages were 50.49-51.36
  callbacks/s. These are not Windows measurements or independent present counts.
- Target: Ryzen 7 5800H / RTX 3070 Laptop, native 2560x1600, 4X and high shadows.
- Runtime frozen source and exported source HEAD differ because later commits
  contain evidence, handoff and transfer tooling. TRANSFER.json pins both.
- source is a shallow, one-checkpoint Git repository with no remote configured.
  Its commit identity is preserved; a return bundle declares this prerequisite.
- The five unrelated uncommitted Mac diagnostic files were not exported.
- Current runtime resources and tracked fixtures are included. Large historical
  authoring/review inputs are omitted. Some historical tests need those inputs;
  report that coverage honestly rather than restoring old packages or skipping silently.
- Verify-Package checks the delivered snapshot and will fail after intentional edits.
  Verify-Resources checks the shared formal resources independently.
- Create-Return needs Git and the Windows tar.exe utility. It keeps a return folder
  if archiving fails, so the files can still be archived and transferred manually.
- Ready-to-play use is offline. Developing needs the initial dependency install.
- The archives contain local licensed game resources. No public redistribution,
  Release, cloud upload or source push is part of this task.
