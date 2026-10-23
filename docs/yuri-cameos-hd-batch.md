# Task E: Yuri HD cameos

Current status: `YURI_CAMEOS_E_VISUALLY_ACCEPTED`. The user accepts all 31 current canonical selections and their 12 rank aliases, including the Psychic Reveal black-fog correction. Exact selected master/export hashes are pinned in batch-acceptance-v2.json; all artwork and app bytes are unchanged by the acceptance update. See [the final handoff](yuri-cameos-final-handoff.md) and [acceptance record](yuri-cameos-final-acceptance.json) for the complete 31-picture review pack, restored approved Genetic Mutation image, targeted corrections, copied-app native validation and integration/resource manifest. The material below preserves the earlier preparation checkpoint; its pending work is historical.

## Historical representative checkpoint

Historical status: `THREE_REPRESENTATIVES_APPROVED_YAPOWR_TARGETED_CORRECTION`. The user approved INIT, LTNK and Genetic Mutator, and requested a targeted YAPOWR correction. This was an isolated preparation checkpoint, not a completed or accepted cameo delivery.

## Isolation and baseline

Worktree: `/Users/Aone/RA2remaster/ra2-hd-yuri-cameos`; branch: `task/e-yuri-cameos-hd`; full committed main baseline: `ee35fcf04de2d24c1bce2ee7497e4156483b21f1`. Main had concurrent uncommitted Task C source changes; none were staged, copied into source, committed, reset or captured in this branch. The Allied correction and Yuri unit worktrees remain independent. No peer commits are merged or cherry-picked; no push or publication is authorized.

The selected accepted UI pack is `remaining-ui-v4`, manifest SHA-256 `1da8b86dccd529314d83836c990e2bf0f542397e32cd8d65bc1cd904585a08d8`. Its 430 entries and actual files were copied independently into this worktree and hash-verified. `.artifacts/yuri-cameos/accepted-input-copies.json` records 317 selected files totaling 31,640,696 bytes. There are no shared resource symlinks. Development dependencies were copied using independent copy-on-write files; caches, evidence and exports remain local. Imported archives were read and hash-verified without copying whole archives for this preparation.

## Native inventory and identity

[The machine-readable inventory](yuri-cameos-inventory.json) is derived from the selected YR archive tree, actual `Rules`/`Art` parsers, `Production` eligibility and sidebar lookup contracts. It inventories 157 Yuri-owner candidates, retaining nonbuildable and capture-only exclusions. A synthetic complete native Yuri factory/prerequisite fixture plus explicit native stolen-tech flags yields 34 eligible roots: 15 buildings and 19 units. This is parser/production eligibility evidence, not an actual-match binding claim. The existing `General.ParadropPlane` compatibility lookup is reused; no statistics or gameplay rules change.

Building roots: NAPSIS, NACLON, YAPOWR, YABRCK, YAWEAP, YAYARD, YATECH, GAFWLL, YAGGUN, YAPSYT, YAGRND, YAGNTC, YAPPET, NATBNK, YAREFN. Unit roots: YURI, CCOMAND, PTROOP, CIVAN, YURIPR, YENGINEER, INIT, BRUTE, VIRUS, LTNK, YHVR, PCV, SMIN, YTNK, TELE, CAOS, BSUB, MIND, DISK. CCOMAND, PTROOP and CIVAN retain their native stolen-tech requirements. Psychic Reveal, Force Shield, Genetic Converter and Psychic Dominator contribute four power references.

There are 52 unique normal/alternate/power references: eight accepted shared reuses, 43 additions and one absent native reference. The additions comprise 31 canonical pictures and 12 shared-rank aliases. YAREFN and SMIN share one normal/alternate family. Existing NAPSIS/NACLON/engineer/stolen-tech art and accepted CCOMAND/PTROOP rank aliases remain unchanged. YACNST (`TechLevel=-1`), YADEPT (`TechLevel=15`), YACOMD and YAROCK are explicit native sidebar exclusions; no rule eligibility is altered to expose icons.

`engnuico.shp` is absent from the selected native archives and its unit is not trainable; preserve the native placeholder/fallback boundary. `inituico.shp` is byte-identical to `ltnkuico.shp` in `langmd.mix/cameomd.mix`. This source collision must not produce a sharp tank icon for INIT. The task-owned alias plan uses the correct INIT base plus the existing shared rank overlay, while recording both native source hashes. Other new native rank pairs differ only within the top-left rank footprint. CAOS/MIND declare alternates but are untrainable; export those declarations without claiming natural sidebar visibility.

All current scoped native canvases are 60 x 48. Cameo filenames do not use world theater suffixes or owner-color masks. The UI selects fixed 4x independently of world Original/2x/4x; preserve the separate 16 MiB UI ceiling. Standard exports are 240 x 192 and 120 x 96, each from the same higher-resolution master. The 2x companion is an export path, not a newly selected or tested runtime policy.

## Direction and rejected candidates

The user requires the original picture's design, framing, palette and proportions to remain as close as possible; restoration adds clarity without redesign. The Initiate's head-adjacent light is ordinary sunlight, not a laser or psychic beam. The Lasher must remain squat, sit higher within the frame and use the native slightly downward viewpoint. The Bio Reactor picture contains one near reactor building and two farther buildings; **each building has three reaction chambers**, not three chambers across the entire picture. Dynamic text, rank overlays, quantities, queue progress, disabled lighting and selection remain live runtime UI.

The user's subsequent decision accepts the other three representatives and requests larger gaps between the three YAPOWR buildings, smaller foundations and less yellow color. The lower assembly must narrow inward to mirror the upper convergence, then connect to a separate low pedestal. The latest clarification makes that pedestal equal in width to the three-chamber middle body, while keeping the lower neck narrow and the base shallow. Pale white/ivory glass, mild lower yellow shading and darker iron/copper match the native source. `.artifacts/yuri-cameos/representative-acceptance-v1.json` pins the three approved master hashes and all six 2x/4x exports. Targeted YAPOWR regeneration does not alter those images or reopen their direction approval. The standalone spacing/color and smaller-foot attempts remain retained and superseded by the clarified lower-body and pedestal-width correction.

Representative subjects are INIT, LTNK, YAPOWR and the Genetic Mutator power icon. Built-in imagegen prompts, raw boards, masters, both export densities and review receipts are retained under `.artifacts/yuri-cameos/`. The first board is rejected for fidelity and panel overlap. The second remains rejected for low tank placement/camera and the misinterpreted reactor arrangement. A focused third correction addresses these requests. No rejected board is selected for runtime or batch production.

Task C's direction-approved YAPOWR master is retained as an independently copied, hash-pinned design reference. It is not final C acceptance or an E production binding; the user's cameo composition takes precedence. Task D was at source-audit/representative preparation when inspected; no stable accepted D master was bound. Later materially changed C/D designs need a targeted identity consistency review, not a repeat of unrelated icons.

## Validation and remaining work

Preparation passed 12 focused existing UI tests / 101 assertions and entry type checking. The tests cover original geometry, rank alias decode sharing, resource registration, budget/release behavior and production animation handoff. The native inventory and all 317 accepted input copies have verified hashes. Early inventory drafts remain retained: the first lacked the negative-tech-level Construction Yard factory seed; later drafts refined rank/source-collision classification. `inventory-v4` and the tracked inventory supersede those draft counts and classifications.

The third representative is `.artifacts/yuri-cameos/representative-v3/generated-board.png`; its four 701 x 561 masters directly produce eight verified RGBA exports at 120 x 96 and 240 x 192, without upscaling a 2x export. The review is `.artifacts/yuri-cameos/representative-v3/Yuri-Cameos-Representative-Review.html`, with a companion `comparison-board.png`. Chromium validation passes all 12 embedded images, native 60 x 48 preview bounds, 240 x 192 inspection bounds and working scaling controls, with zero external requests or page errors. The four candidate 4x textures would allocate 737,280 bytes; this is an exact export-derived bound, not measured total HUD residency. Initial sandboxed WebKit and Chromium launches failed before loading the page and remain separate from the successful isolated `page-check-chromium-v2` run.

The user finds the v6 reactor design acceptable overall and requests slightly higher placement plus a longer lower curved-pipe connection to the pedestal. The current targeted review is `.artifacts/yuri-cameos/representative-v7/Yuri-Cameos-Representative-Review.html`, with `yapowr-comparison.png` showing the native source, v6 candidate and current correction. Its YAPOWR master is the standalone 1402 x 1122 built-in imagegen output in `yapowr-correction-v7`; the raised composition and longer lower connection retain the wider low pedestal and inward-tapered assembly. Export validation preserves all three approved masters and six approved density exports byte-for-byte, checks all eight current exports, and leaves only `ypwricon.shp` pending. The isolated Chromium review again passes 12 embedded images, scaling controls and native-size bounds, with zero external requests or page errors. Earlier targeted candidates remain retained.

The representative exports and embedded local review are structural/visual preparation only. Actual YR sidebar categories, queued/disabled/progress states, alternate bindings, negative controls, allocation peaks, rapid switching and copied macOS review-build validation remain pending after direction approval. No new runtime pack is selected. Full production, one isolated implementation build, task-specific packaging, complete native-size review and final human acceptance are outstanding. Windows is `NOT_RUN`. Final combined-build acceptance is separate.

`fix/allied-animation-sidebar` owns the page-switch Original/HD flashing and asynchronous current-item checks. E has no competing timing/cache patch and no shared source edits at this checkpoint. Production will deliver an additive URI/identity delta against the accepted predecessor rather than replacing main's entire evolving UI catalog or profile. The expected final combined manifest count is 473 if all current 43 additions remain selected, below the existing 512-entry limit; demand residency still requires actual native measurement under the 16 MiB cap.

## Reproduction

```sh
bun scripts/ui/yuri-cameos/inventory.ts /Users/Aone/RA2remaster/ra2-hd/.local
python3 scripts/ui/yuri-cameos/export-review.py .artifacts/yuri-cameos/representative-v3/generated-board.png representative-v7 .artifacts/yuri-cameos/yapowr-correction-v7/generated-master.png representative-v6
python3 scripts/ui/yuri-cameos/resource-manifest.py representative-v7
bun test scripts/ui/ui-art.test.ts scripts/ui/cameo-geometry.test.ts scripts/ui/ui-profile.test.ts scripts/ui/production-frame.test.ts
bun run typecheck:entry
```

Inventory and export scripts reject differing existing evidence bytes. Use a new task-local evidence revision for changed inputs. The review page embeds its images and opens independently without peer resource paths or a shared server. Integration status: `NOT_MERGED`.
