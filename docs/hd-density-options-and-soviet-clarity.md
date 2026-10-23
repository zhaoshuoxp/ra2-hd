# HD density options and Soviet sampling audit

Follow-up: [True 4x regeneration](true-4x-regeneration.md) replaces the 24 density exceptions and raises the measured 4x cap to 1,280 MiB. Results and 768 MiB limits below remain historical predecessor evidence.

The user extended the accepted Allied/Soviet density work at local main `2fe48d5` to cover Soviet filtering and a saved 2x/4x game option, defaulting to 4x. This change preserves all artwork selections, the 24 complete-family 2x exceptions, Original SQD/SQDG and guarded YURIPR, and the accepted shadow, naval-depth and aircraft-parking fixes. No resource is modified or enlarged. Work remains local with no push.

## User-visible behavior

Options → Graphics → **HD atlas detail** offers **2× (lower memory)** and **4× (default)**. New and legacy preferences default to 4x; an explicit selection survives saving and reload independently of HD on/off and output resolution. Each match captures its density once. Changing this option during a match applies next match, including units/buildings first encountered after the preference changes. The existing in-match explanation states this behavior.

All eager and demand-loaded unit/building paths receive the captured density: SHP infantry, general VXL vehicles and their children/rotors, mixed SCHP, Rhino, power plants, building bodies and turrets. The shared allocation cap is 256 MiB at 2x and 768 MiB at 4x. Complete-family validation and fallback, family limits, the narrowly bounded NAYARD exception, cancellation and source identity guards remain intact.

2x uses an existing accepted 2x variant when available. For a 4x-only family, the original source contract, dimensions, hashes and remap/padding data are validated before reducing the decoded pages. Color is averaged in linear light with alpha weights, excluding invisible matte colors. Remap coverage is averaged while shade indices remain categorical. Reduction occurs before lossless pooling and GPU upload; it actually reduces texture storage. Rhino and turret bitmaps/masks are reduced together. UV rectangles scale by one half; native logical size, offsets, part registration, geometry, camera, rules and animation remain unchanged. This downsampling does not create or claim new 4x detail.

## Soviet findings

Two HD paths imposed a minimum filter footprint based on authored/native size:

- General Soviet VXL layers used `frame.rect[2] / frame.logicalSize[0]`, roughly four texels at 4x. Allied VXL and Rhino already used one. The shared VXL path now uses one for every authored family, including child and rotor parts.
- Conscript HD inherited the old `smoothCoverage` native-pixel-width floor. HD now uses the normal one-texel minimum; the Original indexed-material behavior is unchanged.

Screen derivatives still determine normal area antialiasing. No global filtering disable, sharpening or texture repaint is introduced. Other Soviet SHP units, Rhino and building turrets already had a one-texel minimum. HD base textures remain Nearest with no mipmaps. All 28 accepted YR Soviet roster roots were checked in the focused fixture, including Original squid; the preserved RA2 YURI artwork was also checked. APACHE remains an orphan registry entry, not a missing runtime unit. Generic effects and native death animations retain their existing paths.

The accepted ground-shadow correction remains effective across the audited Soviet VXL instances: legacy bridge-only occluders are explicitly false on ordinary ground. The earlier same-frame shadow-removal proof is reused; no second shadow rewrite or full old-task acceptance is performed.

## Incremental evidence

The exact isolated macOS arm64 package was checked on Apple M2 / 24 GB unified memory at 3840×2160 output. These controlled fixtures are bounded dependency checks, not natural-match victory or unrestricted battle benchmarks. Texture figures are accounted HD storage, not physical VRAM counters. Live intervals include display scheduling.

| Case | Accounted HD storage | Shared cap | Live p95 interval |
| --- | --- | --- | --- |
| YR temperate, 2x | 188.39 MiB | 256 MiB | 18.52 ms |
| YR temperate, 4x | 519.79 MiB | 768 MiB | 18.55 ms |
| YR snow, 2x | 212.25 MiB | 256 MiB | Not sampled |
| RA2 snow, 2x | 220.61 MiB | 256 MiB | See runtime receipt |
| RA2 temperate, 4x | 488.58 MiB | 768 MiB | 18.24 ms |

The matched YR temperate roster reduces allocation by 63.8%. All selected cases advanced simulation with no page errors, GL errors, context loss or unexpected demand-family rejection. Existing Original squid is recorded as `USER_REQUESTED_ORIGINAL` and is explicitly expected. Actual 2x Rhino pages are 160×144 versus 320×288 at 4x; NASAM/NALASR turret pages are 160×180 versus 320×360. Fifteen shared VXL families prove unchanged logical sizes/offsets and halved atlas rectangles/page dimensions across both densities, with smaller accounted storage. Allied controls include SPY/ADOG, MTNK, ORCA, CARRIER, E1/TANY, GAAIRC, GAPILE and GADEPT.

Same-tick 4x captures of APOC, HARV, HYD, ZEP and E2 restore the old footprint for the selected actor comparison, then capture the corrected footprint without advancing simulation. Direct 420×300 output-pixel crops were inspected without enlargement or sharpening. Diagnostic legacy footprints are never production settings. Early failed fixtures are retained: DRON and SCHP used incorrect object-type setup, and a later assertion initially treated the intentionally Original squid as an unexpected failure.

Validation: 49 focused tests / 8,004 assertions, entry typecheck, `git diff --check`, isolated immutable build/package, actual menu save/reload checks, 2x/4x runtime sampling/storage/geometry checks and native visual inspection. Prior 4x pressure evidence remains applicable because source resources and their 4x allocations are unchanged; this work removes unnecessary sampling rather than increasing storage. Windows is NOT_RUN. Technical PASS remains separate from user visual acceptance.

## Review and delivery

Self-contained review: `.artifacts/unified-density/Density-Options-Soviet-Clarity-Review.html`; machine-readable summary: `options-final-summary.json`. The runtime-tested package is `.artifacts/unified-density/options-package-v1/RA2-HD-Density-Options`, with its sibling resources and `Red Alert 2 HD Offline Trainer R1.app`. The final clean-source package and equality receipt are recorded in `.artifacts/unified-density/options-final-delivery.json` after the local commit. Existing applications, `dist`, profiles, resources and historical evidence remain intact. Continue fixes and visual acceptance in this execution conversation.
