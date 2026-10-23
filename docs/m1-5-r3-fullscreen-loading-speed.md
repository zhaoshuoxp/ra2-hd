# M1.5 R3: fullscreen stability, loading layout and five solo speeds

Historical validation record: the later [R5 adjustment](game-speed-r5.md) reduces all five solo rates by 25%. The original measurements below are retained as evidence for their original build.

Status: native focused checks PASS; final user acceptance PENDING. The user confirmed the earlier five R2 fixes, then reported repeated menu animations on first fullscreen entry, a small loading picture, and requested a simpler speed scale. Their final speed correction selects five tiers, with 120 and 150 as the two highest.

## Resulting behavior

- First fullscreen entry keeps the current Options screen and live controls. Identical viewport notifications are ignored; native fullscreen notifications only publish state changes. Menu layout updates no longer leave/re-enter the current screen, and width-only changes retain sidebar buttons instead of replaying their animations.
- Existing loading artwork scales uniformly to cover the viewport, with excess image cropped at the edges. Text and progress indicators scale uniformly inside a safe 800×600 reference layout. No new artwork or loading delay is added.
- Single-player lobby and paused Options expose five tiers: **30, 60, 90, 120, 150 ticks/second**. Tier 3 (90) is the default, the midpoint between R2's 60 and 120. The new `soloSpeedTierV1` preference remembers later choices separately; existing seven-tier host settings are preserved for multiplayer. No unit, weapon, simulation rule or network/replay speed mapping changes.
- Retain R2 Conscript coverage, all accepted HD artwork, the 900-high battlefield presentation and current HD selections. No imported resource bytes change.

## Reproduction and native checks

The preserved R2 app reproduced six Options exits/entries during first fullscreen selection. Three additional paired window/visual-viewport resize notifications brought that to 15. Evidence: `.artifacts/m1-5/r3-baseline-1789866988008/result.json`. This establishes redundant navigation in the resize path; it does not claim every platform's spontaneous infinite-loop trigger was isolated.

The final R3 app passed first fullscreen entry followed by **100 paired resize notifications**, with **zero screen exits or entries**, the same screen instance, settled sidebar animation and usable Back navigation. Evidence: `.artifacts/m1-5/r3-native-1789867227276/result.json`.

| Check | Result |
| --- | --- |
| Entry typecheck | PASS |
| Automated regression | PASS: 103 tests, 19,258 assertions across 29 files |
| First fullscreen / repeated notifications | PASS: 3840×2160 output, no menu re-entry, controls usable |
| Loading view | PASS: full-viewport native 4K screenshot; text remains within screen |
| Lobby tiers / default | PASS: five positions, default tier 3, actual initial rate 90 |
| Measured rates | 29.97, 59.93, 90.38, 119.88, 149.91 tick/s over four-second samples |
| Paused Options | PASS: five positions; simulation stays paused during selection and resumes at chosen 90 |
| Preferences | PASS: solo choice saved separately; prior host-speed value 6 preserved |
| Script / WebGL errors | None in the focused native run |

Screenshots: [fullscreen Options](../.artifacts/m1-5/r3-native-1789867227276/fullscreen-options.png), [five-tier lobby](../.artifacts/m1-5/r3-native-1789867227276/five-speed-lobby.png), [loading screen](../.artifacts/m1-5/r3-native-1789867227276/fullscreen-loading.png). The loading capture holds completion of the normal loader in the harness only so its actual view can be inspected. An earlier harness missed this transient screen; its failed recording remains under `r3-native-1789867032831`. The hold is absent from the app.

## Artifact and preservation

Final application: `.artifacts/m1-5/build-2026-09-20T01-19-50-973Z/Red Alert 2 HD M1.5.app`. It is an independent local macOS arm64 development app with pinned Electron 44.4.0. Build-time source and bundle inventories are adjacent. Normal `dist` and prior apps remain intact; all tests use disposable profiles.

Preservation checks passed for both prior delivered bundles (867 entries), all three currently present prior Desktop archives, all five retained workspace archives and all 61 registered resource files. Two original pre-R2 Desktop ZIP paths were already absent at this check; their workspace copies remain hash-verified, and this task did not recreate or remove those Desktop files. Evidence: `.artifacts/m1-5/r3/preservation.json`.

Runtime checkpoint: `3e2eb26b806013344519bdaa8cdef28d4d4a1d37`. The build predates this commit; the artifact audit verifies all 1,337 recorded runtime/build inputs against it byte-for-byte, plus 433 bundle entries, 163 payload files and the web allowlist/exclusions. Evidence: adjacent `implementation-binding.json` and `.artifacts/m1-5/r3/artifact-audit.log`.

Three consecutive native game/menu cycles passed teardown checks, with Rhino disposed, the game cleared and stable retained menu counts of 11 geometries, 26 textures and 2 programs. Evidence: `.artifacts/m1-5/ui-1789867315989/result.json`. Resolution 2560×1440 persisted across two app launches and the fullscreen shortcut round trip passed: `.artifacts/m1-5/display-persistence-1789867582192/result.json`. These bounded checks do not establish prolonged-battle performance or human input acceptance.

## Desktop transfer

| New Desktop archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `RA2-HD-M1.5-R3-macOS-arm64.zip` | 130276334 | `350fb65ae1724e3f19944493bc7e828e0ab379b97186797263058e2757f5d7af` |
| `RA2-HD-M1.5-R3-Windows-x64-portable.zip` | 159398352 | `a91466c00b86cdb72e8e90c82fc26b67a95a3f51294f66a85b7aaa6fedf34a53` |

Both archives passed content/CRC verification and the Desktop copies match their staged SHA-256 hashes. Existing R2 Desktop packages and the external resource ZIP remain untouched. Receipts: `.artifacts/m1-5/feedback-transfer-r3/transfer.json` and `desktop-copy.json`. Windows reuses the checksum-verified official Electron 44.4.0 x64 runtime; its application payload matches this Mac candidate before the portable entry adaptation. R3 Windows execution is NOT RUN; iCloud sync completion is UNVERIFIED. Reuse the existing external resource directory; do not replace a previous portable `UserData` folder. Stop at hands-on acceptance of first fullscreen entry, loading layout and the five speeds; continue corrections in this task.
