# Soviet 01 remaining HD coverage audit

The user accepted the R6 map/arrow corrections before requesting this audit. The accepted runtime remains `580c985417a218e0d53f5c71579ac404d2ae7889`; its Desktop ZIP and all game resources are unchanged. This audit found real remaining Original fallbacks. It makes no new authored-art, runtime-fix or complete-HD claim.

The source contains 161 structures (36 intentionally invisible lights), 78 vehicles/ships, 60 infantry and 746 scenery placements. All 29 task-force definitions, implicit paradrop aircraft and native overlays are included; low-tech production candidates are listed separately in the CSV. The native inspection uses the accepted extracted app and an isolated diagnostic reveal, not a new mission-completion attempt.

| Placed category | Visible placements | HD types | Original types | Original placements |
|---|---:|---:|---:|---:|
| building | 125 | 29 | 8 | 15 |
| infantry | 60 | 1 | 3 | 29 |
| vehicle | 78 | 12 | 2 | 6 |
| scenery | 746 | 25 | 10 | 76 |

## Remaining gaps

| Identity | Original English label | Kind | Placed count / scope | Cause |
|---|---|---|---:|---|
| CAMOV01 | Movie Screen | building | 1 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CAMOV02 | Concession Stand | building | 1 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CAMSC10 | McBurger Kong | building | 1 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CAMSC11 | Tires | building | 4 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CANEWY21 | Warehouse | building | 4 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CAWA2A | Pentagon | building | 1 | NO_COMPATIBLE_CURRENT_URBAN_HD_FAMILY |
| CAWA2B | Pentagon | building | 1 | NO_COMPATIBLE_CURRENT_URBAN_HD_FAMILY |
| CAWASH06 | Building | building | 2 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CIV1 | Civilian | infantry | 9 | SOURCE_MATCHED_CROSS_THEATER_ASSETS_NOT_REGISTERED_FOR_URBAN_RA2 |
| CIV2 | Civilian | infantry | 10 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CIV3 | Civilian | infantry | 10 | SOURCE_MATCHED_CROSS_THEATER_ASSETS_NOT_REGISTERED_FOR_URBAN_RA2 |
| CIVBBP | Civilian | infantry | declared | REGISTERED_ENVIRONMENT_REINFORCEMENT_NOT_IN_INITIAL_DEMAND |
| CIVSF | Civilian | infantry | declared | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CIVSFM | Civilian | infantry | declared | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CIVSTM | Civilian | infantry | declared | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| CRUISE | Cruise Ship | vehicle | 3 | NO_COMPATIBLE_CURRENT_URBAN_HD_FAMILY |
| LT_SGN01 | lightpost signed 1 | scenery | 5 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| LT_SGN03 | lightpost signed 3 | scenery | 10 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| LT_SGN04 | lightpost signed 4 | scenery | 6 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| POLE02 | utility pole 2 | scenery | 12 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| SIGN01 | street sign 1 | scenery | 8 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| TREE25 | Tree | scenery | 10 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| TREE26 | Tree | scenery | 14 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| TREE27 | Tree | scenery | 8 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| TRFF01 | traffic light 1 | scenery | 1 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| TRFF02 | traffic light 2 | scenery | 2 | SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION |
| TUG | Tug Boat | vehicle | 3 | NO_COMPATIBLE_CURRENT_URBAN_HD_FAMILY |
| BRIDGEB1 | Wood Bridge 1 | overlay | 1 native overlay | NO_COMPATIBLE_CURRENT_URBAN_HD_FAMILY |
| PDPLANE | Cargo Plane | aircraft | declared | NO_COMPATIBLE_CURRENT_URBAN_HD_FAMILY |

Existing source-matched 2X/4X assets can support 23 gap identities: CAMOV01, CAMOV02, CAMSC10, CAMSC11, CANEWY21, CAWASH06, CIV1, CIV2, CIV3, CIVBBP, CIVSF, CIVSFM, CIVSTM, LT_SGN01, LT_SGN03, LT_SGN04, POLE02, SIGN01, TREE25, TREE26, TREE27, TRFF01, TRFF02. Every required member, palette, installed manifest and page hash was checked. These assets are candidates for reuse; registration and native state/visual validation are still required. The RA2 identity map omits most of these families because their declarations are currently YR-only. CIVBBP is registered for RA2 but not included in the initial environment demand, so a task-force-only arrival has no prepared override.

CIV1 and CIV3 have source/palette-matched candidates in other installed theater catalogs. The unit palette bytes are identical to URBAN; their selected 2X/4X pages also pass hashes. They still lack a compatible URBAN route. Other-theater wooden bridges use different native source and palette hashes, so they are not counted as reusable URBAN assets.

No source-compatible family was found in the current catalogs for CAWA2A, CAWA2B, CRUISE, TUG, BRIDGEB1, PDPLANE. Pentagon C/D and the opening memorial/animated flag bind HD; Pentagon A/B remain Original. Eleven civilian road-vehicle types (plus the Soviet MCV) bind HD. The cargo plane appears naturally during the bounded opening observation and has no registered HD family. The single original wooden high-bridge piece is listed separately from the already-HD concrete bridge and invisible low-bridge placeholders. Its current source frame contains 3,939 nonzero pixels. TMP terrain publishes at 4X with no fallback group.

The native report covers both per-object and batched sprite materials, including trees, walls and ore. A null per-object sprite is not classified as Original when its batch binds HD. No memory/budget fallback was reported among the families that actually loaded; missing registrations never enter that list, which is why a loader summary alone would miss these gaps.

Detailed rows and locations: `docs/m3-1-hd-coverage-audit.csv`. Machine evidence: `.artifacts/m3-1/hd-coverage-20261024/coverage.json` and `native-complete/report.json`. Screenshots are embedded in the accompanying audit review. This is an audit only: no art was generated, no rule/map/runtime/resource was edited, no ZIP replaced, and main was not merged.
