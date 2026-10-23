# M1.3f Rhino normal-match integration, owner colors and firing

## Scope and decision

The user selected normal-match Rhino integration, team colors and firing continuity, preserving the accepted low-profile eight-heading artwork. Work started from clean `98307a3` on `m0-2-stabilization`. This extends the M1.3e acceptance; it does not reopen earlier rejected routes or change M1.4 production C/reference height 900.

Status: **NORMAL_MATCH_RUNTIME_PASS / M1_3F_VISUAL_ACCEPTED**. Default graphics remain Original. This task adds an opt-in setting in the ordinary game; it does not modify the accepted desktop applications or `dist`.

## Visual acceptance

The user explicitly accepted the reviewed result in this Rhino conversation after receiving the illustrated report and firing recording. See [the separate acceptance receipt](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/visual-acceptance.json). The receipt verifies 153 build files and the reviewed evidence hashes. Historical pending review/report files are preserved unchanged. Original remains the default; acceptance does not change settings or certify unsupported states as HD.

## Visual evidence

[Open the complete illustrated report with an embedded, playable firing video](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/report-accepted-v1/report.html). This HTML file includes its images and video data, so it can be handed off as one file. The Markdown report below also embeds the still images; video playback depends on the Markdown viewer.

### Original and team-color comparison

The four panels show Original, HD red, HD blue and HD green. Game pixels are cropped directly from the 1920x1080 framebuffer without enlargement; the logical reference remains 1600x900. Labels sit outside the game pixels.

![Native-size Original and HD red, blue and green comparison](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/review-v1/overview.png)

### Actual firing video

The 6.48-second recording is a 640x360 native pixel crop of the running game. Six native Cannon spawns were recorded. The weapon, projectile positions and timing remain unchanged.

<video controls preload="metadata" width="640" height="360" poster="/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/review-v1/combat-2s.png">
  <source src="/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/review-v1/combat.webm" type="video/webm">
</video>

[Open or download the firing video](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/review-v1/combat.webm). If inline playback is unavailable, use the illustrated HTML report linked above. The following still is decoded from the recording at 2 seconds, without browser player controls.

![Actual firing recording at 2 seconds, native 640x360 pixels](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/review-v1/combat-2s.png)

### Independent turret examples

Body 0 degrees / turret 90 degrees, blue owner:

![Blue Rhino with body 0 and turret 90 degrees](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/review-v1/heading-0-hd.png)

Body 180 degrees / turret 270 degrees, blue owner:

![Blue Rhino with body 180 and turret 270 degrees](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/review-v1/heading-180-hd.png)

[Open all 48 native-size comparisons, including eight team colors, eight headings and 4K pairs](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3f/review-v1/review.html). Every Original/HD pair uses the same tick, camera and output density. The reviewed M1.3f scope is visually accepted; unsupported states remain outside the validated HD coverage.

## Implementation

- `GameScreen` loads a pinned optional local HTNK family before renderables exist; `WorldView` owns its textures until match teardown. All six resolved original VXL/HVA hashes and all 16 base/mask pairs must validate. Missing, corrupted, mismatched or failed GPU uploads restore the whole original family.
- `Vehicle.update` installs the renderer for eligible ordinary HTNK instances, including newly produced units. It updates after native body/turret transforms, and disposes before native builders. No runtime adapter injection or prototype monkey-patching is required. A unit releasing its layers does not destroy textures needed by the next produced unit.
- `Options > Rhino HD (local pack)` selects Original or HD and persists with graphics preferences. Existing settings deserialize as Original. The setting may change during a match. Optional data are preloaded for loopback single-player temperate games so enabling during play can work without restarting the match.
- The 16 accepted PNGs are copied byte-for-byte. Separate one-channel selectors identify painted red regions, excluding neutral metal and near-transparent extraction noise. A Rhino-only material changes red chroma in linear light while retaining the original texture's shading, wear and highlights. The reference red has exactly zero color delta. Owner changes update independent per-vehicle uniforms; shared textures remain immutable. The accepted generic production-C shader and coverage thresholds are unchanged.
- Firing no longer disqualifies an otherwise supported Rhino. Body/turret selection follows the existing eight-heading rule throughout movement, aiming and firing. Weapon FLH, aiming, projectiles, sounds, damage, cooldown and native simulation remain untouched. There is no newly invented barrel recoil or flash animation.

Accepted registration remains a 320x288 source over an 80x72 logical canvas at offset (-40,-46), two independent body/turret surfaces, ground-clamped folded depth and the existing 0.5-world-unit turret depth bias. Original VXL body/turret/barrel shadow sections remain live. Each visible unit contributes six sprite draws; invisible heading layers skip updates. Shared base and selector textures occupy approximately 7.03 MiB before driver overhead.

## Runnable entry

From the repository root:

```sh
bun scripts/m1/play-rhino-game.mjs
```

This launches the new isolated build in disposable Chrome at a task-owned loopback address. Open Options, choose `Rhino HD (local pack) > HD`, then start an ordinary Soviet Offline Skirmish. Produce Rhino tanks normally. The launcher has no fixture units, diagnostic toolbar or injected renderer. Close the browser to stop it. Set `M13F_PORT` if the default port 4071 is occupied.

Build independently without touching `dist`:

```sh
bun run typecheck:entry
bun run build --outDir .artifacts/m1-3f/build
bun test scripts/m1
```

The existing M1.3e and M1.4 launchers and builds remain historical accepted evidence. The new launcher uses the existing allowlisted Conscript/GAPOWR server and adds the separately pinned Rhino pack. Nothing is pushed, published or packaged.

## Validation and evidence

Primary successful run: `.artifacts/m1-3f/check-1789774065155/`. Review: `.artifacts/m1-3f/review-v1/review.html`; native overview: `overview.png`; native combat recording: `combat.webm`.

| Check | Result and scope |
| --- | --- |
| Ordinary production | PASS: Soviet NAPOWR, NAHAND, NAREFN and NAWEAP through native production/placement; HTNK IDs 1387 and 1397 through vehicle queue 3. No vehicle renderer injection. |
| Movement and firing | PASS: 937 sampled frames, including 105 explicitly marked static-review frames. All 832 running-simulation samples retained HD; 59 moving samples and six firing samples. Six actual Cannon spawns, all five intervals 65 ticks; forward distance 150 and height 100 preserved. See `firing-validation.json`. |
| Colors, poses and output | PASS: 48 full-frame captures. Eight colors × Original/HD × 1080p/4K, plus eight blue body headings with independent turret +90° × Original/HD. Same tick, camera and native transforms within comparisons; restoration of Original is byte-exact. Logical presentation is 1600x900; physical buffers are 1920x1080 and 3840x2160. |
| Missing member | PASS: deliberately withholding `turret-315.mask` leaves the optional family empty and all three native VXL sections visible on a separately placed fallback test unit. See `.artifacts/m1-3f/check-1789774241054/result.json`. |
| Ownership | PASS: reversible owner fixture stays authored and updates its per-unit color. This is not a claim of a mind-control battle. |
| Lifecycle | PASS: explicit native destruction releases every per-unit reference to zero while keeping the pack alive; another normally produced Rhino reuses it. Ordinary match exit releases all 16 resources and their GPU textures. |
| Delivered launcher | PASS: `play-rhino-game.mjs --check` validates the pinned build, waits for its own preview to bind, reaches the ordinary menu with Original selected, then closes its browser/server. |
| Options | PASS: real browser clicks select HD, persistence survives reload, and selecting Original restores the setting. See `.artifacts/m1-3f/options/`. |
| Unit/regression suite | PASS: 58 tests / 18,502 assertions, including the existing M1.1/M1.2/M1.3/M1.4 tests and four new integration tests. Entry typecheck and isolated Vite build pass. |
| Preservation | PASS: before/after inventories match across original/imported resources, every older accepted pack and Rhino/M1.4 artifact directory, application bundles, `dist` and application user data. The new Rhino pack alone is outside the protected-pack inventory. |

The primary run uses the game's Easy AI setting to keep the factory alive for a bounded teardown/rebuild check. Earlier Normal-AI runs also recorded actual shots and native destruction but lost the factory/game before replacement production; those incomplete full-suite runs are retained. Other earlier failures concerned test listener API usage and attempted destruction of an already destroyed unit. The initial smoke used the wrong queue index and is not the final normal-production evidence. No gameplay rule was weakened to obtain the final pass.

Checks distinguish ordinary production/combat from explicit reversible test fixtures used for color sweeps, exact poses, owner changes and resource rejection. Fresh user visual acceptance is recorded separately; the technical scope and limits remain unchanged.

## Boundaries

- Opt-in, local macOS Chrome, single-player, temperate terrain is the validated scope. Other theaters retain Original. Network play, Windows, packaged applications, physical external 4K and prolonged mass battles are unverified.
- Eight authored headings still quantize the visual barrel by up to 22.5 degrees relative to continuous native aim. This task preserves that accepted discretization. It does not establish pixel-exact muzzle alignment at every intermediate angle or add firing artwork.
- Tracks are static, shadows retain the original VXL silhouette, and depth is the accepted two-layer approximation. Destroyed, bridge/ramp/elevated, tilted/rocking, cloaked, warped, invulnerable or submerged states retain complete-original fallback. Firing by itself is now supported; simultaneous unsupported states still fall back.
- The user accepted the reviewed team-color and firing appearance. This does not authorize default activation, finer headings, other vehicles, buildings, campaigns or desktop packaging.

## What unsupported states mean in play

These are limits of the authored HD rendering, not restrictions on driving or combat. With HD enabled, an eligible Rhino normally uses the authored body and turret layers. If a condition below occurs, all three original VXL body/turret/barrel sections are restored together and both HD layers are hidden. Returning to a supported state automatically restores HD. A visible change in detail or silhouette can occur at the transition; the switch is not a crossfade.

| Condition | Current handling and reason |
| --- | --- |
| Ramp tile, pitched/rolled body or rocking | Original rendering handles the actual native three-dimensional tilt. Current artwork contains flat-ground headings, without corresponding pitched/rolled views or validated transforms. |
| Bridge or nonzero elevation relative to the tile | Original rendering handles elevation, deck occlusion and clipping. These interactions have not been validated for the two-layer HD depth approximation. |
| Cloaking, warp-out, invulnerability, submergence or opacity other than one | The native rendering path retains the state's visibility, tint/transparency and clipping behavior. HD versions of those effects are not validated. |
| Destruction | Native destruction/removal rendering and effects apply; the healthy authored layers are disabled. |

A flat plateau is not excluded merely because its terrain height is above zero: the guard checks the unit's `tileElevation` relative to its tile, not the tile's absolute `z`. Ordinary movement, turning and firing do not themselves trigger fallback. The state guards are in `src/engine/renderable/rhino/contract.ts` and `RhinoRenderer.update`; this explanation is based on those guards and native position/tilt code, not a new all-state gameplay certification.

If another Rhino correction is selected, ramp and bridge continuity are a practical bounded next scope because they occur in ordinary matches. Such corrections belong in this existing Rhino conversation; this acceptance/question does not start their implementation.

Continue visual corrections and acceptance in this existing Rhino task because they concern the same asset and implementation. Return the result to the main planning task after acceptance to choose any materially different next objective; do not create another task automatically.
