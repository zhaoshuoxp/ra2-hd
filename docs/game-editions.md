# RA2 / Yuri's Revenge edition separation

Status: `MAC_REVIEW_DELIVERED_USER_ACCEPTANCE_PENDING`. The latest presentation/AI follow-up is [R2](game-editions-feedback-r2.md), with [remaining retail differences](game-editions-fidelity.md). Runtime implementation and earlier evidence are tracked in [game-editions-runtime.md](game-editions-runtime.md). The historical groundwork below describes the starting assessment; reproduced parser failures have since been addressed. The user explicitly requires both editions to support complete retail-rule skirmishes in this task, together with the two-cover startup selector. A selector-only release, disabled Yuri mode or partial-unit substitute is not an accepted delivery. Campaign execution is excluded for now; eventual Allied/Soviet campaign catalogs must remain edition-specific. Isolated native builds now play both editions; the current Mac review candidate and its exact verification boundaries are tracked in the runtime report. Original-AI-script and exact binary/visual parity are not claimed.

The independent `game-edition-selection` worktree starts at accepted UI correction checkpoint `80943b8`. The existing UI branch, Desktop R2 archive, normal application entry and all accepted artwork remain unchanged. This work stays local and sequential, without subagents or publication.

## Historical groundwork

- `scripts/editions/audit.ts` reads seven explicitly named local archives, preserves raw `rules`/`art`/`ai`/CSF/map-catalog members, records container ownership and SHA-256, and compares both complete type registries. Local archive authenticity remains unverified independently; CnCNet, loose overrides and executables are not imported or run.
- `.artifacts/editions/audit/` contains separate source catalogs. RA2 resolves its base rules from `ra2.mix/local.mix`. Yuri resolves `rulesmd.ini` from the patch archive `expandmd01.mix`, and its art/AI from `ra2md.mix/localmd.mix`. Their rules hashes are `fd1e95cea0306ea78049dc81c8cd816e18c28c496872a1ff02edd50bd082062f` and `3d341ef8a13a4b5ab24af2eef48ac94931ac2bb87d950fe3330a07e2d25672ef`.
- Retail catalogs identify nine RA2 multiplayer countries and ten Yuri countries including `YuriCountry` / `ThirdSide`. Country count alone is not compatibility evidence. Captured-factory prerequisites, required/forbidden houses, cloned units and existing-side changes must use each complete rule set.
- `src/editions/GameEdition.ts` defines distinct archive precedence, rule/art/AI/CSF/map identities and preference namespaces. It was initially unwired; the runtime implementation now uses it.
- `EditionSelect` implements two large keyboard-accessible poster buttons. Its isolated review uses the user's two JPEGs, embedded unchanged, with `object-fit: contain`. No generated faces, logos, crop or stretched proportions. The preview passes click, Tab, Enter and Space at six viewport sizes, including 16:9, 16:10 and MacBook-like ratios. It is an interface preview, not a launcher or gameplay proof.

## Historical reproduced engine failures

`scripts/editions/probe.ts` runs the current rule readers against the archived files. RA2's full rules constructor passes. Yuri's constructor fails on `Unknown side "ThirdSide" for country "YuriCountry"`. Its five additional special-weapon types do not parse to executable types: `PsychicDominator`, `SpyPlane`, `GeneticConverter`, `ForceShield`, and `PsychicReveal`. The existing engine selection method also returns `RedAlert2` unconditionally. These are reproduced failures, not missing artwork or menu wiring.

The following are minimum implementation/verification obligations, not an exhaustive declaration of unsupported tags:

| Area | Retail examples | Required runtime evidence |
| --- | --- | --- |
| Edition lifecycle | Complete RA2 / YR resources, maps, translated strings, rules and AI | Cold-start choice, switching without stale VFS/HD caches, independent preferences, no expansion units in RA2 |
| Third combat side | YuriCountry, PCV/YACNST, Yuri factories, radar and loading | Starting force, construction, all production queues, power, prerequisites, capture and defeat |
| Slave economy | SMIN/YAREFN, five SLAV workers, respawn/reload rates | Deploy/relocate, mining/deposit, worker loss/replacement, miner loss and freed slaves |
| Magnetron | TELE, MagneticBeam / LocomotorBeam | Lift, pull, drop, terrain/water/bridge collision and cancellation/ownership changes |
| Gatling | YTNK/YAGGUN, three stages | Ground/air stages, elite thresholds, spin-down, target changes and power |
| Mental effects | MIND, YAPSYT, CAOS, Yuri Prime | Capacity/overload, release on death, berserk target allegiance, immunities and building control |
| Flying disc | DISK, DiskLaser / DiskDrain | Combat, income/power drain, termination, target ownership and destruction |
| Mobile firing | BFRT, open-topped passenger weapons | Range/damage bonuses, target choice, movement, unloading, death and temporal-link distance |
| Siege aircraft and missiles | SCHP, BSUB | Air/ground deployment state and weapon switching; submerged torpedoes versus cruise missiles |
| Airstrike | BORIS, Flare/BPLN | Designation, aircraft count/recharge, abort and target loss |
| Building systems | Tank bunker, bio-reactor, robot control, industrial plant | Occupancy bonuses, infantry power, robot power loss, factory costs/build speed, captures |
| Expansion superweapons | Five new types above | Charge/target/power rules, effects, immunities, lasting ownership, allied use, cleanup and AI |
| Existing-rule changes | Cloning vats, Yuri, country-specific units, existing prerequisites | Retail availability, veterancy, economy and captured-tech regression across both editions |
| AI and complete match | All ten countries, all three sides | Legal expansion economy/tech/production, combat, naval use, superweapons, victory/defeat, restart |

Some generic support already exists (for example recycler tasks and single-target mind control). It must be checked against the expansion's actual semantics; it must not be reported as completely absent or automatically compatible. Do not silently map unknown effects to ordinary damage or replace missing units with RA2 units.

## References and current limits

The local original `Manuals/Yuri_s Revenge - English - Manual.pdf` (36 pages) describes the expansion systems above. Text was extracted read-only to ignored evidence. Rule numbers and ownership come from archived INI files, not wiki recollection. The user's provided cover images are the visual reference. The [EA support discussion](https://forums.ea.com/discussions/command-and-conquer-franchise-en/red-alert-2-wont-start/7264989) corroborates the separate-edition launch interaction, but no authoritative screenshot of that selection dialog was located; the current design must not be labeled a pixel-identical EA recreation.

The attached image sizes limit poster detail; this preview does not claim authored HD cover art. Historical Windows/native-input limitations remain unchanged. UI preview PASS and rules inventory PASS cannot substitute for the user's required complete two-edition skirmish acceptance. The historical selector-only checkpoint was not a gameplay deliverable. The current playable review must retain the explicit fidelity limits in the runtime report.

## Reproduction

```sh
bun scripts/editions/audit.ts '/Users/Aone/RA2remaster/Resource/Command and Conquer Red Alert II'
bun scripts/editions/probe.ts
bun test scripts/editions/edition.test.ts
bun scripts/editions/build-preview.ts '<RA2-cover.jpeg>' '<Yuri-cover.jpeg>'
node scripts/editions/check-preview.mjs
```

Current preview: `.artifacts/editions/selection-preview/review.html`; all images and scripts are embedded. Continue the same full objective in this task; this checkpoint is not a scope reduction or final delivery.
