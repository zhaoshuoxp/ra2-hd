# Test maintenance main integration and scoped retirement

The user authorized checking clean main, validating the maintenance report, integrating passing work, retiring completed branches and redundant files, and preserving ongoing M2.4 and Windows work for later integration. Future new work starts in `/Users/Aone/RA2remaster/ra2-hd` on `main`. Existing active tasks remain independent until their own completion and review.

## Integration and validation

Main was clean at `84a0b34809a860de09162337bdc2d157faa16e81`. It fast-forwarded to tested maintenance commit `42f8b55aec9539c908faf96cfe04a4d12d006067`. No history was rewritten. The closing commit adds only this report, compact receipts and the current workflow instruction in AGENTS.md. Production `src/` and `desktop/` are unchanged from the Windows development baseline.

The documented full command was rerun on the exact incoming tree before integration, including both final refinements from the original report:

```sh
bun run test --resource-root /Users/Aone/RA2remaster/ra2-hd/.local --output /Users/Aone/RA2remaster/project-history/test-maintenance-main-20261020/premerge
bun run typecheck:entry
```

Results: **589 pass, zero failed cases, zero loading errors, zero skips, zero process errors**, 145 files / 146 isolated processes, no omitted files; typecheck passed. After fast-forward, the canonical main path passed the five terrain-loading tests and entry typecheck. The complete suite was not repeated on the identical fast-forwarded tree. This is Mac test acceptance; native rendering, Windows execution, performance and user acceptance were not rerun. The original maintenance report and its failed intermediate receipts remain immutable historical evidence.

## M2.4 compatibility

The active worktree remains clean at inspected head `7a240f6e401c232b291acba9ad8404cfea9b6121`. It was neither changed nor integrated. A disposable detached worktree rehearsed its merge into the maintenance tree:

| Conflict | Origin | Tested resolution |
| --- | --- | --- |
| `src/engine/renderable/entity/Building.ts` | Already present against old main | Keep main's `updateConstructionCompletion()` and M2.4's ready/alive gate frame refresh, in that order. |
| `scripts/m2/official-maps/terrain-loading.test.ts` | Introduced by maintenance | Keep validated selected-pack/native-archive discovery and native image accounting; preserve M2.4's explicit `RA2_TERRAIN_TEST_ROOT` candidate override. |

The resolved preview passed entry typecheck and **24 focused cases**: terrain loading 5, terrain contracts including M2.4 contours 5, construction completion 6, gate mechanism 3, explicit candidate terrain override 5. These checks establish the bounded source merge plan, not complete M2.4 native/art acceptance. No M2.4 resources were promoted.

The [resolution patch](test-maintenance-main-integration-20261020/m2-4-resolution.patch) is pinned to those two inspected tips and the conflict markers from `git merge --no-commit --no-ff 7a240f6e401c232b291acba9ad8404cfea9b6121`. It was applied in the preview and passed reverse applicability checking. At eventual authorized integration, first review the then-current branch and rerun `git merge-tree --write-tree main <returned-head>`. In an isolated integration checkout, inspect conflict stages, run `git apply --check` on the patch, then apply and stage only the resolved files if it still matches. Do not apply this conflict patch directly to clean main or blindly to a later changed branch. Preserve both behaviors when refreshing it. Revalidate affected tests and final native/resource contracts before promotion.

## Windows return compatibility

Read-only inspection of `RA2-HD-Windows-Dev-84a0b348-20261020.zip` confirms kit `WINDEV-20261020-84A0B348`, base `84a0b34809a860de09162337bdc2d157faa16e81`, and its source bundle. That exact base remains in main's ancestry. The frozen ZIP and its baseline instructions are unchanged. Its historical full-suite-failure statement is superseded on updated main by this maintenance result; it remains historically correct for the frozen kit.

Preserved local Windows references are `perf/windows-hd-investigation`, `windows-return-20261011` and `integrate/windows-return-20261011`. Both historical return references are already ancestors of main. The investigation reference has unique historical commits and one pre-existing AGENTS.md conflict; maintenance introduces no additional conflict there. Retaining that reference is not approval to promote every historical experiment or to revert later accepted runtime work.

The current external Windows repair head is unavailable on this Mac. Its future content cannot be certified conflict-free now. Continue that existing task from the frozen base and return the committed incremental bundle, patch, changed-file list and actual Windows evidence required by the kit. On receipt, verify the base and bundle, compare against current main, and integrate reviewed commits in a temporary integration checkout. Preserve current main tests, workflow authority and accepted runtime fixes; combine any new Windows tests rather than replacing them with the kit's older test tree. Reconcile shared runtime edits with M2.4 if both tasks touch the same behavior. Run affected regressions, entry typecheck and the repaired full suite before promoting the return. Native Windows evidence remains a separate requirement.

## Cleanup and retained evidence

Deleted **18 local branch pointers**, each verified as an ancestor of updated main immediately before `git branch -d`; the [receipt](test-maintenance-main-integration-20261020/retirement.json) records every name and commit. Removed the completed maintenance worktree and this task's disposable merge-preview worktree. The maintenance checkout was clean, had no inbound symlinks, and contained only the ignored dependency link; removing that link did not remove canonical dependencies. Its pre-removal logical inventory was 54,463,469 bytes and `du -sk` reported 60,596 KiB. These are distinct measurements, not a claim of APFS free-space gain.

Main, the active M2.4 worktree, its resources/dependencies, the three Windows references, canonical resources/dependencies/profiles/builds, the frozen Windows kit and unrelated deliveries remain. No full recovery archive, resource deletion, remote branch deletion or push occurred. All removed branch tips remain reachable through main. The before/after resource metadata digest matches across 18,960 filesystem entries; ZIP size, mtime and inode match. This is metadata preservation evidence, supplemented by integration resource hash checks, not a second whole-ZIP content hash.

The [machine report](test-maintenance-main-integration-20261020.json) and [compact evidence index](test-maintenance-main-integration-20261020/index.json) identify full raw logs and audit receipts in `/Users/Aone/RA2remaster/project-history/test-maintenance-main-20261020`. The [preview receipt](test-maintenance-main-integration-20261020/compatibility-preview.json) pins both source tips, resolved tree and patch hash. Only main and M2.4 remain registered worktrees.

Continue corrections to this integration in the current execution chat. Start materially new work from main; keep the existing M2.4 and Windows execution chats until their outcomes are complete and ready for reviewed integration.
