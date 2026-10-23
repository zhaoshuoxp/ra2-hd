# Shared unit HD on snow maps

The batch unit loader returned immediately for the Snow theater. Conscript and Rhino used separate loaders, so they retained HD while the other accepted units stayed Original in both editions. The M1.6C building resources were present; the failure was the older unit loader's theater gate.

Snow now uses the same demand loader as dry theaters. The loader still verifies every SHP or VXL/HVA source, complete-family contract, page hash and allocation before binding HD. Authored resources, game rules, geometry, the 256 MiB total budget and the accepted SQD/YURIPR Original exceptions are unchanged. Resource availability text no longer describes dry theaters only.

## Verification

- The retained `db458e4` build reproduces the missing loader on the original `MP12S4.map`: `DRON: unit HD loader unavailable in theater 4`.
- The corrected candidate passes native RA2 snow activation: all 22 accepted batch families reach READY and bind to actual renderers, with both Original exceptions retained and no GL errors.
- Targeted resource, demand-loading and desktop tests pass (28 tests); TypeScript entry checking passes. The new regression covers SHP/VXL demand on snow and temperate maps, missing-resource fallback, disabled HD and the None theater. The desktop empty-resource fixture also includes the 23 previously integrated building coverage registrations.
- `scripts/editions/validate-package.mjs --snow` checks both packaged editions on their original snow maps, including the theater identity, 18 active Soviet building families, all accepted batch units, guard scans and combat feedback. Without the flag it retains temperate regression coverage. Exact final package evidence and delivery hashes are recorded under `.artifacts/editions/`.

These controlled native checks validate resource selection and rendering, not exhaustive action playback or user battle acceptance. Continue this same task for the user's Desktop match feedback.

The user subsequently confirmed that the delivered `2475407` snow-unit fix passes their match test. This accepts that correction; the later lamp exposure and score-duration reports are separate follow-up defects.
