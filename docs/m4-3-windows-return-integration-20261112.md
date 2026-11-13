# M4.3 verified Windows return integration

Date: 2026-11-12, America/Los_Angeles. The Desktop return is verified and merged into canonical local `main` at `5b8e6efa40d00ceba97153307b8d9e892df3b693`. Mac regression checks pass. The fixed 4X/native/high-shadow stable 60 FPS target remains **NOT PASSED**. Fresh native Windows execution of the integrated checkout remains **NOT_RUN_ON_THIS_MAC**.

## Identity and integration

The incoming archive is `M4.2-Windows-Return-2026-11-13T04-45-16-955Z.tar.gz` (UTC name), 12,510,289 bytes, SHA-256 `72a275ca8f484825c9dce186e7075c5324e0bdce775109f4e1e57a6067c7ec37`. Safe extraction and the complete inventory verified all 159 files, including 158 individually listed path/size/hash records; no links, traversal paths, duplicate paths or unexplained extra files were admitted. The original Desktop archive and every extracted receipt remain retained.

The bundle requires transfer base `61a4bbbe75cb12bfbb4cd605b09dbbf39ae9f6bd` and returns head `1d68c2b1a0ccd59f2b6a56b7fe05aca97fc6349e`. Ancestry and all 19 changed paths match the declaration. `changes.patch` matches a locally generated binary diff byte-for-byte with seven-character Git index abbreviations. The nine commits were merged with history preserved into previous main `f1e14096b8b60e062177750a31547d94e7fb5071`; no branch, worktree or remote was created.

Windows measured packaged source `8db5523e5b387a816ad50170a0a2cfa1e6ed72ad`. Later returned commits change documentation and the movie test's viewport assertion only. All 1,693 frozen runtime source files match that tested Windows source exactly in the fresh Mac build. The three returned frozen-source manifests also match their Git revisions exactly. No `src`, `desktop` or `public` change was added during Mac verification.

The reviewed changes remove empty colour draws beneath HD VXL layers while preserving native shadow casters, decode plain mono IMA ADPCM through an equivalent typed-array path, replace native VXL string keys with integer tuple lookup, and write merged sprite indices directly. Unsupported geometry/audio layouts retain the original fallback. The return also supplies Windows launch support and measurement/correctness tools. Resource bytes, quality, gameplay cadence and camera scale are unchanged.

## Returned Windows results

The return records a Lenovo Ryzen 7 5800H / RTX 3070 Laptop machine with 16 GiB RAM, Windows 11 Pro build 26300, AC power, driver 32.0.16.1742, and actual ANGLE D3D11 output at 2560x1600 / 165 Hz / 150% display scaling. The truncated WMI adapter-RAM field does not establish VRAM capacity. GPU duration, actual VRAM, thermal state and independent screen-present counts remain unavailable.

All 17 formal receipts and 18 diagnostic receipts are retained. Independent recomputation from raw intervals reproduces every available summary exactly, including outliers, stalls and simulation throughput. All 16 completed formal windows use seven Brutal AI, matching per-scenario map/placement identities and native uncapped 4X/high-shadow output, with no recorded runtime/resource error. One baseline RA2 dense attempt failed before a complete sample window and remains visible below. **No formal run passes the gate**, including RA2 dense with mean callbacks above 60: its simulation rate remains below 99% and its cadence also fails.

| Run | Status | Callback FPS | 1% low | Simulation | Stalls >=50 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| `ab-final-ra2dense-1-cand-a196e40f` | COMPLETE | 64.44 | 10.85 | 91.36% | 102 |
| `ab-final-yroverload-1-cand-a196e40f` | COMPLETE | 29.62 | 4.97 | 65.25% | 731 |
| `ab-matched-ra2dense-1-base-32c0f11b` | FAIL | -- | -- | -- | -- |
| `ab-matched-ra2dense-retry-1-base-32c0f11b` | COMPLETE | 63.60 | 10.18 | 90.61% | 116 |
| `ab-matched-yroverload-1-base-32c0f11b` | COMPLETE | 26.73 | 4.17 | 61.18% | 846 |
| `ab-sustained-1-base-32c0f11b` | COMPLETE | 37.86 | 7.00 | 85.16% | 168 |
| `ab-sustained-2-cand-a196e40f` | COMPLETE | 38.02 | 7.76 | 85.73% | 132 |
| `ab-sustained-3-cand-a196e40f` | COMPLETE | 39.54 | 7.95 | 86.78% | 127 |
| `ab-sustained-4-base-32c0f11b` | COMPLETE | 37.75 | 6.95 | 85.08% | 162 |
| `ab-v3-ra2dense-1-cand-8db5523e` | COMPLETE | 68.49 | 11.89 | 92.90% | 78 |
| `ab-v3-sustained-1-cand-8db5523e` | COMPLETE | 39.62 | 8.17 | 87.07% | 124 |
| `ab-v3-sustained-2-base-32c0f11b` | COMPLETE | 38.72 | 7.29 | 85.83% | 154 |
| `ab-v3-sustained-3-cand-8db5523e` | COMPLETE | 39.08 | 7.95 | 86.54% | 138 |
| `ab-v3-yroverload-1-cand-8db5523e` | COMPLETE | 31.14 | 5.23 | 67.11% | 699 |
| `ra2-dense-measure-2026-11-13T02-40-47-368Z` | COMPLETE | 47.80 | 8.20 | 87.55% | 183 |
| `yr-overload-measure-2026-11-13T02-43-44-183Z` | COMPLETE | 22.64 | 3.36 | 53.75% | 1011 |
| `yr-sustained-measure-2026-11-13T02-37-38-196Z` | COMPLETE | 29.49 | 5.11 | 73.44% | 467 |

For the closest final YR sustained interleave, the baseline is 38.72 FPS and the two final candidates average 39.35 FPS (+1.64%). Pooling all three warm baseline windows gives 38.11 FPS (+3.25%); these are different comparison sets. The earlier candidate ABBA sequence is retained separately. RA2 dense records 63.60 to 68.49 FPS; YR overload records 26.73 to 31.14 FPS. First-launch baselines (29.49 / 47.80 / 22.64 FPS) remain historical cold-process observations and are not used to inflate the matched comparison. OS/driver caches were not flushed, and the small sample count does not establish a universal gain.

The Windows host suite is **NOT PASSING**: 328 executions, 1,642 passes, 294 failed cases and 31 loading errors. These totals independently match the returned raw Bun logs. The return compares 75 failing executions against transfer base: 74 have identical counts; castle-collapse has a different failure shape and is reported to reproduce its resource-loading error when run alone. Separate baseline raw logs for those comparisons were not included, so that baseline attribution is reported evidence, not a fresh independent Windows reproduction. These failures are not converted into a passing suite.

Returned native menus and RA2 victory/next pass. Both initial media cases and the baseline control fail at the same fractional-viewport assertion. The reviewed harness fix compares exact `visualViewport` dimensions; both media/save/restart reruns pass without a video-layout source change. Initial failures and the failed aggregate suite remain retained. Eight final Windows 2X/4X fixed-camera RGBA hashes match their baseline reports exactly. Full Windows PNG captures remain on the Windows machine and are absent from this compact return; the Mac checks below supply fresh local images.

## Fresh Mac verification

The production build, desktop route allowlist and entry typecheck pass. The complete host suite passes 2,166 cases in 328 executions, with zero failed cases, loading/process errors, skips or omitted files. All 3,438 retail audio outputs and six malformed/boundary controls match the original library; both edition output digests equal the Windows receipts. All 268 VXL builds across 123 files / 134 sections match the generic merger and returned Windows digest `b9813e4f85e676cfcf62895c5a3be0624e33b2ad7cd50d1270edb06521203c3c`.

Four fixed cameras at each of 4X and 2X produce exactly equal RGBA output before/after integration. Repeated frames, simulation state, camera identities and HD activation are checked; actual exports were inspected. Both-edition menus, RA2 and YR HD opening/radar/save/process-restart/fallback/release, and RA2 victory/next pass on the integrated development runtime using isolated profiles. Media report build hashes and the independently checked frozen production inventory bind these checks to the fresh output.

One 120-second YR sustained window was taken before integration and one after verification at 3840x2160 on the M2 / 24 GiB Mac. Both start at nominal thermal state with fresh application profiles; baseline ends nominal and candidate ends fair. No other heavy task runs during either formal window. These sanity windows do not establish a stable gain or a passing performance target; the lower final mean is retained.

| Mac window | Callback FPS | Simulation | Gate |
| --- | ---: | ---: | --- |
| mac-baseline-sustained | 52.70 | 95.38% | False |
| mac-integrated-sustained | 51.85 | 94.88% | False |

## Protected state and use

All 16,444 selected resource files / 17,689,836,587 bytes pass a fresh full SHA-256 comparison. All 245 existing files in five real Library profiles and the five pre-existing uncommitted YR scripts remain exact; the profile file inventory is unchanged. Only those five unrelated files remain uncommitted after closeout. No resource, application, profile or evidence cleanup was performed.

The accepted v0.5 and M4.1 Mac applications remain at their previous frozen sources. This integration updates source main and its development build; it does not rebuild an application or ZIP. Run `bun run desktop:prepare` and `bun run desktop:start` from canonical main to use the integrated development runtime. No push or release was performed.

The compact machine-readable receipt is [the integration JSON](m4-3-windows-return-integration-20261112.json). All incoming records, independent recomputation, frozen runtimes, native captures and logs are retained under `.artifacts/m4-3-windows-return-20261112/`, with receipt hashes pinned in that JSON. Continue same-outcome review and fixes in this execution conversation. Further performance optimization or a new delivery needs an explicit scope; fresh combined-main Windows acceptance requires native Windows execution.
