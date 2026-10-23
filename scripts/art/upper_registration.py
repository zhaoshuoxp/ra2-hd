"""Register authored surfaces by attachment landmarks in native world space."""
import numpy as np
from scipy.ndimage import map_coordinates
from scipy.spatial import Delaunay

from painted_rig import encode, linearize


def warp_landmarks(rgba, source, target, density=4):
    """Preserve complete painted coverage through a continuous attachment mesh.

    Each source triangle keeps its authored texels. Shared vertices use one
    target position, preventing cracks at connections between moving parts.
    Native artwork supplies coordinates only, never color or coverage.
    """
    source, target = np.asarray(source, float), np.asarray(target, float)
    assert source.shape == target.shape and source.shape[1] == 2
    triangles = Delaunay(source).simplices
    height, width = rgba.shape[:2]
    alpha = rgba[..., 3:4] / 255
    material = np.concatenate((linearize(rgba[..., :3] / 255) * alpha, alpha), axis=2)
    result = np.zeros_like(material)
    min_area_ratio = float("inf")
    for triangle in triangles:
        before, after = source[triangle], target[triangle]
        a = np.column_stack((before[1]-before[0], before[2]-before[0]))
        b = np.column_stack((after[1]-after[0], after[2]-after[0]))
        area_ratio = np.linalg.det(b) / np.linalg.det(a)
        assert area_ratio > .08, ("Folded or collapsed attachment surface", triangle.tolist(), area_ratio)
        min_area_ratio = min(min_area_ratio, area_ratio)
        x0, y0 = np.maximum(np.floor(after.min(axis=0) * density).astype(int)-1, 0)
        x1, y1 = np.minimum(np.ceil(after.max(axis=0) * density).astype(int)+1, [width, height])
        if x1 <= x0 or y1 <= y0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        points = np.stack(((xx+.5)/density, (yy+.5)/density), axis=-1)
        barycentric = (points-after[0]) @ np.linalg.inv(b).T
        inside = ((barycentric.min(axis=2) >= -1e-7)
                  & (barycentric.sum(axis=2) <= 1+1e-7))
        mapped = before[0] + barycentric @ a.T
        coordinates = [mapped[..., 1] * density-.5, mapped[..., 0] * density-.5]
        for channel in range(4):
            sampled = map_coordinates(material[..., channel], coordinates, order=1,
                                      mode="constant", cval=0, prefilter=False)
            result[y0:y1, x0:x1, channel][inside] = sampled[inside]
    out_alpha = np.clip(result[..., 3:4], 0, 1)
    color = np.divide(result[..., :3], out_alpha, out=np.zeros_like(result[..., :3]), where=out_alpha > 0)
    output = np.concatenate((np.clip(encode(np.clip(color, 0, 1)), 0, 1), out_alpha), axis=2)
    output = np.floor(output * 255+.5).astype(np.uint8)
    output[..., :3][output[..., 3] == 0] = 0
    return output, {"triangles": len(triangles), "minimumAreaRatio": min_area_ratio,
                    "maximumLandmarkDisplacement": float(np.linalg.norm(target-source, axis=1).max())}
