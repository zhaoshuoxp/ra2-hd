"""Authored material intent backed by the native building palette and design."""
import numpy as np

# Bio Reactor's native owner regions are its red coil and lower red pedestal.
# Its gold/brass vessel fittings and yellow/blue liquid are fixed materials.
# These envelopes include local deployment and damaged-coil displacement;
# they never clip the final authored panel to source-index pixel support.
PAINT_REGIONS = {
    'YAPOWR': [(70, 0, 104, 35), (61, 82, 111, 118)],
    'YAGGUN': [(0, 0, 120, 82)],
    'YAREFN': [(0, 0, 118, 108)],
    'YABRCK': [(0, 72, 32, 150), (68, 116, 88, 146), (108, 98, 121, 116),
                (98, 110, 109, 126), (39, 129, 55, 151)],
    'YACNST': [(0, 0, 256, 232)],
    'YAPSYT': [(0, 0, 242, 254)],
    'NATBNK': [(0, 0, 138, 126)],
    'YAGRND': [(0, 0, 320, 220)],
    'NAPSIS': [(0, 0, 262, 210)],
    'YATECH': [(0, 0, 308, 316)],
    'YAGNTC': [(0, 0, 270, 244)],
    'YAPPET': [(0, 0, 282, 204)],
    'YAWEAP': [(0, 0, 272, 242)],
    'YAYARD': [(0, 0, 304, 236)],
}
PAINT_EXCLUSIONS = {'YACNST': [(186, 97, 197, 108)], 'YAPPET': [(113, 120, 156, 163)],
    'YAGNTC': [(72, 165, 81, 174), (87, 172, 96, 181), (103, 180, 112, 189),
               (116, 186, 125, 197), (146, 186, 155, 197), (159, 180, 168, 189),
               (175, 172, 184, 181), (190, 165, 199, 174)]}
RATIONALE = {
    'YAPOWR': 'Native owner-index coil and lower pedestal; authored red-painted insulator/support panels. Brass, yellow/blue glass and emissive spark control are fixed.',
    'YAGGUN': 'Owner-index red gun drum/receiver only in construction and separate VXL turret; native stationary pedestal has no owner-index material.',
    'YAREFN': 'Native owner-index red collar rings and control side panel, including compact yaw/deployment keys. Gold/silver structure, dark conveyor and separate neutral turret remain fixed.',
    'YABRCK': 'Native owner-index buttress/stair panels, red side block and canister stripes. Blue electrical glass, stone head, metal and the red terminal light are fixed.',
    'YACNST': 'Native owner-index structural red walls, panel bands, floor emblem and moving forearm. Bronze/rust, silver machinery, yellow windows and the small spire indicator light remain fixed.',
    'YAPSYT': 'Native owner-index red electrode collars, rotating-dish fins and fixed foot tips. Black threaded conductors, silver caps, bronze dish/shaft and curved gold wiring stay neutral; no photographic glow is baked.',
    'NATBNK': 'Native owner-index outer floor perimeter belongs to the fixed bib. The Original-reference reconstruction uses purple master paint with explicit categorical shades; retained predecessors use red. Raised gold/dark-steel guards, yellow hazard stripes, silver braces, rust and wheel strips are neutral; original body slots are empty.',
    'YAGRND': 'Native owner-index red structural rim, canisters and foot blocks remain owner paint. Gold crusher teeth, silver/dark rollers, brass pipes, white floor inlays and yellow electrical particles remain fixed materials.',
    'NAPSIS': 'Accepted functional pixels and original categorical owner shades are retained. New YR construction uses red structural braces/hinges and sensor clips as owner paint; pale stone, silver metal and yellow windows are fixed.',
    'YATECH': 'Native owner-index red cylinder cap, foot braces, support panels and moving-fork housing remain owner paint. Bronze stairs, silver tubing/blades and black moving crescent are neutral.',
    'YAGNTC': 'Native owner-index red structural base, large canisters and emitter collars remain owner paint; bronze/silver mechanics, small fixed red indicator buttons (native index 15) and native purple electrical control are neutral.',
    'YAPPET': 'Native owner-index red chamber band, hub and foot pads remain owner paint. Rust-colored central stair surfaces, gold joints/petals, silver/black hydraulics and purple electrical intensity are fixed materials.',
    'YAWEAP': 'Native owner-index red rear panels, bay arch and canister bands remain owner paint. Silver gate/roof, gold girders, dark opaque interior and conveyor are neutral.',
    'YAYARD': 'Native owner-index red cylindrical tanks, dome ring and buttress panels remain owner paint. Orange chemical pipes, bronze masonry, silver berth roofs, crane and blue indicator light remain fixed.',
}


def paint_envelope(identity, shape, native, density):
    regions = PAINT_REGIONS.get(identity)
    if regions is None:
        return np.ones(shape, bool)
    y, x = np.indices(shape)
    x = x / density + native['x']
    y = y / density + native['y']
    material = np.zeros(shape, bool)
    for x0, y0, x1, y1 in regions:
        material |= (x >= x0) & (x < x1) & (y >= y0) & (y < y1)
    for x0, y0, x1, y1 in PAINT_EXCLUSIONS.get(identity, []):
        material &= ~((x >= x0) & (x < x1) & (y >= y0) & (y < y1))
    return material


def intended_core(identity, rgba, native, density, owner_material=True, paint_color='red'):
    red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
    core = (rgba[..., 3] >= 240) & (red > 2.5 * np.maximum(green, blue)) & (red - np.maximum(green, blue) > 35)
    if identity == 'NATBNK' and paint_color == 'purple':
        core = (rgba[..., 3] >= 240) & (blue > red*1.1) & (red > green*1.5) & (blue-green > 25)
    material = paint_envelope(identity, core.shape, native, density)
    if identity in RATIONALE and not owner_material:
        material[:] = False
    return core & material, core & ~material
