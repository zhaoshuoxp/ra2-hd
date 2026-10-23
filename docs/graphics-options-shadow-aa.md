# Graphics choices and SHP shadow antialiasing

The graphics page now has one HD choice: Original, 2x or 4x. The unused Models High/Low control is removed. Default remains 4x. Original disables authored HD bindings, while 2x and 4x enable the corresponding unit/building atlas density. Existing preference fields and the legacy model-quality slot remain readable; all three choices survive save/reload. Complete application of a changed choice still requires a new match. The dynamic-shadow quality control remains separate.

## Cause and correction

HD body resolution did not increase the resolution of retail shadows. There are two distinct SHP paths:

- Buildings and some SHP units use separate binary indexed shadow frames. Nearest sampling enlarged each native pixel into visible steps. Their existing alpha-test threshold also rejected fractional coverage.
- Many infantry sprites contain palette-12 ground shadows inside the visible frame, with an empty separate shadow frame. Existing accepted exports composite these black ground pixels beneath the authored figure as opaque RGBA pixels. Smoothing only `ShadowRenderable` therefore leaves infantry shadows unchanged.

The correction reconstructs shadow coverage with a bounded quadratic kernel in native-pixel coordinates, clamped to the current frame. Separate shadows use a dedicated material with a fractional-coverage alpha threshold. Embedded HD shadows require both the native palette-12 index and an exactly black, unremapped HD sample; colored boots, black body detail using another native index, and owner-color pixels remain body artwork. Body coverage and ground coverage combine in the existing HD passes. Original infantry preserves nearest body sampling and its native single batch draw, except the already-filtered Conscript path. Nonbatched sprites preserve their native depth-writing and render classification through premultiplied custom blending.

Body filtering keeps its one-texel minimum. Camera, geometry, animation, selection, rules, frame offsets, original blob-shadow placement and native shadow opacity are unchanged. No artwork, pack, manifest, legacy VXL shadow-mask fix or accepted resource file is edited. Tanks retain their existing realtime model-shadow path; raising dynamic-shadow quality never increased the resolution of embedded SHP shadows.

## Incremental evidence

Evidence root: `.artifacts/graphics-options-shadow-aa/`. Earlier failed diagnostics remain retained and are not acceptance evidence.

| Runtime | Coverage | Result |
| --- | --- | --- |
| `runtime-package-4x-v1` | Copied Mac app, YR temperate, default 4x | PASS |
| `runtime-ra2-snow-2x-v1` | RA2 snow, actual 2x bindings | PASS |
| `runtime-yr-original-v1` | YR temperate, all tested authored HD bindings disabled | PASS |

The focused roster is E1, E2, Tanya, GGI where available, DRON, GAPILE, NAPOWR and the HTNK control. Every comparison holds the game tick and camera fixed. SHP shadows change in each mode; HTNK crops remain pixel identical. GI/GGI movement and deployment use native orders, and the selected body frame still maps to its native shadow frame or embedded palette-12 pixels. The default-4x package includes a 3840x2160, 30 fps native movement/deployment recording.

GPU fixture checks prove fractional shadow coverage, zero neighboring-frame leakage, unchanged solid-interior opacity, equivalent merged/unmerged output and correct faded opacity. A separate HD fixture preserves black body detail, dark boots over the old shadow index and remapped body pixels. Nine focused tests / 157 assertions, entry type checking and whitespace checks pass. Previously accepted comprehensive bridge/paradrop/cloak and asset acceptance evidence is reused; those entire tasks were not rerun.

The 48-added-infantry scene uses a 3840x2160 buffer on Apple M2. Alternating synchronized same-frame batches in the copied default-4x app measured maximum p95 7.51 ms with smoothing and 7.65 ms without it. Both modes used 659 textures and 296 complete-scene draw calls. These are bounded render-submission/GPU synchronization timings, not sustained-battle FPS or physical VRAM measurements. Native index maps reuse existing SHP atlases; the five maps referenced by this scene total 5.51 MiB, an upper bound on additional native-mask storage rather than newly authored HD atlas allocation. The smaller 2x and Original cases also report GL error 0 and no context loss. Prior full-roster 4x memory/pressure evidence remains applicable to unchanged HD resource bytes.

The final clean-source package is staged separately under `package-final-v1/RA2-HD-Graphics-Shadow-AA/`, with an embedded offline review and a preservation/delivery receipt. Its default-4x smoke is recorded under `runtime-final-package-4x-v1/`. Final visual acceptance remains with the user. Continue fixes and acceptance in the current execution conversation; no push or new task is implied.
