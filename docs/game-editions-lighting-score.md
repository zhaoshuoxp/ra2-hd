# Local lamp exposure and score duration

The user reported blown-out ore regions on several maps and an enormous duration after leaving a match. The supplied location is Bering Strait (`MP26S6.map` / `XMP26S6.map`), the upper-right starting area. These are shared engine/UI defects; no map or accepted art resource is edited.

## Lamp coefficients

Buildings used a gradient as a destination-color blend multiplier. `Color.getHexString()` encoded that multiplier for sRGB, and `MeshBasicMaterial` applied another display-output transform when drawing the gradient. Numeric light coefficients were amplified; negative lamps also subtracted destination alpha, exposing large transparent/black polygons. Map-defined invisible lamps made both defects appear location-dependent.

`LampMaterial` stores raw coefficients and draws them without color-space conversion. The existing color calculation, radial gradient, visibility radius and positive/negative RGB blend equations remain intact. Separate alpha blending preserves the destination opacity. This applies to all buildings using the shared lamp path, across maps and editions. It does not remove the original map's intentional light or rewrite global lighting, radiation or superweapon effects.

The retained `2475407` build reproduces Bering's overexposure; disabling only the lamp meshes removes it. Corrected native screenshots preserve terrain detail. A GPU probe using the actual positive and negative lamp materials verifies exact destination-color arithmetic and alpha: `[128,112,102,255]` and `[76,92,102,255]`, with no GL errors. Both maps retain their original resource hashes. Screenshot statistics are diagnostic evidence, not a claim of exact retail-renderer parity or a global brightness target.

## Score duration

The score table divided accumulated simulation milliseconds by the current speed. The pause menu sets that speed to `Number.EPSILON`; a reproduced 33-second match became `41866796535925:59:44`. It also meant changing speed could retroactively alter the reported duration.

The score now displays accumulated simulation time directly, matching the sidebar and game API. Regression tests cover paused, stopped, slow and fast speeds, including hour/minute rollover. A real pause-menu quit produces the expected `0:00:36` in the corrected candidate. This is simulation time, not wall-clock time including pauses.

## Evidence and delivery

Candidate evidence is under `.artifacts/editions/bering-score-before/` and `bering-score-after-ra2/`. Focused tests and TypeScript entry checking pass. `validate-bootstrap.mjs --lighting-score --start-pos=3 --two-player --map=MP26S6.map` reproduces the original report; `--reproduce` records the retained faulty behavior. The native package validator's `--lighting-score` option checks both original Bering maps, positive/negative GPU blending and pause-to-score navigation after existing building/unit/guard/combat regressions. Final package receipts and screenshots remain under `.artifacts/editions/`.

Continue this same task for the user's display and match acceptance. Per-map art/lighting redesign, new artwork and platform expansion remain outside this correction.
