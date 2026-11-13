"""Render source-pinned pyramid masonry with one shared course geometry."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def read_spec(declaration, source):
    file = Path(declaration['file'])
    assert sha(file) == declaration['sha256']
    spec = json.loads(file.read_text())
    assert spec['schema'] == 'yr-pyramid-authored-courses-v1'
    assert spec['sourceSha256'] == source['sha256']
    assert spec['originalIndices'] == [frame['indexSha256'] for frame in source['frames'][:3]]
    assert spec['courseCount'] == 72 and spec['projectedRise'] == 182
    assert all(frame['size'] == spec['logicalSize'] for frame in source['frames'][:3])
    assert spec['independentPaintCapacity'] >= 4
    for role in ['damagePaint', 'damageMask', *(['basePaint'] if spec.get('basePaint') else [])]:
        assert sha(spec[role]['file']) == spec[role]['sha256']
    return spec


def paint_crop(file):
    image = Image.open(file).convert('RGBA')
    bounds = image.getchannel('A').point(lambda value: 255 if value >= 4 else 0).getbbox()
    assert bounds
    return image.crop(bounds)


def render(spec, slot, density):
    assert slot in [0, 1, 2] and density in [2, 4, 8]
    width, height = spec['logicalSize']
    scale = density * 8
    image = Image.new('RGBA', (width * scale, height * scale))
    draw = ImageDraw.Draw(image)
    apex, left, front, right = [np.array(spec['vertices'][name], float)
        for name in ['apex', 'left', 'front', 'right']]
    rise, count = spec['projectedRise'] / spec['courseCount'], spec['courseCount']

    def polygon(points, color):
        draw.polygon([tuple(point * scale) for point in points], fill=color)

    # Every component uses the same physical course fractions. The side parts
    # and front part therefore meet along the same original projected rays.
    for level in range(count, 0, -1):
        inner, outer = (level - 1) / count, level / count
        for a, b, palette in [(front, right, spec['colors']['right']),
            (left, front, spec['colors']['left'])]:
            p, q = apex + (a - apex) * outer, apex + (b - apex) * outer
            ip, iq = apex + (a - apex) * inner, apex + (b - apex) * inner
            tp, tq = p - [0, rise], q - [0, rise]
            polygon([tp, tq, q, p], palette['riser'])
            polygon([ip, iq, tq, tp], palette['tread'])
            # A narrow stone lip catches the original upper-left light.
            lip = min(.32, rise * .16)
            polygon([tp, tq, tq + [0, lip], tp + [0, lip]], palette['lip'])
            shadow = min(.35, rise * .18)
            polygon([p - [0, shadow], q - [0, shadow], q, p], palette['shadow'])
    if spec.get('post') and not spec.get('basePaint'):
        for face in spec['post']:
            polygon([np.array(point) for point in face['points']], face['color'])
    image = image.resize((width * density, height * density), Image.Resampling.LANCZOS)
    if spec.get('basePaint'):
        paint = paint_crop(spec['basePaint']['file'])
        assert paint.width >= image.width and paint.height >= image.height
        paint = paint.convert('RGBa').resize(image.size, Image.Resampling.LANCZOS).convert('RGBA')
        pixels = np.array(paint)
        yy, xx = np.mgrid[:image.height, :image.width].astype(float)
        points = np.stack([(xx + .5) / density, (yy + .5) / density], axis=-1)
        distance = np.full((image.height, image.width), np.inf)
        for a, b in [(left, front), (front, right)]:
            delta = b - a
            fraction = np.clip(((points - a) * delta).sum(2) / (delta * delta).sum(), 0, 1)
            nearest = a + fraction[..., None] * delta
            distance = np.minimum(distance, np.sqrt(((points - nearest) ** 2).sum(2)))
        bright = (pixels[..., 0] > 140) & (pixels[..., 1] > 120) & (pixels[..., 2] > 80)
        coverage = np.clip((2.2 - distance) * density, 0, 1) * bright
        if spec.get('authoredPostRect'):
            x, y, w, h = spec['authoredPostRect']
            post = (points[..., 0] >= x) & (points[..., 0] < x + w) \
                & (points[..., 1] >= y) & (points[..., 1] < y + h)
            coverage[post] = 1
        mask = Image.fromarray(np.rint(coverage * 255).astype(np.uint8))
        image = Image.composite(paint, image, mask)
    if slot == 1:
        # This paint is independently authored HD damage. Its measured density
        # already covers the final output; no original pixels supply material.
        paint = paint_crop(spec['damagePaint']['file'])
        assert paint.width >= width * density and paint.height >= height * density
        paint = paint.convert('RGBa').resize(image.size, Image.Resampling.LANCZOS).convert('RGBA')
        mask = Image.open(spec['damageMask']['file']).convert('L')
        assert mask.width >= image.width and mask.height >= image.height
        mask = mask.resize(image.size, Image.Resampling.LANCZOS)
        image = Image.composite(paint, image, mask)
    return image
