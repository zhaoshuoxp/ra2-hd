"""Track painted material with native pose guides; never sample native RGB into art."""
import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_dilation, gaussian_filter, minimum_filter, uniform_filter


def linearize(color):
    return np.where(color <= .04045, color / 12.92, ((color + .055) / 1.055) ** 2.4)


def encode(color):
    return np.where(color <= .0031308, color * 12.92, 1.055 * color ** (1 / 2.4) - .055)


def blend_material(base, data, material, remap, weight, palette):
    """Feather paired shader coefficients, never raw palette-slot identifiers."""
    left, right = data[..., :1] / 255, remap[..., :1] / 255
    strength = left * (1 - weight) + right * weight
    quantized = np.floor(strength * 255 + .5).astype(np.uint8)
    levels = linearize(palette[16:32, 0].astype(float) / 255)
    tone = (left[..., 0] * levels[data[..., 1]] * (1 - weight[..., 0])
            + right[..., 0] * levels[remap[..., 1]] * weight[..., 0])
    tone = np.divide(tone, strength[..., 0], out=np.zeros_like(tone), where=strength[..., 0] > 0)
    shade = np.argmin(np.abs(tone[..., None] - levels), axis=2)
    neutral = (linearize(base[..., :3] / 255) * (1 - left) * (1 - weight)
               + linearize(material[..., :3] / 255) * (1 - right) * weight)
    divisor = 1 - quantized.astype(float) / 255
    neutral = np.divide(neutral, divisor, out=np.zeros_like(neutral), where=divisor > 0)
    color = np.clip(np.floor(encode(np.clip(neutral, 0, 1)) * 255 + .5), 0, 255).astype(np.uint8)
    partial = (weight[..., 0] > 0) & (weight[..., 0] < 1)
    base[..., :3][partial] = color[partial]
    data[..., 0][partial] = quantized[..., 0][partial]
    data[..., 1][partial] = shade[partial]
    exact = weight[..., 0] == 1
    base[..., :3][exact], data[..., :2][exact] = material[..., :3][exact], remap[..., :2][exact]
    data[..., :2][base[..., 3] == 0] = 0


def share_stationary_material(current, following, pair, donor, palette):
    base, data = pair
    density = base.shape[0] // current.shape[0]
    assert density in (2, 4) and base.shape[1] == current.shape[1] * density
    donor_base, donor_data = donor
    exact = minimum_filter((current == following) & (current > 0), size=3,
                           mode="constant", cval=0).astype(bool)
    current_owner = (current >= 16) & (current <= 31)
    next_owner = (following >= 16) & (following <= 31)
    error = np.abs(palette[current].astype(float) - palette[following].astype(float))
    allowed = ((current > 0) & (following > 0) & (current_owner == next_owner)
               & (error.max(axis=2) <= 40) & (uniform_filter(error.mean(axis=2), size=5) <= 16))
    region = (binary_closing(binary_dilation(exact, iterations=3), iterations=2) | exact) & allowed
    weights = gaussian_filter(region.astype(float), sigma=.8) * allowed
    weights[exact] = 1
    weight = np.array(Image.fromarray(weights.astype(np.float32)).resize(
        (base.shape[1], base.shape[0]), Image.Resampling.BILINEAR))[..., None]
    expand = lambda a: np.repeat(np.repeat(a, density, axis=0), density, axis=1)
    material, remap = donor_base, donor_data
    owners = (current >= 16) & (current <= 31)
    eligible_owner = expand(binary_dilation(owners, iterations=3)) if owners.any() else np.zeros(base.shape[:2], bool)
    # A faint donor edge is background coverage, not an opaque material sample.
    # It must never darken a solid receiver during stationary registration.
    transfer = ((weight[..., 0] > 0) & (base[..., 3] >= 128)
                & (material[..., 3] >= 224) & ((remap[..., 0] == 0) | eligible_owner))
    # Alpha, canvas/trim geometry and terminal pixels remain untouched.
    # Paired base/data copying keeps the existing linear owner shader exact.
    weight[~transfer] = 0
    # Feather only the boundary between stationary and newly changing
    # surfaces. Native motion is retained; no per-pixel displacement field
    # may tear a painted component into independently translated blocks.
    weight[expand(exact) & transfer] = 1
    blend_material(base, data, material, remap, weight, palette)
    return {"stationaryNativePixels": int((weights > .5).sum()),
            "exactUnchangedNativeNeighborhoods": int(exact.sum()),
            "paintedTexelsTransferred": int(transfer.sum()), "nativeRgbContribution": 0}

def cohere_pose_materials(native, canvases, palette, frozen=()):
    result = [[a.copy() for a in pair] for pair in canvases]
    evidence = []
    for phase in range(len(result) - 2, -1, -1):
        if phase in frozen:
            continue
        row = share_stationary_material(native[phase], native[phase + 1], result[phase], result[phase + 1], palette)
        evidence.append({"phase": phase, "donorPhase": phase + 1, **row})
    # A reused source-equivalent prefix is immutable. Its surviving surfaces
    # establish the material anchor when freshly painted snow poses begin.
    # Carry that anchor forward without altering any reused or terminal pose.
    anchor = False
    for phase in range(1, len(result) - 1):
        if phase - 1 in frozen:
            anchor = True
        if phase in frozen or not anchor:
            continue
        row = share_stationary_material(native[phase], native[phase - 1], result[phase], result[phase - 1], palette)
        evidence.append({"phase": phase, "donorPhase": phase - 1, "mode": "IMMUTABLE_PREFIX_ANCHOR", **row})
    return result, sorted(evidence, key=lambda row: row["phase"])


def reduce_material(pair, palette):
    base, data = pair
    alpha = base[..., 3].astype(np.float64) / 255
    srgb = base[..., :3].astype(np.float64) / 255
    linear = linearize(srgb)
    def total(a):
        return a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2, *a.shape[2:]).sum(axis=(1, 3))
    coverage = total(alpha)
    light = np.divide(total(linear * alpha[..., None]), coverage[..., None],
                      out=np.zeros((base.shape[0] // 2, base.shape[1] // 2, 3)), where=coverage[..., None] > 0)
    color = np.where(light <= .0031308, light * 12.92, 1.055 * light ** (1 / 2.4) - .055)
    reduced = np.concatenate((np.clip(np.floor(color * 255 + .5), 0, 255).astype(np.uint8),
                              np.floor(coverage[..., None] * 255 / 4 + .5).astype(np.uint8)), axis=2)
    reduced[..., :3][reduced[..., 3] == 0] = 0
    owner = alpha * data[..., 0] / 255
    weight = total(owner)
    remap = np.zeros_like(reduced)
    remap[..., 0] = np.floor(np.divide(weight * 255, coverage, out=np.zeros_like(weight), where=coverage > 0) + .5)
    levels = linearize(palette[16:32, 0].astype(np.float64) / 255)
    shade_light = np.divide(total(owner * levels[data[..., 1]]), weight,
                           out=np.zeros_like(weight), where=weight > 0)
    remap[..., 1] = np.argmin(np.abs(shade_light[..., None] - levels), axis=2)
    remap[..., 1][weight == 0] = 0
    remap[..., :2][reduced[..., 3] == 0] = 0
    remap[..., 3] = 255
    return [reduced, remap]
