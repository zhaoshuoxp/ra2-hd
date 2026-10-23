"""Recover authored owner paint without clipping it to native silhouette coordinates."""
import numpy as np
from scipy import ndimage
from audit import red_paint


def owner_paint(rgba, data, density, identity, member, heading=None):
    existing = data[..., 0] >= 128
    red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
    # Skin and brown hair can pass a broad red detector at dark edge pixels.
    # Keep those materials out of new paint, including where they touch clothes.
    brown = (green > red * .25) & (green > blue * 1.3)
    skin = (green > red * .35) & (blue > red * .28)
    infantry = identity in ('E1', 'E2', 'GGI', 'TANY', 'SNIPE', 'BORIS', 'DESO', 'SHK',
        'CLEG', 'JUMPJET', 'GHOST', 'CIVAN', 'ENGINEER', 'SENGINEER', 'CCOMAND',
        'PTROOP', 'YURI', 'YURIPR', 'ADOG', 'DOG')
    candidate = red_paint(rgba) & (~(brown | skin) if infantry else True)
    # These retail materials are neutral: spy disguise artwork and wall masonry.
    if identity in ('SPY', 'GAWALL', 'NAWALL') or member in ('spy.shp', 'gtwall.shp', 'gawall.shp', 'ntwall.shp', 'nawall.shp'):
        return existing, candidate & ~existing
    core = candidate & (red > 2.5 * np.maximum(green, blue)) & (red - np.maximum(green, blue) > 35)
    labels, count = ndimage.label(candidate, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel(), minlength=count + 1)
    seeds = np.bincount(labels.ravel(), weights=core.ravel(), minlength=count + 1)
    supported = ndimage.binary_dilation(existing, iterations=max(1, density))
    contacts = np.bincount(labels.ravel(), weights=supported.ravel(), minlength=count + 1)
    approved = (contacts > 0) | ((seeds >= max(1, density * density / 4)) & (seeds >= sizes * .15))
    approved[0] = False
    paint = existing | (candidate & approved[labels])

    # Unseeded red fire rims share a connected warm component with their yellow
    # core. Keep muzzle flashes, molten ore and lamps out of new owner paint.
    warm = ((rgba[..., 3] > 0) & (red > 65) & (red > blue * 1.4) & (red >= green * .85))
    hot = warm & (red > 120) & (green > red * .6) & (blue < red * .25)
    warm_labels, warm_count = ndimage.label(warm, np.ones((3, 3)))
    warm_sizes = np.bincount(warm_labels.ravel(), minlength=warm_count + 1)
    hot_counts = np.bincount(warm_labels.ravel(), weights=hot.ravel(), minlength=warm_count + 1)
    paint_counts = np.bincount(warm_labels.ravel(), weights=existing.ravel(), minlength=warm_count + 1)
    emission = (hot_counts >= max(2, density * density / 2)) & (hot_counts >= warm_sizes * .1) & (paint_counts == 0)
    emission[0] = False
    paint &= existing | ~emission[warm_labels]
    if identity == 'ZEP':
        # Kirov's painted shark mouth is a fixed insignia. Its original mask
        # distinguishes it from the heavily owner-marked engines and tail.
        owners = np.bincount(labels.ravel(), weights=existing.ravel(), minlength=count + 1)
        centers = ndimage.center_of_mass(candidate, labels, range(1, count + 1))
        face = np.zeros(count + 1, bool)
        for label, (y, x) in enumerate(centers, 1):
            x, y = x / max(1, rgba.shape[1]), y / max(1, rgba.shape[0])
            face[label] = (heading == 0 and x > .77 and y < .5 or
                heading == 90 and x < .23 and y < .5 or
                heading == 135 and x < .23 or heading == 315 and x > .77 or
                heading == 180 and x < .35 and y > .7 or
                heading == 270 and x > .65 and y > .7 or
                heading == 225 and .35 < x < .65 and y > .8)
        fixed = face & (owners < sizes * .2)
        paint &= existing | ~fixed[labels]
    return paint, candidate & ~paint


def complete_data(rgba, data, density, identity, member, heading=None):
    paint, neutral = owner_paint(rgba, data, density, identity, member, heading)
    added = paint & (data[..., 0] < 128)
    result = data.copy()
    ramp = np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4
    shades = abs(rgba[..., 0, None].astype(float) - ramp).argmin(axis=2)
    result[..., 0][added] = 255
    result[..., 1][added] = shades[added]
    return result, int(added.sum()), int(neutral.sum())
