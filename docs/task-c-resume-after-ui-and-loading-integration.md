# Task C resume contract after E, Allied and loading integration

Local main now contains accepted E, accepted Allied corrections and the technically validated skirmish-loading optimization. C's final visual acceptance and user loading-experience acceptance remain pending. Windows is unverified and D is not merged. This supersedes the earlier E handoff's statement that sidebar/loading branches remained excluded; historical reports remain unchanged.

Canonical checkout: `/Users/Aone/RA2remaster/ra2-hd`, branch `main`. Pre-integration main was `3bf42ee86e11b97202432bf33c8e421462c176b2`; reconciliation merge `5236c23` retains it and loading tip `c8134d71da67e81b3146f110b652ede48c6e077d`, which already contains Allied tip `3b4202a8862ce637e3322dd0e31efaba87499149`. Promoted source checkpoint: `78e6f17aee5f392f731bac069e697bfaf23b5069`. Closure documentation follows; obtain the exact delivered final HEAD from `.artifacts/allied-loading-main-integration-v1/final-checkpoint.json` and recheck live `git status`/`git rev-parse HEAD` before editing. These are observations, never reset targets.

Read current main's `AGENTS.md`, [integration report](allied-corrections-loading-main-integration.md), [integration/resource receipt](allied-corrections-loading-main-integration.json), `desktop/hd-profile.mjs`, `desktop/yuri-building-coverage.json`, `desktop/allied-building-coverage.json`, `desktop/allied-unit-contracts.json`, `desktop/prepared-hd-contract.json` and actual `.local/ui-selection.json`. Continue C's already selected corrections and acceptance in its existing execution conversation. Preserve newly active work and all peer branches/worktrees; do not restore historical whole files or resource pointers.

## Combined contracts to retain

Current C feedback R4 selects immutable `c4-feedback-r4` temperate/snow resources for 13 construction families; see [yuri-buildings-feedback-r4.md](yuri-buildings-feedback-r4.md) and its [incremental evidence](yuri-buildings-feedback-r4.json). It corrects curved reactor half/full occupancy, local construction motion, Gatling completion alignment, Dominator's closed guard frame, native bunker hull alignment and proportional miner packing keys. Native Mutator building electricity remains retained. The selected prepared contract is `91ffd6383a34f2bb2e2886246694271f04d22816b365e68c43419c47b1cf3fde`, with 570 historical/current manifest identities and 1,538 pages; current registration has 459 bindings and 1,224 selected pages. Complete C still covers 16 applicable identities and 33 theater selections in both densities. Resource promotion adds 1,182 immutable files without replacing existing paths. Accepted UI/Allied/Soviet, logical geometry and all caps remain preserved. C visual acceptance remains pending. The earlier c2 Mutator correction and its `21e525...` preparation are historical and retained; see [yagntc-building-electricity-fix.md](yagntc-building-electricity-fix.md).

- E UI remains `yuri-cameos-e-main-v1`, 474 entries, manifest SHA-256 `052c1ca0294344e21b3bb4fe881aece611232000e6efc3ec2ad1306efaf3a890`. Retain its 430-entry baseline, 31 canonical additions, 12 rank aliases and Yuri loading background. Do not select an older UI pack.
- Retain E's independent world/UI roots, returned `uiRoot`, desktop propagation and `/local-ui/` containment. Retain bounded Yuri loading preparation, native layout/labels/progress/portraits, Original fallback, HD switching and lease release. World-density preferences remain independent from UI.
- C's current R4 construction and operating corrections, Mutator electricity, native bunker docking/alignment, dual-density turrets, independent owner/remap pools and lookup maps remain selected. The map-layout repair and original logical camera/input geometry remain preserved. Complete family-relative resources are mandatory even when different families share turret hashes.
- HQ temperate/snow stays `animation-r5`; Prism temperate/snow and E1 stay `animation-r9`. Retain the accepted fixed HQ mount, rigid Prism rotation and stationary GI fortress. No new Allied or E art decision is implied by C continuation.
- Retain coherent asynchronous sidebar publication, current-model/generation guards, published-item click targets and bounded leases/visited-page retention. Preserve Original/2X/4X and complete-family fallback.
- Caps remain 128 MiB prepared CPU cache, 16 MiB maximum retained CPU page, 256 MiB world HD at 2X, 1280 MiB at 4X and separate 16 MiB UI. Do not raise them to fit a revised family.

## Prepared-resource lifecycle for future C artwork

The compiled contract is `desktop/prepared-hd-contract.json`, currently pinned to `91ffd6383a34f2bb2e2886246694271f04d22816b365e68c43419c47b1cf3fde`. Its source index is `.local/prepared-hd/indexes/<index-sha>.json`, immutable validation proof `.local/prepared-hd/proofs/<index-sha>.json`, and payloads `.local/prepared-hd/<manifest-sha>/<density>/<page-id>.bin`. Current preparation covers 570 distinct historical/current manifests and 1,538 pages; canonical registration has 459 bindings including aliases and 1,224 selected pages. These ignored files are not transferred by Git.

When a C source manifest/page changes, create a new immutable resource revision and update the selected family hash/path. Keep its validated fallback PNGs, source/native metadata, both density dependencies and family-relative turret/maps. An unmatched prepared entry naturally uses fallback; never relabel old payloads or rewrite their index hashes as if they belonged to the new art.

Regenerate in a private worktree/resource root using the validated Electron pipeline, sequentially for both editions:

```sh
bun scripts/skirmish-loading/prepare.ts ra2
bun scripts/skirmish-loading/prepare.ts yr
```

The generator can reuse an existing index only after its pinned hash, matching proof and all indexed payload hashes pass. To reuse it in a new private root, independently copy the versioned index, proof and all referenced binaries explicitly; the current isolation helper must not be assumed to copy every preparation artifact. If that complete proof bundle is unavailable, regenerate from selected PNGs with the same Electron decoder. Do not substitute a decoder with different alpha rounding. Changed manifests need newly validated resolver-equivalent pixels, including independent owner pools and categorical lookup textures.

Preserve older resource/proof paths. Commit the newly generated compiled contract with the selected catalog change, exclusively copy missing resources to the intended main root, and validate actual registration. Build from that committed combined baseline. Use the main `scripts/editions/package-mac-test.mjs` recipe with `--require-prepared` when delivering an optimized review; include current desktop modules, immutable index, needed binaries, fallback PNGs, both density dependencies and the current E UI sibling root. Never use `--link-resources` or share a writable peer root.

Validate only affected family/pool/native phases, actual copied-application bindings and bounded loading/cache evidence. Reuse accepted unchanged evidence. A changed manifest with honest PNG fallback is allowed during correction work, but cannot be described as fully optimized packaged loading until its matching preparation is delivered and verified. Do not infer user loading or C visual acceptance from technical passes.

## Current review and acceptance boundary

The current C review is the Feedback R4 Desktop ZIP documented in [yuri-buildings-feedback-r4.md](yuri-buildings-feedback-r4.md). Its runtime source is `feb7656`; later review/documentation commits do not change the tested app. It includes complete independent world/UI roots and an embedded native image/video review. Soviet widespread fallback remains `NOT_REPRODUCED` in the selected fresh-profile roster; user retesting is pending. The earlier combined integration launcher and timings below remain historical evidence.

Review launcher: `/Users/Aone/RA2remaster/ra2-hd/.artifacts/allied-loading-main-integration-v1/delivery/RA2-HD-Main-Allied-Loading-Review-R1/Launch-Isolated-Review.command`.

Review app: `/Users/Aone/RA2remaster/ra2-hd/.artifacts/allied-loading-main-integration-v1/delivery/RA2-HD-Main-Allied-Loading-Review-R1/Red Alert 2 HD Main Allied Loading Review R1.app`.

Keep `RA2-HD-Editions-Resources` and `RA2-HD-UI-Resources` beside the app. Its relocatable wrapper discovers those roots and creates its own new `Review-Profile`; no task-worktree environment override is required. The actual copied launcher passed E 474-entry discovery and native HQ/Prism/GI/C binding checks plus registered-handler/native-queue click verification.

Fresh combined YR times were 3.484/4.366 s at 2X and 6.302/5.274 s at 4X for first/same-process repeat entry, with zero timed HD PNG requests. They replace no historical measurement and guarantee no fixed latency. The integration used 60 focused tests plus three current C family tests, entry typecheck, one production build and bounded native samples. Raw failed fixture receipts remain retained with narrow successful followups.

E and Allied remain `USER_ACCEPTED`. C visual and user loading-experience acceptance remain `USER_REVIEW_PENDING`; Windows is `NOT_RUN`, physical pointer/panel acceptance is not claimed, and D remains separate. Preserve old apps/resources/profiles/dist/evidence and all source branches. No push, cleanup, extra art, automatic task creation or automatic message to another conversation is authorized.
