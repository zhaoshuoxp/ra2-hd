# M1.3d Rhino: two body headings × two independent turret headings

**FOUR_COMBINATION_RUNTIME_PASS / REVISION_2_VISUAL_ACCEPTED.** The user selected the next bounded experiment after accepting M1.3c: verify two body headings and two independent turret headings. This delivers four separately authored component images and actual world rendering of their four combinations. Normal Rhino remains original. No full vehicle, additional headings, firing animation, production override or other asset is enabled.

Started from clean `dd6d1b6` on `m0-2-stabilization`. Preserve the accepted single-pose artwork/runtime and the later accepted final M1.4 implementation, including C, reference height 900, shroud corrections, stable GAPOWR effects, paused speed and output-density HUD text. Work is sequential, local and unpublished.

## Review and run

[Native-size A/reference/R review](../.artifacts/m1-3d/review-v3/review.html), [direct 1080p four-combination crops](../.artifacts/m1-3d/review-v3/four-combinations-native.png), [measurements](../.artifacts/m1-3d/review-v3/review.json).

Use 100% browser zoom. Each primary panel remains 300×220 CSS pixels; narrow windows scroll. The first eight rows cover four combinations at High and 1080p with the standard 900 presentation. Every row compares the same tick, camera, owner, lighting and output density. A is original runtime; the middle column is a clearly labeled synthetic assembly reference; R is a direct actual-renderer capture, only cropped. Separate collapsed historical-camera rows are diagnostic only. Enlarged component inspection is also labeled separately.

The direct four-combination image is a 2×2 montage of unscaled 1080p runtime crops. Top row: body 0 / turret 0 and body 0 / turret 90. Bottom row: body 90 / turret 0 and body 90 / turret 90.

```sh
cd /Users/Aone/RA2remaster/ra2-hd
bun scripts/m1/play-rhino-parts.mjs
```

The launcher verifies all build and resource hashes, starts a loopback-only server, prepares the existing HD Conscript/GAPOWR scene and opens a disposable visible Chrome session. The initial validation takes time before the controls appear. Use **A original / R parts**, independently switch **Body 0 / Body 90** and **Turret 0 / Turret 90**, and inspect **Show body / Show turret / Show both**. The scene is frozen for this four-combination review. Selection and camera movement remain available. Ctrl+C closes the owned session; `M13D_PORT=4058` chooses another unused port. `--check` runs headlessly and exits.

This is not a general playable vehicle or an animation demonstration. Heading controls explicitly set the diagnostic fixture's native body direction and absolute turret facing; the renderer selects the corresponding component. Ordinary game aiming, weapon definitions and timing are unchanged. Other poses/states use the complete original family.

## Authored components and registration

The initial four built-in imagegen calls created `body-0`, `body-90`, `turret-0` and `turret-90` under [authoring-v1](../.artifacts/m1-3d/authoring-v1/). Exact prompts are saved there as `body0-prompt.txt`, `body90-prompt.txt`, `turret0-prompt.txt` and `turret90-prompt.txt`. The accepted `.artifacts/m1-3a/authoring-v2/primary-realism-v1.png` guided the initial hull and turret. Their respective second views used those generated components as references. All generated originals were copied into the project; no API/CLI fallback was used.

After review, the user requested a lower, more original-like turret. Two further built-in edits produced the corrected turret views in [authoring-v2](../.artifacts/m1-3d/authoring-v2/), with exact correction prompts. The cylindrical pedestal was removed and the housing/hatch profile reduced. Both hull source images and exports remain byte-identical to revision 1. The new source bearing landmarks are `[572,801]` and `[940,837]`; there is no vertical bitmap squash or camera change. The [feedback receipt](../.artifacts/m1-3d/feedback-v1.json) records `REVIEWED_REVISION_REQUESTED` for revision 1; revision 2 subsequently received explicit visual acceptance (see the acceptance record below).

The hulls contain newly authored continuous hidden decks and flush turret bearings. The turret includes its barrel, hatch, fittings and lower bearing, with no chassis pixels. These are new candidate surfaces, not pixel-identical extracts or implicitly accepted extensions of the earlier art. Perspective, panel continuity, turret dimensions and newly revealed fittings were included in this bounded visual review. The original accepted image/export remains immutable.

`prepare-rhino-parts.py` performs only uniform-scale, premultiplied Lanczos packaging, preserving source alpha/color. There is no repainting, affine perspective warp, original-silhouette masking or red-pixel recoloring in this exporter. The [manifest](../.artifacts/m1-3d/candidate-v2/manifest.json) records source hashes, alpha extents, scale and manually inspected bearing landmarks. Both hull bearings and both turret bearings register to `[0,-9.5]` logical pixels. Hull substantive-alpha width is 52 logical pixels; turret-plus-barrel width is 39. Each part uses a 256×224 physical export on a 64×56 logical canvas at offset `[-32,-38]`; extra transparent canvas does not change the vehicle's gameplay bounds or world scale.

The four offline assembled reference PNGs are never loaded by the runtime adapter. Only four individual component files are routable. Missing or corrupt manifest/part data fails before replacement; partially loaded textures/bitmaps are released.

## Actual independent world rendering

The diagnostic adapter imports the existing production `MergedSpriteMesh`, `HdSpriteMaterial` and edge renderer. Each entity prepares four reusable layer objects; exactly one body and one turret layer are visible at each supported pose. Body selection reads native `direction`; turret selection reads absolute `turretTrait.facing`. Neither is derived from the other's selected frame. Native body, turret and barrel matrices remain untouched by candidate activation.

The turret's native pivot is read through its existing world transform, converted into the position parent's space. HTNK's measured pivot is `[0,0,0]`; its delta stays zero across all four combinations. Original body transforms stay identical when only turret facing changes. Original turret world transforms stay identical, within floating-point tolerance, when only body direction changes with turret facing fixed. Tests also verify unchanged candidate projection and reuse of the same geometry, edge views and textures.

Both layers retain M1.3c's ground-clamped folded depth surface. A **0.5-world-unit displacement toward the camera** places the turret surface in front of the hull surface, preserving every projected pixel and pivot. Each layer uses the same disclosed colorless 0.985 coverage depth proxy to protect the predominantly fractional-alpha artwork from ground shadows. C's color/edge thresholds and sampling stay unchanged. This is an approximate layered surface, not recovered 3D vehicle geometry.

The original three VXL sections remain the sole live shadow casters with their independent native transformations. No sprite casts a second ground shadow. Their shadows follow the selected headings but approximate the new artwork's silhouette. Painted component shading is retained and adjusted only by relative existing SHP scalar light, with the reference light normalized to one. No new general material, light, camera or game rule is introduced.

**OWNER_REMAP_NOT_IMPLEMENTED:** only the reference red `(255,24,24)` is supported. Another owner or changed RGB channels triggers whole-family original fallback, including in-place color mutation. This avoids falsely displaying fixed red art for another team. No inferred binary red mask or unverified remap ramp is promoted. Firing, destruction, cloak/warp/invulnerability, bridge/ramp/elevation, tilt and unsupported directions similarly restore the original family. Static tread frames and turret-plus-barrel artwork do not establish motion/recoil acceptance.

## Validation

- **36 tests / 1,025 assertions PASS** across nine targeted suites: part identity, projection, all four combinations, independent selection, owner/state fallback, shared-resource disposal, prior single-pose proof, HD coverage/material/family, presentation, resolution and accepted M1.4 corrections. Entry and standalone adapter typechecks pass.
- Fresh isolated build succeeds. All **153 files are byte-identical to the accepted final M1.4 `build-v4`**, not merely the older M1.3c baseline. The adapter and four images are served separately by an explicit diagnostic route; normal application entries do not import them.
- [Revision 2 capture](../.artifacts/m1-3d/check-1789761713728/capture/result.json) records all twelve A/reference/R conditions at tick 663. Standard High uses CSS 1920×1080, DPR 2, buffer 3840×2160, logical presentation 1600×900, unchanged camera zoom 1. Standard 1080p changes only output sampling. Transparent part canvases project to about 76.78×67.19 CSS pixels at the standard view; the visible hull is about 62.4 CSS pixels wide. The taller transparent canvas is not enlarged tank geometry.
- Across twelve rows, **zero changed pixels outside the Rhino canvases**, zero changed transparent reference pixels and byte-exact restoration of A. Thus matched terrain, UI, accepted Conscript and GAPOWR retain pixel parity. Runtime versus separately filtered/composited component reference averages 0.84–1.29 maximum-channel RGB levels over covered pixels; this is bounded transfer evidence, not visual approval.
- The [28 depth controls](../.artifacts/m1-3d/check-1789761713728/capture/depth.json) separate opaque and fractional passes, retaining depth proxies in color-on/off controls. Open controls are fully visible. With either body heading, yard `[0,0]` fully hides turret-0 combinations and yard `[1,1]` fully hides turret-90 combinations; occluder-off controls remain visible. Coverage depends on the pose and position: turret-0 combinations leave four fractional pixels at `[1,1]`, so that position is not labeled fully hidden for revision 2. Yard `[-1,-1]` leaves a strict subset visible. Double-tank overlap retains roughly 4,040–4,192 of 6,737–7,139 unobstructed color pixels. These rendering-only stress placements restore native positions and do not assert legal occupancy or arbitrary depth intersections.
- Actual click selects HTNK 1382; camera pan/restoration and a 1440×900 resize preserve registration and reference height 900. Repeated pose switches reuse buffers/textures; 32 frozen render/finish samples observed stable programs, median about 1.27 ms and p95 1.50 ms. This is a tiny diagnostic scene, not a battle benchmark.
- One visible candidate adds six draws: two depth proxies, two C interior passes and two C fractional passes. Four shared RGBA textures plus metadata occupy 917,536 bytes; each entity's four prepared merged geometries occupy 1,984 bytes, with shared edge/proxy views. Original geometry/shadow work remains. Final entity disposal restores exact material/callback objects and releases all four texture sets at zero references.
- Visible launcher smoke uses the delivered entry, independently selects body 90 / turret 0 and R, and exits cleanly. The review passes at widths 1440 and 600 with JavaScript disabled, fixed image dimensions, complete local links and no external requests.
- **17,347 protected entries PASS**, including accepted artwork/packs, all prior Rhino and M1.4 evidence, imports, installation inventory and three selected archive hashes, applications, normal `dist` and the normal user profile. Full original-installation hashing remains outside the established preservation scope.

## Retained failures, feedback and boundary

The first sandbox launch failed before Chrome startup; the subsequent isolated local launch succeeded. Capture v2 demonstrated the four world combinations but had only preliminary depth captures. V3's assertion that yard `[0,0]` was fully hiding the enlarged component canvas failed: 27 or 113 fractional pixels remained. V4 retained those results and added explicit yard offsets; `[1,1]` fully covers all four poses. No asset or renderer change was made to force that depth assertion. Earlier captures and reviews remain retained. The user then rejected the tall turret proportions, despite these technical passes; revision 1 is not visually accepted. `runtime-v1/` preserves its adapter/build receipt, and review-v1/v2 retain their original images and labels. Revision 2 corrects only the two turret views and is delivered in review-v3.

Normal Rhino stays original. Fixed owner color, approximate shadows/depth, discontinuous two-heading selection, firing/recoil, other headings, movement animation, full light/state coverage, slopes, crowds, sustained battles, Windows and physical-panel fidelity remain **NOT IMPLEMENTED / UNVERIFIED**. No independent barrel recoil, full vehicle production or default override is claimed.

The visual gate for the four reviewed actual runtime combinations at standard size is closed by the acceptance below. Keep corrections and acceptance in this same Rhino conversation because this continues the same asset objective. Do not expand headings or promote a normal override without a separately selected next step.

## Reproduce without overwriting evidence

```sh
bun test scripts/m1/rhino-parts.test.ts scripts/m1/rhino-sprite.test.ts
bun scripts/m1/play-rhino-parts.mjs --check
# The launcher creates a new timestamped check directory.
# Generate a fresh review from that capture directory:
python3 scripts/m1/build-rhino-parts-review.py CAPTURE_DIR .artifacts/m1-3d/review-fresh
bun scripts/m1/check-rhino-parts-review.mjs .artifacts/m1-3d/review-fresh
```

## Revision 2 visual acceptance — 2026-09-18

The user explicitly accepted the corrected version after reviewing its lower turret profile against the original. Record `M1_3D_REVISION_2_VISUAL_ACCEPTED / FOUR_COMBINATION_RUNTIME_PASS` for the two body headings × two independent turret headings proof. The [separate acceptance receipt](../.artifacts/m1-3d/visual-acceptance.json) binds this decision to implementation `efaf009`, the four component assets, runtime evidence and review-v3 by SHA-256. All 153 delivered build files, diagnostic resources and previously recorded evidence hashes were revalidated before recording this decision.

Revision 1 remains rejected for excessive turret height. Historical review pages, captures and the final-state receipt retain their earlier pending labels; this acceptance supersedes those labels without rewriting the evidence. This is a documentation-only closeout, with no rebuild or new test run.

Normal Rhino remains original. This acceptance does not select additional headings, team-color authoring, movement/firing assets, full-vehicle production or default activation. Keep all documented limits and the accepted M1.4 implementation/reference height 900 intact. Continue Rhino corrections or a separately selected next step in this same conversation; no next implementation phase has started.
