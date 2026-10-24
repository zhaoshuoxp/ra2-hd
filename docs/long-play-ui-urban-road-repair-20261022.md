# Long-session UI and Urban road repairs

The repair starts from clean local main `dc494dbd`. Source changes remain in the main working tree. The separate campaign worktree, existing Desktop deliveries and their profiles are preserved.

## Behavior

When optional HD clock artwork cannot fit, the original production clock previously wrote depth before the HD cameo drew. This hid the cameo behind an opaque black region despite the clock's 50% opacity. Fallback clocks now use ordinary transparent meshes in the same draw order as the HD cameos, with depth writes disabled. Other native UI sprites retain their existing batching.

The result panel previously lost its image when the sidebar left less than 781,312 bytes available, even after falling back from 4X to 2X. A match now protects that minimum capacity before loading its HUD. Optional artwork cannot spend it; the result canvas can use it. Both outcome backgrounds retain the complete-family hash checks, existing lettering and 4X preference. The UI limit remains 16 MiB. Protection and result surfaces release when leaving the match.

Urban roads on The Alamo (`mp29u2.map` / `xmp29u2.map`, displayed as Fireline Conflict in Simplified Chinese) were bound to HD atlases, but their coarse road samples differed visibly from the clear accepted Temperate and NewUrban roads. The new `urban-road-hd-repair-v2` selection repairs 47 complete physical road sources and all 578 density slots. Forty-six members reuse source-checked accepted road artwork, registered to the target's original coverage. `proad14.urb` has different donor depth, so it retains its Urban form and uses accepted asphalt material only. No donor depth is copied.

The 41 native group definitions, original source hashes, indexed frames, coverage, geometry, rules, depth, atlas dimensions and rectangles remain unchanged. Ten road atlas files change; 72 other atlas files retain their exact hashes. Existing source packs remain available. Temperate, Snow and NewUrban selections, original archives and prepared data are unchanged. World and prepared-cache limits are unchanged. The incomplete `urban-road-hd-repair-v1` export is retained unselected.

## Verification

Focused validation passes **119 tests / 2,863 assertions**, with zero failures, across eight files. Entry typecheck, the frozen runtime build and the refreshed main development build pass. This is a targeted regression run, not a full historical-suite claim.

| Native Mac control | Terrain setting | Result under pressure | Fallback clock and release |
| --- | --- | --- | --- |
| YR The Alamo | 4X | Complete 2X victory image | Pass |
| RA2 The Alamo | 2X | Complete 2X defeat image | Pass |
| YR Austin | 4X | Complete 2X victory image | Pass |
| YR Bering Strait | Original | Complete 2X defeat image | Pass |

Every encountered HD terrain group publishes in the three HD controls, with all inspected source images bound. The tests cycle sidebar categories, release clock artwork, fill the remaining optional UI capacity and exercise actual rendering. Captured fallback-clock pixels retain approximately 50% of the unshaded cameo brightness. The largest result-inclusive UI reservation is 16,776,216 bytes, below 16,777,216. Result surfaces and protected capacity return to zero after the score screen opens. Original mode returns all tracked UI reservations to zero. Native page errors are zero in all four cases.

These are controlled budget-pressure sessions with stopped AI, not natural long matches. Windows execution remains `NOT_RUN_ON_THIS_MAC`; changed road appearance and the user's natural long-session confirmation remain pending. No performance target or visual acceptance is claimed.

Failed controls and earlier candidates remain under `.artifacts/long-play-repair`. They include the initial non-unified diagnostic payload, the depth-only repair that exposed draw-order behavior, rejected non-batched palette setup, corrected pixel-capture control, and a DOM-release assertion that counted unrelated score artwork. The JSON receipt identifies these separately from the four final passing controls.

## Review and repeat

Open `.artifacts/long-play-repair/Repair Review.html` for the embedded before/after images. `Launch Repairs.command` in the same directory starts the verified frozen runtime with canonical resources and a new private `User-Profile`; it does not replace an existing Desktop package or copy its settings. The native case runner is `scripts/m2-4/native-long-play-repair.mjs`. The JSON receipt pins the selected resource manifest, runtime, native reports and review images.

Continue this conversation for appearance or long-session feedback. No new milestone, remote push, publication or cleanup is included.
