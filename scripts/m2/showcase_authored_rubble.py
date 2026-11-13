"""Register authored rubble outlines against pinned native geometry and area."""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from showcase_curved_arch import homography
from showcase_registration import authored_coverage, extrude, register, sha


def cardinal_points(mask):
    labels, _ = ndimage.label(mask, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    assert sizes.max() > 0, 'Missing rubble silhouette'
    main = ndimage.binary_fill_holes(labels == sizes.argmax())
    ys, xs = np.where(main)
    return np.asarray([
        [np.median(np.flatnonzero(main[ys.min()])) + .5, ys.min() + .5],
        [xs.max() + .5, np.median(np.flatnonzero(main[:, xs.max()])) + .5],
        [np.median(np.flatnonzero(main[ys.max()])) + .5, ys.max() + .5],
        [xs.min() + .5, np.median(np.flatnonzero(main[:, xs.min()])) + .5],
    ], float)


class AuthoredRubble:
    def __init__(self, declarations, native, prepared):
        self.declarations, self.frames = declarations, {}
        for name, declaration in declarations.items():
            source = native[name]
            assert declaration['schema'] == 'source-pinned-authored-rubble-contours-v1'
            assert source['sha256'] == declaration['sourceSha256']
            assert source['bodyFrames'] == 4 and source['totalFrames'] == 8 and source['hasShadow']
            assert all(b['kind'] == 'building' and b['role'] == 'body' for b in source['bindings'])
            frame = source['frames'][3]
            palette = source['framePalettes']['3']
            assert palette['remapable'] is False and palette['role'] == 'rubble'
            assert palette['sha256'] == declaration['paletteSha256']
            assert frame['indexSha256'] == declaration['indexSha256']
            index_file = prepared / 'native' / frame['indexFile']
            assert sha(index_file) == declaration['indexSha256']
            indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
            assert (indices != 0).any() and not (indices == 12).any(), 'Native contacts need a separate policy'
            assert declaration['registration'] in ('native-bounds', 'native-cardinal-homography')
            assert declaration['limits'] == dict(areaChangeFraction=.025, symmetricDifferenceFraction=.125,
                boundaryDeviationFraction=.05, centroidShiftFraction=.025, frameBoundsNativePixels=1)
            file = Path(declaration['master'])
            assert sha(file) == declaration['masterSha256']
            image = Image.open(file).convert('RGBA')
            pixels = np.asarray(image)
            assert hashlib.sha256(pixels.tobytes()).hexdigest() == declaration['masterRgbaSha256']
            info = dict(slotRect=[0, 0, *image.size], rejectFluorescentFringe=True)
            rect, _ = register(image, info, image.size)
            assert min(rect[2] / frame['size'][0], rect[3] / frame['size'][1]) >= 4
            valid = authored_coverage(pixels, 180, fringe_guard=True)
            rgb = extrude(pixels[..., :3], valid)
            self.frames[name] = dict(indices=indices, rect=rect, valid=valid, rgb=rgb,
                matrix=homography(cardinal_points(indices != 0), cardinal_points(valid))
                    if declaration['registration'] == 'native-cardinal-homography' else None)
            self.frames[name]['proof'] = self.prove(name)

    def owns(self, name, slot):
        return name in self.frames and slot == 3

    def coordinates(self, name, scale):
        state = self.frames[name]
        height, width = state['indices'].shape
        yy, xx = np.indices((height * scale, width * scale), dtype=float)
        nx, ny = (xx + .5) / scale, (yy + .5) / scale
        if state['matrix'] is None:
            x, y, w, h = state['rect']
            return y + ny * h / height - .5, x + nx * w / width - .5
        mapped = state['matrix'] @ np.array([nx.ravel(), ny.ravel(), np.ones(nx.size)])
        assert (mapped[2] > 0).all(), 'Material registration crosses its projection plane'
        return tuple((mapped[axis] / mapped[2]).reshape(nx.shape) - .5 for axis in [1, 0])

    def prove(self, name):
        state = self.frames[name]
        scale = 8
        coordinates = self.coordinates(name, scale)
        mapped = ndimage.map_coordinates(state['valid'].astype(float), coordinates,
            order=1, mode='constant') > .5
        original = np.repeat(np.repeat(state['indices'] != 0, scale, 0), scale, 1)
        area_change = abs(mapped.sum() / original.sum() - 1)
        difference = np.count_nonzero(mapped != original) / original.sum()
        a = ndimage.distance_transform_edt(~mapped) / scale
        b = ndimage.distance_transform_edt(~original) / scale
        deviations = np.r_[a[original & ~mapped], b[mapped & ~original]]
        deviation = float(deviations.max()) if len(deviations) else 0
        center = float(np.linalg.norm(np.argwhere(mapped).mean(0) - np.argwhere(original).mean(0)) / scale)
        limit = self.declarations[name]['limits']
        extent = max(state['indices'].shape)
        assert area_change <= limit['areaChangeFraction'], ('Rubble area', name, area_change)
        assert difference <= limit['symmetricDifferenceFraction'], ('Rubble footprint', name, difference)
        assert deviation <= extent * limit['boundaryDeviationFraction'], ('Rubble contour', name, deviation)
        assert center <= extent * limit['centroidShiftFraction'], ('Rubble center', name, center)
        def bounds(mask):
            y, x = np.where(mask)
            return np.array([x.min(), y.min(), x.max() + 1, y.max() + 1], float) / scale
        bounds_difference = float(np.max(np.abs(bounds(mapped) - bounds(original))))
        assert bounds_difference <= limit['frameBoundsNativePixels'], ('Rubble bounds', name, bounds_difference)
        return dict(referenceDensity=scale, areaChangeFraction=float(area_change),
            symmetricDifferenceFraction=float(difference), maximumBoundaryDeviationNativePixels=deviation,
            centroidShiftNativePixels=center, maximumFrameBoundsDifferenceNativePixels=bounds_difference,
            nativeCardinalPoints=cardinal_points(state['indices'] != 0).tolist(),
            authoredCardinalPoints=cardinal_points(state['valid']).tolist(),
            nativeCanvasPivotsShadowsCollisionAndStateTiming='UNCHANGED')

    def metadata(self, name):
        return {**self.declarations[name], 'geometryProof': self.frames[name]['proof'],
            'policy': 'Authored continuous outlines with source-pinned placement/area/footprint limits. Native logical geometry and original separate shadows are retained. Other states use exact accepted payloads.'}

    def frame(self, name, slot, density):
        assert self.owns(name, slot) and density in (2, 4)
        state = self.frames[name]
        height, width = state['indices'].shape
        scale = density * 2
        coordinates = self.coordinates(name, scale)
        alpha = ndimage.map_coordinates(state['valid'].astype(float), coordinates, order=1, mode='constant')
        sampled = np.stack([ndimage.map_coordinates(state['rgb'][..., channel], coordinates,
            order=1, mode='nearest') for channel in range(3)], axis=2)
        rgb = np.asarray(Image.fromarray(sampled).resize((width * density, height * density), Image.Resampling.LANCZOS))
        alpha = np.uint8(np.rint(alpha.reshape(height * density, 2, width * density, 2).mean((1, 3)) * 255))
        result = np.dstack((rgb, alpha))
        result[..., :3][alpha == 0] = 0
        return result
