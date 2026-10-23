# M1.3g — Rhino terrain and special-state rendering

Status: `RHINO_STATE_RUNTIME_PASS / VISUAL_REVIEW_PENDING`.

This continues the accepted M1.3f Rhino in the same task. The user authorized ramps, tilt/rocking, bridges/elevation, cloak/warp/Iron Curtain and destruction. Starting checkout: `11788e8`, branch `m0-2-stabilization`, initially clean. Original remains the normal default; HD remains an explicit graphics option.

## What changed

The accepted eight body and eight independent turret images, remap masks, registration and optional-pack identity are unchanged. The renderer now applies the residual native vehicle pose to both registered layers. Flat yaw is already represented by the authored heading, so it is removed from the residual transform. Pitch, roll, the native rocking pivot translation and sinking displacement remain. Tests cover exact identity at all 360 flat integer headings and agreement with native transforms for independent turret headings.

Native world position, relative elevation, bridge order and water clipping are retained. A bridge deck is a native ordered overlay without a depth-writing surface. Rhino coverage must therefore blend within the corresponding native opaque order band, before the next deck band. The Rhino-specific coverage pass preserves premultiplied alpha and depth testing. It does not change bridge materials, terrain, production C, camera scale or other HD families. The earlier transparent-queue candidate leaked through a bridge and was rejected during technical review; its captures remain in the milestone evidence.

Cloak and warp use native opacity with a full-coverage, non-depth-writing draw. The near-opaque depth proxy is disabled during these transparent states. Owner remap remains active. Iron Curtain follows the native VPL effect-brightness equation, including the black phase, instead of merely dimming the authored colors. Native sparkles, explosions, warp-away effects, damage effects and VXL shadows remain owned by the original engine.

Three existing native defects were reproduced while checking the requested states and corrected for both original and HD rendering:

- `ObjectCloakPlugin` assumed a boxed player although normal matches pass a Player. It now accepts both forms, so enemy cloak is hidden and friendly cloak remains visible.
- The shared light-effect scratch value also overwrote the native rocking-angle constant. Light intensity now uses a local variable, preserving the intended rocking motion.
- Sinking animation was incorrectly gated by lighting changes. The original and HD vehicles could remain at the water surface with unreleased render resources. Removal animation now advances on its own native clock, then hides and disposes normally.

No gameplay rules, pathfinding, weapons, logical bounds, target coordinates or unit abilities were changed. The cloak diagnostic attaches an existing native cloak trait to a temporary Rhino; it does not grant cloak to the production Rhino rules. Elevated and sinking setup is explicitly controlled. Movement clips issue real native movement orders on retail-map ramps and bridges.

## Native-size visual review

All comparisons use the same paused state, camera and output density within each pair: 1920 × 1080 drawing buffer and CSS canvas, DPR 1, renderer ratio 1, logical presentation 1600 × 900, camera zoom 1. The images below are unscaled framebuffer crops with labels added outside the crop. They are not enlarged previews, retouched artwork or image composites substituted for world rendering.

Review the slope silhouette, body/turret attachment, rocking, bridge visibility, transparency and restoration. Technical passing results are not visual acceptance.

![Native-size terrain comparisons](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g/review-v1/sheet-1.png)

![Native-size bridge comparisons](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g/review-v1/sheet-2.png)

![Native-size bridge and elevation comparisons](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g/review-v1/sheet-3.png)

![Native-size special-state comparisons](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g/review-v1/sheet-4.png)

![Native-size visibility and restoration comparisons](/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g/review-v1/sheet-5.png)

### Actual movement

Native orders move the Rhino across a ramp and a high bridge. This video is a 640 × 360 moving crop of the actual framebuffer at 1:1 pixels. Cropping follows the unit; the game camera zoom is unchanged.

<video controls preload="metadata" width="640" height="360" src="/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g/review-v1/movement.webm"></video>

### Effects and destruction

Original and HD are rendered sequentially at the same controlled native animation time. Each column contains a 400 × 268 framebuffer crop at 1:1 pixels; text occupies a separate 32-pixel strip. The 800 × 300 video covers rocking, warp, Iron Curtain, restoration, explosion, temporal removal and sinking. It is a renderer/state fixture, not a claim that every special ability was earned in an ordinary battle.

<video controls preload="metadata" width="800" height="300" src="/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-3g/review-v1/states.webm"></video>

## Run the reviewed build

From the repository root, with the existing local retail resources and optional Rhino pack:

```bash
bun scripts/m1/play-rhino-state-game.mjs --states
```

This opens the controlled state comparison with Original/HD and state buttons. Close the browser to stop its owned preview. To enter an ordinary game instead:

```bash
bun scripts/m1/play-rhino-state-game.mjs
```

Select Options → Rhino HD (local pack) → HD and start a Soviet skirmish. Both modes verify the reviewed build hashes, use a disposable Chrome profile and an owned loopback preview (default port 4073). They do not modify the desktop application, distribution build or real user data. `M13G_PORT` can select another free local port. An occupied port fails closed.

## Validation

Implementation commit: `25ef116`. The final state run contains 36 captures (18 Original/HD pairs), 542 live movement samples including 38 moving ramp samples and 37 moving bridge samples, and 130 paired animation samples. The normal-match regression records six native shots, successful rebuilding, zero retained artwork references and released GPU textures on exit. All 16 diagnostic controls and both launcher modes passed.

Final measured results and evidence identity are recorded in `.artifacts/m1-3g/delivery.json`. Raw snapshots, failed intermediate runs and traces remain under `.artifacts/m1-3g/`; the report embeds its PNG and WebM evidence for portable viewing.

- Targeted and existing M1 tests: 62 tests / 18,897 assertions passed.
- TypeScript entry check and isolated production build: passed.
- Same-state Original → HD → Original captures check exact original restoration, identical camera/native transforms and zero GL errors.
- Live native ramp and high-bridge movement checks require HD continuity, moving samples in each requested state and zero GL errors.
- Native cloak visibility, explosion and temporal FX, sinking clipping and disposal are checked. Sinking must finish, hide the main object and release all 16 artwork references.
- The ordinary factory-production, owner-color, firing, rebuild and match-exit regression is recorded separately from the controlled state fixtures.
- The launcher verifies the pinned build; media checks verify native image/video dimensions and decode actual video frames.
- Preservation: every pre-existing entry is unchanged. A separate Conscript audit added 172 entries under `.artifacts/m1-1/state-audit-2026-09-18/` while this task ran; those independent additions were preserved. The strict inventory comparison and the additions-only reconciliation are both retained.
- Protected-payload inventories include all previously accepted assets, the entire accepted Rhino optional pack, M1.3f evidence, M1.4 evidence, originals/imports, application bundles, `dist` and user data.

## Boundaries and decision

The geometry remains two registered authored surfaces. Applying native pose preserves a coherent attachment and tilt, but cannot invent unseen sides or an underside. The native ramp pitch is 25 degrees; the visual quality of those deformations requires user acceptance. This is not a newly authored volumetric Rhino.

The water plane and sinking clock are native, but the clipped silhouette can disappear at a different intermediate time because the authored surfaces have approximate depth; final hiding and disposal follow the native removal lifecycle.

Static tracks, 45-degree heading steps and native VXL shadows remain inherited limitations. A custom-rule submerged Rhino still uses complete-original fallback because underwater flattening requires a separate artwork contract; native HTNK has no submerge ability. Other unsupported source/layout or invalid-state cases still fail closed. Physical external 4K, packaged desktop delivery, all maps, prolonged multiplayer and every possible effect combination are not certified by this bounded run.

M1.4 production C and reference height 900, Conscript, GAPOWR and the accepted Rhino PNG/mask bytes remain protected. No other vehicle/building, campaign, packaging, push or publication is included. Stop at `VISUAL_REVIEW_PENDING`; continue corrections and acceptance in this same Rhino task because this is the selected continuation of the accepted Rhino work.
