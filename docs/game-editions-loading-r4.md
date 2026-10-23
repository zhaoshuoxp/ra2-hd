# Dual-edition R4 loading background correction

The YR loading screen decoded its replacement SHP backgrounds with RA2's shared `mpls.pal`. Those indices describe different colors, producing white regions and multicolored outlines. The accepted specialty-unit overlays were independent PNGs and therefore remained correct.

R4 selects the retail palette by edition and country. RA2 retains `mpls.pal`; YR uses `mplsu`, `mplsf`, `mplsg`, `mplsuk`, `mplsr`, `mplsc`, `mplsl`, `mplsi`, `mplsk` and `mpyls` for the corresponding national images. Both editions retain their edition-resolved observer image and `mplsobs.pal`. The correction applies to DOM backgrounds and native-sprite fallback. It changes no artwork pixels, world geometry, rules, AI or loading layout.

## Validation

Native screenshot and pixel validation passes for both editions. The independent retail audit resolves all 21 edition/country/observer image-palette pairs and records decoded RGBA hashes. The native harness enters an actual Soviet skirmish, holds loading, and exercises the production wrapper against every country in that edition. It compares decoded pixels with the retail audit, checks full-window bounds and captures 16:9, 16:10, 1512x982 and 1728x1117 layouts plus native fullscreen. This does not claim a separate complete match for every country.

The focused regression suite passes 65 tests / 463 assertions; entry type checking passes. Both native runs complete loading and enter a running skirmish without page errors. Evidence: `.artifacts/editions/loading-r4-{ra2,yr}/result.json`, with actual-entry and per-country PNG captures; `.artifacts/editions/loading-r4-reference-v3/references.json` binds every decoded reference. Representative Allied, Soviet and Yuri captures were inspected visually.

The user explicitly requested applying the screenshot-verified correction to project main. Main `m0-2-stabilization` at `471c1c5` was clean and is an ancestor of this branch. Integration includes the dual-edition prerequisites and accepted UI work, not just an isolated palette helper. Resource preflight identifies 323 missing files to copy exclusively, 596 identical existing files and zero conflicts. The main checkout fast-forwarded to runtime commit `ad68424`. It now contains the 323 new resources, and all 8,630 pre-existing local files retained their hashes. Integration receipt: `.artifacts/editions/loading-r4-main-integration/integration.json`.

## Preserved scope

R3's missing-secondary-weapon guard fix, M1.7 accepted Soviet unit integration and the 430 accepted UI assets remain included. Industrial Plant and other building-art gaps remain covered by [the M1.6 handoff](m1-6-soviet-building-gaps-execution-prompt.md); this loading correction does not generate building art. See [R3 validation](game-editions-feedback-r3.md) and [fidelity limits](game-editions-fidelity.md). In particular, the earlier 15-minute stability observation did not reach a victory and is not relabeled a complete-match pass.

R4 packaging uses its own app/profile and a uniquely named Desktop archive when produced. Existing R2/R3 applications, archives, resource folders, profiles and source worktrees remain preserved. macOS Apple Silicon is the target; Windows and final user acceptance remain unverified. Continue loading corrections and test feedback in this same task.

## Main verification and delivery boundary

Main build `.artifacts/editions/build-r4-main` is bound to `ad68424`. The complete integration regression passes 237 tests / 7,629,393 assertions; entry type checking and the isolated build pass. Actual main-build runs `.artifacts/editions/loading-r4-main-ra2` and `loading-r4-main-yr-v2` pass all 21 decoded RGBA comparisons, aspect-ratio bounds, the application display API fullscreen check, and loading-to-skirmish entry without page errors. `.artifacts/editions/loading-r4-main-integration/review.html` embeds the before/after and three-faction native screenshots for offline inspection.

The earlier `loading-r4-main-yr` run records a harness failure: it queried Electron native fullscreen instead of the app's macOS simple-fullscreen display state. The rerun clears viewport emulation and uses the same `desktopDisplay` API as the real display setting. No application change was needed for that assertion. Its historical failure is preserved.

This is the requested source-and-resource integration on main; no R4 Desktop archive has been delivered by this step. Existing Desktop R2/R3 archives are not modified. The observer background retains the existing wide-screen strip extension, whose center can stretch the emblem; this separate layout limitation is not relabeled fixed by the palette/pixel checks. Continue further corrections in this same task.
