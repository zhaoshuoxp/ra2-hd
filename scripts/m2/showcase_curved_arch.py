"""Source-pinned registration of the approved CASTL04 masters and smooth contours."""
from pathlib import Path
import hashlib

import numpy as np
from PIL import Image
from scipy.interpolate import LinearNDInterpolator, splprep, splev
from scipy.ndimage import map_coordinates

from showcase_contours import coverage, rasterize
from showcase_registration import authored_coverage, extrude, sha

SOURCE = '5a41203dcdd34dc12790c9a0a2b758d96135f3eceba5f00b13ebe9e75e8134d9'
PALETTE = 'ed785e62eed291480f3198dd44f6b656ebe3a9b75e9f641944d710abc6bde3e3'
NORMAL_INDEX = '954c816a9ece0110c05f9ea0222ae7b1fa58e5cf1668b5b9b0b412326f82a2cb'
BASE_QUAD = np.asarray([[0, 271], [177, 182], [237, 212], [59, 301]], float)
RUBBLE_QUAD = np.asarray([[0, 107], [186, 0], [237, 47.5], [59, 137]], float)


def intervals(row):
    xs = np.flatnonzero(row)
    return [part for part in np.split(xs, np.flatnonzero(np.diff(xs) > 1) + 1) if len(part)]


def edge_model(rows, mask, leg):
    points = np.asarray([[y, float(intervals(mask[y])[leg][0]),
                          float(intervals(mask[y])[leg][-1] + 1)] for y in rows])
    return [np.polyfit(points[:, 0], points[:, index], 2) for index in [1, 2]]


def homography(source, target):
    rows, values = [], []
    for (x, y), (u, v) in zip(source, target):
        rows.extend([[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]])
        values.extend([u, v])
    return np.r_[np.linalg.solve(rows, values), 1].reshape(3, 3)


class CurvedArchGeometry:
    def __init__(self, normal):
        assert normal.shape == (301, 237)
        assert hashlib.sha256(normal.tobytes()).hexdigest() == NORMAL_INDEX
        self.normal = normal != 0
        self.gap = next(y for y in range(100) if len(intervals(self.normal[y])) == 2)
        self.left = edge_model(range(175, 231), self.normal, 0)
        self.right = edge_model(range(130, 181), self.normal, -1)
        outer = [[float(np.flatnonzero(self.normal[y])[0]), y + .5] for y in range(251)]
        outer.extend([[float(np.polyval(self.left[0], y)), y + .5] for y in range(251, 261)])
        outer.reverse()
        outer.extend([[float(np.flatnonzero(self.normal[y])[-1] + 1), y + .5] for y in range(182)])
        outer.extend([[float(np.polyval(self.right[1], y)), y + .5] for y in range(182, 206)])
        left, right = [], []
        for y in range(241):
            parts = intervals(self.normal[y])
            if len(parts) > 1:
                left.append([float(parts[0][-1] + 1), y + .5])
                if y < 182:
                    right.append([float(parts[-1][0]), y + .5])
        left.extend([[float(np.polyval(self.left[1], y)), y + .5] for y in range(241, 261)])
        right.extend([[float(np.polyval(self.right[0], y)), y + .5] for y in range(182, 206)])
        self.proof = []
        self.polygon = np.concatenate((self.fit(outer), self.fit(left[::-1] + right)[::-1]))

    def fit(self, points):
        points = np.asarray(points)
        weights = np.ones(len(points))
        weights[[0, -1]] = 100
        # Endpoint extensions lie within the unchanged paving plane. The
        # subpixel fit removes source sampling steps without filtering RGB.
        for factor in [.4, .25, .15, .1, .08, .06, .04]:
            curve, parameter = splprep(points.T, w=weights, s=len(points) * factor, k=3)
            fitted = np.array(splev(parameter, curve)).T
            error = float(np.linalg.norm(fitted - points, axis=1).max())
            if error <= .95:
                break
        assert error <= .95, 'The authored contour exceeds its pinned native registration tolerance'
        self.proof.append(dict(points=len(points), smoothing=factor, maximumNativeDeviation=error))
        return np.array(splev(np.linspace(0, 1, len(points) * 8), curve)).T

    def alpha(self, indices, slot, density):
        assert density in (2, 4)
        if slot == 3:
            return coverage(indices != 0, density, maximum_stair_run=64)
        assert indices.shape == self.normal.shape
        arch = rasterize([self.polygon], indices.shape, density)
        plane = rasterize([BASE_QUAD], indices.shape, density)
        alpha = np.maximum(arch, plane)
        extra, holes = (indices != 0) & ~self.normal, self.normal & (indices == 0)
        if extra.any():
            alpha = np.maximum(alpha, coverage(extra, density, maximum_stair_run=64))
        if holes.any():
            alpha = np.minimum(alpha, 255 - coverage(holes, density, maximum_stair_run=64))
        if slot == 2:
            yy, xx = np.indices(alpha.shape, dtype=float)
            nx, ny = (xx + .5) / density, (yy + .5) / density
            foot = ((ny >= 180) & (nx > 155)) | ((ny >= 255) & (nx < 90))
            # The full garrison silhouette owns the bags and foot recesses.
            # Unioning separate difference masks leaves projecting slivers.
            original = coverage(indices != 0, density, maximum_stair_run=64)
            alpha[foot] = original[foot]
        expected = np.count_nonzero(indices) * density * density
        assert abs(alpha.sum() / 255 / expected - 1) < .025
        return alpha


class RegisteredCurvedArch:
    def __init__(self, declarations, native, prepared):
        self.declarations, self.indices, self.masters = declarations, {}, {}
        self.normal_colors = {}
        self.geometry = None
        for name, declaration in declarations.items():
            source = native[name]
            assert name == 'cgstl04.shp' and source['sha256'] == declaration['sourceSha256'] == SOURCE
            assert source['palette']['sha256'] == declaration['paletteSha256'] == PALETTE
            assert declaration['schema'] == 'source-pinned-curved-arch-v1'
            assert source['canvas'] == [362, 372] and source['bodyFrames'] == 4 and source['totalFrames'] == 8
            assert source['remapable'] is bool(declaration.get('nativeOwnership'))
            assert source['framePalettes']['3']['sha256'] == 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'
            assert source['frames'][0]['indexSha256'] == NORMAL_INDEX
            assert declaration['bodyIndexSha256'] == [frame['indexSha256'] for frame in source['frames'][:4]]
            assert sorted(declaration['masters']) == ['0', '1', '2', '3']
            for frame in source['frames'][:4]:
                slot = frame['slot']
                index = prepared / 'native' / frame['indexFile']
                assert sha(index) == frame['indexSha256']
                self.indices[slot] = np.frombuffer(index.read_bytes(), np.uint8).reshape(frame['size'][::-1])
                if source['remapable']:
                    admission = declaration['nativeOwnership']
                    assert admission['schema'] == 'source-pinned-building-owner-v1'
                    expected = admission['frames'][str(slot)]
                    assert expected['indexSha256'] == frame['indexSha256']
                    owner = (self.indices[slot] >= 16) & (self.indices[slot] < 32)
                    assert expected['nativeOwnerPixels'] == int(owner.sum())
                master = declaration['masters'][str(slot)]
                file = Path(master['file'])
                assert sha(file) == master['sha256']
                pixels = np.asarray(Image.open(file).convert('RGBA'))
                valid = authored_coverage(pixels, 180, fringe_guard=True)
                ys, xs = np.where(valid)
                assert (xs.max() - xs.min() + 1) >= frame['size'][0] * 4
                assert (ys.max() - ys.min() + 1) >= frame['size'][1] * 4
                rgb = extrude(pixels[..., :3], valid)
                self.masters[slot] = (valid, [rgb[..., channel].astype(float) for channel in range(3)])
            self.geometry = CurvedArchGeometry(self.indices[0])

    def owns(self, name):
        return name in self.declarations

    def metadata(self, name):
        return {**self.declarations[name], 'geometryProof': self.geometry.proof,
                'policy': 'Independent authored 2X/4X, source-pinned smooth contours and material coordinates; native canvas, pivots, states and separate shadows retained'}

    def frame(self, name, slot, density):
        assert self.owns(name) and slot in range(4) and density in (2, 4)
        indices = self.indices[slot]
        valid, channels = self.masters[slot]
        height, width = np.array(indices.shape) * density
        yy, xx = np.indices((height, width), dtype=float)
        nx, ny = (xx + .5) / density, (yy + .5) / density
        # Rubble has its own paving plane, rather than a translated normal plane.
        quad = RUBBLE_QUAD if slot == 3 else BASE_QUAD
        declaration = self.declarations[name]['masters'][str(slot)]
        matrix = homography(quad, declaration['baseQuad'])
        mapped = matrix @ np.array([nx.ravel(), ny.ravel(), np.ones(nx.size)])
        sx, sy = [(mapped[axis] / mapped[2]).reshape(nx.shape) for axis in [0, 1]]
        alpha = self.geometry.alpha(indices, slot, density)
        if slot < 3:
            arch = rasterize([self.geometry.polygon], indices.shape, density)
            top = int(np.flatnonzero(valid.any(1))[0])
            gap = next(y for y in range(top, top + 150)
                       if len([part for part in intervals(valid[y]) if len(part) >= 5]) == 2)
            left = edge_model(range(900, 1081, 5), valid, 0)
            right = edge_model(range(650, 831, 5), valid, -1)

            def source_y(y, leg):
                return float(np.interp(y, [0, self.geometry.gap, 282 if leg == 0 else 199],
                                       [top, gap, declaration['footY'][leg]]))

            for row in range(min(height, 283 * density)):
                native_y = (row + .5) / density
                target_runs = intervals(arch[row] > 0)
                if native_y < 20 and len(target_runs) < 2:
                    target = np.flatnonzero(arch[row] > 0)
                    my = source_y(native_y, 0)
                    run = np.flatnonzero(valid[min(len(valid) - 1, round(my))])
                    if len(target) and len(run):
                        sx[row, target] = run[0] + (np.arange(len(target)) + .5) * (run[-1] - run[0] + 1) / len(target)
                        sy[row, target] = my
                    continue
                for leg in [0, 1]:
                    if native_y > (282 if leg == 0 else 199):
                        continue
                    if native_y < (235 if leg == 0 else 180) and len(target_runs) == 2:
                        target = target_runs[leg]
                    else:
                        model = self.geometry.left if leg == 0 else self.geometry.right
                        bounds = [np.polyval(poly, native_y) for poly in model]
                        target = np.flatnonzero((nx[row] >= bounds[0]) & (nx[row] < bounds[1]))
                    if not len(target):
                        continue
                    my = source_y(native_y, leg)
                    chunks = [part for part in intervals(valid[min(len(valid) - 1, round(my))]) if len(part) >= 5]
                    if len(chunks) == 2 and my < (1150 if leg == 0 else 850):
                        source = [chunks[leg][0], chunks[leg][-1] + 1]
                    else:
                        source = [np.polyval(poly, my) for poly in (left if leg == 0 else right)]
                    positions = source[0] + (np.arange(len(target)) + .5) * (source[1] - source[0]) / len(target)
                    start, end = (225, 282) if leg == 0 else (165, 199)
                    blend = np.clip((native_y - start) / (end - start), 0, 1)
                    weight = 1 - blend * blend * (3 - 2 * blend)
                    # Blend coordinates, preserving crisp authored panel lines.
                    sx[row, target] = sx[row, target] * (1 - weight) + positions * weight
                    sy[row, target] = sy[row, target] * (1 - weight) + my * weight
        if slot == 2:
            registration = declaration['footRegistration']
            boundary = np.asarray(registration['boundary'], float)
            boundary_uv = np.column_stack([map_coordinates(channel,
                [boundary[:, 1] * density - .5, boundary[:, 0] * density - .5],
                order=1, mode='nearest') for channel in [sx, sy]])
            # Pin both the red trim and the surrounding bags. A broad blended
            # displacement bends bag seams and can duplicate the red plate.
            target = np.vstack((boundary, registration['nativePoints']))
            authored = np.vstack((boundary_uv, registration['masterPoints']))
            mapped = LinearNDInterpolator(target, authored)(nx, ny)
            part = np.isfinite(mapped[..., 0])
            sx[part], sy[part] = mapped[..., 0][part], mapped[..., 1][part]
        colors = np.stack([map_coordinates(channel, [sy - .5, sx - .5], order=1, mode='nearest') for channel in channels], 2)
        if slot == 0:
            self.normal_colors[density] = colors
        elif slot == 2:
            if density not in self.normal_colors:
                self.frame(name, 0, density)
            # Both source states retain the same silver metal. Reuse its clean
            # material field above the authored garrison-specific foot details.
            common = rasterize([self.geometry.polygon], indices.shape, density).astype(float) / 255
            lower = ((ny > 235) & (ny < 282) & (nx >= np.polyval(self.geometry.left[0], ny))
                     & (nx < np.polyval(self.geometry.left[1], ny)))
            common[lower] = 1
            right_red = coverage((indices >= 16) & (indices <= 31)
                & (np.indices(indices.shape)[1] > 150), density, linear_strips=True).astype(float) / 255
            lower_left = np.clip((ny - 263) / 12, 0, 1) * (nx < 90)
            weight = common * (1 - np.maximum(right_red, lower_left))
            colors = colors * (1 - weight[..., None]) + self.normal_colors[density] * weight[..., None]
        result = np.concatenate((np.uint8(np.clip(np.rint(colors), 0, 255)), alpha[..., None]), 2)
        result[alpha == 0, :3] = 0
        return result
