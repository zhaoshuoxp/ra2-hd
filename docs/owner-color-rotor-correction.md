# Owner color, helicopter rotors and superweapon option correction

This correction continues the accepted Allied/Soviet graphics work on local main `7a001fb`. Accepted base artwork, original retail archives, 2x/4x options, logical geometry, shadow coverage, sampling and previous deliveries are retained. No remote push or new art direction is part of this change.

## Causes and changes

- Authored red paint extends beyond the native owner-index silhouette. Previous exporters intersected it with a limited native support region, leaving displaced panels and death poses unmapped. The correction scans every selected world frame and heading and creates complete authored material masks. Skin, brown hair, fire, neutral wall masonry, spy disguise artwork and Kirov's fixed shark-mouth insignia are treated separately.
- `GAGAP` and `ATESLA` declare `Remapable=no` in retail art despite using native owner-palette indices. Their authored mask generation excluded the panels. Their new masks follow the actual retail image palette and runtime owner palette.
- Coverage includes Allied death/deployed poses and `DEST`, `CARRIER`, `AEGIS`, Soviet `APOC`, `SCHP`, `DRED`, plus normal/damaged/construction/animation members of `NAWEAP`, `NANRCT` and the remaining selected building families in both theaters. Red fire, blood effects, rust and fixed insignia are not automatically recolored merely because a broad red detector reports them.
- Retail `SHAD` omits the optional rotor metadata. Supply its existing main `CYLINDER18` and tail `CYLINDER09` joints through the same native rotor helper and component-plane HD renderer as `SCHP`. Explicit metadata still takes precedence.
- The production filter previously disabled every structure associated with a shell-disableable power. YR battle labs carry `ForceShieldSpecial`, so disabling superweapons removed the technology chain. The option now filters only the six primary power types: Chronosphere, Weather Storm, Iron Curtain, Nuclear Missile, Genetic Mutator and Psychic Dominator. Other powers and ordinary prerequisites remain intact.

## Resource scope and preservation

The immutable revision is `owner-r3`: 348 corrected resource manifests and their recursively pinned families/dependencies, 444 changed bindings in total. All previous revisions remain at their original paths. Changes affect only owner-mask/shade channels, revision metadata and dependency hashes. Base PNGs, original owner masks/shades, alpha/depth channels and native frame/heading rectangles are verified independently.

The selected world inventory contains 371 manifests and 23,831 frame entries, including density variants and aliases. Registration retains 2,419 routes and the same availability. Accepted Original exceptions such as SQD and YURIPR remain Original. Native archive source resolution covers 330 unique selected SHP source hashes. The raw-red report is a candidate inventory, not a claim that every red pixel must change.

## Incremental evidence

Evidence root: `.artifacts/owner-remap-r1/`.

- `native-source-audit.json`: archive/source palette resolution.
- `production-after.json`: real retail rules and production methods; 19 country/edition pairs. Switching the option changes only the two primary power buildings per side; buildable unit sets and reachable battle labs are unchanged.
- `correction-map-final.json`, `registered-final.json`, `audit-final-v3/report.json`, `preservation.json`: selected dependency graph and complete-frame integrity checks.
- `scripts/editions/superweapon-production.test.ts`, `scripts/m1/yr-unit-animation.test.ts`: 5 tests / 114 assertions passed. `paint_test.py`: 4 material classification regressions passed. Entry type checking passed.
- Candidate failures and superseded mask revisions are retained. Native package validation and a fresh Desktop ZIP are recorded separately after their checks finish.

The automated global mask scan and integrity checks cover all selected resources. Native screenshots and recordings focus on reported families and controls. They do not relabel the old complete gameplay/platform matrices or final human acceptance.

## Final native validation and delivery

Runtime source commit: `49b7a7b` (clean at build/package time). The signed final app uses its sibling resource root, not the checkout's `.local` directory. Native cases pass for YR temperate at 4x and RA2 snow at 2x: 87 and 38 stages, followed only by 5 and 3 unobstructed infantry replacement stages. All cases use isolated profiles. Main/tail rotor quaternion and HD component matrices change during native flight; death controllers advance through their native HD frames.

The 4x targeted run allocates 496.4 MiB against the existing 1280 MiB shared world limit; the 2x run allocates 176.7 MiB against 256 MiB. WebGL reports zero errors and no lost context. These are bounded correction cases; the previously accepted full-density pressure evidence remains separate.

`OWNER-COLOR-ROTOR-REVIEW.html` embeds 81 native screenshots and 6 recordings at 3840 x 2160. Its decoded images, video metadata and owner/bearing/playback controls pass the offline browser check. The Desktop test ZIP is `RA2-HD-Owner-Color-Rotor-49b7a7b-macOS-arm64.zip`; final copy and extraction evidence is recorded in `owner-color-rotor-delivery.json`. This task did not overwrite or delete prior Desktop files or resource revisions. User visual/gameplay acceptance is pending; continue feedback for this correction in the existing execution conversation. No remote push was made.
