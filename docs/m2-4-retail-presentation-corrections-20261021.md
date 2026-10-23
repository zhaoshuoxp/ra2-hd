# M2.4 original catalog and presentation corrections

The user tested several maps across theaters without finding a gameplay defect, then requested original edition map lists/order, three text languages, an editable skirmish name, HD world tooltips and localized HD end banners. This is incremental work on accepted five-theater resources; it does not repeat their full artwork acceptance matrix.

## Original map publication

The resolved original `missions.pkt` publishes 62 RA2 skirmish entries; `missionsmd.pkt` publishes 151 YR entries. Runtime registration now walks each original `[MultiMaps]` declaration in order and publishes only verified catalog sources. Cooperative/campaign declarations remain excluded. Legacy mode tags remain recorded and use the existing unified standard skirmish adaptation, actual starts and user settings.

The previous broader inventory additionally admitted 10 RA2 and 82 YR archive-only entries using source self-flags. All 92 are preserved with hashes and hidden from skirmish selection. They are not deleted from imports or historical evidence. The three absent-`hyte01.tem` variants and the blank `id-5b521907.map@26a65602d7a0` entry belong to that hidden set. Their diagnoses remain valid archive warnings, not blockers for the original published list. This explicitly supersedes earlier four-blocker wording for the user-facing scope. See `m2-4-original-map-lists-20261021.json` for complete ordered lists and retained extras.

The default sort is labeled Original order. A one-time preference migration clears the old alphabetical choice; later deliberate user sorts remain available. An old saved hidden map falls back through the existing initial-map resolver. No original map bytes, starts, terrain, objects, scripts or rules are rewritten.

## Text and player identity

Simplified Chinese, Traditional Chinese and English share one persisted language setting. Each edition has a complete source-matched game text table: 4,476 RA2 labels and 5,211 YR labels, plus matching interface keys. Simplified text comes from the existing installation translation; Traditional text preserves imported CSFs. English uses a pinned original-label reference, with RA2 identity restored where YR changes the product name. This replaces guessing English labels from internal identifiers. Runtime checks the selected translation against the actual imported CSF hash and size. The provenance record identifies every input/output and the English reference; no mission-pack overrides, third-party rules or art are imported.

The edition selector, menus, map titles/descriptions, lobby, HUD, trainer, tooltips and result text use the selected layer. A menu change reloads that edition. A change during a match is explicitly deferred until returning to Home; it does not discard the match. Legacy developer/storage and out-of-scope network tools are not a new localization milestone.

The local skirmish human name is editable, Unicode-aware and persisted per edition. Blur/Enter commits a normalized, nonempty name of at most 32 code points; internal AI/neutral identities are reserved. The same value updates the human slot, native player lookup, game launch and results. Multiplayer/LAN name controls are unchanged.

## World tooltips and result banners

World hover text was drawn once at logical resolution with nearest filtering. It now measures at the same logical size and rasterizes real font outlines at 2–4 times density according to render output, using linear sampling. Pointer offsets, 800/400 ms delays, object behavior and destruction of texture/material/geometry remain intact.

Original `grfxtxt.shp` has four 436×112 frames with baked Traditional Chinese lettering. Frames 0/1 are campaign Mission Accomplished/Failed; frames 2/3 are skirmish You Are Victorious/Game Over. The application retains all four source frames and all four localized slots. Only 2/3 are exercised by skirmish victory/defeat; 0/1 remain campaign standby and do not enable campaigns.

Two text-free backgrounds were reconstructed with the built-in imagegen tool from the original tank/explosion and burning-city scenes. Both have full 872×224 (2X) and 1744×448 (4X) exports. Live vector text preserves distinct campaign/skirmish wording in all three languages. Every state/density hash is checked before publishing any member. Missing/corrupt/over-budget art falls back as a complete family to a readable localized vector panel. Original/HD-Off also retains localized text. Canvas and decode leases use the unchanged shared 16 MiB UI budget and release on unmount. World/prepared budgets and selected assets are unchanged.

The four shipped PNGs are in `public/res/ui`; their hashes are in `src/gui/hd/resultBannerSources.json`. Generated masters, prompts and crop/export provenance are retained under `.local/source-art/m2-4-result-banners-v1` and must accompany delivery because this authoring directory is ignored by Git. Final backgrounds and new text appearance remain pending user visual review; accepted theater/faction art is not reopened.

## Verification and handoff boundary

Focused checks cover complete locale label sets/source hashes, original catalog order and capacity, retained legacy adaptation, Unicode/internal name safety, four result slots and full 2X/4X image hashes, plus existing UI family budget/release behavior. Entry typecheck and an isolated build are required. Native checks use actual settings/name controls, both editions and all three languages, new hover textures, native result detection, cross-theater re-entry, family failure/Original fallback and release. Exact runtime/package hashes and final outcomes are recorded in the delivery receipt, not inferred from source-only tests.

Initial development receipts retain setup failures: a sandboxed GUI launch, invalid opposing-team fixture values, undersampled building hover coordinates, observation before the tooltip's first render, and an overly broad assertion that score-screen flag images must use zero DOM bytes. These are harness failures; the final check targets the banner's own reservation. No game rule or accepted artwork was changed to satisfy a fixture.

Mac technical validation, new visual review, user runtime feedback and Windows status are separate. Windows is not run on this Mac. After this correction is accepted, the user authorizes dependency-checked removal of obsolete temporary builds/intermediates/branches. Keep the current independent delivery, active dependencies, source provenance and compact failed/final receipts. Do not remove an active worktree or unrelated outputs. Continue fixes and acceptance in this execution conversation.
