# V3 and Dreadnought HD missile pose correction

The reported flight-pose defect was reproduced on main `777e70d`. Both V3ROCKET and DMISL already receive climbing, turning and diving angles from the native flight logic. The HD image used the generic folded sprite depth surface, however, so rotating that surface could leave the painted nose pointing upward while the missile descended.

Missile sprites now recover a plane containing the original VXL longitudinal axis by projecting the accepted image along camera rays. The level-flight image, texture coordinates and native pivot are preserved. The surface follows continuous native yaw and pitch, including angles between the eight authored bearings, and remains visible from either side during a dive. The change applies only to HD missile-spawn actors; aircraft, vehicles, ship hulls and rotor surfaces retain their existing path.

No resource bytes, flight curves, speed, weapon range, damage, collision rules or accepted M1.7 artwork were changed. V3 and Dreadnought retain their distinct native flight profiles.

## Bounded verification

- The geometry test covers eight authored bearings, three yaw offsets and five pitch angles from +60 to -85 degrees. It checks unchanged level-image projection/UVs, the recovered longitudinal surface and alignment with the original flight axis. All 680 assertions pass. Entry type checking also passes.
- Native Electron RA2 and YR skirmish fixtures issue actual V3 and Dreadnought attack orders. Each records a climb, a dive below -40 degrees, active HD resources, finite poses and damage to the target. During the flight, the recovered surface contains the original longitudinal axis and the rendered axis follows continuous native yaw/pitch.
- Direct client screenshots confirm a downward-pointing nose during terminal descent. Full launch-to-impact recordings are retained for both launchers in both editions.
- A separate controlled pose capture compares HD and original missiles at four headings and +60/0/-60 degree pitch, yielding 48 screenshots. This is a rendering fixture, separate from the actual attack-order checks.

Evidence under `.artifacts/editions/`:

| Directory or file | Purpose |
| --- | --- |
| `missile-flight-before-v2/` | Reproduction: native pitch becomes negative while the HD nose can still point upward. |
| `missile-after-yr/` | Controlled original/HD pose comparison and initial visual correction. |
| `missile-verified-ra2/` | Final RA2 flight traces, screenshots and launch-to-impact videos. |
| `missile-verified-yr/` | Final YR equivalent. |
| `missile-typecheck-final.log` | Entry type-check output. |

The early `missile-before/` fixture placed the missile inside a building and the first flight fixture incorrectly assumed an unarmed target had an attack trait. Both harness issues were corrected; earlier evidence is retained. These failures did not require gameplay changes.

Repeat only the reported missile checks with:

```sh
bun test scripts/editions/missile-pose.test.ts
bun run typecheck:entry
node scripts/editions/validate-bootstrap.mjs BUILD OUT_RA2 ra2 --country=5 --map=MP23T4.map --missile-pose --missile-flight-only
node scripts/editions/validate-bootstrap.mjs BUILD OUT_YR yr --country=5 --map=XMP23T4.map --missile-pose --missile-flight-only
```

Remove `--missile-flight-only` to include controlled pose comparisons. Accepted M1.7 unit artwork is not reopened for review. Windows and a new Desktop package are outside this validation. Continue feedback on this correction in the current task.
