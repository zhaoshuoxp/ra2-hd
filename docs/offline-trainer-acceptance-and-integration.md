# Task F acceptance and main integration

Status: `OFFLINE_TRAINER_ACCEPTED_AND_INTEGRATED_INTO_MAIN`.

On 2026-09-24 the user approved the completed review and requested main integration, retirement of obsolete intermediate worktrees, and preservation of implementation details, reports and lessons. This accepts the delivered Task F functional/UI scope. A–E remain unstarted. No publication or remote push is authorized.

## Source and delivery identity

The reviewed source is `4ea1f0382617b304cdc34a13af880ec37d56fbe0`; the frozen application runtime is `cc2adeafb475031739d1f937387394d522d461f0`. The implementation extends clean integrated baseline `c6cbe578d9895d744ca5797a69c59e3dea9ed305`. The two trainer commits changed 37 files, adding 1,710 lines and removing 47. Subsequent acceptance and archive work changes documentation only.

The canonical checkout remains `/Users/Aone/RA2remaster/ra2-hd`. Historically its integrated branch was named `m0-2-stabilization`, while literal `main` remained at `898d89188542a3028a232031ce1a0bdc7c605b6f`. Ancestry verification established a lossless 180-commit fast-forward to the reviewed source. The local `main` reference advances to that exact history before switching the checkout; no old tree is checked out, no integration commits are discarded, and `origin/main` stays unchanged. Later documentation commits record acceptance and the completed retirement receipt.

The accepted app and companion resources remain at `.artifacts/offline-trainer/package-final/RA2-HD-Offline-Trainer-R1/`. The self-contained review remains `.artifacts/offline-trainer/offline-trainer-review.html`. Historical pending labels in that frozen review and `final-receipt.json` describe the pre-acceptance state; this acceptance addendum supersedes their review status without rewriting test history.

## Preserved evidence and limits

- 162 passing tests, 2,711 assertions, 37 test files; entry typecheck and isolated production build passed.
- Ten packaged Mac edition/faction/theater cases passed: five temperate full-feature cases and five snow smoke cases. Both-edition HD, combat/guard, visual/missile and civilian evacuation regressions passed.
- 22 runtime source/configuration paths matched the frozen runtime; 9,395 protected resource/dist/receipt files and 1,685 package inventory entries were verified unchanged. The companion package contains 1,214 resource files.
- User acceptance is now complete for the delivered scope. Windows remains `NOT_RUN`; physical device/input/IME/application-switch, panel and speaker measurements remain `UNVERIFIED`. Acceptance does not fabricate those measurements.

See [implementation and complete feature semantics](offline-built-in-trainer.md), [problems and solutions](offline-trainer-lessons.md), and the [project report index and archive guide](project-history-index.md). Machine-readable acceptance is in [offline-trainer-acceptance.json](offline-trainer-acceptance.json).

## Retirement policy and recovery

Five clean intermediate worktrees have no commits absent from the reviewed integration. Preserve their entire contents as ordinary snapshots, including ignored raw artwork, corrections, failed checks, builds, profiles, apps and resource exports. The archive is `/Users/Aone/RA2remaster/archives/2026-09-24-accepted-integration/`. A verified complete Git bundle preserves all pre-cleanup refs and source history. Per-entry SHA-256 inventories and before/after filesystem identity checks protect snapshot contents. Historical absolute paths are retained as evidence; the relocation map resolves them to archived locations.

Retirement removes the obsolete active worktree registrations and merged local branch names after preservation. It does not delete historical files, empty Trash, deduplicate accepted assets or claim reclaimed disk space. Cross-checkout dependency symlinks are relocated with an explicit old/new target receipt. The main checkout's artifacts, resources, applications, profiles and normal `dist` remain in place. In particular, trainer matrix symlink targets are retained together with their earlier successful runs.

Corrections to this accepted trainer, integration or archive belong in the same execution task. A materially different future objective requires the user's selection; no new task is created automatically.
