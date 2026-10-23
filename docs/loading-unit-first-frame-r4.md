# R4: country specialty artwork on the first loading frame

The user accepted R3 icon brightness and reported that each country's specialty image appeared one or two seconds after the skirmish loading screen. Starting baseline: clean main `fda1a2f`. This correction changes loading order and canvas readiness only; retained artwork, loading layout, game rules, R2 input behavior and R3 brightness stay unchanged.

## Cause and correction

`UiArtSurface` previously began fetching, hash checking and decoding its image in a passive React effect after the loading screen mounted. At the same time, `GameLoader` ignored the loading API's start promise and immediately began map preparation. The image could therefore arrive after the first visible loading frame and compete with that preparation. The native baseline run reproduced a blank initial unit layer with a measured 71 ms gap in this environment; it did not reproduce the user's full one-to-two-second delay.

Single-player loading now awaits screen preparation using the already resolved player country, including random-country resolution. A bounded lease prepares just that country's image and shares the existing cache, hash checks and 16 MiB UI budget. The loading canvas acquires a prepared bitmap synchronously in its layout effect so its first visible frame includes the image. Other artwork consumers retain the existing asynchronous callback default. The image lease ends at loading-screen teardown.

Preparation waits at most 500 ms. Missing, invalid, disabled, over-budget or timed-out artwork uses the original loading image for that screen without a late HD replacement. Observer and Yuri retain their existing original artwork; neither has a separate authored specialty overlay in the selected pack. Disposing during preparation resolves the pending start and cannot create a new screen afterward. Network loading retains its existing start behavior.

## Validation and evidence

Evidence root: `.artifacts/loading-unit-r4/`. Fifteen focused tests passed with 155 assertions, covering shared texture leases, synchronous prepared acquisition versus the existing asynchronous default, disposal, bounded timeout, late callbacks, missing/disabled images, country palettes and original-screen contracts. Entry typecheck passed.

`baseline-yr/result.json` records the old first-frame gap. `candidate-yr/result.json` records zero image gap on actual cold match entry and first-frame images for all nine supported countries through the real loading API. Measured per-country preparation was about 10–20 ms; these figures are local observations, not performance guarantees. The complete match then entered normally with zero renderer errors. Final packaged RA2/YR results, fallback/cancellation probes and delivery identities are retained under `delivery/` in the evidence root.

The initial unit-test attempt imported the complete game loader and encountered a browser-only particle library dependency in the test runner. That import was removed; loader ordering is verified through native first-frame observations, while standalone unit tests focus on the asynchronous preparation and lease contract. No browser-global workaround was added to production code.

The new Desktop package includes both editions, unchanged selected resources, all prior reports and timing evidence. Earlier app folders, ZIPs, profiles and archives remain preserved. Keep manual confirmation and any remaining corrections in this task; no A–E expansion, artwork regeneration, Windows validation or publication is implied.
