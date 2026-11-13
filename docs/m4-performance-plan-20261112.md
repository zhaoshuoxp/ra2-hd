# M4: performance, cross-platform integration and resource storage

Date: 2026-11-12. Planning baseline: canonical local main `0693c3ca`. M3 content remains accepted. The user sets this order: Mac optimization, Windows optimization, return/integration with regression repair, and evaluation of more efficient resource storage. This record defines the next implementation scope; no performance changes or benchmarks have started.

## Confirmed target

- Main acceptance uses **4X HD, native output resolution and the current high-shadow settings**, preserving camera scale, UI scale and accepted artwork.
- Windows remains Ryzen 7 5800H, RTX 3070 Laptop and 2560x1600 output, as confirmed by the user. Capture current driver, actual GPU/backend, power mode and refresh rate during execution rather than copying historical values.
- The current host reports MacBook Air, Apple M2, 10 GPU cores and 24 GB unified memory. At benchmark start, record the actual game host, output dimensions, refresh rate and power/thermal state. Display resolution was not available from this planning probe.
- **Stable 60 FPS during the agreed large-map, many-unit workload is the minimum acceptable result.** Improve higher where measurable. Original and 2X are diagnostic controls, not substitutes for a failed 4X target. If the target remains unmet, report it as unmet; do not weaken acceptance silently.

Bind this target to a repeatable workload before modifying performance code: exact map/edition, native save or reproducible setup, seed, AI/player count, unit/building/projectile counts, game speed, view/camera path, resource hashes and settings. Start with the user's heaviest representative real match, include an eight-player/seven-AI scenario and a higher-pressure scenario within supported game rules. Record the finite tested scope instead of claiming unlimited unit scaling or arbitrary-hardware performance.

Capture frame intervals, per-second FPS, 1% low, p50/p95/p99/worst frame time, intervals below 60, long stalls and simulation progress. Sixty FPS corresponds to about 16.67 ms per frame; document refresh/sampling precision when a nominal 60 Hz display reports values such as 59.94. An overall mean above 60 cannot hide sustained under-target battle intervals. Define the sampling window and tolerance before A/B work, and retain all valid runs and outliers. Report loading separately; first sight of a new unit/effect during battle remains part of battle performance.

Display presentation, callback cadence and simulation throughput are separate measurements. Do not claim real GPU time or VRAM from unavailable counters. On a refresh-capped display, evaluate CPU/GPU headroom without claiming higher displayed FPS. Keep simulation ticks, game speed, timers, RNG, AI and animations correct. A renderer that appears smooth while simulation falls behind does not pass.

## Execution stages

| Stage | Scope | Exit evidence |
| --- | --- | --- |
| M4.1 | Mac baseline, bottleneck investigation and bounded optimization | Matched baseline/candidate runs, pressure results, visual/state checks and a stable Mac checkpoint |
| M4.2 | Windows optimization from the exact M4.1 checkpoint | Native Windows results at confirmed settings, committed changes, source/resource hashes and compact return evidence |
| M4.3 | Integrate Windows return with Mac, repair regressions | The actual integrated commit checked on both machines, with preserved visuals/semantics and matched performance evidence |
| M4.4 | Adopt a measured resource storage improvement, if qualified | Storage/load/peak-memory comparison, exact payload preservation and final both-platform checks with the chosen format |

Begin the storage inventory and a small prototype during M4.1. Keep format migration separately switchable so it cannot obscure CPU/render comparisons. If measurements establish resource I/O or preparation as the primary performance blocker, promote that bounded storage experiment earlier and validate the resulting format on both platforms. After any later storage migration, the M4.3 integrated performance result must be rechecked on the final build.

### M4.1: Mac

Reuse existing performance/debug instrumentation and prior accepted optimization records. Investigate current steady-state and first-use costs separately: simulation/pathfinding/AI, visible-scene updates and culling, draw submission, GPU workload, shadows/overdraw, texture preparation/upload, allocation/GC and cache lifetime. Optimize only measured costs. Reuse earlier successful fixes and preserve reverted/unproven AI experiments as reverted unless a new isolated proposal proves semantics.

Use baseline/candidate comparisons under identical settings, including a counterbalanced repeat when run-to-run variation could explain the result. Keep cold-start and warmed runs distinct. A pressure interval should cover ongoing battle, camera motion and repeated appearances; allow thermal stabilization for sustained measurements. Avoid an arbitrary full campaign replay or repeated packaging on each small edit.

### M4.2 and M4.3: Windows and integration

Prepare a self-contained Windows development handoff from the fixed Mac checkpoint. Include exact source base, only current required resources, reproducible build/run commands and diagnostic scenarios. Omit old apps, history, test recordings, unrelated profiles, credentials and intermediate media. Reuse resource files already on Windows when hashes match.

Keep this optimization sequence serialized: while Windows edits its exported baseline, do not make competing runtime changes on Mac. A Windows return must include its base commit, committed changes or a verifiable bundle/patch series, changed-file list, environment/settings, raw bounded performance traces, correctness evidence and any resource changes. Large resource payloads need not return if unchanged.

Integrate on canonical local main. Verify source ancestry or patch base before applying, inspect shared changes, and rerun the relevant behavior/visual checks. Then send the exact integrated build back to Windows for a focused check and repeat matched Mac checks. A passing pre-integration Windows candidate does not establish performance or correctness of a changed integrated build.

### M4.4: storage

Current selected payload is approximately 16.475 GiB across 16,444 files. Major logical categories at this checkpoint are media 5.455 GiB, terrain 2.779 GiB, prepared HD 2.655 GiB, campaign 1.739 GiB, HD packs 1.700 GiB and environment packs 1.407 GiB. These are selected payload sizes, not total development-folder allocation or measured reclaimable space.

The renderer already has prepared HD pages, a bounded cache and complete-family fallback; desktop media already supports byte-range streaming. Extend these boundaries rather than replacing them blindly. In particular, prepared-page copies currently protect cache ownership from mutable consumers; removing a copy requires proving lifetime and mutation safety.

Prototype an indexed, independently readable resource container with bounded chunks. Compare raw versus losslessly compressed chunks on representative terrain, sprites and prepared pages. Preserve source hashes and virtual resource identities, independent 2X/4X access, complete-family admission, cancellation, integrity checks and recoverable cache eviction. Keep authoring sources editable separately from runtime containers. Do not require whole-pack decompression or a second full permanent extracted copy to launch.

Keep already encoded movies streamable and seekable; measure any extra wrapping rather than assuming another compression layer helps. Storage compression and GPU texture compression are distinct proposals. Do not lossily compress remap indices, masks, depth/ownership data or accepted color/alpha samples as a storage shortcut.

Measure delivered bytes, installed bytes, file count, startup/map load time, first-use stalls, CPU decode cost, peak RAM/GPU charges, steady battle frame time and partial update size. A smaller archive can still make loading or frame time worse. Adoption requires a measured benefit without violating runtime correctness, accepted quality or memory limits. If no candidate qualifies, retain the existing format and record why; the task still delivers a concrete evaluation.

## Regression gates throughout M4

Optimization and correctness are one acceptance requirement. Each change receives focused checks before promotion; M4.3 adds integration checks rather than discovering all regressions only at the end.

- Preserve simulation at comparable ticks: identities, positions, ownership, health, orders, timers, resource values, RNG and task state where deterministic comparison is valid. Investigate drift rather than declaring faster execution equivalent.
- Compare deterministic same-tick/camera render samples for behavior-preserving rendering changes. Any visual difference needs explanation and review; no hidden lower density, removed shadows/effects or missing units may count as a speedup.
- Cover relevant edge cases from previous regressions: camera exit/re-entry, slopes and bridges, shadows/soft edges, remap colors, invisibility/reveal, infantry posture, independent turret bearings, construction/deploy/repack and destruction.
- Check affected RA2/YR campaign trigger/media paths, save/restart, mission transitions, resource fallback and UI/cameo publication. Do not rerun every accepted mission when a change has a narrower impact.
- Verify bounded caches and object/texture/decoder release over representative sustained use. Do not raise memory caps or preload everything to conceal stalls without an explicit evaluated design.

Retain the current accepted v0.5 baseline until a replacement is accepted. Keep technical, visual, user, platform and performance acceptance distinct. Useful regression tests remain; one-off experiments and redundant screenshots/packages are retired after retaining current source, compact measurements and required inputs. Five pre-existing YR diagnostic working files remain unrelated and preserved. No push, Release or external publication is included.

M4.1 changes the objective and should start in a new explicitly scoped execution conversation. Same-stage measurement corrections and feedback remain there. Windows uses its separate machine/account conversation; this main planning conversation coordinates the return and acceptance boundaries.
