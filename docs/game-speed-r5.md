# R5: reduce every solo speed tier by one quarter

The user requested that every exposed speed tier run 25% slower, followed by committing all changes to main. Starting baseline: clean `main` at `56ccb64`, already containing the trainer, cursor, disabled-icon, brightness and loading-artwork corrections. The five shared single-player tiers used by both editions now run at 75% of their previous rates.

| Tier | Previous ticks/s | Updated ticks/s |
| --- | ---: | ---: |
| 1 | 30 | 22.5 |
| 2 | 60 | 45 |
| 3 (default) | 90 | 67.5 |
| 4 | 120 | 90 |
| 5 | 150 | 112.5 |

Only `SOLO_TICKS_PER_SECOND` changes runtime behavior. Lobby selection, initial match speed and paused Options use this same mapping. The `soloSpeedTierV1` key still stores the chosen tier, so previously saved selections remain at their chosen position and use the reduced rate. The midpoint remains tier 3. Native simulation rules and the separate network/replay mapping remain unchanged. Existing speed tests and the native validation script's expectations are updated; historical reports retain their original measured rates.

Nine focused existing tests passed with 85 assertions, checking every tier, reverse mapping, default/persisted choices, invalid selections and the independent network mapping. Entry typecheck passed. Evidence is retained under `.artifacts/game-speed-r5/`; the delivery receipt records exact source identity and Desktop copy verification. Following the user's manual-test preference, no extended packaged gameplay matrix is required for this numeric adjustment. Keep all previous apps, resources, profiles and reports; no push or cleanup is part of this request.
