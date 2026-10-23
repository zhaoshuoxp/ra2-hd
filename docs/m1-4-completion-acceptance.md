# M1.4 completion and acceptance

**M1_4_ACCEPTED_AND_DELIVERED / TECHNICAL_PASS / VISUAL_ACCEPTED.** The user explicitly confirmed that this task is ready for delivery after the final shroud, pause-menu and money-text corrections. This closes the bounded M1.4 visual-review gate.

The accepted scope includes resolution-independent presentation at the confirmed reference height 900, controlled source/export/game fidelity review for existing Conscript and GAPOWR, accepted C sampling and soft edges, stable power-plant structure with local fire/glow animation, shroud coverage and boundary corrections, single-player pause-menu speed, and output-density HUD text. Original artwork and exports, gameplay geometry and rules, and unrelated Rhino work are preserved.

Run `bun scripts/m1/play-production-c.mjs` from the repository. The launcher verifies the 153-file `.artifacts/m1-4/pause-and-shroud/build-v4/` build and opens an isolated Chrome session. Ctrl+C closes it. Implementation commit: `b740e010b4321c075a8b25e7eb268ef7989536f2`.

Validation: 44 tests / 910 assertions, entry typecheck, isolated build, focused pause/shroud/HUD checks, bounded natural gameplay, visible Chrome launch, and resource cleanup all passed. Eighteen full-shroud cases had no bright pixels; overlap and same-value money-text comparisons are retained. Preservation checks matched 14,372 protected entries and 2,019 prior M1.4 files. The delivered build hashes were checked again when recording acceptance; no runtime changes were made during closeout.

See the [final correction report](m1-4-pause-options-and-shroud.md), [native-size review](../.artifacts/m1-4/pause-and-shroud/review-v3/review.html), and [acceptance receipt](../.artifacts/m1-4/pause-and-shroud/acceptance.json). Earlier review pages, failed intermediate checks and the pre-acceptance delivery receipt are preserved with their historical labels; the separate acceptance receipt records the final decision.

This is bounded local macOS/Chrome delivery. Windows, physical external-panel output, long battles and desktop packaging retain their previously documented unverified status. Acceptance does not authorize a new asset family, Rhino implementation, packaging, push or publication. Rhino's independent work and acceptance gates remain unchanged.

Continue any M1.4 corrections in this task. A materially different next milestone should use a new task after its scope is selected; no new task is created automatically.
