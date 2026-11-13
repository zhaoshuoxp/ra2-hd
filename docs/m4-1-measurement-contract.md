# M4.1 measurement contract

The starting source is canonical local main `be4e59ff1764ba8ef92c50e1080ce1a6c5e45cf3`. The production baseline is frozen under `.artifacts/m4-performance-20261112/baseline-runtime`, with its complete code inventory in `baseline-runtime.json`. It shares the canonical selected resources. The five unrelated YR working files and all 245 real-profile files are hash-pinned in `workspace-before.json`; no real save is opened or modified.

## Fixed measurement

The contract is defined before runtime optimization in `scripts/m4/statistics.mjs`. A formal window is 120 seconds, including battle first-use stalls. Every positive callback interval is retained. Loading ends before artificial placement; the first rendering, preparation and upload of newly placed units remain inside the battle window. Fresh isolated processes/profiles define cold application caches; the OS and driver caches are not flushed.

Average callback FPS is interval count divided by their summed duration. The 1% low is 1000 divided by the mean of the slowest `ceil(N * 0.01)` intervals. Quantiles use nearest rank. Reports retain per-second callback counts, raw and tolerance-adjusted time below 60, contiguous low bins, all stalls of at least 50 ms, CPU update/submission/simulation time, native ticks and missed tick opportunities. The fixed cadence tolerance is 0.35 ms around 16.6667 ms; the complete-bin tolerance is 0.5 callbacks/s. The callback gate requires at least 99% elapsed interval time within that budget, no two consecutive complete bins below 59.5 callbacks/s and at least 99% nominal simulation throughput. Raw 59.94 values are reported without rounding them to 60.

The sampler is a main-thread rAF callback, timed with `performance.now()`, after the game's callback. It is not an independent screen-present counter. GPU elapsed time, actual VRAM and presented-frame count are unavailable. CPU render time means submission, including synchronous driver work; it does not measure asynchronous GPU completion. Diagnostics and screenshot/pixel controls run separately from formal timing. The GPU renderer, actual framebuffer, display refresh/scale, power and thermal state are recorded for each run.

## Native workload

RA2 uses `mp27t8.map`; YR uses `xmp27t8.map` (Long March). Each run records the exact loaded map SHA256, map CRC, lobby settings, timestamp seed `1700000000000`, placement hash and every initial placement. One human combatant and seven Brutal AI use native rules, production, pathfinding, attacks and effects. AI functions and simulation cadence are unchanged. Default solo speed tier 2 requests 67.5 ticks/s. The scene is explicitly artificial: legal foundations receive five buildings per player, and legal ground tiles receive 48 units per player (`dense`) or 96 (`overload`), split between vehicles and infantry. The original MCVs remain. The initial input queues native attack-move orders toward the center. Revealing the human shroud is a declared setup parameter.

The normal camera zoom remains 1. Camera panning follows the simulation tick: center plus `sin(tick / 180) * 850` horizontally and `sin(tick / 360) * 450` vertically. This crosses the central bridge, coast and sloped terrain, with units leaving and reentering view. Object counts every five seconds expose attrition and later AI development; a lighter late interval cannot establish sustained heavy-battle acceptance. Original and 2X controls keep all other inputs fixed.

Formal runs seed the native simulation and retain the engine's ordinary non-simulation visual `Math.random` behavior. Terrain variants, idle visual phases and effect choices can therefore vary. This limits attribution of small whole-game differences; initial placement/native state hashes and the repeat series remain explicit. Static pixel controls separately normalize these visual choices. Thermal labels are coarse, and OS/driver caches and background utilization are not fully controlled; no clock-frequency or background-load cause is inferred from a low run alone.

The `sustained` variant begins with the same 392 units and 44 buildings. Each player receives 100,000 initial credits. The human MCV receives the native deploy order. At tick 120, each player's native tank and infantry queues receive 99 orders; the human receives another attack-move order every 450 ticks. The complete input list is retained in each report. Nothing is spawned after setup. Native construction, production, attacks, AI and resource consumption continue normally. This maintains an active load beyond the initial attrition phase.

The confirmed Mac output is the DELL S2722QC at 3840x2160, scale factor 2, approximately 59.9967 Hz. The built-in Retina display remains attached. Acceptance retains native output, 4X HD, high shadows, original camera scale and UI size. No resolution emulation is used.

## Commands

```bash
bun run desktop:prepare
node scripts/m4/benchmark.mjs --runtime=/absolute/frozen/runtime --out=/new/output --edition=yr --scene=dense --phase=measure
node scripts/m4/benchmark.mjs --runtime=/absolute/frozen/runtime --out=/new/profile-output --edition=yr --scene=dense --phase=profile --seconds=25
node scripts/m4/benchmark.mjs --runtime=/absolute/frozen/runtime --out=/new/pixel-output --edition=yr --scene=dense --phase=explore --static=1 --density=4
```

Runtime directories contain the production `dist`, `desktop` modules and `package.json`; resource payloads remain shared. Output directories must be new. Each run uses its own profile. `--density=2` and `--density=0` select diagnostic controls. `--static=1` freezes tick zero and both animation loops, fixes the world animation clock/interpolation, holds visual random draws at their midpoint and gives UUID construction a separate seeded stream. This controls terrain variants and idle poses without identifier collisions or changing the simulation PRNG. It publishes visible resources and captures repeated center, exit, reentry and opposite views. Match the decoded RGBA bytes between frozen baseline and final; this diagnostic establishes no battle FPS or user visual acceptance. `--app=/absolute/Red Alert 2 HD.app` runs the actual Mac delivery with its embedded resources. A fresh standalone runtime uses the installed host Electron executable, including on Windows.
