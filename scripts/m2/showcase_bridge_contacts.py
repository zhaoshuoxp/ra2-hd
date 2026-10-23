"""Register approved bridge road material to native lane geometry and road contacts."""
import numpy as np
from scipy import ndimage
from scipy.signal import find_peaks


def coordinates(shape, density=1):
    y, x = np.indices(shape)
    x, y = (x+.5)/density, (y+.5)/density
    return x+2*y, x-2*y


def color_masks(pixels):
    colors = pixels[..., :3].astype(float)
    active = pixels[..., 3] > 0
    yellow = (np.minimum(colors[..., 0], colors[..., 1])-colors[..., 2] > 12)
    yellow &= np.abs(colors[..., 0]-colors[..., 1]) < 35
    white = (colors.mean(2) > 115) & (colors.max(2)-colors.min(2) < 25)
    return active, yellow & active, white & active


def intervals(values):
    """Close raster sampling holes inside existing dashes, retaining their gaps."""
    start = float(values.min())
    end = float(values.max())
    signal = np.zeros(int(round(end-start))+1, bool)
    signal[np.rint(values-start).astype(int)] = True
    signal = ndimage.binary_closing(np.pad(signal, 3), iterations=1)[3:-3]
    edges = np.diff(np.pad(signal.astype(int), 1))
    return [(start+int(a)-.5, start+int(b)-.5)
        for a, b in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1))]


def fit_stripes(native):
    active, yellow, white = color_masks(native)
    u, v = coordinates(active.shape)
    low, high = float(u[active].min()), float(u[active].max())
    width = high-low+1
    # Four source yellow stripes: two road edges and the central double line.
    limits = [low, low+width*.3, low+width*.515, low+width*.7, high+1]
    result = []
    for left, right in zip(limits, limits[1:]):
        mask = yellow & (u >= left) & (u < right)
        assert mask.sum() >= 12, 'Missing native bridge road stripe'
        center = float(u[mask].mean())
        span = float(v[active].max()-v[active].min()+1)
        stripe_width = float(mask.sum()*4/span)
        assert .5 < stripe_width < 7
        result.append(dict(kind='yellow', center=center, width=stripe_width))
    for left, right in [(low+width*.22, low+width*.4), (low+width*.64, low+width*.81)]:
        mask = white & (u >= left) & (u <= right)
        assert mask.sum() >= 12, 'Missing native white lane dashes'
        runs = intervals(v[mask])
        span = sum(b-a for a, b in runs)
        result.append(dict(kind='white', center=float(u[mask].mean()),
            width=float(mask.sum()*4/span), intervals=runs))
    return result


def nearest_material(values, valid):
    assert valid.any(), 'No approved asphalt detail outside road paint'
    indices = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    result = values.copy()
    result[~valid] = result[tuple(indices[:, ~valid])]
    return result


def neighbor_profile(donors, native_u, shift):
    """Measure adjoining source asphalt by material; never restore source pixel cells."""
    bins = np.arange(int(native_u.min()), int(native_u.max())+2)
    sums = np.zeros((len(bins), 3), float)
    counts = np.zeros(len(bins), float)
    pigments = {'yellow': [], 'white': []}
    for donor in donors:
        active, yellow, white = color_masks(donor)
        u, v = coordinates(active.shape)
        colors = donor[..., :3].astype(float)
        # The native placement audit establishes a +120 U offset at this join.
        u += shift
        contact = active & (v <= v[active].min()+14)
        asphalt = contact & ~yellow & ~white & (colors.mean(2) < 115)
        for index, coordinate in enumerate(bins):
            samples = asphalt & (np.abs(u-coordinate) <= 3)
            if samples.any():
                sums[index] += colors[samples].sum(0)
                counts[index] += samples.sum()
        for kind, mask in [('yellow', yellow), ('white', white)]:
            if (contact & mask).any():
                pigments[kind].append(colors[contact & mask].mean(0))
    assert (counts > 0).sum() > len(bins)*.6
    valid = counts > 0
    values = sums[valid]/counts[valid, None]
    curve = np.stack([np.interp(bins, bins[valid], values[:, c]) for c in range(3)], axis=-1)
    curve = ndimage.gaussian_filter1d(curve, 4, axis=0)
    return bins, curve, {kind: np.mean(value, axis=0) for kind, value in pigments.items()}


def register_bridge_contacts(approved, native_main, donors, density):
    """Reproject only the join band; retain approved texture and existing paint."""
    assert density in (2, 4)
    active, _, _ = color_masks(native_main)
    u0, v0 = coordinates(active.shape)
    u, v = coordinates(approved.shape[:2], density)
    support = active.repeat(density, 0).repeat(density, 1)
    stripes = fit_stripes(native_main)
    native_centers = np.array([s['center'] for s in stripes if s['kind'] == 'yellow'])
    rgb = approved[..., :3].astype(float)
    end = float(v0[active].max())+.5
    distance = (end-v)/np.sqrt(5)
    weight = np.clip(1-distance/12, 0, 1)
    weight = weight*weight*(3-2*weight)
    region = support & (u >= native_centers[0]-8) & (u <= native_centers[-1]+6)
    region &= (distance >= 0) & (distance < 12)

    chroma = np.minimum(rgb[..., 0], rgb[..., 1])-rgb[..., 2]
    fitting = support & (v > end-42) & (v < end-4)
    fitting &= (u > native_centers[0]-12) & (u < native_centers[-1]+12)
    strength = np.maximum(0, chroma-25)*fitting
    bins = np.arange(native_centers[0]-16, native_centers[-1]+17, 1/density)
    histogram, _ = np.histogram(u.ravel(), bins, weights=strength.ravel())
    histogram = ndimage.gaussian_filter1d(histogram, 1)
    peaks, _ = find_peaks(histogram, distance=3*density, prominence=histogram.max()*.08)
    assert len(peaks) >= 4, 'Approved bridge must retain four measurable yellow lines'
    selected = sorted(sorted(peaks, key=lambda i: histogram[i], reverse=True)[:4])
    fits = []
    for target, index in zip(native_centers, selected):
        center = float((bins[index]+bins[index+1])/2)
        assert abs(center-target) < 10, 'Paint displacement exceeds bounded registration'
        mask = fitting & (np.abs(u-center) < 1.6) & (chroma > 30)
        assert mask.sum() > density*8
        coefficients = np.polyfit(v[mask], u[mask], 1, w=np.sqrt(strength[mask]))
        assert abs(coefficients[0]) < .12
        fits.append(coefficients)
    author_lines = [a*v+b for a, b in fits]
    mapped_u = u+author_lines[0]-native_centers[0]
    for index in range(3):
        fraction = np.clip((u-native_centers[index])/(native_centers[index+1]-native_centers[index]), 0, 1)
        mapped = author_lines[index]*(1-fraction)+author_lines[index+1]*fraction
        mapped_u = np.where((u >= native_centers[index]) & (u < native_centers[index+1]), mapped, mapped_u)
    mapped_u = np.where(u >= native_centers[-1], u+author_lines[-1]-native_centers[-1], mapped_u)
    mapped_u = u+(mapped_u-u)*weight
    sample_x = (mapped_u+v)*density/2-.5
    sample_y = (mapped_u-v)*density/4-.5
    sample = np.stack([ndimage.map_coordinates(rgb[..., c], [sample_y, sample_x], order=1,
        mode='nearest') for c in range(3)], axis=-1)

    yellow = np.clip((np.minimum(sample[..., 0], sample[..., 1])-sample[..., 2]-12)/25, 0, 1)
    white = np.clip((sample.mean(2)-100)/65, 0, 1)*(1-yellow)
    material_mask = support & (chroma < 12) & (rgb.mean(2) < 110)
    material_mask &= (u > native_centers[0]-4) & (u < native_centers[-1]+3)
    mass = ndimage.gaussian_filter(material_mask.astype(float), 2*density)
    diffuse = np.stack([ndimage.gaussian_filter(rgb[..., c]*material_mask, 2*density)
        / np.maximum(mass, 1e-8) for c in range(3)], axis=-1)
    diffuse = nearest_material(diffuse, mass > .04)
    diffuse = np.stack([ndimage.map_coordinates(diffuse[..., c], [sample_y, sample_x],
        order=1, mode='nearest') for c in range(3)], axis=-1)
    bins, target, pigments = neighbor_profile(donors, u0[active], 120)
    target = np.stack([np.interp(u, bins, target[:, c]) for c in range(3)], axis=-1)
    offset = np.clip(target-diffuse, -35, 35)*(1-yellow-white)[..., None]
    source_yellow = fitting & (chroma > 40)
    source_white = fitting & (rgb.mean(2) > 135) & (rgb.max(2)-rgb.min(2) < 30)
    source_white &= (u > native_centers[0]+12) & (u < native_centers[-1]-12)
    for kind, mask, opacity in [('yellow', source_yellow, yellow), ('white', source_white, white)]:
        assert mask.any(), 'Approved paint color authority is required'
        offset += (pigments[kind]-rgb[mask].mean(0))*opacity[..., None]
    toned = sample+offset*weight[..., None]
    # Color registration stays on asphalt; curb alignment uses approved pixels only.
    asphalt = (u > native_centers[0]-4) & (u < native_centers[-1]+3)
    result = np.where(asphalt[..., None], toned, sample)
    output = approved.copy()
    output[..., :3][region] = np.uint8(np.clip(result[region], 0, 255))
    assert np.array_equal(output[..., 3], approved[..., 3])
    assert np.array_equal(output[~region], approved[~region])
    return output, dict(policy='BOUNDED_APPROVED_ROAD_CONTACT_REPROJECTION_V2',
        density=density, nativeStripeCenters=native_centers.tolist(),
        approvedStripeFits=[p.tolist() for p in fits], contactNativeWidth=12,
        maxNativeDisplacement=float(np.max(np.abs(mapped_u[region]-u[region]))*np.sqrt(5)/4),
        changedPixels=int(np.any(output != approved, axis=2).sum()),
        alphaChanged=False, outsideRoadMainBlocksChanged=False, outsideContactBandChanged=False)
