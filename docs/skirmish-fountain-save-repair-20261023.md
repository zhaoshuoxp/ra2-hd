# Skirmish fountain, defeat feedback and saved games

The user accepted the preceding long-play UI and road-marking repairs on 2026-10-23, then requested these three corrections. Work continues on local `main` at `dc494dbd59363439ae830fad5e81134ef36ee95b`. Changes are uncommitted; no remote push, publication, cleanup or change to the independent campaign worktree is included.

The HD fountain's active animation already contains its complete basin. `FountainSurface` hides the overlapping dry base while this complete animation is visible and restores the base when unavailable. The original artwork, frame timing, anchors and every resource pixel remain unchanged. All ten native animation frames were checked at 2X and 4X, with an Original control on the actual Small Town America placement.

Defeat feedback now includes AI resignation and queues each elimination separately. Text uses the same localized AI difficulty names as the lobby, plus player number and color. Native queued notices retain their existing cooldown; individual queued events do not accumulate cooldown-map entries. The result screen continues rendering after simulation stops, allowing the final opponent's announcement and victory voice to finish. Score navigation waits at least five seconds and at most fifteen seconds for voice playback. Result cleanup is idempotent when leaving or loading another game.

The pause menu provides Save Game and Load Game. The main menu also provides Load Game. Named saves support separate slots, overwrite and delete confirmations, and a warning before discarding unsaved progress. Saves persist in the app's private IndexedDB database and are separated by game edition. Each atomic record includes a checksum, embedded map bytes, original millisecond seed, settings, human commands, speed history and simulation checkpoints. Loading reconstructs the deterministic simulation with its normal AI before creating renderers, verifies checkpoints and the final state, and resumes live play. It offers progress and cancellation; load time grows with match duration. A save made after loading retains its complete command history.

Ordinary skirmishes with built-in AI are supported in RA2 and YR. Trainer/debug-modified matches and custom AI scripts are explicitly rejected rather than producing an incomplete save. Future simulation or rules changes must review compatibility and bump `SAVE_SIMULATION_VERSION` when needed. English, Simplified Chinese and Traditional Chinese include the new controls and errors.

## Validation

- Focused source checks: 20 cases / 153 assertions, plus 13 loading/cache cases / 72 assertions. Entry typecheck, frozen build and whitespace validation pass.
- Native RA2 2X and YR 4X: normal AI, legal deployment/building/infantry commands, an in-flight human movement task, pending production, save at tick 2181, full application restart, exact restored state and 600-tick continuation comparison. In-game reload, save-after-load, overwrite/cancel and delete/cancel pass.
- Native defeat feedback: three rapid eliminations during busy EVA and the final opponent during the real victory flow. Four unique colored messages and four decoded voice playbacks pass; recorded audio and result screenshots are retained.
- Final packaged revision: localized lobby names replace internal AI labels. Four elimination messages, decoded voices and the victory flow pass again. Seven saved-game, simulation-turn, fountain, EVA and result implementation files remain byte-identical to the restart-validated source snapshot.
- Native fountain: ten frames per density and Original control. HD uses one complete fountain surface; Original retains its existing layers.
- Final UI pressure regression: construction clocks retain 50% transparency, the complete result background loads within the existing UI budget, and match resources release.
- All 13,978 selected resource files remain byte-identical to the accepted preceding delivery. World, prepared CPU and UI texture budgets are unchanged.

Evidence and failed/early checkpoints remain under `.artifacts/skirmish-repair-20261023`. The companion JSON records the final app, hashes, native packaged checks and delivery status. Clean staged signing and Desktop signature metadata diagnostics are recorded separately. Windows is `NOT_RUN_ON_THIS_MAC`; the new fountain and user-input/audio acceptance remain pending user testing.

## Delivery

The self-contained Apple Silicon app is installed at `/Users/Aone/Applications/Red Alert 2 HD Skirmish Repairs 20261023.app`, with a symbolic link of the same name on Desktop. It embeds all game resources and uses `~/Library/Application Support/Red Alert 2 HD Skirmish Repairs 20261023` for persistent preferences and saves. The complete archive is `/Users/Aone/Desktop/Red Alert 2 HD Skirmish Repairs 20261023 Mac arm64.zip` (5,650,550,584 bytes). It contains the actual app and all 13,978 selected resource files, rather than the Desktop link. ZIP verification checks every decompressed file hash, executable permission and framework symlink against the signed app inventory. A separate system extraction passes all 14,507 entries and deep/strict signature verification; that decoded app also passes a native 2X fountain match and ten-frame capture. The Desktop copy retains the verified archive SHA-256.

On this Mac, directly copied Desktop bundles stalled in the native loader before application initialization; Desktop metadata is managed by File Provider. The local Applications installation and its Desktop link launch successfully with embedded resources and the private default profile. Extract the backup ZIP to a local Applications folder. Native runtime cache launchers were investigated but are not selected; their sources and failed checkpoints remain under the artifact directory.

The preceding named Desktop app was already absent during delivery preflight; it was not deleted or overwritten by this task. Its existing profile and retained build evidence are preserved. Earlier repair builds and the first archive remain retained as checkpoints. Continue the current conversation for testing and corrections to this delivery.
