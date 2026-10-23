# Rhino M1.3e — accepted prototype and main-planning handoff

Prepared: 2026-09-18. Repository: `/Users/Aone/RA2remaster/ra2-hd`; branch: `m0-2-stabilization`. Revalidated acceptance baseline: `b774567`, with a clean worktree before this documentation-only handoff. Revalidate the current checkout before subsequent implementation and preserve all later changes.

## Answer: is the accepted Rhino applied to the game?

**It runs inside the actual game engine in the dedicated comparison fixture. It is not integrated into normal-match vehicle creation and is not the default Rhino.** Visual acceptance closes the bounded artwork/runtime review; it does not mean normal-game deployment is complete.

| Entry or behavior | Current state |
| --- | --- |
| Dedicated `play-rhino-eight.mjs` comparison | Implemented: actual world-rendered artwork, independent body/turret views and native movement commands |
| Normal offline/skirmish startup | Original Rhino remains active; no production Rhino override |
| Rhino units built through ordinary production | No automatic attachment of the new renderer; current adapter attaches only to harness-created fixtures |
| Other owner colors or firing states in the fixture | Complete original-family fallback; fixed reference red is the only supported artwork color |
| Existing application bundles | Preserved without rebuilding; this task delivered no desktop Rhino update |

Code evidence: `scripts/m1/play-rhino-eight.mjs` enables `M13E_DIAGNOSTIC`; `scripts/m1/serve-power-plant-game.mjs` exposes `/rhino-eight/` only under that flag. `scripts/m1/run-rhino-eight.mjs` creates fixture units and explicitly installs `RhinoPartsProof` on those renderables. Production application entries and the ordinary vehicle lifecycle do not import/install this adapter. The underlying 153-file game build is byte-identical to the accepted final M1.4 build; the diagnostic adapter and artwork are served separately.

## Accepted result to preserve

Status: **EIGHT_HEADING_RUNTIME_PASS / EIGHT_HEADING_VISUAL_ACCEPTED**. The user explicitly accepted M1.3e after the native-size review and actual movement video.

- Eight body headings and eight independently selected turret headings, covering 64 combinations. The software chooses the nearest 45° view while native aiming and movement remain continuous.
- Realistic, detailed off-white/red artwork with the accepted lower-profile turret. The prior tall turret was rejected. Accepted M1.3d 0°/90° pixels remain unchanged, with transparent padding only.
- Native-size appearance, turret attachment and reviewed direction transitions accepted at reference height **900**. Finer heading production is not currently required by the accepted visual result.
- Two world layers use the existing production C material path, not a screen overlay or a preassembled full-tank frame. Actual selection, camera movement and native movement commands are demonstrated.
- Original camera, logical vehicle bounds, body/turret/barrel transforms, targeting, rotation speed and gameplay rules are preserved. Sixteen 320 × 288 RGBA textures use a transparent 80 × 72 logical canvas; extending the canvas did not enlarge the vehicle.

Preserve the earlier decisions: the M1.3 geometry experiment and M1.3b surface-transfer result did not meet the visual target. The realistic M1.3a target, M1.3c single-pose runtime, M1.3d lower-profile revision and M1.3e eight-heading result were subsequently accepted within their stated scopes. Do not reopen rejected routes or reinterpret the accepted artwork as unapproved.

## Evidence and its limits

Recorded implementation checks passed: 44 tests / 17,379 assertions; entry and adapter typechecks; all 153 final M1.4 build files matched; 64 combinations at 1080p and 16 at 4K; 112 depth controls; selection, pan, resize, resource reuse and disposal. Review-v2 reports zero changed pixels outside the Rhino canvases and zero changes in transparent support.

The final movement run issued four native commands over 8.09 seconds. All 161 sampled ticks, including 36 with nonzero turning velocity, retained the new artwork. That route observed seven body headings; 45° was verified separately in the static combination set. Do not describe this as an eight-direction production/combat test. An earlier moving-only assertion missed stationary-turn fallback; the inherited `spinVelocity` exclusion was corrected, and the final check includes moving, turning and stopped frames. Historical failed/superseded evidence is retained.

This handoff reverified 504 acceptance-bound evidence hashes. It did not rerun gameplay or alter the accepted assets. Historical `VISUAL_REVIEW_PENDING` labels in immutable review/capture files are superseded by the separate visual-acceptance receipt, not evidence that user approval is missing.

| Remaining gap | Why it matters for normal gameplay |
| --- | --- |
| Fixture-only renderer installation | Existing, newly produced and subsequently removed Rhino units need normal lifecycle integration |
| Fixed reference red; no authored owner remap | Other players' units currently revert to the original; red pixels must not be incorrectly shown for another owner |
| Firing restores original art | A production vehicle would visibly switch appearance during ordinary combat |
| Static tracks; no independent authored gun recoil | Movement footage validates translation/turning, not tread animation or a completed firing presentation |
| Folded layer depth and original VXL shadows | These are approximations; bounded overlap checks do not establish arbitrary intersection or slope correctness |
| Unsupported terrain/effects/destruction states | Complete original fallback remains required until each state is deliberately supported and checked |
| Small macOS Chrome fixture | Long battles, large groups, Windows, physical-panel fidelity and packaged-app behavior remain unverified |

## Recommended next task for the main planning conversation

**Proposed title: M1.3f — Rhino normal-match integration, owner remap and firing continuity.** This is a planning recommendation, not implementation authorized or started by this handoff. The main conversation should select the final scope and issue a concrete execution prompt.

Objective: make the already accepted Rhino appearance usable for ordinary HTNK units in a real skirmish, including player color and ordinary firing, with reversible original-art fallback and no gameplay changes. Avoid spending the next task on redoing the accepted style, making larger previews, changing the camera or producing finer headings without a demonstrated need.

Suggested bounded sequence:

1. **Normal lifecycle and asset loading.** Move the necessary prototype behavior into a maintainable opt-in normal-game path. Resolve HTNK identity and its original VXL/HVA family, load all sixteen authored components as one verified family, and attach/dispose resources for existing and naturally produced Rhino units. Provide an explicit original/HD control. Missing, corrupt or disabled resources must preserve complete original rendering. Do not depend on injected debug scripts, fixture-only unit creation or the comparison toolbar.
2. **Owner color and firing continuity.** Add reviewed remap data without repainting neutral armor or losing the accepted material/shading. Check multiple opposing owner colors. Support ordinary native firing without whole-vehicle visual replacement; preserve weapon timing, targeting, projectile origin and damage. Check gun/muzzle/recoil visual alignment against the native behavior before choosing any additional artwork. Never hide a misalignment by moving gameplay coordinates or changing rules. Review any added masks, effects or changed pixels at native size.
3. **Actual-match acceptance.** Demonstrate naturally built Rhino units moving, turning, independently aiming, repeatedly firing, taking damage, becoming obscured and being removed, alongside accepted Conscript/GAPOWR. Verify original mode and complete-family failure fallback. Present same-density native-size comparisons and real gameplay footage, then obtain visual/gameplay acceptance for this new scope.

Recommended initial activation policy: opt-in in the normal game, with original mode immediately recoverable. The execution prompt must distinguish “available in normal matches” from “enabled by default.” Default activation should be an explicit decision after the new gameplay gate, not inferred from M1.3e art acceptance. If the main conversation chooses a smaller integration-only task, name the remaining color/firing fallback clearly and do not label it a completed production Rhino.

Keep the already accepted eight-direction presentation and static tracks for the first integration scope unless a specific native-size problem requires changes. Finer headings, tread animation, arbitrary slope artwork, other vehicles/buildings, campaigns and desktop packaging should remain separate additions. Rendering/asset changes needed for the selected scope must preserve the accepted production C path and reference height 900.

Suggested completion criteria for the selected integration task:

- Ordinary game startup can enable the HD Rhino, and natural HTNK production uses it without harness attachment.
- Owner colors are correct, independent aiming remains intact and ordinary firing does not pop back to the original vehicle.
- Original geometry, camera, input/selection coordinates, pathfinding, weapon rules, damage and timing are unchanged.
- Explicit original mode, missing/corrupt-family fallback and resource teardown work; unsupported states remain honestly documented.
- Native-size visual/gameplay review passes with simultaneous accepted Conscript/GAPOWR; technical PASS alone is not final acceptance.
- Final report states the activation default, remaining limitations, local commit and exact runnable entry.

## Files and checkpoints to give the next executor

Repository root: `/Users/Aone/RA2remaster/ra2-hd`. All paths below are relative to that root.

| Purpose | Path / checkpoint |
| --- | --- |
| Current repository rules | `AGENTS.md` |
| Detailed M1.3e report | `docs/m1-3e-rhino-eight-headings.md` |
| Prior accepted low-profile foundation | `docs/m1-3d-rhino-independent-parts.md` |
| Final M1.4 acceptance | `docs/m1-4-completion-acceptance.md` |
| Implementation checkpoint | `c44038c7663cb19571c01de0cd4195c4da85ed2d` |
| M1.3e acceptance checkpoint | `b774567` |
| Binding visual-acceptance receipt | `.artifacts/m1-3e/visual-acceptance.json` |
| Review and actual movement video | `.artifacts/m1-3e/review-v2/review.html`; `motion-native.webm` in that directory |
| Accepted exports and source registration | `.artifacts/m1-3e/candidate-v1/manifest.json` and its sixteen PNG members |
| Raw authored components and prompts | `.artifacts/m1-3e/authoring-v1/`, including `authoring-ledger.json` |
| Final runtime and motion trace | `.artifacts/m1-3e/check-1789769486300/capture/result.json`; `motion.json` |
| Diagnostic adapter and state contract | `scripts/m1/rhino-eight/adapter.ts`; `contract.ts`; `identity.ts` |
| Native scale calibration / packaging | `scripts/m1/calibrate-rhino-eight.ts`; `prepare-rhino-eight.py` |
| Runnable fixture | `scripts/m1/play-rhino-eight.mjs` |

Open [the native review](../.artifacts/m1-3e/review-v2/review.html) at 100% browser zoom. Run the accepted comparison from any working directory:

```sh
bun /Users/Aone/RA2remaster/ra2-hd/scripts/m1/play-rhino-eight.mjs
```

Artwork, imported derivatives and captures are ignored local files, not contained in Git commits. A fresh checkout alone is insufficient; use the existing workspace or explicitly preserve and transfer those local assets before execution. No push/publication has occurred.

## Handoff boundary

The user requested this document for the existing main planning conversation to add a next task. No new implementation or default activation is performed here, and no new conversation is created automatically. Return Rhino corrections, new execution and visual acceptance to this existing Rhino execution conversation to preserve its accepted style and review history. Use a separate execution conversation only if the selected objective materially changes.

For any selected follow-up: revalidate current HEAD rather than resetting to a reported baseline; work sequentially without subagents; communicate in Chinese and save project files in English; make reviewed local commits without pushing. Preserve all accepted Rhino artwork, Conscript, GAPOWR, final M1.4 production C/reference 900, original/imported resources, application bundles, `dist` and user data. This handoff changes documentation only.
