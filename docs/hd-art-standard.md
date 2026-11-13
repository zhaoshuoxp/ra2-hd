# Persistent HD artwork standard

Effective 2026-10-24. This is the user's standing requirement for all future RA2 HD artwork tasks and conversations, not only M3.1. It supersedes interpretations of source fidelity that preserve defects caused by low resolution. The parent workspace `AGENTS.md` carries the same instruction across worktrees.

## Fidelity and finish

Preserve the original patterns, design, colors and style as closely as possible. Retain recognizable forms, proportions, perspective, composition, lighting, material identity, intentional damage and frame-specific details. Use smooth, clearly resolved materials and crisp, continuous, antialiased lines. Low-resolution grain, blocky color patches, coarse stair steps and jagged edges must be reconstructed rather than copied into the HD artwork.

Material detail should describe the original object: continuous planks and beams, coherent masonry and cornices, clean metal panels, readable glazing and restrained intentional wear. Do not replace the original design with a new building, bridge or vehicle. Do not add gritty noise, pixel-art texture, excessive weathering, invented ornaments or an unrelated photorealistic style. Smooth does not mean blurry, plastic or featureless; sharp does not mean oversharpened halos.

## Production requirements

- Identify the original source and complete state/heading family before authoring. Label each reference as design/geometry, palette or finish so low-resolution sampling is never mistaken for a finish target.
- Redraw the material and lines at sufficient real source resolution. Enlargement, interpolation, sharpening or noise removal alone does not qualify as new HD artwork.
- Preserve native logical dimensions, pivots, ownership masks, depth, shadows, state coverage and animation timing. Contour reconstruction may remove sampling stair steps within the established authoring tolerances without changing the object's design or gameplay geometry.
- Export independent 2X and 4X resources from sufficiently resolved masters. Inspect thin members, line continuity, transparency, color, source alignment and actual runtime appearance at both densities.
- Retain rejected candidates and provenance. Do not ship a rejected master merely because its registration or resource checks pass. Technical checks and user visual acceptance are separate.
- Apply the standard to new or explicitly reopened assets. Preserve other accepted resources unless the user requests their revision.

## Prompt requirement

Every new or revised raster-art prompt must explicitly require: preserve the original patterns, design, colors and style; reconstruct smooth, clear materials and continuous crisp antialiased lines; remove low-resolution grain, blocky color patches and jagged edges; preserve native forms and state-specific details; do not introduce a new design or simulate HD with enlargement, blur, sharpening or added noise.

## M3.1 disposition

M3.1 through R8 is user accepted on 2026-10-25. The selected R7 CAWA2A/CAWA2B, URBAN wooden bridge and CRUISE resources use the reconstructed finish; TUG and PDPLANE retain the user-permitted artwork. R8 preserves their textures while repairing civilian hull depth and adding the Soviet national flag insignia. Initial candidates remain historical provenance. This acceptance does not authorize replacement of the 23 reused accepted families or weaken the standing standard for future work. See `m3-1-main-handoff.md` for the integrated baseline and retained authoring index.
