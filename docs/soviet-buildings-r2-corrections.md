# Soviet Buildings R2 corrections

The user accepts the delivered static models and reports four defects: stretched construction, shifting NAPSIS/TESLA upper layers, a crash when Soviet infantry evacuate civilian buildings, and a stall near the end of map loading. Animation and gameplay acceptance remains open in this task.

## Changes

- Sixteen construction families now use fixed-scale authored parts translated behind stationary ground/socket planes. Early native foundation coverage avoids rectangular crop edges. Native frame counts, trim geometry, reverse demolition, timing and shadows remain unchanged. NAPOWR and wall resources are retained.
- NAPSIS antenna poses register to the shaft socket instead of their changing silhouette centroid. The moving mast belongs to the active layer; the base remains fixed. TESLA activity contains local electrical material and phase intensity, without a second independently registered mast. Damaged states retain native frame timing.
- `PlayerList.getCivilian()` now compares the numeric `SideType.Civilian` used by parsed country rules. The previous string comparison returned no owner and crashed while returning an evacuated house to neutral ownership. Successful `EnterBuildingTask` entry now completes its task, allowing evacuated infantry to scatter, move and re-enter.
- Tile pooling uses typed-array source references, numeric hashes and exact collision comparisons. It avoids per-tile byte arrays, strings and per-pixel array views. Sprite pixels, owner channels and lookup semantics remain lossless. Loading progress reserves a visible interval for complete HD-family loading. Relevant Chinese crash/resource messages no longer direct users to a public account; game errors include a short error detail.

No new source artwork was generated. Non-construction state PNGs are copied byte-for-byte, except the explicitly corrected NAPSIS layer partition/scan and TESLA effects. Five hundred and two accepted artwork/reference files pass SHA-256 preservation checks. Old packs and apps remain at their existing paths. The new app uses `RA2 HD Soviet Buildings R2`, and automation uses isolated artifact-local profiles.

## Evidence and delivery

The app is `.artifacts/soviet-remaining/build-2026-09-21T22-12-38-837Z/Red Alert 2 HD Soviet Buildings R2.app`. Its exact source snapshot is in the adjacent `artifact.json` and `source.json`. The new selections use revision 4 for the earlier four families, revision 3 for twelve remaining families, and the unchanged revision 1 wall. These revision numbers describe independent pack histories.

The combined delivery is `/Users/Aone/Desktop/RA2-HD-Soviet-Buildings-R2-macOS-arm64-App-Resources-Review.zip` (677,479,853 bytes; SHA-256 `4e930687dd4e1a5c4d2c44d3baef4a4da8101af05dcd0b526c8574a12db8a4e9`). It includes the app, 429 external resource files and the complete review/dashboard. Every ZIP member, executable permission, symlink and resource checksum passes validation. The desktop copy matches the validated archive. Implementation checkpoint: `3db57df`; packaging and desktop receipts are in `desktop-transfer-r2/`.

The local R1 ZIP retains its original checksum. Its previous Desktop pathname was absent at the final check; this task neither removed nor replaced it. The four historically observed old-profile differences remain separately recorded as strict equality failures, while protected payload preservation passes.

- 56 focused tests and 1,340 assertions pass; entry-point TypeScript checking passes.
- The reported default first map resolves to `mp02t2.map`. R1 crashes after Conscripts evacuate existing `CAMIAM01`; the captured stack reaches `changeObjectOwner` with no civilian owner. The exact final R2 app passes five cycles with the same three Conscripts, restored neutral ownership, renderables and subsequent re-entry. Infantry were spawned near the map's existing house as an explicit test fixture; occupy and evacuate use unchanged native orders.
- Fresh-profile local loading measurements were 24.058, 24.101 and 26.525 seconds for R1; the final R2 measurement is 7.215 seconds. These are same-host elapsed measurements, not a cold-disk benchmark. An earlier engine-only R2 test with R1 resources measured 7.413 seconds.
- Actual-app controller captures cover all seventeen review families and 1,492 animation frames, with matched Original/HD geometry and shadow checks plus owner-color fixtures. Combined optional GPU allocation is 188.46 MiB under the unchanged 256 MiB cap.
- The portable review is `.artifacts/soviet-remaining/complete-review-r2/Soviet-Buildings-Review.html`. The validation dashboard records current checks, historical evidence and unverified limits separately.

The runtime capture combines fourteen completed families from `runtime-complete-r2` and three from `runtime-complete-r2-first-batch`, all using the same app. The first capture stopped on a refinery storage-level visibility assertion: the fixture requested an inactive layer. The supplemental run captures the changed construction/reverse sequences and matched static/owner states; unchanged earlier production animation remains accepted and byte-preserved. This fixture failure is retained, not reported as a game crash or silently relabeled.

Other retained failures include the initial garrison fixture outside sight range, an engine-only fix that exposed the stale entry task, construction candidates with changing stage proportions or rectangular early crops, a turret-review canvas mismatch, and an export that would have re-inferred previously corrected owner masks. None is selected for delivery.

Final visual quality, physical-input behavior, full defense/superweapon gameplay and platform coverage beyond the local Mac remain user review items or previously documented limits. Continue corrections and acceptance in this task; do not create a new task automatically.
