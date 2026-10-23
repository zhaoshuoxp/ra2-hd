# M1.3e — Rhino eight-heading artwork and native movement

The user selected continued production after accepting M1.3d revision 2's lower-profile turret. This increment adds six body views and six independent turret views, producing 8 × 8 combinations and a runnable movement comparison. Status is **EIGHT_HEADING_RUNTIME_PASS / EIGHT_HEADING_VISUAL_ACCEPTED**, following explicit user acceptance on 2026-09-18. Normal Rhino stays original. No other assets, production activation, remap or firing artwork are included.

Baseline was clean `8fd34e6` on `m0-2-stabilization`. Preserve M1.3d acceptance, all prior Rhino decisions, accepted Conscript/GAPOWR and final M1.4 production C/reference height 900. Work remains sequential, local and unpublished.

## Review and run

- [Native-size review](../.artifacts/m1-3e/review-v2/review.html): 64 runtime combinations, actual movement video and 80 same-density A/reference/R comparisons.
- [64-combination native crop matrix](../.artifacts/m1-3e/review-v2/sixty-four-native.png).
- [Actual movement video](../.artifacts/m1-3e/review-v2/motion-native.webm).
- [Source hashes, registration and component manifest](../.artifacts/m1-3e/candidate-v1/manifest.json).

Use 100% browser zoom. Matrix cells are direct 150 × 110 output-pixel crops shown at that CSS size. Detailed A/reference/R panels stay 300 × 220 CSS pixels at either 1× or 2× output density within each row. The middle reference is explicitly a CPU assembly, not an engine screenshot. The 640 × 360 movement video is cropped directly from the 1080p drawing buffer without scaling. It includes actual native turns, movement and stops.

```sh
bun scripts/m1/play-rhino-eight.mjs
```

The launcher verifies build/resource hashes, serves loopback only and opens a disposable Chrome session with the accepted HD Conscript/GAPOWR fixture. **A original / R parts** selects the renderer. **Body** and **Turret** controls select independent headings; **Show body / turret / both** reveals registration. **Move nearby** sends a native movement command; **Run / pause** resumes or freezes simulation. Pose controls are diagnostic state setters; movement uses the unchanged actions API. Close the owned session with Ctrl+C. `M13E_PORT=4064` selects another port. `--check` runs the full automated capture/check sequence headlessly; interactive startup skips that expensive sequence.

## Artwork and registration

Four accepted 0°/90° component source images are byte-preserved. Their exported RGBA pixels are copied without resampling into a larger transparent canvas. Twelve missing views were authored with the built-in image generator using the accepted lower-profile reference, including newly visible front, rear and side surfaces. Exact prompts, raw outputs and rejected intermediate side-view drafts remain in `.artifacts/m1-3e/authoring-v1/`. The user accepted the reviewed new views; reference-guided generation does not independently prove geometric consistency.

`calibrate-rhino-eight.ts` measures the original occupied VXL/HVA geometry through its native axis transform and fixed camera. Projected width ratios are anchored to accepted 0° widths: 52 logical pixels for the hull and 39 for turret plus gun. Previously accepted 90° pixels take precedence over the small native ratio difference. New views use uniform scale only, with manually reviewed bearing landmarks. No silhouette repaint, perspective warp or flat-image rotation is used. Approximate hull widths are 52 diagonal, 33.52 end-on and 44.92 broadside logical pixels; they are not all forced to the same screen width.

The transparent sprite canvas extends from 64 × 56 to 80 × 72 logical pixels, offset `[-40,-46]`, density 4 and bearing `[0,-9.5]`. Every texture is 320 × 288. Padding accommodates side-pointing guns; it does not enlarge the artwork or change selection, collision, native geometry, camera, gameplay scale or field of view. Packaging verifies unchanged accepted pixels and an unclipped substantive-alpha margin.

## Runtime behavior

Only the explicit `/rhino-eight/` diagnostic route loads this adapter. The production entry has no Rhino override. Sixteen shared artwork resources are verified by manifest/image SHA-256 before installation. Missing/corrupt members reject the complete family. Two independently selected world layers render through the existing production C interior/edge path; no DOM overlay or preassembled vehicle image is used.

The body follows the native interpolated body transform. The turret follows native absolute aiming. Each independently selects the nearest 45° view; the software selection error is at most 22.5° relative to the rendered heading. Native facing, rotation speed, pivot, body/turret/barrel matrices and weapon rules are untouched. Ordinary `TurnTask`/`DriveLocomotor` rotation remains supported, including nonzero `spinVelocity`; no value is written back to suppress turning.

The two ground-clamped folded surfaces retain the prior 0.5-world-unit camera-axis turret depth offset and colorless 0.985 coverage proxy. The larger transparent canvas changes the diagnostic surface extent, not projected artwork size. Original VXL meshes are color/depth suppressed only while the complete candidate is active; their live shadows remain. This is still approximate layered depth and shadow silhouette, not recovered 3D geometry.

Reference red only. Firing, other colors/owners, nonfinite angles/rotation, destruction, ramps/bridges/elevation, tilt and unsupported effects restore the complete original. Treads are static. No independent gun recoil, moving tread animation, continuous visual rotation, team remap, crowd performance or complete vehicle acceptance is claimed.

## Technical evidence

- **44 tests / 17,379 assertions PASS**, including independent selection, actual rendered-angle selection, normal turn velocity, whole-family fallback, geometry projection, resource lifetime and existing HD/M1.4 suites. Entry and standalone adapter typechecks pass.
- Fresh isolated build: **153 files byte-identical** to accepted final M1.4 `build-v4`. Reference height remains 900; production C is unchanged.
- Runtime captures cover all 64 combinations at 1080p and 16 aligned/crossed combinations at 4K. Each A/R pair has identical tick, camera, native transforms, original shadow sections and output density; disabling the candidate restores the original frame byte-for-byte.
- Depth controls cover 16 aligned/crossed combinations across seven stress placements: open, partial building overlap, four yard placements and overlapping tanks. Color-on/off controls retain the proxy and separate interior/fractional passes. Full hiding is demonstrated at a pose-specific yard placement, not assumed to work at one fixed coordinate for every pose.
- [Final runtime evidence](../.artifacts/m1-3e/check-1789769486300/capture/result.json) and [motion trace](../.artifacts/m1-3e/check-1789769486300/capture/motion.json): four ordinary commands around a prevalidated clear route, 8.09 seconds, 161 sampled ticks including 36 with nonzero turning velocity, **zero inactive frames**. Seven authored body headings occur in that route; heading 45° is separately verified in the static 64-combination set. Every sampled moving, turning and stopped frame must remain active.
- Review-v2 measures **zero changed pixels outside Rhino canvases** and **zero changes in transparent support** for all 80 conditions. Mean maximum-channel deviation from the independently filtered assembly reference ranges from 0.90 to 2.21 intensity levels. These transfer measurements do not establish visual approval.
- [Review-page checks](../.artifacts/m1-3e/review-v2/page-check.json): all 304 displayed images and the 640 × 360 video retain their stated CSS sizes at 1440- and 600-pixel viewports, all links resolve and no external requests occur. Actual video frames decode successfully. [Final visible launcher smoke](../.artifacts/m1-3e/manual-1789769772292/capture/result.json) verifies body 315° / turret 135°, candidate selection, native movement and pause controls with the final adapter.
- Click selection, pan/restoration and viewport resize preserve registration/reference 900. Buffers/textures and shader programs are reused. Sixteen RGBA textures plus small metadata use approximately 5.63 MiB; prepared merged geometries use 7,936 bytes per instance. A visible vehicle still adds six draws. This small fixture is not a battle benchmark.
- Disposal restores exact original materials/hooks and releases all sixteen texture sets when reference counts reach zero. Preservation comparison covers **18,286 entries** plus original archive hashes, including accepted artwork, history, imports, apps, `dist` and user data.

## Retained failures and limits

The first runtime attempt stopped because a requested motion destination was occupied. The fixture now reserves and validates the entire route; no pathfinding/game rule was altered. The second run's moving-only assertion passed, but manual inspection found 34 stationary-turn frames reverting through the inherited single-pose `spinVelocity` exclusion. That result and review-v1 are superseded for motion by [the separate correction receipt](../.artifacts/m1-3e/revalidation-v1.json). Runtime-v1's adapter and identity are retained. The final check includes turns/stops and follows the interpolated body angle.

The user accepted the reviewed new surfaces, native-size appearance, turret attachment and 45° transitions. Firing/remap/treads, arbitrary slopes, all possible intersections, large battles, Windows and physical-panel fidelity remain **NOT IMPLEMENTED / UNVERIFIED**. The bounded visual gate is complete; await a separately selected next step. Continue Rhino corrections and acceptance in this same conversation because the asset objective is unchanged; do not start another task automatically.

## Visual acceptance — 2026-09-18

The user explicitly confirmed that this version is acceptable after receiving review-v2 and the native movement video. The [separate acceptance receipt](../.artifacts/m1-3e/visual-acceptance.json) binds this decision to implementation `c44038c`, sixteen authored components and 504 reviewed evidence hashes. All those hashes, the sixteen source/export identities and 153 accepted M1.4 build files were revalidated before recording acceptance.

This closes the M1.3e eight-heading visual gate at reference height 900, with the documented fixed-red, static-track and unsupported-state fallback boundaries. It does not activate a production override or authorize finer heading, remap, firing/tread or full-vehicle work. Historical pending labels and superseded motion evidence remain unchanged; this receipt records the subsequent decision. This closeout changes documentation only; no artwork, renderer, gameplay, build or test rerun was needed.

## Reproduce

```sh
bun scripts/m1/calibrate-rhino-eight.ts
# Packaging uses a fresh candidate directory; preserve the delivered candidate and review.
bun scripts/m1/prepare-rhino-eight.mjs
bun scripts/m1/play-rhino-eight.mjs --check
python3 scripts/m1/build-rhino-eight-review.py CAPTURE_DIR .artifacts/m1-3e/review-fresh
bun scripts/m1/check-rhino-eight-review.mjs .artifacts/m1-3e/review-fresh
```

Artwork, imported derivatives and captures remain ignored local evidence. No push, publication or desktop packaging was performed.
