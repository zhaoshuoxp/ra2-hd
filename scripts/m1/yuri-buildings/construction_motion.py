"""Native local roof travel above stationary wall material and fixed sockets."""
import numpy as np
from PIL import Image
from production_common import indices, clip
from mechanical_common import ground_plane, project_part


def local_top(family, member, n, bounds):
    native = indices(member, n)
    canvas = np.zeros(family.body['canvas'][::-1], np.uint8)
    delta = [(family.body['canvas'][i] - member['canvas'][i]) // 2 for i in range(2)]
    source = Image.fromarray(native)
    centered = Image.fromarray(canvas)
    centered.paste(source, tuple(delta))
    native = np.array(centered)
    x0, y0, x1, y1 = map(round, bounds)
    y, _ = np.where(native[max(0, y0):y1, max(0, x0):x1] > 1)
    return float(y.min() + max(0, y0)) if len(y) else float(y1)


def telescope(family, part, member, n, bounds, roof_height=12):
    """Move the rigid cap, revealing fixed column surfaces beneath it.

    Unlike translating a full facade through a horizontal clipping plane,
    its bolts, wall panels and foundation remain at their final coordinates.
    Only the native local roof/collar position changes.
    """
    box = part.getbbox()
    if box is None:
        return family.blank()
    d = family.density
    top = box[1] / d
    reference = local_top(family, member, member['visibleFrames'] - 1, bounds)
    shift = max(-3, local_top(family, member, n, bounds) - reference)
    yy = np.indices(part.size[::-1])[0]
    cap_mask = Image.fromarray(np.uint8(yy < (top + roof_height) * d) * 255)
    cap = clip(part, cap_mask)
    wall_mask = Image.fromarray(np.uint8(yy >= (top + roof_height + max(0, shift)) * d) * 255)
    result = clip(part, wall_mask)
    result.alpha_composite(family.translate(cap, dy=shift))
    result = clip(result, ground_plane(part))
    family.construction_motion.append({'frame': n, 'partBounds': list(bounds), 'capTravel': shift,
        'capHeight': roof_height, 'wallTranslation': [0, 0], 'foundationTranslation': [0, 0],
        'wholeBuildingScale': [1, 1], 'control': 'Native local component top; stationary wall material'})
    return result


def hinge(family, part, bounds, phase, direction=1):
    """Unfold one complete panel about its bottom edge onto the ground plane."""
    x0, y0, x1, y1 = bounds
    phase = float(np.clip(phase, 0, 1))
    angle = phase * np.pi / 2
    height = y1 - y0
    rise = height * np.sin(angle)
    lean = direction * height * np.cos(angle) * .45
    quad = [(x0 + lean, y1 - rise), (x1 + lean, y1 - rise), (x1, y1), (x0, y1)]
    # Keep a tiny projected width at the exactly folded pose; the panel is
    # edge-on, without rescaling the building or moving its hinge sockets.
    if phase == 0:
        quad[0] = (quad[0][0], y1 - .5)
        quad[1] = (quad[1][0], y1 - .5)
    return project_part(family, part, [(x0,y0),(x1,y0),(x1,y1),(x0,y1)], quad)
