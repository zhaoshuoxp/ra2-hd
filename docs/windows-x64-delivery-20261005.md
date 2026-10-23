# Windows x86-64 portable test delivery

This package carries the same verified gameplay bundle as the macOS DISK repair (`c7e4c0e`), including continuous refinery payments, shared original DISKRAY animation and exact centered hovering. Windows desktop integration is `b2463fa`. See `windows-x64-delivery-20261005.json` for the delivered archive hash and final verification results.

The existing desktop discovery assumed the macOS `.app/Contents/Resources/app` layout. A shared layout helper now resolves Windows `resources/app` relative to the EXE directory while preserving the Mac sibling path. The Windows entry point uses the package's `Review-Profile` and `RA2-HD-UI-Resources`; complete world-resource registration remains mandatory for the bundled delivery. No gameplay or accepted artwork changed.

The portable folder includes the checksum-verified official Electron 44.4.0 Windows x64 runtime, copied game files, all selected world/UI resources, licenses, a CMD launcher and `START-HERE.txt`. macOS executable helpers, prior user profiles and unrelated review artifacts are excluded. Existing Mac deliveries are preserved.

## Host checks

- Windows drive-letter, UNC, spaces-in-path and unchanged Mac discovery tests pass, together with focused desktop/control tests: 7 tests, 40 assertions.
- Seven PE executables/libraries have machine type `0x8664` (AMD64). The vendor runtime ZIP matches its retained official SHA-256 manifest.
- All 160 web files match the verified Mac game payload. Fourteen copied desktop modules pass syntax checks; the package entry resolves to the Windows portable wrapper.
- All 4,778 registered resource files match the prior delivery, retaining 33 C selections, 140 D runtime files, 490 UI entries and the 459-binding/1,224-page prepared contract.
- The copied startup module reports complete HD registration on the host, with no missing families. This checks the package's actual resource bytes and module logic, not Windows execution.
- Package filenames have no Windows-reserved components or case-insensitive collisions; the longest relative path is 118 characters. Final ZIP and Desktop extraction verification are recorded in the receipt.

## Windows validation left to the user

No Windows environment is available on this host, as confirmed by the user. Windows executable startup, graphics drivers, rendering, audio, fullscreen, pointer behavior and gameplay remain `NOT_RUN`. macOS gameplay evidence does not certify those Windows behaviors.

Extract the entire ZIP into a writable folder and run `Red Alert 2 HD.exe` or `Launch-Isolated-Review.cmd`. Keep all files and both resource folders together. No separate Node, Bun or browser installation is needed. The application creates `Review-Profile`; retain its `last-session.json` if reporting a failure. Check both editions, Original/2X/4X, then refinery/power drains and cancellation. Continue Windows feedback in this conversation. No installer, custom application signing or publication is included.

## Desktop delivery

Archive: `/Users/Aone/Desktop/RA2-HD-Main-Disk-Fix-20261005-Windows-x64-portable.zip` (3,316,683,537 bytes).

SHA-256: `14011df566d425de418961d9f0457c314f8b2b882de427248d7365f5bb11bc18`.

The actual Desktop ZIP and its fresh extraction pass exact checks for all 5,260 files. The extracted EXE and six DLLs remain x64, with no user profile included. Status: `DELIVERED_HOST_CHECKS_PASS_WINDOWS_RUNTIME_NOT_RUN`.
