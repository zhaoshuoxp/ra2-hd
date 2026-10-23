# M1.1 Conscript HD Prototype — completion and acceptance

**Status: COMPLETE_BOUNDED_PROTOTYPE. Technical acceptance: PASS_BOUNDED_MAC_4K.**

Follow-up, 2026-09-18: the [historical special-state audit](m1-1-special-state-audit.md) reproduced an enemy-cloak defect and identified untested native scenarios. The subsequent [correction and native-state validation](m1-1-state-validation.md) now passes enemy cloak, ramps, bridges/occlusion, paradrop, temporal effects and destruction, including bridge-coverage and airborne-shadow fixes. It records 7,182 native simulation ticks and 40 original/HD 4K frame pairs. Earlier scope statements below remain the original completion record; the follow-up report defines the additional bounded coverage.

The user requested that this step be recorded as complete and handed back to the main planning conversation after reviewing the actual-match 4K comparison and clarifying equal unit size at 1080p and 4K. This closes the current local prototype step. It does not record a new hands-on playthrough or certify platforms and conditions not tested. M0 remains closed after M0.4; this work is M1.1, not M0.5.

## Delivered scope

- One member only: Conscript `cons.shp`, all 301 visible frames. All 301 original shadow frames remain on their original path.
- A separately committed, verified rendering foundation; accepted standing/walking/firing samples; complete artwork subsequently accepted by the user as reviewed.
- Complete 2x and 4x local packs, source/hash/geometry binding and whole-member 4x → 2x → original fallback. Samples or incomplete members cannot activate an override.
- Actual offline-skirmish integration, explicitly enabled by the loopback `?conscript-hd=4` entry. Normal launches retain original art; accepted desktop bundles remain unchanged.
- User-authorized selectable rendering resolution: Auto, Original (1x), 720p, 1080p, 1440p and 4K. The menu is reachable through **Options → Rendering resolution**; preferences persist and remain selectable in fullscreen.
- Direct actual-match screenshots, an exact same-frame 1080p/4K comparison, and a static review with its image embedded for previews that cannot execute scripts or resolve neighboring files.

## Resolution contract

At equal window size, display scaling and viewport, changing from 1920x1080 to 3840x2160 preserves the apparent size of units and UI, camera bounds and map field of view. The drawing buffer gains twice the pixels along each axis, four times the pixel count. The 4K image is native WebGL output, not an enlarged 1080p screenshot.

Presets preserve the existing aspect ratio inside their maximum dimensions. Thus a 1920x1080 logical viewport reaches 3840x2160, while a 1280x960 logical viewport reaches 2880x2160. GPU limits can reduce these maxima. The separate existing viewport-resolution control can still change layout/view area; it is not the rendering-density control. Higher output resolution does not create detail in unchanged low-resolution terrain, vehicle or UI artwork.

## Acceptance matrix

| Area | Result and evidence |
| --- | --- |
| Complete art gate | USER ACCEPTED: the complete candidate was approved before match integration; historical art observations were retained, not represented as additional repainting |
| Coverage and geometry | All 301 visible frames present; all body/shadow geometry pairs match original logical placement; original shadow texture bindings retained |
| Material foundation | Synthetic color/remap/lighting/opacity and batching parity verified before artwork integration |
| Actual authored gameplay | Standing, walking, firing, cheer, prone, prone-fire, stance transition and death observed across bounded matches |
| Colors, selection and occlusion | Yellow/red/blue observed; browser mouse selection hits the expected unit; a real construction yard occludes the Conscript; original shadows retained |
| Atlas transitions and fallback | Live actions use both 4x atlas pages correctly; an intentionally missing 4x page selects the complete 2x member; original-art control remains separate |
| Actual 4K output | Both authored-HD and original-art skirmishes produce a verified 3840x2160 drawing buffer |
| Equal display size | Same simulation tick/frame has identical camera bounds, body vertices, logical size and selection coordinates across output presets |
| Interaction and settings | 4K mouse selection, right-edge scroll, fullscreen setting, resize/aspect handling and saved preference reload pass; unit tests cover all four scroll edges and CSS-scaled coordinates |
| Cleanup and errors | Accepted runs have no unexpected page/console/GL errors or external requests; HD allocations release on match teardown |
| Automated checks | 30 tests, 558 assertions, entry typecheck and isolated production build pass |

## Checkpoints and retained evidence

Repository: `/Users/Aone/RA2remaster/ra2-hd`; branch: `m0-2-stabilization`. Latest implementation checkpoint: **`4012a51`**. The completion documentation is committed separately.

| Commit | Meaning |
| --- | --- |
| `be55d60` | Rendering foundation; art and overall acceptance explicitly incomplete at that time |
| `237d54b` / `f2f167d` | Representative samples and corrected resolution review |
| `8f63d00` | Complete candidate review before subsequent user art acceptance |
| `df759d8` | Approved authored resource integrated into bounded local skirmishes |
| `4012a51` | Selectable actual rendering up to 4K with logical input/size preserved |

Detailed reports: [prototype foundation](m1-1-conscript-prototype.md), [art history](m1-1-art-production-readiness.md), [authored gameplay](m1-1-gameplay-acceptance.md), [4K rendering](m1-1-4k-rendering.md).

Local, ignored evidence:

- `.artifacts/m1-1/hd-gameplay-v1/art-acceptance.json`: approval bound to the reviewed candidate's hash.
- `.artifacts/m1-1/hd-gameplay-v1/acceptance.json`: earlier bounded gameplay summary.
- `.artifacts/m1-1/4k-gameplay-v1/hd-4k-v3/result.json` and `original-4k/result.json`: final HD/original 4K runs.
- `.artifacts/m1-1/4k-gameplay-v1/hd-4k-v3/same-frame-4k.png`: raw 3840x2160 output.
- `.artifacts/m1-1/4k-gameplay-v1/hd-4k-v3/4k-closeup-comparison.png` and `review.html`: same-frame enlarged comparison and embedded static review. Both comparison sides use the same HD artwork; only rendering density changes.
- `.local/hd-packs/conscript-authored/1/manifest.json`: complete 2x/4x runtime pack. SHA-256: `4255aaccb76f7f1372d34a447d9d54e9579fb5be9002a7987cd4a115833ea9a0`.

Artifacts, derivative artwork and retail resources remain local and ignored. Nothing was published or pushed. Source archives, accepted application bundles and normal distribution output were preserved. The reviewed prototype is served from its isolated build; cloning the tracked repository alone does not reproduce the ignored art and evidence.

## Explicit limits and handoff

- Validated host/browser: current macOS / Chrome. Windows x64, packaged-application HD integration and physical external-4K-monitor acceptance are NOT RUN.
- Long-duration or large-scale 4K battles, GPU context recovery, repeated pack switching, every facing/action combination, paradrop and all lighting/occlusion combinations remain unverified.
- Automated input is not a physical-mouse acceptance record. The user's remote connection and earlier all-black HTML preview were not reproduced end to end; direct PNGs and the embedded static review were provided instead.
- No buildings, vehicles, campaigns or further artwork targets were started. Their scope and milestone numbers belong to the next planning decision. Start a separate execution conversation for a new target when the user instructs it; keep any correction to this delivered step in the current conversation.
- Potential next-step discussions include another asset type, broader platform/performance acceptance, or application packaging. These are planning options, not work already authorized or completed.

This is completion of the bounded Conscript HD prototype and its selected rendering-resolution extension, not acceptance of the whole remaster.
