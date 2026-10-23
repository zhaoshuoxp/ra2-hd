"""Share accepted asphalt detail across road forms without tile-edge photometry."""
import numpy as np
from PIL import Image
from scipy import ndimage


def asphalt_pixels(rgba):
    rgb = rgba[..., :3].astype(float)
    return (rgba[..., 3] > 0) & (rgb.max(2) < 132) & (np.ptp(rgb, axis=2) < 35)


def periodic_material(reference, density, target_mean):
    """Unproject accepted detail onto a periodic isometric material lattice."""
    rgb = reference[..., :3].astype(float)
    valid = asphalt_pixels(reference) & (rgb.mean(2) > 20) & (np.ptp(rgb, axis=2) < 15)
    assert valid.any()
    nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    rgb = rgb[tuple(nearest)]
    size = 60*density
    v, u = (np.indices((size, size))+.5)/size
    x, y = (30+30*(u-v))*density-.5, 15*(u+v)*density-.5
    material = np.stack([ndimage.map_coordinates(rgb[..., c], [y, x], order=1, mode='nearest')
        for c in range(3)], axis=2)
    # Remove only the broad opposing-edge difference. The source remains actual
    # accepted HD texture, rather than enlarged native pixels or generated noise.
    horizontal = material[:, -1].mean(0)-material[:, 0].mean(0)
    vertical = material[-1].mean(0)-material[0].mean(0)
    material -= (u-.5)[..., None]*horizontal+(v-.5)[..., None]*vertical
    material += np.asarray(target_mean)-material.mean((0, 1))
    # Muted worn paint can resemble asphalt in a source palette. Its colored
    # strokes must never become a second set of road markings in the material.
    light = material.mean(2, keepdims=True)
    chroma = material-light
    material = light+np.clip(chroma-chroma.mean((0, 1)), -2, 2)
    material += np.asarray(target_mean)-material.mean((0, 1))
    return material


def project_road_material(authored, native, metadata, density, material, plane_gain=1):
    """Keep target coverage and high-resolution paint; repair only asphalt RGB."""
    assert authored.shape[:2] == tuple(value*density for value in native.shape[:2])
    native_band = asphalt_pixels(native)
    if not native_band.any():
        return authored.copy(), dict(changedPixels=0, nativeRoadPixels=0)
    yy, xx = np.indices(authored.shape[:2])
    x = (xx+.5)/density+metadata['origin'][0]+metadata['offset'][0]
    y = (yy+.5)/density+metadata['origin'][1]+metadata['offset'][1]
    ramp = metadata['rampType']
    # Source slope charts: keep the native across-road vector while undoing the
    # compressed or extended along-road projection. Sprite geometry is unchanged.
    if ramp == 1:
        y = 2*y+x/2
    elif ramp == 2:
        y = 2*y-x/2
    elif ramp == 3:
        y = 2*y/3-x/6
    elif ramp == 4:
        y = 2*y/3+x/6
    u, v = (x/60+y/30-.5) % 1, (-x/60+y/30+.5) % 1
    coords = [v*material.shape[0]-.5, u*material.shape[1]-.5]
    sampled = np.stack([ndimage.map_coordinates(material[..., c], coords, order=1, mode='grid-wrap')
        for c in range(3)], axis=2)*plane_gain
    rgb = authored[..., :3].astype(float)
    # The original field gates actual roadway; authored paint and curb material
    # use their existing output-resolution boundaries, never a new native-pixel edge.
    active = native[..., 3] > 0
    nearest = ndimage.distance_transform_edt(~active, return_distances=False, return_indices=True)
    # Transparent surroundings must not turn an actual asphalt cut into a
    # half-strength blend. Coverage remains exclusively target-owned below.
    extended_band = native_band[tuple(nearest)]
    # Fill paint-sized gaps before material transfer. A native paint pixel is
    # not a hole in the road plane; actual HD strokes are protected separately.
    padded = np.pad(extended_band, 8, mode='edge')
    extended_band = ndimage.binary_closing(padded, structure=np.ones((5, 5)))[8:-8, 8:-8]
    native_weight = np.asarray(Image.fromarray(extended_band.astype(np.float32)).resize(
        authored.shape[1::-1], Image.Resampling.BILINEAR))
    weight = np.clip(native_weight, 0, 1)*np.clip((155-rgb.max(2))/25, 0, 1)
    weight *= np.clip((55-np.ptp(rgb, axis=2))/25, 0, 1)
    weight *= authored[..., 3] > 0
    fine = rgb-ndimage.gaussian_filter(rgb, (density, density, 0))
    sampled += np.clip(fine, -12, 12)*.1
    result = authored.copy()
    result[..., :3] = np.rint(np.clip(rgb*(1-weight[..., None])+sampled*weight[..., None], 0, 255)).astype(np.uint8)
    np.testing.assert_array_equal(result[..., 3], authored[..., 3])
    np.testing.assert_array_equal(result[weight == 0], authored[weight == 0])
    opaque = result[..., 3] > 0
    outside = ndimage.distance_transform_edt(~opaque, return_distances=False, return_indices=True)
    result[~opaque, :3] = result[tuple(outside)][~opaque, :3]
    return result, dict(changedPixels=int(np.any(result != authored, axis=2).sum()),
        nativeRoadPixels=int(native_band.sum()), planeGain=float(plane_gain),
        alphaExact=True, opaqueOutsideRoadWeightExact=True, transparentRgb='NEAREST_VISIBLE_COLOR_EXTRUSION',
        paintPolicy='EXISTING_HD_COLOR_BOUNDARIES')
