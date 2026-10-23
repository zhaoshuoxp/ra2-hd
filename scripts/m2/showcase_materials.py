"""Bounded material registration; retail masks and logical geometry remain authoritative."""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from showcase_registration import extrude, matte


def resized(array, size, method=Image.Resampling.BILINEAR):
    return np.asarray(Image.fromarray(array).resize(size, method)).astype(float)


def water_mask(native, pure_sea=False):
    rgb = native[..., :3].astype(float)
    active = native[..., 3] > 0
    if pure_sea:
        return active
    deep = (rgb[..., 2] > rgb[..., 1] + 8) & (rgb[..., 2] > rgb[..., 0] + 3)
    shallow = (rgb[..., 1] > rgb[..., 0] + 4) & (rgb[..., 2] > rgb[..., 0] - 12)
    water = active & (deep | shallow)
    # Bright neutral water glints can be enclosed by the water region. Warm
    # sand/rock islands remain land even when surrounded by water.
    neutral = (rgb.max(2) - rgb.min(2) < 45) & (rgb[..., 2] >= rgb[..., 0] - 8)
    return (water | (ndimage.binary_fill_holes(water) & neutral)) & active


def pinned_ice_water_mask(native, declaration, source_sha256, root):
    """Require exact native sea ownership, excluding blue shadowed extra ice."""
    assert declaration['classification'] == 'NATIVE_SNOW_ICE_WITH_WATER'
    return pinned_native_water_mask(native, declaration, source_sha256, root)


def pinned_native_water_mask(native, declaration, source_sha256, root):
    """Validate source-pinned sea ownership independently of neighboring materials."""
    assert declaration['classification'] in ('NATIVE_SNOW_ICE_WITH_WATER', 'NATIVE_SNOW_BRIDGE_WITH_WATER',
                                            'NATIVE_URBAN_COAST_WITH_WATER', 'NATIVE_URBAN_STRUCTURE_WITH_WATER',
                                            'NATIVE_THEATER_COAST_WITH_WATER', 'NATIVE_THEATER_STRUCTURE_WITH_WATER')
    assert declaration['sourceSha256'] == source_sha256
    spec = declaration['mask']
    assert spec['nativeRgbaSha256'] == hashlib.sha256(native.tobytes()).hexdigest()
    assert spec['logical'] == list(native.shape[1::-1])
    assert spec['file'] == Path(spec['file']).name
    raw = (Path(root) / spec['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == spec['sha256']
    values = np.frombuffer(raw, np.uint8).reshape(native.shape[:2])
    assert np.all(values <= 1)
    mask = values.astype(bool)
    assert mask.any() and np.all(native[..., 3][mask] > 0)
    assert np.all(native[..., :3][mask].max(1) <= declaration['maximumNativeWaterChannel'])
    assert ((native[..., 3] > 0) & ~mask).any()
    return mask


def register_water(authored, native, density, pure_sea=False, mask=None):
    mask = water_mask(native, pure_sea) if mask is None else mask
    assert mask.shape == native.shape[:2] and mask.dtype == np.bool_
    if not mask.any():
        return authored
    weight = ndimage.gaussian_filter(mask.astype(float), .8)
    colors = native[..., :3].astype(float)
    anchor = np.stack([ndimage.gaussian_filter(colors[..., c] * mask, .8) /
                       np.maximum(weight, .001) for c in range(3)], axis=-1)
    anchor = resized(np.uint8(np.clip(anchor, 0, 255)), authored.shape[1::-1])
    # Retain independently sampled fine waves; remove the authored low-frequency
    # tile bevel and bright broad specular lobes that cannot meet across cells.
    detail = authored.astype(float) - ndimage.gaussian_filter(authored.astype(float), (2 * density, 2 * density, 0))
    result = authored.copy()
    enlarged = np.repeat(np.repeat(mask, density, 0), density, 1)
    result[enlarged] = np.uint8(np.clip(anchor + np.clip(detail, -8, 14) * .28, 0, 255))[enlarged]
    return result


def authored_pool_water_weight(authored, native_mask, density):
    """Retain authored smooth coping edges within two native pixels of pinned water."""
    r, g, b = np.moveaxis(authored.astype(float), -1, 0)
    guide = native_mask.repeat(density, 0).repeat(density, 1)
    nearby = ndimage.distance_transform_edt(~guide) <= 2 * density
    candidate = (b > r + 6) & (b > g + 6) & (b < 160) & nearby
    labels, count = ndimage.label(candidate)
    retained = np.zeros(guide.shape, bool)
    for index in range(1, count + 1):
        body = labels == index
        if (body & guide).sum() >= 64 * density * density:
            retained |= ndimage.binary_fill_holes(body)
    assert retained.any(), 'Authored pool must contain registered water'
    assert (retained & guide).sum() / guide.sum() >= .9, 'Authored water displaced from source pool'
    assert not (retained & ~nearby).any(), 'Authored contour exceeds source tolerance'
    weight = np.clip((ndimage.gaussian_filter(retained.astype(float), .65) - .12) / .76, 0, 1)
    return weight, dict(policy='AUTHORED_SMOOTH_POOL_EDGE_WITHIN_TWO_NATIVE_PIXELS',
        nativeWaterPixels=int(native_mask.sum()), overlap=float((retained & guide).sum() / guide.sum()))


def reject_new_matte(rgb, native, density):
    """Remove calibration-induced fluorescent residue; retain original bright pixels."""
    native_bright = matte(native[..., :3]).repeat(density, 0).repeat(density, 1)
    residue = matte(rgb) & ~native_bright
    return (extrude(rgb, ~residue), int(residue.sum())) if residue.any() else (rgb, 0)


def opaque_water_patch(rgb, active, density):
    """Sample only painted diamond interior; never repeat transparent-margin extrusion."""
    safe = ndimage.binary_erosion(active)
    best = (0, 0, 0, 0)
    for top in range(safe.shape[0]):
        columns = np.ones(safe.shape[1], bool)
        for bottom in range(top, safe.shape[0]):
            columns &= safe[bottom]
            starts = np.flatnonzero(np.diff(np.pad(columns.astype(int), 1)) == 1)
            ends = np.flatnonzero(np.diff(np.pad(columns.astype(int), 1)) == -1)
            for left, right in zip(starts, ends):
                rect = (int(left), top, int(right - left), bottom - top + 1)
                if rect[2] * rect[3] > best[2] * best[3]:
                    best = rect
    x, y, width, height = best
    assert width >= 8 and height >= 4, 'Insufficient opaque authored water interior'
    patch = rgb[y * density:(y + height) * density, x * density:(x + width) * density]
    row = np.concatenate([patch, patch[:, ::-1]], axis=1)
    return np.concatenate([row, row[::-1]], axis=0), list(best)


def contact_weight(native, density):
    active = native[..., 3] > 0
    distance = ndimage.distance_transform_edt(np.pad(active, 1))[1:-1, 1:-1]
    contact = (np.clip((3 - distance) / 2, 0, 1) * active).astype(np.float32)
    size = (native.shape[1] * density, native.shape[0] * density)
    weight = resized(contact, size)
    enlarged_active = np.repeat(np.repeat(active, density, 0), density, 1)
    exact = np.repeat(np.repeat((distance <= 1) & active, density, 0), density, 1)
    weight[exact] = 1
    weight[~enlarged_active] = 0
    return weight


def native_diffuse_rgb(native, sigma=1.2):
    """Original broad light, extruded only outside the authoritative native alpha."""
    active = native[..., 3] > 0
    assert active.any()
    indices = ndimage.distance_transform_edt(~active, return_distances=False, return_indices=True)
    guide = native[..., :3].astype(float).copy()
    guide[~active] = guide[tuple(indices[:, ~active])]
    assert .35 <= sigma <= 2
    return ndimage.gaussian_filter(guide, (sigma, sigma, 0))


def sample_diffuse_rgb(native, size, sigma=1.2):
    field = native_diffuse_rgb(native, sigma)
    return np.stack([np.asarray(Image.fromarray(field[..., channel].astype(np.float32)).resize(
        size, Image.Resampling.BICUBIC)) for channel in range(3)], axis=-1)


def register_contacts(authored, native, density, diffuse=False, diffuse_sigma=1.2):
    # Every native sub-tile owns a contact, including interior cuts in a larger
    # master. The explicit color anchor fades over two native pixels; alpha
    # and contact ownership always remain authoritative native geometry.
    weight = contact_weight(native, density)[..., None]
    anchor = (sample_diffuse_rgb(native, authored.shape[1::-1], diffuse_sigma) if diffuse else
              resized(native[..., :3], authored.shape[1::-1], Image.Resampling.NEAREST))
    return np.uint8(np.clip(authored * (1 - weight) + anchor * weight, 0, 255))


def register_coast_contacts(authored, native, density):
    """Anchor native contact illumination without erasing new material grain."""
    assert density in (2, 4)
    assert authored.shape[:2] == tuple(value * density for value in native.shape[:2])
    weight = contact_weight(native, density)[..., None]
    anchor = sample_diffuse_rgb(native, authored.shape[1::-1])
    broad_authored = ndimage.gaussian_filter(authored.astype(float), (1.5 * density, 1.5 * density, 0))
    return np.uint8(np.clip(authored.astype(float) + (anchor - broad_authored) * weight, 0, 255))


def register_snow_planar_photometry(authored, native, degree=1):
    """Bind generated Snow detail to source-pinned broad illumination."""
    assert degree in (1, 2)
    active = ndimage.binary_erosion(native[..., 3] > 0)
    assert active.sum() >= 32

    def basis(width, height):
        yy, xx = np.meshgrid(np.linspace(-1, 1, height), np.linspace(-1, 1, width), indexing='ij')
        terms = [np.ones_like(xx), xx, yy]
        if degree == 2:
            terms.extend([xx * xx, xx * yy, yy * yy])
        return np.stack(terms, axis=-1)

    grid = basis(native.shape[1], native.shape[0])
    projected = np.asarray(Image.fromarray(authored).resize(native.shape[1::-1], Image.Resampling.BOX))
    native_light, _, rank, _ = np.linalg.lstsq(grid[active], native[..., :3][active], rcond=None)
    authored_light, _, authored_rank, _ = np.linalg.lstsq(grid[active], projected[active], rcond=None)
    assert rank == authored_rank == (3 if degree == 1 else 6)
    # Replace only the declared broad light component. Independent generated
    # local detail remains; native pixel texture supplies no new HD detail.
    correction = basis(authored.shape[1], authored.shape[0]) @ (native_light - authored_light)
    corrected = authored.astype(float) + correction
    return np.uint8(np.clip(corrected, 0, 255)), dict(
        nativeLight=native_light.tolist(), authoredLight=authored_light.tolist(),
        nativeSamples=int(active.sum()), degree=degree,
        registration='Native polynomial RGB illumination; generated residual detail retained')


def register_snow_continuous_light(authored, native):
    """Reuse the accepted V13D diffuse-light binding with independently authored Snow grain."""
    active = native[..., 3] > 0
    assert active.sum() >= 32
    size = authored.shape[1::-1]
    anchor = sample_diffuse_rgb(native, size)
    sigma = (1.4 * authored.shape[0] / native.shape[0],
             1.4 * authored.shape[1] / native.shape[1], 0)
    colors = authored.astype(float)
    detail = colors - ndimage.gaussian_filter(colors, sigma)
    result = np.uint8(np.clip(anchor + detail * .5, 0, 255))
    return result, dict(nativeSamples=int(active.sum()), nativeFieldSigma=1.2,
        detailSigmaLogical=1.4, detailStrength=.5,
        registration='V13D continuous diffuse light; independent generated Snow detail')


def register_tree_tone(authored, original, index, density, strength=.75):
    assert 0 <= strength <= 1
    body = (index != 0) & (index != 12)
    mask = np.repeat(np.repeat(body, density, 0), density, 1)
    native_mean = original[..., :3][body].mean(0)
    authored_mean = authored[mask].mean(0)
    # Restore the explicitly selected source's foliage tone while retaining
    # authored leaf detail and its existing body silhouette.
    gain = 1 - strength + strength * native_mean / np.maximum(authored_mean, 1)
    result = authored.copy()
    result[mask] = np.uint8(np.clip(authored[mask] * gain, 0, 255))
    return result


def register_frame_tone(authored, original, index, density):
    """Restore a pinned non-remappable frame's mean without replacing fine detail."""
    body = (index != 0) & (index != 12)
    mask = np.repeat(np.repeat(body, density, 0), density, 1)
    assert body.any() and authored.shape[:2] == mask.shape
    native_mean = original[..., :3][body].mean(0)
    input_mean = authored[mask].mean(0)
    gain = .25 + .75 * native_mean / np.maximum(input_mean, 1)
    result = authored.copy()
    result[mask] = np.uint8(np.clip(authored[mask] * gain, 0, 255))
    evidence = dict(nativeMean=native_mean.tolist(), inputMean=input_mean.tolist(),
                    outputMean=result[mask].mean(0).tolist(), gain=gain.tolist(),
                    strength=.75, bodyPixels=int(mask.sum()))
    return result, evidence


def register_thin_metal(authored, original, index, density):
    """Keep opaque dark mesh interstices from becoming extruded metal faces."""
    body = (index != 0) & (index != 12)
    mask = np.repeat(np.repeat(body, density, 0), density, 1)
    assert body.any() and authored.shape[:2] == mask.shape
    # Retail mesh holes include nonzero dark palette shades. Their alpha cannot
    # change. Gate their authored metal color while retaining the independent
    # master samples, including full color on the brighter wire and posts.
    luminance = original[..., :3].astype(float).mean(2)
    gate = np.clip(luminance / 110, 0, 1) ** 1.6 * 1.5
    gate = np.repeat(np.repeat(gate, density, 0), density, 1)
    result = authored.copy()
    result[mask] = np.uint8(np.clip(authored[mask].astype(float) * gate[mask, None], 0, 255))
    return result


def register_minerals(authored, original, density):
    colors = authored.astype(float)
    mean = colors.mean(2, keepdims=True)
    colors = (mean - 112) * 1.3 + 112 + (colors - mean) * 1.55
    native = original[..., :3].astype(float)
    bright = (native.mean(2) > 155) & (original[..., 3] > 0)
    weight = ndimage.gaussian_filter(bright.astype(float), .35)
    weight = resized(np.float32(weight), colors.shape[1::-1])[..., None] * .8
    highlight = resized(np.uint8(np.clip(native * 1.35 + 18, 0, 255)), colors.shape[1::-1])
    colors += np.maximum(highlight - colors, 0) * weight
    return np.uint8(np.clip(colors, 0, 255))


def register_shore_land(authored, native, density):
    active = native[..., 3] > 0
    protected = ndimage.binary_dilation(ndimage.binary_fill_holes(water_mask(native)), iterations=1)
    land = active & ~protected
    weight = ndimage.gaussian_filter(active.astype(float), .55)
    anchor = np.stack([ndimage.gaussian_filter(native[..., c].astype(float) * active, .55) /
                       np.maximum(weight, .001) for c in range(3)], axis=-1)
    anchor = resized(np.uint8(np.clip(anchor, 0, 255)), authored.shape[1::-1], Image.Resampling.BICUBIC)
    detail = authored.astype(float) - ndimage.gaussian_filter(authored.astype(float), (1.5 * density, 1.5 * density, 0))
    registered = np.uint8(np.clip(anchor + np.clip(detail, -12, 12) * .35, 0, 255))
    enlarged = np.repeat(np.repeat(land, density, 0), density, 1)
    result = authored.copy()
    result[enlarged] = registered[enlarged]
    return result, land


def register_bridge(authored, original, index, density, swatch, asphalt_mean, continuous=False):
    size = authored.shape[1::-1]
    native = original[..., :3].astype(float)
    body = (index != 0) & (index != 12)
    asphalt = body & (native.max(2) < 132) & (native.max(2) - native.min(2) < 20)
    if continuous:
        # Retail cool asphalt shades also reach the transverse contacts. Leaving
        # those shades out retains a dark outline around each repeated section.
        cool = (native[..., 2] >= native[..., 0]) & (native[..., 2] > native[..., 1] + 3)
        asphalt |= body & (native.max(2) < 132) & cool
    # Retail lane, curb, damage and join geometry is the source of truth.
    base = resized(original[..., :3], size, Image.Resampling.BICUBIC)
    detail = authored.astype(float) - ndimage.gaussian_filter(authored.astype(float), (density, density, 0))
    base += detail * .18
    grain = resized(swatch, size, Image.Resampling.LANCZOS)
    if continuous:
        grain -= ndimage.gaussian_filter(grain, (2 * density, 2 * density, 0))
        grain = np.clip(grain, -16, 16) * .8 + np.asarray(asphalt_mean)
    else:
        grain = grain - grain.mean((0, 1)) + np.asarray(asphalt_mean)
    mask = np.repeat(np.repeat(asphalt, density, 0), density, 1)
    base[mask] = grain[mask]
    return np.uint8(np.clip(base, 0, 255))
