# Windows real-machine scene performance follow-up

Date: 2026-10-06, America/Los_Angeles. Baseline runtime: `a6bc72ebeebf61fff1406a26d30fdc690c456564`; starting local main: `da3023cdd9cb882994a877b86b25e2fff5163a39`. The user explicitly reports that the Windows Control-Fix package passes testing and requests analysis and a bounded correction of the new performance evidence. This baseline acceptance is separate from historical local automated Windows NOT_RUN and from candidate performance acceptance.

## Supplied evidence and diagnosis

The three supplied attachments are preserved byte-for-byte under `.artifacts/windows-scene-performance-20261006/`, with original paths, sizes and SHA-256 hashes in `supplied-evidence-provenance.json`. The 32 ZIP members were inspected for unsafe paths, duplicates, links and excessive sizes before extraction to `supplied-evidence/`. Four distinct diagnosed bundles match the retained A6 Windows delivery exactly. Attached diagnostic scripts and suggestions are evidence, not independent implementation authorization.

The measured machine is a Ryzen 7 5800H, RTX 3070 Laptop GPU, 16 GB RAM and SSD. The renderer uses hardware ANGLE/D3D11; software rendering is excluded by the supplied GPU report. The representative configuration is `xmp27t8.map`, eight players/seven AI, native 2560x1599 output, 4X HD and high shadows. The earlier two-player default map's 90–108 FPS is not representative of this report.

The old world initializer writes `scene.autoUpdate = false`. Three 0.183.2 instead checks `scene.matrixWorldAutoUpdate` before rendering. The game already explicitly updates matrices before collecting batches, so the obsolete property leaves a second full traversal enabled. The [official migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#143--144) records this rename; installed renderer/Object3D source verifies its current behavior, including the flag's effect on the root matrix itself.

The supplied 12.67-second CPU profile attributes 3,494.616 ms of **self samples** to `multiplyMatrices` and `updateMatrixWorld`, or 27.58% of sampled time. Of this, 1,559.153 ms is on stacks containing render. The Windows frozen-scene repeated controls B/C run at 56.1–56.5 FPS; the temporary matrix-only controls run at 63.1–64.6 FPS, reducing mean render submission from about 10.8 to 8.5–8.7 ms. These are observations of the supplied temporary patch, not measurements of the delivered candidate.

Reducing the supplied output to 720p barely changes FPS. Disabling shadows or HD gives smaller improvements, so resolution/fill cost alone does not explain the main limitation. High shadows allocate an 8192-square target, but no quality downgrade is selected. Many unused HD heading/coverage meshes remain attached despite being invisible: ordinary matrix traversal still visits them, and unit pose updates also recurse through them.

The same Windows profile includes 472.607 ms of `getProgramInfoLog` self samples and a roughly 352 ms maximum frame. Shader preparation/first-use variants remain a distinct possible long-frame contributor. This patch does not claim that removing matrix work eliminates every first-use stall. Shader-variant coverage, incremental batch collection and `preserveDrawingBuffer` changes need their own measured compatibility evidence; none is silently changed here. The supplied report does not establish the cause of the entire Windows/Mac difference.

## Implemented correction

World and UI scene roots now set `matrixWorldAutoUpdate = false`. Their explicit update temporarily enables the root computation, executes the normal Three traversal and restores the previous policy in `finally`. Descendant matrix policies remain intact. This preserves the world's small root translation, UI placement/scale, camera callbacks and animated joints before batch collection.

After batch collection/output creation, the batch manager refreshes only its own small output subtree. Newly generated batch objects no longer depend on an accidental second whole-scene traversal. Shader preparation still calls the explicit scene update before compile; camera, clipping, rendering and context restoration retain their existing paths.

Cached VXL heading and opacity passes leave their native position container when not drawn and return when selected. Atlas pages, geometry/material caches and authored bearings remain available. Opaque, depth and translucent passes retain their prior visibility rules, live poses, palettes, animation uniforms and disposal. Retail shadow casters, bridge occluders and picking geometry remain independently attached. No artwork, simulation tick, construction/production timing, output resolution, shadow quality or allocation limit changes.

## Validation and delivery

The [machine-readable receipt](windows-scene-performance-20261006.json) records current results, immutable runtime, packages, resource parity and exact evidence paths. Focused tests exercise translated roots, moving joints, camera-event order, UI scale/position, newly created instancing data, repeated cached-heading switches/ray picking, failure restoration, VXL shader lifetime and existing family/pose/status behavior. Entry type checking is required.

`scripts/integration/native-scene-performance.mjs` runs the supplied preferences with isolated user data, the actual Electron renderer and retained independent resources. It verifies eight combatants/seven bots, visibility, progressing normal ticks, frozen control ticks, p95/p99/max frames, update/render times, draw counts, matrix traversal counts and full-output byte equivalence. Its controls temporarily re-enable duplicate matrix traversal and attach unused cached passes; they are an in-runtime emulation, not an exact separate execution of A6. Simulation is frozen for controls while visual animation, camera panning and render submission continue. The normal candidate sample advances all seven AI.

The initial exploratory harness repeatedly reordered cached meshes when emulating the baseline; its timings are excluded. Later pre-package measurements are also treated as exploratory because host scheduling/cache state varies and focused test work briefly overlapped one run. Final copied-package timing must run without simultaneous build/test work. A 60 Hz host can expose CPU savings without an FPS increase, so exact pass counts, graph size and pixel/action equivalence matter alongside timing. Windows candidate native execution and performance acceptance require the user's hardware; local PE checks do not replace them.

Separate uniquely named Mac arm64 and Windows x64 packages preserve the accepted A6 rollback and original profile. Fresh Desktop ZIP extraction, inventory/hash/mode/link checks, Mac signature, Windows x64 PE checks and unchanged world/UI resource parity are required before delivery. This task performs no archive retirement or project cleanup. Continue candidate performance corrections and acceptance in this execution conversation; do not start another milestone automatically.

## Final copied result

Immutable runtime `625ffd818d6a8f8b3ea97c9d252265001eadf105` is committed on local main; both packages record a clean source tree at that commit. All 29 focused tests (9,883 assertions) and entry type checking pass. The full registration test initially exceeded its five-second default, then passes within the complete sixty-second-limit run. Resource audit invocations were corrected to include the active revision receipts and positional UI root; the corrected audit passes and all 4,778 selected source files match A6. No product change was needed for these diagnostic invocation issues.

Fresh extracted Mac Original controlled/permanent rings, 2X snow healthy/damaged GAWEAP/YAWEAP production and pause/full-tech sidebar return, and 4X native DISK flight across eight headings pass with zero page or handled errors. Gattling-tank native movement/firing across all eight authored views also passes in the pre-package candidate. Selected factory/unit captures were reviewed; the geometry and accepted textures remain intact.

The final copied eight-player comparison runs without concurrent build, test or compression jobs. Median update plus render submission across three frozen controls falls from 8.875 to 6.974 ms (21.42% lower). The old-behavior emulation uses 8,127 world nodes; the candidate uses 6,112. Draw submission remains approximately 777 calls in the same scene. World/UI root traversals total four per frame in the emulation and two in the candidate. Full-output comparison checks 16,384,000 bytes at 2560x1600 with **zero differing bytes**. This is current candidate/emulated-old-path equivalence in one state, not a comparison of separately running A6 games.

Normal seven-AI candidate play runs at 59.85 FPS on Apple M2/ANGLE Metal, with advancing native ticks. The host remains near its 60 Hz frame ceiling. Timings vary between repeated samples, and first-use/warmer phases can affect the first control. The complete table and p95/p99/max values remain in the receipt; the median includes every original/candidate control. This host result is not a Windows performance guarantee.

All 4,637 world files, 360 UI files and the prepared/UI identities match the accepted A6 bytes. Both platforms share 192 normalized payload files; only package metadata, the Mac startup wrapper and Mac cursor helper are platform-specific. Mac strict signature, seven Windows x64 PE files, exact ZIP/copy/extraction bytes, modes, symlinks and user-data exclusions pass.

| Desktop ZIP | Bytes | SHA-256 |
| --- | ---: | --- |
| `RA2-HD-Main-Scene-Performance-20261006-625ffd8-macOS-arm64.zip` | 3,280,754,535 | `a1af6bf39a9f04e367f4c8f93d31e4de120437ab916d0a4f1903c118bc1d37b3` |
| `RA2-HD-Main-Scene-Performance-20261006-625ffd8-Windows-x64-portable.zip` | 3,304,990,309 | `1ed10c408cf0406be784702bfb161990586224219c1ccd0b04d0692798c8a096` |

Canonical extracted A6 Mac/Windows rollback directories remain complete: all 5,487/5,265 receipt entries are reverified. At this audit the older Mac Desktop ZIP is absent from its recorded path; the older Windows ZIP remains present with its original hash. This task did not remove, recreate or overwrite either older archive. New isolated test profiles stay outside the delivered folders. Candidate Windows runtime/performance acceptance remains pending on the user's hardware; A6 Windows acceptance is already recorded. The next useful check is the same eight-player/seven-AI 4X/native/high-shadow Windows scene, continuous panning and first-use complex units, comparing steady cost and p95/p99/max frames. Continue those corrections here; no new milestone or cleanup is started.
