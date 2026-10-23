# M2.4 NewUrban and Desert structures, Batches 76-77

Status: `MAC_TECHNICAL_PASS_VISUAL_PENDING`. Complete 2X/4X source export, isolated selection and Mac validation pass; new-art acceptance is pending. Full M2.4 remains incomplete. Windows is NOT_RUN. No per-batch game delivery, main integration or push.

The user accepted the Batches 73-75 continuous-structure correction; commit `d7ac10cd` records that decision. This batch follows its continuous HD material and bounded extra-contour policy. Unchanged accepted art and evidence remain authoritative.

## Scope and provenance

- NEWURBAN: five complete groups, 54 members: bridge abutments/overpasses (set19), retaining ramps (25), natural ramps (115), paved slopes and variants (117), barricades (119). The prior 16 terrain groups are preserved.
- DESERT: one complete ramp group (25), 10 members. The prior 19 terrain groups, including 11 accepted equivalent Temperate members, are preserved. The already reused water bridge is excluded from new production.
- Twenty-eight builtin-imagegen masters, source/reference/prompt hashes, capacity and containment receipts live under `.artifacts/m2-4/{newurban,desert}-structures-authoring-batch{76,77}-v{1,2}`. Each exported density is independently sampled from genuine authored detail. Native map files and imported archives are untouched.
- The source-pinned `nativeTheaterStructureMaterials` declaration is limited to this scope. It avoids restoring low-resolution RGB at source cuts; logical source indices, metadata, main footprints, heights, native rules and depth remain target-owned.

## Temperate reuse and style direction

The latest user instruction prioritizes reuse and asks different materials to follow accepted Temperate HD style. The cross-name audit compares all 367 remaining members with 633 selected Temperate sources, including aliases. Twelve pending Desert road members match exactly and remain reserved for complete set20 publication with their eight different siblings. No current structure is a complete visible/depth equivalent. Shape-only matches are references, not an acceptance claim for different materials. Eight actual accepted Temperate 4X source boards and their original source pins are retained as references. The final three Desert mother jobs explicitly include the accepted Temperate HD ramp reference; all other candidates are compared against it during QA.

## Findings and retained attempts

- One three-cell mother has a shifted transparent gutter. The failed equal-grid receipt is retained; measured two-pixel transparent cuts and all three capacities pass without changing raw artwork.
- The first export stopped before writing a pack because one measured mother used an absolute path while its audit key was relative. Canonical used-master paths fix this; no audit requirement was weakened.
- The two water-bearing overpasses are `ovrps02.ubn` and `ovrps05.ubn`. Native palette/body ownership is derived from original TMP layers. Pure-sea palette entries alone exclude valid enclosed bridge-water glints; that no-op v6 attempt is retained. V7 includes only verified enclosed blue-gray components of at most 16 native pixels (actual maximum 13), adding 273/312 pixels. Open shores, connected bridge shadows, void and warm colors remain excluded.
- A repeated rectangular sample exposed extruded transparent margins of the accepted diamond sea mother. Final v4 samples only its opaque interior, retaining the accepted mean and authored fine waves. Candidate packs v1-v3 remain historical and unselected. Only the two water materials change; the other52 new members and all prior accepted groups stay exact.

## Validation checkpoint

Full source metadata, placeholder/empty slots, bounded extra coverage, density pairs, atlas gutters, source hashes and accepted-base bytes pass for all 64 members. Twenty-seven focused loader/terrain tests, 19 Python checks and entry type checking pass. The final two-water-material correction has seven targeted loader rechecks. Independent native-water and source-frame difference receipts are retained. Fifteen native cases use five unchanged official maps: Fight, Downtown, Manhattan, Rush Hour and Dry Heat, covering all 64 members and both water orientations. Additional short simulation probes advance NEWURBAN from tick 2 to 16 and DESERT from 2 to 14. Both 4X cross-theater directions, Original zero-allocation reset and reentry pass. Peak combined world allocation is 162.26 MiB at 2X and 618.19 MiB at 4X; peak prepared CPU usage is 103.10 MiB. These are Mac technical results, separate from new-art user acceptance and Windows.

Evidence root: `.artifacts/m2-4/structures-batches76-77-v1`. Selected NEWURBAN revision is `newurban-m2-4-structures-batch76-v4`; DESERT is `desert-m2-4-structures-batch77-v1`. Environment, faction, prepared and UI selections are unchanged. Budgets remain 512/1280 MiB world, 128 MiB prepared CPU and 16 MiB UI. The 453 prepared bindings/1,205 pages remain hash verified; these new TMP atlases use their separate terrain contract and do not relabel any prepared dependency. The internal signed Mac host and payload freeze at `0880721a543016a480ad1e1dcbff6f0190d6668f` are technical infrastructure, not a new independent delivery. Main remains clean at `748d0998aaf663acda8807c158155bf0a5bb157b`.

## Review and resource handoff

The combined page embeds 157 PNGs, defaults to native 4X pixels and keeps Fit off. It contains every member, matched Original/2X/4X game scenes and accepted Temperate references. Neighboring uncovered Original terrain/buildings are explicitly disclosed. Static PNG/hash/dimension/control checks pass; interactive browser QA remains NOT_RUN under the existing local-file protocol denial.

- Source review: `.artifacts/m2-4/structures-review-batches76-77-v2/M2.4-NewUrban-Desert-Structures-Batches76-77-Embedded.html`.
- Desktop review: `/Users/Aone/Desktop/M2.4-Review-NewUrban-Desert-Batches76-77-20261018/M2.4-NewUrban-Desert-Structures-Batches76-77-Embedded.html`, with its JSON manifest. The exact copied HTML hash is `b3a4d3f92f0cfff9cda17d1f531e0f3f6618c02202478962fd7b1464b380c6cc` (128,131,376 bytes).
- Hash-checked ignored resources: `resource-handoff-final-v2.json` under the evidence root lists 88 selected resource/contract files, 237 authoring files and 442 native guide dependencies. Existing isolated paths contain the complete dependencies; no duplicate game package was made.
- Technical closure: `technical-closure-v1.json` and this document's JSON companion. Remaining source gaps are NEWURBAN 363 (202 TMP,146 buildings,13 overlays,2 infantry) and DESERT 202 (101 TMP,63 buildings,38 overlays), with zero scoped parse issues. Final independent M2.4 app/resource delivery remains required after full coverage and acceptance.
