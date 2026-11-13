"""Fit retained authored parts to source-pinned sprite landmarks and coverage."""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.interpolate import RBFInterpolator

from showcase_contours import coverage, rasterize
from showcase_registration import authored_coverage, extrude, sha


def image_part(spec):
    file = Path(spec['file'])
    assert sha(file) == spec['sha256'], 'Component master identity mismatch'
    pixels = np.asarray(Image.open(file).convert('RGBA'))
    if 'rect' in spec:
        x, y, width, height = spec['rect']
        assert 0 <= x < x + width <= pixels.shape[1] and 0 <= y < y + height <= pixels.shape[0]
        pixels = pixels[y:y + height, x:x + width]
    assert min(pixels.shape[:2]) >= spec['minimumDetail']
    return pixels


def largest_mask(mask, candidates=1):
    labels, count = ndimage.label(mask)
    assert count >= candidates
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    choices = np.argsort(sizes)[-candidates:]
    selected = min(choices, key=lambda label: np.where(labels == label)[0].min())
    assert sizes[selected] > 100
    return labels == selected


def sample(rgb, points, constant=False):
    return np.stack([ndimage.map_coordinates(rgb[..., channel], [points[..., 1], points[..., 0]],
        order=1, mode='constant' if constant else 'nearest', cval=0) for channel in range(3)], axis=-1)


class SourcePinnedComponentAssembly:
    def __init__(self, declarations, native, prepared):
        self.declarations, self.sources, self.cache, self.evidence = declarations, {}, {}, {}
        for name, declaration in declarations.items():
            source = native[name]
            assert declaration['schema'] == 'source-pinned-component-assembly-v1'
            assert source['sha256'] == declaration['sourceSha256']
            assert source['palette']['sha256'] == declaration['paletteSha256']
            assert not source['remapable'] and not source.get('framePalettes')
            assert source['hasShadow'] and source['totalFrames'] == source['bodyFrames'] * 2
            assert declaration['index12Role'] == 'AUTHORED_BODY_SHADE_WITH_SEPARATE_NATIVE_SHADOWS'
            hashes = [frame['indexSha256'] for frame in source['frames'][:source['bodyFrames']]]
            assert hashes == declaration['bodyIndexSha256'] and len(set(hashes)) == 1
            assert len({tuple(frame['size']) for frame in source['frames'][:source['bodyFrames']]}) == 1
            frame = source['frames'][0]; file = prepared / 'native' / frame['indexFile']
            assert sha(file) == frame['indexSha256']
            indices = np.frombuffer(file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
            assert hashlib.sha256(np.uint8(indices == 12).tobytes()).hexdigest() == declaration['bodyShadeMaskSha256']
            palette_file = prepared / 'native' / source['palette']['member']
            assert sha(palette_file) == source['palette']['sha256']
            assert hashlib.sha256(np.uint8(np.isin(indices, range(16, 32))).tobytes()).hexdigest() == declaration['accentMaskSha256']
            nose = np.isin(indices, range(16, 32)) & (np.indices(indices.shape)[1] >= declaration['noseMinimumX'])
            labels, count = ndimage.label(nose, np.ones((3, 3)))
            assert count == declaration['expectedNoses'] == len(declaration['bodyOffsets']) == 4
            assigned = []
            ys, xs = np.where(nose)
            for x, y in declaration['nativeTips']:
                nearest = np.argmin((xs - x) ** 2 + (ys - y) ** 2)
                assert np.hypot(xs[nearest] - x, ys[nearest] - y) <= 2
                assigned.append(int(labels[ys[nearest], xs[nearest]]))
            assert len(set(assigned)) == 4
            assert declaration['coverageEnvelopeNativePixels'] <= .42
            assert declaration['maximumAreaChangeFraction'] == .025
            components = declaration['components']
            body = image_part(components['body'])
            mask = largest_mask(authored_coverage(body, 180, True), candidates=2)
            yy, xx = np.indices(mask.shape)
            root, tip = np.asarray(declaration['masterBodyAxis'], float)
            axis = tip - root; normal = np.array([-axis[1], axis[0]]) / np.linalg.norm(axis)
            delta = np.stack((xx - root[0], yy - root[1]), axis=-1)
            along, across = (delta * axis).sum(2) / (axis @ axis), (delta * normal).sum(2)
            red = (body[..., 0] > body[..., 1] * 1.7) & (body[..., 0] > body[..., 2] * 1.7)
            # Tail faces have independent source-fitted planes; retain the authored tube and mounts.
            mask &= ~((along < .35) & ((across < -73) | red))
            body_rgb = extrude(body[..., :3], mask).astype(float)
            frame_pixels = image_part(components['frame'])
            valid = authored_coverage(frame_pixels, 180, True) & (np.ptp(frame_pixels[..., :3].astype(float), axis=2) < 85)
            frame_rgb = extrude(frame_pixels[..., :3], largest_mask(valid)).astype(float)
            fin_pixels = image_part(components['fin']); fin = fin_pixels[..., :3].astype(float)
            valid = (fin_pixels[..., 3] > 180) & (fin[..., 0] > fin[..., 1] * 1.7) & (fin[..., 0] > fin[..., 2] * 1.7)
            fin_rgb = extrude(fin_pixels[..., :3], valid).astype(float)
            controls = np.asarray(declaration['frameNativeControls'], float)
            master_controls = np.asarray(declaration['frameMasterControls'], float)
            assert controls.shape == master_controls.shape and len(controls) >= 8
            assert np.isfinite(controls).all() and np.isfinite(master_controls).all()
            assert (controls >= 0).all() and (controls < np.array(indices.shape[::-1])).all()
            assert (master_controls >= 0).all() and (master_controls < np.array(frame_rgb.shape[1::-1])).all()
            warp = RBFInterpolator(controls, master_controls, kernel='thin_plate_spline', smoothing=0)
            assert np.max(np.abs(warp(controls) - master_controls)) < 1e-7
            transform = np.linalg.solve(np.c_[declaration['nativeBodyAnchors'], np.ones(3)],
                                        np.asarray(declaration['masterBodyAnchors'], float))
            anchors = np.asarray(declaration['masterBodyAnchors'])
            assert (anchors >= 0).all() and (anchors < np.array(body.shape[1::-1])).all()
            # Each preserved part contains genuine detail beyond the final four-times sample span.
            assert np.linalg.norm(axis) >= np.linalg.norm(np.diff(declaration['nativeBodyAnchors'][:2], axis=0)) * 4
            assert frame_pixels.shape[0] >= indices.shape[0] * 4
            self.sources[name] = dict(indices=indices, source=source,
                bodyRgb=body_rgb, bodyMask=mask.astype(float), frameRgb=frame_rgb, finRgb=fin_rgb,
                warp=warp, transform=transform)

    def owns(self, name, frame):
        return name in self.sources and 0 <= frame < self.sources[name]['source']['bodyFrames']

    def frame(self, name, density):
        assert density in (2, 4)
        if (name, density) in self.cache:
            return self.cache[name, density]
        declaration, materials = self.declarations[name], self.sources[name]
        indices, scale = materials['indices'], density * 2
        shape = indices.shape
        yy, xx = np.indices((shape[0] * scale, shape[1] * scale), dtype=float)
        positions = np.stack(((xx + .5) / scale, (yy + .5) / scale), axis=-1)
        points = materials['warp'](positions.reshape(-1, 2)).reshape(*xx.shape, 2)
        metal = sample(materials['frameRgb'], points)
        rgb = metal.copy()
        source_alpha = coverage(indices != 0, scale, linear_strips=True).astype(float) / 255
        alpha = source_alpha.copy()
        distance = ndimage.distance_transform_edt(source_alpha == 0) / scale
        band = np.maximum(source_alpha, np.clip((declaration['coverageEnvelopeNativePixels'] - distance) * scale, 0, 1))

        def paint(mask, color):
            nonlocal rgb, alpha
            weight = mask * band
            combined = weight + alpha * (1 - weight)
            rgb = np.divide(color * weight[..., None] + rgb * alpha[..., None] * (1 - weight[..., None]),
                            np.maximum(combined[..., None], 1e-9))
            alpha = combined

        layers = []
        for dx, dy in declaration['bodyOffsets']:
            xy = np.dstack((positions[..., 0] - dx, positions[..., 1] - dy, np.ones(xx.shape))) @ materials['transform']
            mask = ndimage.map_coordinates(materials['bodyMask'], [xy[..., 1], xy[..., 0]], order=1, mode='constant', cval=0)
            color = sample(materials['bodyRgb'], xy)
            paint(mask, color); layers.append((mask, color, dx, dy))
        fin = materials['finRgb']
        for polygon in declaration['finPlanes']:
            polygon = np.asarray(polygon, float)
            mask = rasterize([polygon], shape, scale, samples=2).astype(float) / 255
            distance = ndimage.distance_transform_edt(mask == 0) / scale
            rim = np.maximum(mask, np.clip((declaration['finRimNativePixels'] - distance) * scale, 0, 1))
            paint(rim, np.broadcast_to(declaration['finRimRgb'], rgb.shape))
            lower, extent = polygon.min(0), np.maximum(1, np.ptp(polygon, axis=0))
            uv = np.clip((positions - lower) / extent, 0, 1) * np.array([fin.shape[1] - 1, fin.shape[0] - 1])
            paint(mask, sample(fin, uv))
        for start, end, radius in declaration['foregroundFramePlanes']:
            start, end = np.asarray(start), np.asarray(end)
            delta = end - start; normal = np.array([-delta[1], delta[0]]) / np.linalg.norm(delta)
            polygon = np.array([start - normal * radius, end - normal * radius,
                                end + normal * radius, start + normal * radius])
            paint(rasterize([polygon], shape, scale, samples=2).astype(float) / 255, metal)
        # Four original front sections occlude the rear right-hand post.
        for mask, color, dx, dy in layers:
            front = (positions[..., 0] > declaration['frontSection'][0] + dx)
            front &= positions[..., 1] > declaration['frontSection'][1] + dy
            paint(mask * front, color)
        rgba = np.uint8(np.clip(np.dstack((rgb, alpha * 255)), 0, 255))
        rgba[alpha == 0, :3] = 0
        output = np.asarray(Image.fromarray(rgba).resize((shape[1] * density, shape[0] * density), Image.Resampling.LANCZOS)).copy()
        original = coverage(indices != 0, density, linear_strips=True)
        ratio = float(output[..., 3].sum() / original.sum())
        assert abs(ratio - 1) <= declaration['maximumAreaChangeFraction'], 'Component silhouette area drift'
        self.evidence[name, density] = dict(nativeArea=float(original.sum() / 255 / density ** 2),
            outputArea=float(output[..., 3].sum() / 255 / density ** 2), areaRatio=ratio,
            maximumAddedContourNativePixels=declaration['coverageEnvelopeNativePixels'],
            originalTips=declaration['nativeTips'], fixedColor=True,
            bodyShadePixelsRebuilt=int((indices == 12).sum()), originalSeparateShadowsRetained=True)
        self.cache[name, density] = output
        return output
