# M1.5 personal transfer packages

Latest delivery: [R3 Mac and Windows ZIPs](m1-5-r3-fullscreen-loading-speed.md#desktop-transfer), with fullscreen stability, loading layout and five solo speeds. The original package record below is historical; two original Desktop app ZIP paths are no longer present, while their workspace copies and the shared Desktop resource ZIP remain verified.

The user requested Desktop ZIPs for personal iCloud transfer and an install-free Windows build on 2026-09-19. This extends M1.5 packaging scope without accepting its outstanding native-input/visual gate.

## Delivered archives

| Desktop file | Bytes | Purpose |
| --- | ---: | --- |
| `/Users/Aone/Desktop/RA2-HD-M1.5-macOS-arm64.zip` | 130273982 | The unchanged, validated Apple Silicon application |
| `/Users/Aone/Desktop/RA2-HD-M1.5-Windows-x64-portable.zip` | 159395940 | Extract-and-run Windows x64 test folder |
| `/Users/Aone/Desktop/RA2-HD-M1.5-Local-Resources.zip` | 181219109 | Separate runtime resources shared by either platform |

All three archives passed CRC and content verification. The Desktop copies are SHA-256 checked against the staged archives. iCloud upload/completion was not verified and sync settings were not changed.

## Starting on Windows

Extract the entire Windows ZIP into a writable folder, then double-click `Red Alert 2 HD M1.5.exe`. No installer, Node/Bun installation, Chrome or development server is needed. Keep the accompanying DLLs, `resources` and `locales` with the EXE.

On another computer, also extract the shared resource ZIP. At the resource-selection screen, choose its `RA2-HD-M1.5-Local-Resources` folder. In Options, choose HD for Conscript, Power Plant (temperate) and Rhino as desired. Conscript/Power Plant changes apply next match; Rhino supports live switching. Resolution remains independent.

The Windows entry creates `UserData` beside the EXE for settings and registration; no Mac user profile is included. Its environment override remains available to disposable test harnesses. Moving the external resource directory can require choosing it again. The archive includes `START-HERE.txt` with these instructions.

Status: `PACKAGED_STATIC_CHECKS_PASS / WINDOWS_RUNTIME_NOT_RUN`. No Windows machine or Windows execution environment was used. Startup, graphics, input, fullscreen, sound and performance on Windows await the user's test. This is an unsigned personal test folder package, not an installer or public release. No Windows programs from the retail installation were executed.

## Source and preservation

The Mac archive wraps the exact delivered app at `.artifacts/m1-5/build-2026-09-19T06-12-29-587Z/Red Alert 2 HD M1.5.app`, runtime checkpoint `7ab7527`. All 433 recorded bundle entries were reverified, including symlink targets and executable permissions in the ZIP. The original app remains in place.

Windows uses the exact 163-file application payload from that app, checked byte-for-byte before adding only `desktop/portable.mjs` and changing the package entry point. The web/game runtime, settings, protocol security and accepted asset identities are unchanged. Its Electron runtime is official `44.4.0` `win32-x64`, verified against the release's `SHASUMS256.txt`; PE machine type is `0x8664`. All runtime libraries/locales/licenses are retained. This follows [Electron's documented manual packaging layout](https://www.electronjs.org/docs/latest/tutorial/application-distribution), using the [pinned official release](https://github.com/electron/electron/releases/tag/v44.4.0).

The separate resources archive copies only files registered by the validated retail/support and HD allowlists plus required manifests. All artwork/archive bytes retain their hashes. Portable core/support manifests omit old machine-specific absolute paths and unused entries; the original manifests are unchanged. The copied resource folder passes the real desktop profile and HD validators with all three families available. Raw art, the original installation directory, historical evidence, caches and player profiles are excluded. Resources remain external to both applications and outside Git.

Evidence is under `.artifacts/m1-5/transfer-2026-09-20T00-19-21Z/`: official runtime/checksum downloads, `packaging.log`, and `packages/transfer.json` plus `packages/desktop-copy.json`. These record exact file inventories, sizes, SHA-256 hashes and the unverified Windows/iCloud statuses. No old application, artwork, import or profile was modified. No push or publication occurred.

## Reproduce

Download `electron-v44.4.0-win32-x64.zip` and `SHASUMS256.txt` from the pinned official release into a new ignored staging directory, then run from the repository root:

```sh
python3 scripts/m1/package-transfer.py \
  --artifact .artifacts/m1-5/build-2026-09-19T06-12-29-587Z/artifact.json \
  --electron-zip /absolute/staging/electron-v44.4.0-win32-x64.zip \
  --checksums /absolute/staging/SHASUMS256.txt \
  --output /absolute/staging/new-packages
```

The output directory must not exist. The script verifies the retained Mac bundle, archives it with macOS `ditto`, assembles/checks the Windows folder, and copies/checks the minimal external resources. It does not write Desktop files automatically or manage iCloud.

Keep Windows feedback and M1.5 acceptance in this task. No new artwork, campaigns or additional platform work is started automatically.

The updated Mac and Windows R2 archives are documented in [the desktop feedback report](m1-5-desktop-feedback.md). Original ZIPs and external resources remain unchanged.
