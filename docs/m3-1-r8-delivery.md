# M3.1 R8: civilian hulls and Soviet national flag

R8 fixes the yacht and tug being cut off by the water surface and adds the Soviet national insignia to the scripted garrison flag. Native and package checks pass; user visual acceptance is pending. Frozen runtime: `1fc8038ca5f497ccdf34b5e2c855db021b8b3be0`.

The HD renderer used a named military-ship list for reference-surface recovery. CRUISE and TUG therefore left part of their folded sprite geometry below the native water clipping plane. The fix applies the existing camera-ray recovery to all non-airborne VXL actors. Logical projection, native geometry/pivots, shadows, clipping, pitch, sinking and ordinary depth tests remain live. Ship masters and exported resources are unchanged.

The flag correction uses built-in imagegen. Only generated yellow hammer/sickle and outlined-star print is inserted into slots 32–47. Static comparison of all 48 slots at 2X and 4X proves exact alpha, frame geometry, original data, poles and unrequested states. The active loop stays 33–47 at the original rate. Original mode retains retail artwork. Source, prompt, selected master, hashes and integration predecessors are in [the source receipt](m3-1-r8-source.json).

## Verification

- All six placed boats pass at their original map positions in Original, 2X and 4X. Each mode also captures both boats at eight renderer-only headings. Both HD modes lose zero pixels to the water clip plane, compared with the retained R7 failure. Paused observer work leaves world hashes unchanged.
- The original Soviet paradrop team naturally garrisons the memorial by the first observation at tick 630 in all modes. World, RNG and mission state match at tick 3600, hash `1965294077`. Thirty separate native renderer captures inspect all 15 active garrison slots at both HD densities.
- All 86 focused tests and entry typecheck pass. The first broader resource tests used canonical links without the private R7 VXL packs; the failed log is retained, and the explicitly selected resource roots pass. No product fallback or skipped case hides that mismatch.
- The independently assembled application retains 14,065 R7 resource files byte-for-byte, adds three versioned flag files, and updates only the two task-owned campaign metadata files. Existing PNG/data resources remain retained. Texture dimensions, budgets, maps, gameplay and save schemas are unchanged.
- The actual Desktop ZIP passes all 14619 entry/hash/link/mode checks, independent extraction, strict signing and packaged entry/playability checks. Automated profiles are isolated from the user's settings and saves. Windows is not run on this Mac.

R7 GPU-binding checks did not establish complete visible hull coverage. This regression adds same-frame clipped/unclipped native pixel measurements, normal in-world views and Original controls. Diagnostic unclipped images and heading poses are measurement fixtures, not claims of natural mission completion.

## Delivery and preservation

- Desktop ZIP: `/Users/Aone/Desktop/RA2-HD-M3.1-Mac-arm64-20261025-R8.zip`, 5749149671 bytes, SHA-256 `c1f79720094515cf9a4a8e2536bdda081020e1c44911f1f3364f648116ad4b89`.
- Embedded review: [M3.1 R8 review](/Users/Aone/RA2remaster/ra2-hd-m3-1-campaign/.artifacts/m3-1/naval-hull-r8/review/M3.1-Naval-Hull-R8-Review.html), 26 unchanged native PNGs with no external resources.
- The R7 source ZIP remains hash-identical. Its former Desktop location is absent; no cause is inferred and it is not recreated.
- The task-local campaign selector now uses the versioned flag extension. R7 snapshots, masters, preliminary exports and evidence are retained. Future integration uses the exact predecessor/additive pins in the source receipt. Canonical main is untouched by this task; no merge, push or cleanup is performed.
