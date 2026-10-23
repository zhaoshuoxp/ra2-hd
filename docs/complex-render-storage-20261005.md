# Complex first-use rendering and Storage repair

Runtime `ebe4798b96ca284f322c6f289ced6f0a7dc23f4a` fixes first-use native geometry work, advances building preparation for accelerated construction, and restores Storage navigation. Icon/map-entry latency and improved startup speed were accepted before this correction. Windows native retesting and final user acceptance remain pending.

## Findings and changes

The delivered 6db0fb5 Mac package reproduced approximately 162 ms first-use DISK frame intervals; CPU profiling attributed about 146 ms to native meshing. Ready HD atlases did not remove this synchronous native work, which is still needed for native geometry, shadows and fallback. The identical mesher now runs in a separate owned worker alongside HD pixel preparation. The native cache receives the original section geometry; DISK and multipart tank attributes, indices and bounds compare exactly. Cancellation and worker teardown are tested.

Instant construction completes the sidebar queue before a cold complete building family is ready. The initial 4X reproduction changed NAMISL to HD about 308 ms after its first construction frame, versus about 121 ms for NAINDP. The animation itself was unchanged. Current visible building/voxel choices now prepare with reclaimable leases; hovered and queued items take priority. Background work yields at validated page boundaries. Stationary pointer focus follows asynchronous cameo publication instead of being lost until the next mouse movement. Checked building metadata reads overlap and one-page prepared-payload lookahead reuses the bounded cache. Atomic families, source hashes, budgets, native ticks and animation remain intact.

Desktop resources do not expose a browser-import directory handle. The missing-handle Storage branch returned engine JSX to React and caused React error 31 plus the global blocking overlay. It now renders a valid informational React panel and a Back button; the existing browser folder explorer remains available when its directory handle exists.

## Focused validation

The suite passes 70 tests and 9,383 assertions across 15 files, including native geometry equivalence, worker disposal, preparation priority/cancellation, stable hover publication, checked-cache corruption rejection, building families and existing UI/VXL contracts. Entry and worker type checks pass.

| Package / density | NAMISL first HD / max frame | NAINDP first HD / max frame | DISK first HD / max frame |
| --- | --- | --- | --- |
| 6db0fb5 baseline 4X | No / 208.00 ms | No / 28.29 ms | Yes / 182.63 ms |
| desktop-complex-4x | Yes / 199.23 ms | Yes / 46.67 ms | Yes / 96.03 ms |
| desktop-complex-2x | Yes / 39.50 ms | Yes / 30.62 ms | Yes / 43.09 ms |

The final measurements include sidebar navigation, fixed 600 ms pointer dwell, native instant building queues and one-second native unit production. No HD-readiness wait or modified production/animation timing is used. Screenshots are outside the timed loops. These are single Mac observations, not Windows measurements. The corrected copied app also passes Storage entry and return without an error overlay, plus Yuri 2X starting-unit, no-scroll trainer cameo and HD Off regressions. The broader 4X defense-page interval still reaches 199.23 ms, versus 208.00 ms in the old package; this is not a zero-stall result. The narrower earlier diagnostic measured DISK at 53.63 ms after queue start, but the final 96.03 ms includes sidebar preparation and is the selected delivery observation.

Earlier failures and intermediate timings remain in the artifact directory and companion receipt. Native Windows performance/input and final user acceptance are unverified. Unseen or over-budget instant requests can still require complete Original fallback; this repair does not block simulation waiting for optional artwork.

## Delivery and preservation

- `/Users/Aone/Desktop/RA2-HD-Render-Storage-Fix-20261005-ebe4798-macOS-arm64.zip` — 3,292,559,334 bytes; SHA-256 `7f1d95dc5874f37330879877afb32b84333620a4fb331e3036ed24befb9df4e4`.
- `/Users/Aone/Desktop/RA2-HD-Render-Storage-Fix-20261005-ebe4798-Windows-x64-portable.zip` — 3,316,868,800 bytes; SHA-256 `b54224b986985cb52684c85929c3baecabbb6e3f0e8fe17d0990eb55e8d32cef`.

Both archives are independently copied, freshly extracted from Desktop and checked against their complete file inventories, hashes, modes and applicable symlinks. The Mac signature verifies; all seven Windows PE binaries are x64. Each package retains exact accepted bytes for 4,637 world and 360 UI files, 490 UI entries and the unchanged prepared contract. Existing profiles are excluded and previous deliveries are preserved.

Extract the whole Windows folder and launch `Launch-Isolated-Review.cmd`. Retest first DISK production, rapid NAMISL/NAINDP construction and Settings Storage entry/return at the usual graphics density. Keep acceptance or corrections in this conversation. No push, publication, cleanup or new artwork is included.
