# M4.3a Mac vehicle shadow instancing

Status: **prototype evaluation complete; not admitted** (2026-11-13). The developer switch remains **off**. Ten formal Mac windows establish no reliable full-scene benefit, and all stable-60 gates fail. The latest fixed-camera repeats and all 70 same-frame dynamic cases are exact; earlier startup sidebar differences remain an unresolved qualification. No replacement application or ZIP was created. User visual acceptance of the experiment is unestablished.

Starting source: canonical local main `e334bbb2233c04cd4c583a520b7ca1c1560477b4`. Measured runtime source is committed as `a70ee2a4f50b51b4831cc2c88b79486a8bd5deac`. Scope: native VXL vehicle shadows only, with accepted HD colour layers and gameplay unchanged. Optimization and acceptance are Mac-only. No Windows package/retest, resource-format migration, remote push or release is included. One executor performed edits and serial native runs on main, without agents, branches or worktrees.

The existing production path remains the default. Hardware support and business-path admission are separate. The [measurement contract](m4-1-measurement-contract.md), existing scene setup, fixed-camera pixel controls and native regression tools are reused. Formal comparisons retain 120 seconds, 4X HD, native output, high shadows, seven AI, unchanged simulation and all battle first-use stalls. Heavy diagnostic instrumentation is excluded from formal timing.

All evidence paths below are relative to `.artifacts/m4-3a-mac-shadow-instancing/`. The [JSON result](m4-3a-mac-shadow-instancing.json) pins reports and raw samples by SHA256. Preflight records actual HEAD, worktree/index state, the five unrelated YR working-file hashes, real profiles and the resource ledger. Those five files are excluded from edits, staging and commits. The unmodified baseline and final frozen production manifests contain 297 runtime files each. All 1,694 final source files match runtime commit `a70ee2a4`; a fresh build matches every frozen production file. The final source-diff SHA256 is `cc149748cb4f44b9d62fcbf23c2e8693fd96c039dae630588c1a56b8899b451a`.

## Actual Mac path

The measured host is Apple M2 / 24 GiB, macOS 27.2.1, Electron 44.4.0 and ANGLE Metal. The DELL S2722QC remains at 1920x1080 logical points, scale 2, 3840x2160 actual framebuffer and 59.9967003 Hz; the built-in display remains attached. AC power and low-power mode 0 are recorded in `machine.json`. Per-run display, framebuffer, power and thermal receipts remain authoritative.

The actual context is WebGL2 with native instanced drawing and vertex divisors. `ANGLE_instanced_arrays` is absent, so the old capability function returned false. `supportsInstancing()` now checks native APIs. `WorldView` independently keeps legacy VXL/palette/sprite instancing disabled: its custom matrix columns and `INSTANCE_TRANSFORM` are not integrated with the current Three 0.183.2 stock depth transform. Only the new vehicle-shadow prototype is switchable through `Renderer.setVehicleShadowInstancing()` and the existing M4 benchmark's `--shadow-instancing=on|off`. No ordinary setting or diagnostic UI is added.

## Bounded implementation

Accepted HD VXL vehicle renderers and the dedicated Rhino renderer register their native shadow sections with reference counts. The collector operates inside the existing shadow pass, after Three has applied visibility, layers, original world bounds, light-frustum culling and the CPU model-view transform. Compatible source draws append their existing model-view matrices to persistent native `THREE.InstancedMesh` buffers. A final scene subtree submits those batches during the same shadow traversal. It stays invisible during colour projection. Source matrices, cast flags, HD colour layers and native shadow shapes remain intact.

The batch key contains shared geometry identity, source side/shadow side, layers and render order. Admission requires a single directional light and one shadow viewport with a non-VSM pass, a registered shadow-only material, ordinary static geometry, finite matrices and positive determinant. Material arrays, legacy batches, skinned/morph/instanced sources, custom depth/distance shaders or shadow callbacks, clipping planes, alpha-test/hash/coverage, displacement, wireframe and stencil state retain native draws. Translucent/cloaked coverage shaders therefore keep their original per-object uniforms. Fallback reasons and preparation errors are visible in diagnostics. Original and other native colour paths remain unregistered and use their existing rendering.

Instance slots compact through the ordinary traversal on each pass; buffers grow geometrically and reuse their storage. Upload ranges cover active matrices only. Empty groups retire after 120 active shadow passes. A scene owns one shared patched depth material; each batch owns its instance buffer and simple pass material. The native VXL pool retains geometry ownership. Scene removal, disabling and renderer/context disposal release batch owners without disposing shared geometry. Per-source culling removes the need for an aggregate bound in light-view coordinates. No batch array or temporary matrix array is rebuilt per frame.

## Diagnostic evidence

The first unmodified-main Mac diagnostic observes 234 shadow submissions, including 202 eligible hidden vehicle sections across fourteen geometry groups. Its paused warm shadow-submission median is about 0.94 ms. These are local measurements, separate from the historical Windows counts.

In the later R4b same-scene ABBA diagnostic, each block receives sixteen warmup renders and sixteen retained renders. Shadow submissions change from 236 to 49; complete-frame calls change from 1,183 to 996. Both modes submit exactly 2,139,082 triangles and 947 colour draws. Median total CPU submission is 8.8025 / 8.7825 ms (off/on); shadow submission is 0.8550 / 0.9225 ms. Candidate maintenance is about 0.1425 ms, and instance-buffer upload calls about 0.0225 ms, with 207 instances in twenty batches and 13,248 actual GL upload bytes per retained frame. Manager `uploadedBytes` estimates active matrix bytes; first allocation/growth can upload full capacity. Timers/classification add diagnostic overhead; these tiny whole-frame differences do not establish a gain. GPU duration, actual VRAM and presented-frame counts are unavailable.

The initial separate collection traversal consumed the expected draw savings. The revised collector reuses Three's existing traversal and model-view matrices. Shared scene depth ownership also avoids creating a distinct uniform-refresh owner per batch. The final candidate removes the per-caster empty array used by the morph-layout guard. Formal windows use that frozen final candidate with all heavy diagnostics disabled.

## Correctness and lifecycle

The final frozen runtime passes 35 dynamic cases at each HD density, with exact off/on/repeated RGBA, unchanged available world state/hash/simulation RNG and no GL or preparation error. Cases include both vehicle renderers, independent body/turret headings, four real ramp directions, high-bridge upper/lower paths, elevation, forced native clipping fallback, warped/cloaked/hidden/restored states, camera exit/reentry, root visibility, capacity growth, destruction, slot reuse, native motion and ordinary MCV deployment/repacking. Four Original startup controls have zero registered/instanced casters and exact off/on pixels. Runtime screenshots at both densities were inspected; existing artwork was not modified.

Latest separate-process baseline/candidate captures pass all eight full-frame 4X/2X comparisons (`pixel-parity-repeat.json`). Earlier final-build attempts differ by 134-270 pixels in two scanlines above the sidebar tabs. Their whole world areas and same-frame off/on images are exact. A diagnostic-only fixed sidebar clock was added; recorded tab state/frame values match, but the repeated success does not establish why the earlier difference occurred. `startup-ui-variance.json` retains every differing comparison and bounding box. No pixels were masked, blurred or tolerated, and no production UI/material/artwork change was made to force a pass. Cross-process startup fidelity remains qualified until the cause is established.

The replayable native save case uses ordinary starting units and native commands. It verifies exact state after full process restart, equal off/on continuation after 24 turns, exact loaded pixels, zero registered casters/batch owners after the results-page Continue/menu transition and rebuilt instances in a fresh match. This receipt uses the retained R4b build; the final runtime only removes an empty morph-guard allocation. Final-build native RA2/YR save/restart regressions also pass with active instancing probes. Both runtime manifests remain available.

The single complete host suite passes **2,173 cases in 329 executions**, with zero failed cases, loading/process errors, skips or omissions. Entry typecheck and production/desktop build pass. Four native development-runtime regressions pass with the prototype explicitly requested: edition menu/logos/radar fallback/exports/version; RA2 media/save/restart; YR media/save/restart; RA2 ending/score/next. Battle probes confirm active instances without preparation errors. These are source-runtime checks, with no claim about a newly packaged application.

Early diagnostic failures remain retained: sandboxed Electron launch, switching before the world debug bridge existed, replay-incompatible artificial pressure placement, waiting at the results page, and using a normalized building footprint/deploy order for MCV repacking. The corrected drivers use native centered placement, buildup readiness and the retained Allied07 move-to-repack flow. Simulation, save and menu semantics are unchanged. The first host command aborted before test discovery because it omitted `--resource-root .local`; the one complete invocation supplies it and retains every discovered test.

## Formal results and admission

Ten formal windows completed: six interleaved YR sustained windows (off/on/on/off/off/on), one RA2 dense pair and one YR overload pair. Every window uses the **same final production build**, switching only vehicle-shadow admission. The off mode represents the existing rendering algorithm within that build; the separately frozen unmodified main supplies baseline diagnostics and image controls. `collect-shadow-report.mjs` independently recomputes every interval summary, checks all raw array lengths/timestamps, and verifies the fixed settings, matched map/placement/build identities, visibility, empty error lists and disabled heavy diagnostics. No slow-frame removal or gate change was made.

Budget time below is the fraction of accumulated interval time at or below 17.0167 ms. The unchanged gate requires at least 99%, no consecutive two full seconds below 59.5 callbacks/s, and at least 99% nominal simulation throughput. All ten windows fail. Callback FPS does not measure screen presentation. Every pre-window thermal reading is nominal; some final readings are fair, with waits retained in each receipt.

| Window / switch | Callback FPS | 1% low | p50 / p95 / p99 ms | Max ms | Budget time % | Stalls >=50 ms | Simulation % |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| sustained-1-off | 53.338 | 16.523 | 17.175 / 28.965 / 37.810 | 482.960 | 37.941 | 23 | 95.583 |
| sustained-2-on | 53.769 | 16.846 | 17.115 / 29.045 / 38.015 | 447.395 | 39.287 | 23 | 96.347 |
| sustained-3-on | 53.257 | 16.174 | 17.030 / 29.455 / 40.385 | 460.030 | 39.774 | 24 | 95.648 |
| sustained-4-off | 53.345 | 16.584 | 17.170 / 28.760 / 37.865 | 462.975 | 38.859 | 20 | 96.102 |
| sustained-5-off | 53.657 | 16.840 | 17.130 / 28.820 / 38.025 | 456.735 | 38.954 | 20 | 96.071 |
| sustained-6-on | 53.900 | 16.646 | 17.065 / 28.360 / 38.270 | 439.650 | 39.794 | 25 | 96.259 |
| ra2-dense-1-on | 56.281 | 18.507 | 16.840 / 26.125 / 33.215 | 443.015 | 44.689 | 14 | 97.600 |
| ra2-dense-2-off | 55.988 | 18.615 | 16.900 / 26.750 / 33.520 | 437.110 | 43.776 | 13 | 97.497 |
| yr-overload-1-off | 48.709 | 12.824 | 17.330 / 36.890 / 47.105 | 568.200 | 33.688 | 42 | 91.443 |
| yr-overload-2-on | 49.009 | 12.557 | 17.275 / 35.975 / 46.670 | 573.735 | 34.328 | 44 | 91.838 |

| Scenario / switch | Windows | Callback FPS mean (range) | Scene update ms | Submit ms | Simulation ms |
| --- | ---: | --- | ---: | ---: | ---: |
| yr/sustained / off | 3 | 53.446 (53.338-53.657) | 5.627 | 5.408 | 5.051 |
| yr/sustained / on | 3 | 53.642 (53.257-53.900) | 5.708 | 5.307 | 5.018 |
| ra2/dense / off | 1 | 55.988 (55.988-55.988) | 4.951 | 4.346 | 3.074 |
| ra2/dense / on | 1 | 56.281 (56.281-56.281) | 5.156 | 4.335 | 2.717 |
| yr/overload / off | 1 | 48.709 (48.709-48.709) | 6.281 | 6.519 | 4.761 |
| yr/overload / on | 1 | 49.009 (49.009-49.009) | 6.381 | 6.269 | 4.667 |

Sustained callback means change by +0.366%, with overlapping ranges across three windows per mode. Submission improves by about 0.101 ms while scene update rises about 0.081 ms; the whole-callback difference is too small to establish a reliable benefit. Average 1% low changes from 16.649 to 16.555 callbacks/s. Dense (+0.523%) and overload (+0.616%) each contain only one matched pair. Thermal variation, visual RNG and OS/driver caches limit attribution. These results do not qualify the prototype for production admission.

Passive five-second snapshots retain real object and instance ranges in every formal raw sample. Sustained windows contain 234-392 units and 44-130 buildings; enabled modes record 7-207 visible instances in 3-24 batches. Dense records 54-392 units and up to 283 instances/26 batches; overload records 98-776 units and up to 402 instances/41 batches. Capacities, active upload-byte estimates, geometry/texture counters, moving/firing/projectile counts and first-use stalls remain available in the JSON/raw receipts. Instrumented draw classification and per-instance preparation/upload timing are confined to the diagnostic runs.

## Protection, delivery and continuation

Post-cleanup protection verifies all **16,444 selected files / 17,689,836,587 bytes**, the unchanged ledger SHA256 `fe938de7f3fb61ba41fa85537e5c905e4d1fa6468df1c0a1d0b8212c4871c0ac`, all 245 real-profile files and the five unrelated YR files with their original Git/index state. Both retained apps pass deep strict signature checks. Cleanup records cover 686,452,961 bytes of task-only rebuildable caches/builds, 92 superseded intermediate PNGs (1,677,024,509 logical bytes), and storage sharing for byte-identical screenshots. Original/final/R4b frozen builds, all reports, raw formal samples, failed-attempt receipts, final/failure/sidebar-comparison screenshots, difference maps and isolated test saves remain available. Removed PNG hashes are retained. No other task material or real user data was cleaned.

No new app or ZIP is justified by these results. Retained applications are `/Users/Aone/RA2remaster/RA2-HD-Mac-v0.5-20261112/Red Alert 2 HD.app` (runtime `88ac426b`) and `/Users/Aone/RA2remaster/RA2-HD-Mac-M4.1-20261112/Red Alert 2 HD.app` (runtime `32c0f11b`). Their code does not represent the current main prototype. The historical `/Users/Aone/Desktop/RA2-HD-Mac-M4.1-20261112.zip` is absent at this closeout; its prior receipt remains unchanged. This task did not remove or recreate it.

The next bounded proposal is to measure and reduce HD vehicle colour/depth/edge material binding or submission cost: 947 colour draws remain in the paused diagnostic, and the shadow pass is below one CPU millisecond there. This is a proposal for planning, with no implementation expansion in M4.3a. Same-goal corrections stay in this execution chat; return to the planning chat to choose subsequent optimization work.
