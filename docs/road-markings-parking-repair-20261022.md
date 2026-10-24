# Road markings and parking repair

Current selection: **road-markings-v5**, on canonical main's working tree at `dc494dbd59363439ae830fad5e81134ef36ee95b`. Source changes remain uncommitted. The JSON receipt pins the new manifests and evidence. This follow-up supersedes the earlier Urban road selection; its two long-play UI repairs are retained.

## Result and scope

Intersections, crosswalks and selected city road markings previously retained coarse native paint over HD pavement. Urban parking lots were separate `rough` terrain members and still used visibly coarse pavement. The repair authors paint across each complete source member before splitting it into its unchanged native slots. Parking uses accepted road asphalt and retains its original bay layout, central aisles, curbs and compact fixtures.

| Theater | Repaired members | Changed 2X/4X frames | Changed atlas files |
| --- | ---: | ---: | ---: |
| Temperate | 3 | 30 | 2 |
| Urban | 16 | 398 | 8 |
| NewUrban | 15 | 374 | 28 |
| Desert | 2 | 12 | 2 |
| Snow | 0 | 0 | 0 |
| Total | 36 | 814 | 40 |

- All four edited theaters receive complete `proadc13`/`proadc14` crossings. Temperate and both city theaters also receive `proad03` intersection guides.
- Urban and NewUrban receive `proad04`–`proad09`, `prslpe01`/`prslpe02`, and all four parking members: `rough01`, `rough02`, `rough03`, `rough06`. Urban additionally receives its distinct `proad14` bend.
- Straight lanes use the accepted road lattice and dash phase. Curves use source-fitted tangent ports; parking rows use independent supported line families. Crosswalk bars retain their transverse orientation. No new material images or AI images are generated.
- Already clear road art, snow cover, damaged ends, sand overlays, dirt roads and non-urban `rough` fields retain exact baseline pixels. The same `rough` filenames are not parking in other theaters.

The source audit resolves 748 relevant original members / 6,044 native slots with the correct theater palettes. The independent export check covers every selected atlas: **468 files / 23,182 frames**, including **22,368 exact unchanged frames**. Native metadata, source hashes, geometry, alpha samples, ramps, depth authority, atlas dimensions/rectangles and rules remain unchanged. World, prepared CPU and UI budgets remain 512/1280 MiB, 128 MiB and 16 MiB. Prior packs, original archives, prepared data, Desktop deliveries/profiles and the independent campaign worktree are preserved.

## Validation

- **373 Bun cases / 4,623 assertions**, zero failures, in five isolated processes; **7 Python geometry cases**, zero failures. The runner selects YR before loading edition-dependent NewUrban modules.
- The initial combined test attempt retained 176 NewUrban failures from the default RA2 source identity and two obsolete Temperate memory assertions. The isolated YR run passes all 225 NewUrban cases. The Temperate assertion now accounts for retained compressed backing rather than requiring the old decoded-copy footprint. The failed log remains available.
- Entry typecheck, frozen build and main development `desktop:prepare` pass. All 242 frozen runtime files are hash-verified. Only the two terrain contract JSON files differ from the previously verified UI repair runtime; its other 240 files are byte-identical.
- **Eight native Mac map cases / 46 source-placement captures** pass, with zero page/GL errors and all encountered terrain groups published. Every comparison camera is checked against an actual bound source placement. Original map bytes, camera zoom and placements are retained; shroud reveal and stopped AI are disclosed.

| Edition | Map | Density | Captures |
| --- | --- | --- | ---: |
| YR | Alamo (`xmp29u2.map`) | 4X | 9 |
| RA2 | Alamo (`mp29u2.map`) | 2X | 9 |
| YR | Austin | 4X | 5 |
| YR | Rush Hour | 4X | 5 |
| YR | Small Town America | 4X | 4 |
| YR | Sahara | 4X | 4 |
| YR | Austin, including slopes | 2X | 6 |
| YR | Rush Hour, including slopes | 2X | 4 |

One additional native UI pressure case passes with the final terrain selection. The native fallback clock retains a 0.50173 median shaded/clear pixel ratio over 3,740 samples. The complete 2X victory picture remains ready inside the 16 MiB UI limit and releases on exit. Earlier matched defeat and Original controls remain recorded in `long-play-ui-urban-road-repair-20261022.json`; their runtime is unchanged. These controlled cases do not claim a natural long-match endurance run.

## Review and use

Open `.artifacts/road-markings-repair/Road Repair Review.html` for the 14-image embedded review. Its images and desktop layout pass an isolated native viewer check. `.artifacts/road-markings-repair/Launch Road Repairs.command` starts the frozen candidate with canonical resources and its own `User-Profile`. It preserves existing Desktop packages and profiles. Use this launcher for the current resource selection; previous frozen review runtimes retain their historical contract pins.

Reproduce focused loading checks with:

```bash
node scripts/m2-4/test-road-marking-repair.mjs <new-output-directory>
python3 -m unittest discover -s scripts/m2 -p test_road_marking_geometry.py
python3 scripts/m2-4/validate-road-marking-repair.py \
  .artifacts/road-markings-repair/export-v5.json <new-integrity-receipt.json>
```

Unique authoring inputs, unselected v1–v4 candidates, the failed wrong-map RA2 fixture and all failed test receipts are retained under `.artifacts/road-markings-repair` and their immutable `.local/terrain-packs` revisions. The selected v5 resources and compact receipt are current authority. No cleanup, commit, remote push or Desktop replacement occurred. Windows execution is **NOT_RUN_ON_THIS_MAC**; final visual and user acceptance remain pending. Continue same-outcome feedback in this conversation.
