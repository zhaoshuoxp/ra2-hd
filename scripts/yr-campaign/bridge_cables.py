"""Draw source-pinned continuous vector cable tips over new pylon paint."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def curve(points, samples=160):
    points = np.asarray(points, float)
    polynomial = np.polyfit(points[:, 0], points[:, 1], 2)
    xs = np.linspace(points[0, 0], points[-1, 0], samples)
    return list(zip(xs, np.polyval(polynomial, xs)))


def render_cables(detail, bounds, spec, density):
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    base = detail.convert('RGBa').resize((width * density, height * density),
        Image.Resampling.LANCZOS).convert('RGBA')
    # Keep broad original HD column/beam paint in front of the rear cables.
    radius = 6 * density + 1
    broad = base.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    broad = broad.filter(ImageFilter.MinFilter(radius)).filter(ImageFilter.MaxFilter(radius))
    preserved = ImageDraw.Draw(broad)
    for box in spec['clearCableRegions']:
        preserved.rectangle(tuple(round(value * density) for value in box), fill=0)
    supersampling = 16
    scale = supersampling
    layer = Image.new('RGBA', (width * scale, height * scale))
    deletion = Image.new('L', layer.size)
    draw, erase = ImageDraw.Draw(layer), ImageDraw.Draw(deletion)

    def stroke(painter, points, color, line_width, offset=0):
        path = [(round(x * scale), round((y + offset) * scale)) for x, y in points]
        painter.line(path, fill=color, width=max(1, round(line_width * scale)), joint='curve')
        radius = line_width * scale / 2
        for x, y in [path[0], path[-1]]:
            painter.ellipse((round(x - radius), round(y - radius), round(x + radius), round(y + radius)), fill=color)

    for cable in spec['cables']:
        old, new = curve(cable['paintCurve']), curve(cable['nativeCurve'])
        stroke(erase, old, 255, 8, .7)
        for x, old_y, new_y in cable['hangerConnections']:
            stroke(draw, [(x, new_y + .4), (x, old_y + 4.9)], (67, 17, 5, 255), 1.5)
            stroke(draw, [(x - .3, new_y + .4), (x - .3, old_y + 4.9)], (124, 39, 5, 255), .35)
        stroke(draw, new, (101, 33, 4, 255), 3.25, 1.1)
        stroke(draw, new, (201, 103, 12, 255), 2.65, .85)
        stroke(draw, new, (244, 169, 50, 255), 1.45, .3)
        stroke(draw, new, (255, 209, 110, 255), .5, -.12)
    mask = np.asarray(deletion.resize(base.size, Image.Resampling.LANCZOS), dtype=float) / 255
    foreground = np.asarray(broad, dtype=float) / 255
    rgba = np.array(base)
    rgba[:, :, 3] = np.round(rgba[:, :, 3] * (1 - mask * (1 - foreground))).astype(np.uint8)
    result = Image.fromarray(rgba)
    vector = layer.resize(base.size, Image.Resampling.LANCZOS)
    # Broad foreground steel retains its original newly authored material.
    vector_alpha = np.asarray(vector.getchannel('A'), dtype=float)
    vector.putalpha(Image.fromarray(np.round(vector_alpha * (1 - foreground)).astype(np.uint8)))
    result.alpha_composite(vector)
    return result
