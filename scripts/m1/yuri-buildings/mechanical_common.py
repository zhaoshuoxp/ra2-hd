"""Density-specific local part articulation; no whole-building envelope fitting."""
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw
from production_common import clip, material_coverage, sha


def ground_plane(image):
    occupied = np.array(image.getchannel('A')) > 8
    columns = occupied.any(axis=0)
    bottom = np.where(columns, occupied.shape[0] - 1 - occupied[::-1].argmax(axis=0), -1)
    yy = np.arange(occupied.shape[0])[:, None]
    return Image.fromarray(np.uint8((yy <= bottom[None, :]) & columns[None, :]) * 255)


def project_part(family, image, source_quad, target_quad):
    source = np.array(source_quad, float) * family.density
    target = np.array(target_quad, float) * family.density
    equations, values = [], []
    for (x, y), (u, v) in zip(target, source):
        equations.extend([[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]])
        values.extend([u, v])
    matrix = np.linalg.solve(np.array(equations), np.array(values))
    part = family.polygon(image, source_quad)
    return part.convert('RGBa').transform(image.size, Image.Transform.PERSPECTIVE,
        tuple(matrix), Image.Resampling.BICUBIC).convert('RGBA')


def disjoint_parts(image, masks):
    """A partition avoids duplicated AA material where authored parts meet."""
    ownership = np.zeros(image.size[::-1], np.uint8)
    for n, mask in enumerate(masks, 1):
        ownership[np.array(mask) > 127] = n
    return [clip(image, Image.fromarray(np.uint8(ownership == n) * 255)) for n in range(len(masks) + 1)]


@lru_cache(maxsize=12)
def registered_source(path):
    return material_coverage(Image.open(path))


def project_registered_master(family, path, registration, source_quad, target_quad):
    """Sample a moving local part directly from its adequate original master."""
    raw = registered_source(path).crop(registration['sourceRegion']).crop(registration['subjectCrop'])
    source = (np.array(source_quad, float) * family.density - registration['physicalOffset']) / registration['scale']
    target = np.array(target_quad, float) * family.density
    source_edges = np.linalg.norm(np.roll(source, -1, axis=0) - source, axis=1)
    target_edges = np.linalg.norm(np.roll(target, -1, axis=0) - target, axis=1)
    assert np.all(source_edges >= target_edges), 'Inadequate original local part detail'
    mask = Image.new('L', raw.size)
    ImageDraw.Draw(mask).polygon([tuple(v) for v in source], fill=255)
    raw = clip(raw, mask)
    equations, values = [], []
    for (x, y), (u, v) in zip(target, source):
        equations.extend([[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]])
        values.extend([u, v])
    matrix = np.linalg.solve(np.array(equations), np.array(values))
    family.local_parts.append({'source': str(path), 'sourceHash': sha(path), 'rawPartQuad': source.tolist(),
        'nativeTargetQuad': np.array(target_quad).tolist(), 'physicalTargetQuad': target.tolist(),
        'sourceEdges': source_edges.tolist(), 'physicalEdges': target_edges.tolist(),
        'density': family.density, 'upsampling': False,
        'rule': 'Local mechanical part projects directly from the original authored master'})
    projected = raw.convert('RGBa').transform(family.size, Image.Transform.PERSPECTIVE,
        tuple(matrix), Image.Resampling.BICUBIC).convert('RGBA')
    # A homography also maps the exterior through its horizon. The finite
    # mechanical face owns only its target polygon, including a grazing pose.
    return family.polygon(projected, target_quad)


def register_anchored(family, path, reference, allow_canvas_rounding=False):
    """Keep a same-canvas edited key on its predecessor's physical sockets."""
    raw = material_coverage(Image.open(path))
    reference_size = Image.open(reference['source']).size
    canvas_delta = [raw.size[i] - reference_size[i] for i in range(2)]
    assert raw.size == reference_size or (allow_canvas_rounding and max(abs(v) for v in canvas_delta) <= 1)
    scale = np.array(reference['scale'])
    assert (scale <= 1).all()
    offset = np.array(reference['physicalOffset']) - np.array(reference['subjectCrop'][:2]) * scale
    size = np.round(np.array(raw.size) * scale).astype(int)
    image = family.blank()
    image.alpha_composite(raw.convert('RGBa').resize(tuple(size), Image.Resampling.LANCZOS).convert('RGBA'),
                          tuple(np.round(offset).astype(int)))
    registration = {'source': str(path), 'sourceHash': sha(path), 'subjectCrop': [0, 0, *raw.size],
        'sourceRegion': [0, 0, *raw.size], 'sourceSubject': list(raw.size), 'physicalSize': size.tolist(),
        'physicalOffset': np.round(offset).astype(int).tolist(), 'scale': scale.tolist(), 'upsampling': False,
        'anchorSourceHash': reference['sourceHash'],
        'sourceCanvasDelta': canvas_delta, 'canvasHandling': 'Inherited top-left origin without any alignment or subject refitting',
        'rule': 'Same-canvas edited key inherits final master coordinates; no new subject-envelope fit'}
    family.registrations.append(registration)
    return image, registration


def articulate_raw_part(family, path, isolated, region, source_axis, target_axis, source_width, target_width):
    """Project an entire isolated rigid part from its original master at native joints."""
    source = np.array(source_axis, float) - region[:2]
    target = np.array(target_axis, float) * family.density
    source_direction = source[1] - source[0]
    target_direction = target[1] - target[0]
    source_perp = np.array([-source_direction[1], source_direction[0]]) / np.linalg.norm(source_direction)
    target_perp = np.array([-target_direction[1], target_direction[0]]) / np.linalg.norm(target_direction)
    source_basis = np.column_stack((source_direction, source_perp * source_width))
    target_basis = np.column_stack((target_direction, target_perp * target_width * family.density))
    forward = target_basis @ np.linalg.inv(source_basis)
    assert np.linalg.svd(forward, compute_uv=False).max() <= 1, 'Insufficient master detail for local joint projection'
    inverse = np.linalg.inv(forward)
    offset = source[0] - inverse @ target[0]
    coefficients = (inverse[0, 0], inverse[0, 1], offset[0], inverse[1, 0], inverse[1, 1], offset[1])
    source_points = [source[0], source[1], source[1] + source_perp * source_width, source[0] + source_perp * source_width]
    target_points = [target[0], target[1], target[1] + target_perp * target_width * family.density,
                     target[0] + target_perp * target_width * family.density]
    family.local_parts.append({'source': str(path), 'sourceHash': sha(path), 'rawPartQuad': np.array(source_points).tolist(),
        'nativeTargetQuad': (np.array(target_points) / family.density).tolist(), 'physicalTargetQuad': np.array(target_points).tolist(),
        'sourceEdges': np.linalg.norm(np.roll(source_points, -1, axis=0) - source_points, axis=1).tolist(),
        'physicalEdges': np.linalg.norm(np.roll(target_points, -1, axis=0) - target_points, axis=1).tolist(),
        'density': family.density, 'upsampling': False, 'sourceRegion': list(region),
        'rule': 'Complete isolated authored part; native joint endpoints; direct original-master sampling without whole-building scaling'})
    return material_coverage(isolated).convert('RGBa').transform(family.size, Image.Transform.AFFINE,
        coefficients, Image.Resampling.BICUBIC).convert('RGBA')
