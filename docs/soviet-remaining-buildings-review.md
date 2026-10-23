# Remaining temperate Soviet buildings: complete-family delivery

Current status: **ACCEPTED_AND_DELIVERED** following the user's final all-tests-passed confirmation. See [final handoff](soviet-buildings-final-handoff.md) and `.artifacts/soviet-remaining/final-acceptance.json`. Historical pending labels below describe earlier delivery stages and are superseded by that receipt.

Current continuation: **R2_CORRECTIONS_TECHNICAL_PASS / ANIMATION_GAMEPLAY_ACCEPTANCE_PENDING**. The user accepts the static models and reported construction, NAPSIS/TESLA alignment, civilian-evacuation and loading defects. Read [Soviet Buildings R2 corrections](soviet-buildings-r2-corrections.md) for the new app, resources, 17-family review and current evidence. The R1 delivery below is retained historical evidence, including its rejected animation behavior.

## Historical R1 delivery

Current status: **COMPLETE_FAMILY_TECHNICAL_REVIEW / FINAL_VISUAL_GAMEPLAY_ACCEPTANCE_PENDING**. The user accepted all 13 representative directions and five proportion corrections, including NANRCT's widened right cooling-tower foot. The acceptance receipt binds the exact reviewed files. Complete-family production, integration and local delivery are authorized; final visual and gameplay acceptance remains open.

The new application is `.artifacts/soviet-remaining/build-2026-09-21T20-35-44-119Z/Red Alert 2 HD Soviet Buildings R1.app`. It retains the accepted M1.5 R3 / M1.6b R2 foundation and uses a separate `RA2 HD Soviet Buildings R1` profile. The review is `complete-review-v1/Soviet-Buildings-Review.html`; the accompanying validation dashboard separates measured passes, historical failures and human acceptance. All paths below are under `.artifacts/soviet-remaining` unless stated otherwise.

## Complete production and runtime integration

`production-selection-v1.json` selects 1,102 authored SHP slots across all 13 families. `production-checklist-v2.json` and `native-tail-validation.json` additionally bind 192 retained Original-only indexed-shadow/empty slots; source aggregate offsets never shrink around those tails. The complete packs add revision-1 siblings under `.local/hd-packs/soviet-<family>-authored/1`, preserving every accepted pack. The refinery remains on its accepted conveyor-corrected revision 3.

NALASR and NAFLAK include eight authored headings each, registered against isolated native VXL/HVA part captures and attached to the actual native turret pivot. The renderer chooses the nearest 45-degree heading while preserving native facing, geometry, position and original indexed shadows. Both the SHP base and turret must validate before that whole family can activate. These are sprite heading samples, not newly modeled continuously rotating voxel geometry.

The optional-texture budget remains 256 MiB. Exact 4x4 RGBA/remap tiles share physical storage through a virtual atlas lookup; color, coverage, owner shades and logical UV dimensions are unchanged. All accepted Soviet pages and all new pages reconstruct byte-for-byte. A 48-case GPU comparison has zero pixel differences. Whole-family CPU validation and measured allocation precede upload. The accepted four-building batch remains at 2x, NAPOWR at 4x, and GAPOWR/Conscript/Rhino retain their accepted resources. The actual all-enabled allocation is approximately 226.46 MiB, including the accepted Rhino parts.

## Validation and acceptance boundary

- Export contracts pass all 1,102 slots; retained-tail validation passes all 192 slots. Actual retail member aliases and source hashes pass the 17-family catalog test.
- 53 focused tests / 1,332 assertions and entry type checking pass. Independent missing-turret, corrupt-turret and corrupt-shipyard resources restore whole Original families; the single HD switch disables all families next match.
- `runtime-complete-v2` captures 1,278 native-controller motion samples with no application or WebGL errors. All 13 normal/damaged matched captures have identical original/HD geometry and shadow textures. These spawned/frozen render fixtures do not claim legal placement or natural action triggering.
- `native-builds-v1` passes native queues and legal placement for twelve additions, actual cloning into two infantry, and nine damage-event / native-repair / sale paths. The starting-credit and injected-damage fixtures are explicit; retail rules, cost and timing remain unchanged.
- `naval-retry-v5` separately passes coastal MCV movement/deployment, native refinery/power prerequisites, legal shipyard placement and two submarine deliveries. Native animation-event tracing confirms production and return-to-idle transitions. Prior coastal setup and polling failures remain recorded; shipyard repair/sale is not claimed as passed.
- `preservation-production-v1.json` checks 54,009 protected entries and all accepted representative files. Four prior old-profile runtime/cache differences are separately reported, not repaired or silently marked equal.

Full-family material, construction transitions, damaged states, motions, owner colors, turret appearance, combat and superweapon gameplay still require the user's final review. Physical paused-Options cursor restoration remains independently UNVERIFIED. Windows runtime is NOT RUN; campaigns are outside scope. The highest preset's measured buffer is 2982x2160 in this test window, not a physical 3840x2160 claim.

Construction uses authored key stages registered to unchanged native frame envelopes. Local energy variations retain fixed structural pixels; crane/scanner motion follows native landmarks. Review these production choices at native size before final acceptance. Renderer parity and complete coverage are not a visual-quality verdict.

Continue corrections and final acceptance in this same task. No push, publication, subagents, other factions, unit artwork or campaigns. Historical pending labels below describe earlier review stages and are superseded only by the explicit acceptance and current evidence above.

## Representative review history

Current status: **CONSOLIDATED_REPRESENTATIVE_REVIEW_PENDING**. The user's continuation authorizes every remaining vanilla RA2 temperate Soviet buildable family after the five M1.6b corrections. All 13 normal material candidates and 204 representative motion/connection frames are available in one self-contained dashboard: `.artifacts/soviet-remaining/review-v3/review.html`. This is concrete artwork for one consolidated decision, not a complete-family or gameplay delivery. No remaining-family override is registered.

## Verified identities and coverage

Source evidence is `.artifacts/soviet-remaining/source-v1/inventory.json`, with resolved member hashes, archive paths, rules/art sections and indexed frames per family. `dependencies-v1.json` additionally records native turret VXL/HVA and wall connection behavior. `references-v1` contains decoded members and composited native states. The native game fixture's turret references are isolated part/heading evidence, not legal-production validation.

| Family | Native temperate members | Representative motion/state coverage |
| --- | --- | --- |
| NARADR — Radar Tower | ngradr, ngradr_a, ntradrmk | 45 dish-scan frames, fixed base and smaller dish |
| NADEPT — Service Depot | ngdept, ngdeptbb, ngdept_b, ngdept_c, ntdeptmk | 23 repair-transition frames; independent jib, cable and hook |
| NAYARD — Shipyard | ngyard, ngyard_a/b/c/d/s, ntyardmk | 41 normal production frames; articulated crane on fixed platform |
| NATECH — Battle Lab | ngtech, nttechmk | 8 construction key poses from the 25-frame native buildup |
| NANRCT — Nuclear Reactor | ngnrct, ngnrct_a, ntnrctmk | 10 local activity representatives |
| NACLON — Cloning Vats | ngclon, ngclon_a, ntclonmk | 10 local activity representatives |
| NAPSIS — Psychic Sensor | ngpsis, ngpsis_a, ntpsismk | 8 antenna key poses, stable lower structure |
| NALASR — Sentry Gun | nglasr, ntlasrmk; laser.vxl/hva | 8 rotating upper-part headings; normal complete-building material |
| NAFLAK — Flak Cannon | ngflak, ntflakmk; flaktur.vxl/hva | 8 rotating upper-part headings; normal complete-building material |
| TESLA — Tesla Coil, image NATSLA | ngtsla, ngtsla_a/b, nttslamk | 9 local activity representatives |
| NAIRON — Iron Curtain | ngiron, ngiron_a/f/h, ntironmk | 10 local activity representatives |
| NAMISL — Nuclear Missile Silo | ngmisl, ngmisl_e/f/g/h, ntmislmk | 8 opening/ready key poses from 16 normal opening frames |
| NAWALL — Soviet Wall | ntwall | 16 native normal connection states, shown as states rather than an idle loop |

All listed sprite stems are SHP members. NAYARD_D's normal production range is 0–40; its later damaged half is not part of that loop. NAFLAK has no resolved optional flakbarl VXL/HVA; the native loader only adds that part when present, so no separate barrel is invented. NAWALL uses native connection order 0–15 and the engine's damaged offset +16; the remaining source frames are retained without inferring an unsupported third health state. NAPSYB is campaign-only and NASAM is Allied; neither belongs to this scope. Buildings' original turrets are included; unrelated units and effects are excluded.

## Artwork and representative methods

`art-v1/provenance.json` binds all 26 generated raw inputs to their retained imagegen originals, saved briefs, dimensions and SHA-256 hashes. Normal architectural references come from resolved retail members; accepted NAPOWR supplies material style only. Generated raw images remain immutable. The ledger identifies selected revisions and retained failures independently for each family.

`review-exports-v3/report.json` records normal registration and motion coverage. Export canvases use 2x native source dimensions for review; this alone does not certify adequate source density or coverage for a final 2x family. Authored color comes from generated masters. Native pixels supply reference landmarks, envelopes and motion control, not final HD surface color. Radar scanning transforms the authored dish section; depot/shipyard motion transforms separate authored jib, cable and hook parts over clean stationary plates. Local glow candidates vary only the selected emissive regions. Eight-pose sheets provide explicitly labeled key poses. Turret motion cards isolate the moving upper parts; their final fixed-base attachment and continuous native transforms are still unverified.

Animation rate follows `AnimProps.rate` in source frames per second. The dashboard offers base rate, quarter speed and the 6x rate observed in the current native capture. Eight-pose previews retain approximate cycle durations without claiming all native intermediate frames. The 1x view means original sprite pixels, not a new physical-panel or current-game-window size certification. The 2x detail view preserves pixels and wraps large pairs without clipping.

## Validation, failures and review gate

`review-v3/browser-check.json` passes all 13 cards, normal/motion selection, stepping, playback, 1x/2x dimensions, global resume and unclipped detail layout, with no browser errors. `review-v3/export-check.json` validates 204 representative motion/state frames plus normal pairs, expected dimensions and no opaque canvas-edge clipping. Repeated native hold/end poses may share pixels. Full-size masters and source comparisons remain accessible on each card.

Retained corrections include reactor/sensor halo removal, flak sheet margins, battle-lab sheet margins and registration, missile-top registration, shipyard hook threshold, an initially incorrect turret viewport crop, and the dashboard's initial 2x overflow. Earlier attempts are preserved. Technical review does not imply user approval.

After the consolidated material/motion decision, continue approved families without routine per-building requests. Produce every required damaged, buildup, repair, active and superweapon state; complete intermediate motion; validate registration, remap, native shadows, occlusion and continuous turret behavior; package whole-family fallbacks; and measure combined allocation before integration. The existing optional budget remains 256 MiB with accepted density unchanged; the current accepted set already uses 258,507,328 bytes. No allocation feasibility is claimed for these 13 candidates yet, and failed families must remain Original with explicit ledger status.

Deliver final complete families in one combined Mac review app/resources/dashboard, then stop for visual/gameplay acceptance. Preserve all accepted apps, resource revisions and profiles. Keep feedback, corrections and acceptance in this same task. No campaigns, other factions, units, subagents, push or publication.

## Proportion feedback and corrected review

The user accepts the NADEPT, NAYARD, NATECH, NACLON, NALASR, NAFLAK, NAMISL and NAWALL materials and representative motions. Their status is `REPRESENTATIVE_ACCEPTED`; complete-family and gameplay acceptance remain separate. `representative-feedback-r2.json` records five exceptions: NANRCT right cooling tower, NARADR/NAPSIS right foundation width, TESLA height and red-support spacing, and NAIRON upper sphere height.

Six built-in imagegen edits, exact saved prompts, input references and raw-output hashes are retained under `art-v2/provenance.json`. The first NANRCT edit remained too narrow at the foot and was explicitly rejected during production. Its selected follow-up is `art-v2/NANRCT/normal-lower-r3-raw.png`, which expands the lower flare, radial support ring and foundation using the left tower as the proportional reference. That candidate still requires user review; no intermediate image is treated as accepted.

`review-exports-v4` reuses all 260 exported PNG files for the eight accepted families byte-for-byte. Only the five exceptions and their 82 representative frames are updated. Their texture registration now uses the native visible width and height independently instead of an aspect-fit operation that could leave a narrow or short candidate within the original envelope. This changes authored texture registration only; native logical canvases, bottom anchors, game geometry, timing and placement rules remain unchanged. Radar's horizontal pivot uses the horizontal registration scale; its base and the psychic sensor's hut remain fixed across their motion previews.

The focused self-contained review is `.artifacts/soviet-remaining/proportion-review-v2/review.html`, with Original / Previous delivered / Corrected comparisons, native pixels, 2x detail, playback, stepping and full masters. Its export check passes dimensions, alpha-edge bounds and accepted-file preservation. Its browser check passes five cards, frame stepping, playback, native/detail dimensions and unclipped desktop/narrow layout with no browser errors. Existing application/resource ZIPs are preserved; no new application or installed family is claimed for this artwork-only correction.

Current status: `REPRESENTATIVE_PARTIAL_ACCEPTANCE_FIVE_CORRECTIONS_PENDING`. Continue this same task for the consolidated five-correction decision and subsequent complete-family work; do not reset the eight approvals or infer final gameplay acceptance from this review.
# Complete-family production checkpoint

The user accepted all five corrected representatives and requested the next step. All 13 remaining-building directions are accepted; the exact approval bindings are in `.artifacts/soviet-remaining/representative-acceptance.json`. Complete-family production and routine integration/delivery are authorized. Final complete-family visual/gameplay acceptance remains open.

Production now includes 1,102 authored SHP slots, 192 verified retained indexed-shadow/empty tail slots, and 16 authored turret heading registrations. `.artifacts/soviet-remaining/production-selection-v1.json` selects the current per-family exports; `export-validation-production-v1.json` passes their size, empty-frame, padding, owner-shade and source-binding contracts. Revision-1 optional packs are new sibling resources, not replacements for accepted packs.

The existing 256 MiB optional-texture cap is retained. Paired color/remap tiles are pooled without changing a byte or logical geometry. The 48-case GPU probe has zero pixel differences; all accepted Soviet pack pages and all remaining-family pages reconstruct exactly and release every allocation. Accepted densities stay pinned. The remaining 13 families, including two turret sets, require approximately 121.15 MiB. Their actual retail identities and combined allocation pass the pack integration test. Native desktop rendering, complete behavior, preservation and final delivery checks are still in progress; these format tests are not gameplay acceptance.

Per-family failures remain in the ledger. Superseded wall extraction, cloning construction sampling, Iron Curtain emission masking and repair-crane landmark attempts are preserved. The current app uses a new `RA2 HD Soviet Buildings R1` profile. Physical paused-menu cursor confirmation remains independently unverified.
