"""Project pinned authored bridge material onto original sprite landmarks."""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from showcase_authored_rubble import cardinal_points
from showcase_curved_arch import homography
from showcase_registration import authored_coverage, extrude, sha
from showcase_bridge_deck import ContinuousBridgeDeck


class BridgePlanarMaterial:
    def __init__(self, declarations, native, prepared):
        self.declarations, self.materials = declarations, {}
        for name, declaration in declarations.items():
            source = native[name]
            assert declaration['schema'] == 'source-pinned-bridge-planar-material-v1'
            assert name.startswith('lobrdb') and name.endswith('.urb')
            assert source['sha256'] == declaration['sourceSha256']
            assert source['palette']['sha256'] == declaration['paletteSha256']
            assert source['bodyFrames'] == 3 and not source['remapable']
            assert all(binding['kind'] == 'overlay' for binding in source['bindings'])
            frame = source['frames'][1]
            assert declaration['nativeFrame'] == 1 and frame['indexSha256'] == declaration['indexSha256']
            index_file = prepared / 'native' / frame['indexFile']
            assert sha(index_file) == frame['indexSha256']
            indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
            assert not (indices == 12).any()
            points = cardinal_points(indices != 0)
            assert np.array_equal(points, np.asarray(declaration['nativePoints']))
            master = Path(declaration['master'])
            assert sha(master) == declaration['masterSha256']
            image = Image.open(master).convert('RGBA'); pixels = np.array(image)
            assert hashlib.sha256(pixels.tobytes()).hexdigest() == declaration['masterRgbaSha256']
            valid = authored_coverage(pixels, 180, fringe_guard=True)
            authored = cardinal_points(valid)
            assert np.array_equal(authored, np.asarray(declaration['masterPoints']))
            ys, xs = np.nonzero(valid)
            assert min((xs.max() - xs.min() + 1) / frame['size'][0],
                       (ys.max() - ys.min() + 1) / frame['size'][1]) >= 4
            # Exclude only a pinned, thin exterior dark sampling matte. Native
            # alpha and interior damage holes are not changed by this step.
            silhouette = ndimage.binary_fill_holes(valid)
            distance = ndimage.distance_transform_edt(np.pad(silhouette, 1))[1:-1, 1:-1]
            valid &= ~((distance <= 4) & (pixels[..., :3].max(2) <= 32))
            self.materials[name] = dict(matrix=homography(points, authored),
                rgb=extrude(pixels[..., :3], valid), shape=frame['size'][::-1],
                deck=ContinuousBridgeDeck(declaration['continuousDeck'], source)
                if 'continuousDeck' in declaration else None)

    def owns(self, name, frame):
        return name in self.materials and frame == 1

    def frame(self, name, density):
        assert density in [2, 4]
        state = self.materials[name]; height, width = state['shape']; scale = density * 2
        yy, xx = np.indices((height * scale, width * scale), dtype=float)
        mapped = state['matrix'] @ np.array([((xx + .5) / scale).ravel(),
            ((yy + .5) / scale).ravel(), np.ones(xx.size)])
        assert (mapped[2] > 0).all()
        coordinates = tuple((mapped[axis] / mapped[2]).reshape(xx.shape) - .5 for axis in [1, 0])
        sampled = np.stack([ndimage.map_coordinates(state['rgb'][..., channel], coordinates,
            order=1, mode='nearest') for channel in range(3)], axis=2)
        # Compose the measured lane geometry at the same supersampled density;
        # independent 2X/4X exports retain clean antialiased paint boundaries.
        if state['deck']:
            sampled = state['deck'].apply(sampled, scale)
        return np.asarray(Image.fromarray(sampled).resize((width * density, height * density), Image.Resampling.LANCZOS))
