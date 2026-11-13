"""Sample approved terrain silhouettes without clipping them to source pixels."""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from showcase_registration import authored_coverage, extrude, sha


class AuthoredTerrain:
    def __init__(self, declarations, native, prepared):
        self.declarations, self.frames = declarations, {}
        for name, declaration in declarations.items():
            source = native[name]
            assert declaration['schema'] == 'source-pinned-authored-terrain-contours-v1'
            assert source['sha256'] == declaration['sourceSha256']
            assert source['palette']['sha256'] == declaration['paletteSha256']
            assert source['bodyFrames'] == 1 and source['totalFrames'] == 2 and source['hasShadow']
            assert not source['remapable'] and not source.get('framePalettes')
            assert all(binding['kind'] == 'terrain' and binding['role'] == 'body' for binding in source['bindings'])
            frame = source['frames'][0]
            assert frame['indexSha256'] == declaration['indexSha256']
            index_file = prepared / 'native' / frame['indexFile']
            assert sha(index_file) == frame['indexSha256']
            indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
            assert (indices != 0).any() and not (indices == 12).any(), 'Contact material requires its own policy'
            assert declaration['limits'] == dict(areaChangeFraction=.025, minimumNativeOverlapFraction=.75,
                boundaryDeviationFraction=.05, centroidShiftFraction=.04, frameBoundsNativePixels=.5)
            file = Path(declaration['master'])
            assert sha(file) == declaration['masterSha256']
            pixels = np.asarray(Image.open(file).convert('RGBA'))
            assert hashlib.sha256(pixels.tobytes()).hexdigest() == declaration['masterRgbaSha256']
            valid = authored_coverage(pixels, 180, fringe_guard=True)
            labels, _ = ndimage.label(valid, np.ones((3, 3)))
            sizes = np.bincount(labels.ravel()); sizes[0] = 0
            assert sizes.max() > 0, 'Missing authored terrain silhouette'
            valid = labels == sizes.argmax()
            registration = declaration['registration']
            for axis, extent in [('X', frame['size'][0]), ('Y', frame['size'][1])]:
                master_points, target = registration['master' + axis], registration['native' + axis]
                assert len(master_points) == len(target) and len(target) >= 2
                assert np.isfinite(master_points).all() and np.isfinite(target).all()
                assert (np.diff(master_points) > 0).all() and (np.diff(target) > 0).all()
                assert 0 <= master_points[0] < master_points[-1] <= pixels.shape[1 if axis == 'X' else 0]
                assert 0 <= target[0] < target[-1] <= extent
                assert (np.diff(master_points) / np.diff(target) >= 4).all(), 'Insufficient independent4X detail'
            self.frames[name] = dict(indices=indices, valid=valid, rgb=extrude(pixels[..., :3], valid),
                registration=registration)
            self.frames[name]['proof'] = self.prove(name)

    def owns(self, name, slot=0):
        return name in self.frames and slot == 0

    def sample(self, name, scale):
        state = self.frames[name]
        height, width = state['indices'].shape
        yy, xx = np.indices((height * scale, width * scale), dtype=float)
        registration = state['registration']
        coordinates = [np.interp((values + .5) / scale, registration['native' + axis],
            registration['master' + axis], left=-1, right=-1) - .5 for axis, values in [('Y', yy), ('X', xx)]]
        alpha = ndimage.map_coordinates(state['valid'].astype(float), coordinates, order=1, mode='constant')
        return coordinates, alpha

    def prove(self, name):
        state = self.frames[name]
        scale = 16
        _, alpha = self.sample(name, scale)
        original = (state['indices'] != 0).repeat(scale, 0).repeat(scale, 1)
        mapped = alpha > .5
        native_area = int(np.count_nonzero(state['indices']))
        area_change = abs(alpha.sum() / scale**2 / native_area - 1)
        overlap = np.minimum(alpha, original).sum() / original.sum()
        a, b = ndimage.distance_transform_edt(~mapped) / scale, ndimage.distance_transform_edt(~original) / scale
        deviations = np.r_[a[original & ~mapped], b[mapped & ~original]]
        deviation = float(deviations.max()) if len(deviations) else 0
        center = float(np.linalg.norm(np.argwhere(mapped).mean(0) - np.argwhere(original).mean(0)) / scale)
        def bounds(mask):
            y, x = np.where(mask)
            return np.array([x.min(), y.min(), x.max() + 1, y.max() + 1], float) / scale
        bounds_difference = float(np.max(np.abs(bounds(mapped) - bounds(original))))
        limits = self.declarations[name]['limits']
        extent = max(state['indices'].shape)
        assert area_change <= limits['areaChangeFraction'], ('Authored terrain area', name, area_change)
        assert overlap >= limits['minimumNativeOverlapFraction'], ('Authored terrain placement', name, overlap)
        assert deviation <= extent * limits['boundaryDeviationFraction'], ('Authored terrain boundary', name, deviation)
        assert center <= extent * limits['centroidShiftFraction'], ('Authored terrain center', name, center)
        assert bounds_difference <= limits['frameBoundsNativePixels'], ('Authored terrain bounds', name, bounds_difference)
        assert ndimage.label(mapped, np.ones((3, 3)))[1] == 1, 'Disconnected authored terrain body'
        return dict(referenceDensity=scale, nativeArea=native_area, areaChangeFraction=float(area_change),
            nativeOverlapFraction=float(overlap), maximumBoundaryDeviationNativePixels=deviation,
            centroidShiftNativePixels=center, maximumFrameBoundsDifferenceNativePixels=bounds_difference,
            alphaAuthority='APPROVED_FULL_RESOLUTION_MASTER_NOT_INDEXED_MASK',
            nativeCanvasPivotsShadowsCollisionAndStateTiming='UNCHANGED')

    def metadata(self, name):
        return {**self.declarations[name], 'geometryProof': self.frames[name]['proof']}

    def frame(self, name, slot, density):
        assert self.owns(name, slot) and density in (2, 4)
        state = self.frames[name]
        height, width = state['indices'].shape
        coordinates, alpha = self.sample(name, density * 8)
        sample = np.stack([ndimage.map_coordinates(state['rgb'][..., channel].astype(float), coordinates,
            order=1, mode='nearest') for channel in range(3)], axis=2)
        coverage = alpha.reshape(height * density, 8, width * density, 8).mean((1, 3))
        weighted = (sample * alpha[..., None]).reshape(height * density, 8, width * density, 8, 3).mean((1, 3))
        rgb = np.divide(weighted, coverage[..., None], out=np.zeros_like(weighted), where=coverage[..., None] > 0)
        result = np.dstack((np.uint8(np.rint(rgb)), np.uint8(np.rint(coverage * 255))))
        result[..., :3][result[..., 3] == 0] = 0
        return result
