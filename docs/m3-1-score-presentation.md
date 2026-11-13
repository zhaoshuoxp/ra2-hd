# Soviet 01 campaign score correction

The earlier campaign result used a bespoke static summary over the multiplayer Soviet score image. The replacement uses the original single-player Soviet panel and badge, original mission ranking keys, live text reveal and numeric tally. The full Normal gameplay acceptance remains pinned to `d1e21e8c`; the presentation addendum records the changed runtime separately. No simulation rules, victory/loss trigger or final-speech barrier changes.

## Resource and wording correspondence

The controlled `score-presentation.json` pins `SSCRBKMD.SHP`, `SSCRTMD.SHP`, `SSCRAMD.SHP` and `SSCORE.PAL` from the verified RA2 archives. Runtime verifies every byte identity before decoding. The 632 × 568 background, six 472 × 448 panel frames and all 44 distinct 424 × 230 badge frames retain their native composition. The panel is centered at `(80,60)` and the badge at `(104,196)`, inside the original 800 × 600 campaign shell. Widescreen displays retain letterboxing. Only the current frame is expanded to RGBA; the animation does not allocate 44 full decoded textures.

Read-only inspection of the installation's `game.exe` dialog resource 259 supplies the original text controls: rank, evaluation, `GUI:HeadsTaken`, `GUI:ParTime` and `GUI:YourTime`. Its small-screen dialog coordinates are translated into the centered large panel; typography remains live, scalable text in the existing locale system. No Windows executable or DLL is run.

The original map's `[Ranking]` section supplies Normal `ParTimeMedium=00:15:00`, `UnderParTitle=GUI:ParTitleSov02`, `UnderParMessage=GUI:UnderParMsgSov01`, `OverParTitle=GUI:ParTitleSov01` and `OverParMessage=GUI:OverParMsgSov01`. The UI chooses the source rank/evaluation using elapsed simulation time and the par boundary, rather than the player's combat score or a fixed congratulatory sentence. Existing source-matched English, Simplified Chinese and Traditional Chinese locale catalogs supply the wording. Failure retains a retry message without a victory award.

Panel entry uses source frames 5 through 0. The badge loops all 44 original glow frames; rank/evaluation reveal progressively and the enemy count/times tally to real final values. Clicking the result or pressing Enter/Space finishes the text/tally, while Continue returns to the campaign. The original `ScoreAnimSound` is scoped to the result component and stops on unmount. Frame cadence, reveal speed and numeric interpolation are presentation parameters; exact timing against the retail executable is not certified.

## HD audit

| Item | Actual resource | Current density |
| --- | --- | --- |
| Soviet 01 loading image | `LS800S01.SHP`, 800 × 520, `LDSCRNS.PAL` | Original bitmap; no authored 2X/4X replacement |
| Opening Iwo Jima memorial | `CAWASH19` → Urban `CUWASH19.SHP` | Original fallback; no task-theater HD contract |
| Campaign result | Original panel and all badge frames above | Original bitmaps, with scalable live text |

Selecting world 4X does not turn these original pixels into new HD artwork. No new bitmap art is authored by this correction, and the previously accepted HD unit/building/terrain resources remain unchanged. The historical full gameplay captures retain their source identities; the new result recording is separately identified as an accelerated replay of the already proven ordinary command journal.

## Repeatable verification

The first new-build restore exposed a pre-existing serialization defect: diagnostic trait keys depended on minified class names. A UI-only bundle change could therefore reject an otherwise identical saved world. Six diagnostic traits now have stable keys. The journal migrates the five exact aliases present in the frozen `d1e21e8c` checkpoint, retaining every value, checksum/resource checks and the complete reconstructed-state comparison. The `m3-1-campaign-journal-v3` format remains; unknown aliases or changed state still fail closed. A second harness attempt retained optional JavaScript `undefined` fields when comparing with persisted JSON; it failed only after the runtime restoration passed. A third stopped before the Winner's next-turn callback, then used a separate ordinary turn to drain it and captured the real score; its short-title sampling assertion still failed. Those failed receipts remain retained. The final harness drains the original callback normally and checks partial evaluation text at the measured capture cadence. Native continuity additionally checks a newly captured stable-key checkpoint in a fresh world.

Run `bun scripts/m3-1/score-resources.ts`, the focused campaign/shared presentation tests, entry typecheck and `node scripts/m3-1/build-review.mjs`. `node scripts/m3-1/score-native.mjs OUTPUT_DIRECTORY` restores the existing input checkpoint, checks the full reconstructed state, replays the remaining serialized commands and waits for the source Winner plus final speech before capturing the real result. It also checks text completion, changing original frames, skip and return/reentry. See `m3-1-score-presentation.json` for the exact source/runtime/media identities and outcomes.

The standalone `M3.1-Embedded-Review.html` contains the new native result screenshots and animation recording near the top, along with the explicit density audit. Original loading/gameplay and full win/loss/save evidence remain available below. The external original-game screenshot used as an additional composition reference is [Riot Pixels' Soviet campaign score capture](https://s01.riotpixels.net/data/06/1b/061bf3bf-77a6-4324-8ee2-b16d707ddf25.jpg/screenshot.command-and-conquer-red-alert-2.1024x768.2000-10-27.3.jpg); local source bytes and dialog/map records determine the implementation.

The supported browser connection exposed no tabs despite ambient file-page context. This correction therefore verifies the standalone file's embedded bytes, all native image pixels and full clip decoding, while browser playback remains user review. No alternate server/browser path bypasses the previous file-URL restriction. Own closed automation profiles lose only rebuildable browser/GPU caches; `score-cleanup.json` retains the exact scope and logical byte counts. Runtime, raw captures/frames, failure receipts, checkpoints, IndexedDB saves, canonical resources and user profiles remain preserved.
