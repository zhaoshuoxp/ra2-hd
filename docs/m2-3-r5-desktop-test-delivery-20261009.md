# M2.3 R5 Desktop gameplay test delivery

The user accepted R5's visual corrections and requested a complete game ZIP on Desktop plus a complete map-name checklist for individual testing. The delivered Mac Apple Silicon package preserves the frozen R5 app and every world/UI resource byte. Main integration remains pending.

- Game ZIP: `/Users/Aone/Desktop/M2.3-R5-Desktop-Mac-Test-20261009.zip` (3,738,908,593 bytes).
- ZIP SHA-256: `697eefef625b8d433b35c469c23034257a8cb0876c558f527736e242e961fac3`.
- Complete name checklist: `/Users/Aone/Desktop/M2.3-R5-Temperate-Map-Test-List-20261009.txt`.
- Result worksheet: `/Users/Aone/Desktop/M2.3-R5-Temperate-Map-Test-List-20261009.csv`.
- Staging: `/Users/Aone/RA2remaster/M2.3-R5-Desktop-Mac-Test-20261009-R2/RA2-HD-M2.3-R5-Desktop-Test`.
- Machine-readable receipt: `docs/m2-3-r5-desktop-test-delivery-20261009.json`.

Extract the entire ZIP, keep the app and both resource folders together, and launch `Launch-M2.3-R5-Test.command`. Choose the matching edition, Standard skirmish mode, and HD 2X or 4X before entering a new match. The launcher registers the sibling world resources and UI root in a new package-local profile using the shipped Electron runtime. This explicit registration is required because the legacy discovery flags do not recognize the M2.3 package metadata. No app-bundle or shipping-source change is needed.

The checklist contains all 61 currently selectable official TEMPERATE edition/map entries: RA2 17 and Yuri's Revenge 44. Titles reproduce the shipped general CSF, its locale JSON, missing retail labels, and native title suffix behavior; the resulting mix of existing localized strings matches the game. Each row includes edition, map member, player count, separate 2X/4X result fields and notes. The 12 maps previously covered by focused R5 native checks are marked. Edition counterparts remain separate entries.

All 7,569 runtime entries (6,437,800,266 ordinary-file bytes) match the immutable R5 delivery manifest. The ZIP's 7,578 entries, 14 symlinks, permissions, executable modes and absence of profiles pass independent verification. The actual Desktop ZIP and both list files match their source hashes. Full extraction from that Desktop ZIP passes every file/link/mode check and strict deep code-signature verification.

The extracted user launcher loads the correct environment v6 and terrain v3 and exposes every listed title in the corresponding edition's visible Standard map list. Fresh extracted native controls also pass: RA2 American Town at 2X binds 80 HD environment objects and 13,515 terrain placements; YR New Heights at 4X binds 38 HD environment objects and 5,643 terrain placements. Both remain within the unchanged world budgets, with zero graphics errors or recorded page errors. These are controlled native binding checks, not full natural-match playthroughs. The unchanged 30-session R5 state/fallback evidence is reused.

The first archive candidate remains preserved and was superseded before Desktop delivery to add explicit profile registration. A restricted-command launch aborted during macOS UI registration before game startup; its report and diagnostic disposition remain preserved. The same extracted launcher passes in the native desktop command environment, using a profile that initially contained only the freshly written resource registration and no game preferences. No failed receipt was rewritten as a pass.

The complete runtime ZIP omits the large static image review, authoring files and duplicate QA inventory/evidence, which remain preserved in their previous deliveries. The declared reusable TEMPERATE artwork is complete; full-match user acceptance for all 61 entries is not recorded. Other theaters, unsupported/archive-only map entries, Windows execution and physical-input validation retain their prior boundaries. The canonical main remains at `d38f136`; no merge, push, publication or next-theater work occurred.

Continue gameplay feedback and corrections to this delivery in the current execution chat.
