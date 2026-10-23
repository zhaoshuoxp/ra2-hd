"""Rebuild accepted representative motion directly from full-resolution masters."""
import numpy as np
from PIL import Image
from production import ROOT, D, area
from master_regeneration import resolve_master


def fit_master(image, box, size):
    crop = image.getchannel('A').point(lambda a: 255 if a > 32 else 0).getbbox()
    source = image.crop(crop)
    scale = min((box[2] - box[0]) / source.width, (box[3] - box[1]) / source.height)
    target = (round(source.width * scale * D), round(source.height * scale * D))
    offset = (round((box[0] + (box[2] - box[0] - source.width * scale) / 2) * D),
              round((box[3] - source.height * scale) * D))
    source = resolve_master(source, target)
    out = Image.new('RGBA', tuple(v * D for v in size))
    out.alpha_composite(area(source, target), offset)
    return out


def sheet_cell(image, columns, rows, n):
    x, y = n % columns, n // columns
    return image.crop((round(x * image.width / columns), round(y * image.height / rows),
                       round((x + 1) * image.width / columns), round((y + 1) * image.height / rows)))


def authored_scans(f, normal):
    sequence = f.rep['sequences'][0]['frames']
    reg = f.rep['registration']
    if f.name == 'NAPSIS':
        sheet = f.load(ROOT / 'art-v1/NAPSIS/motion-raw.png')
        seam = round((reg['translation'][1] + (790 - reg['crop'][1]) * reg['scale']) * D)
        base = normal.copy()
        base.paste((0, 0, 0, 0), (0, 0, base.width, seam))
        result = {}
        for i, item in enumerate(sequence):
            antenna = fit_master(sheet_cell(sheet, 4, 2, i), [110, 4, 165, seam / D + 2], f.size)
            image = base.copy()
            image.alpha_composite(antenna)
            result[item['sourceFrame']] = image
        return result
    pivot = reg['translation'][0] + (650 - reg['crop'][0]) * reg.get('scaleXY', [reg['scale']])[0]
    boundary = round((reg['translation'][1] + (585 - reg['crop'][1]) * reg['scale']) * D)
    upper, base = normal.copy(), normal.copy()
    upper.paste((0, 0, 0, 0), (0, boundary, upper.width, upper.height))
    base.paste((0, 0, 0, 0), (0, 0, base.width, boundary))
    def extent(n):
        yy, xx = np.where(np.array(f.source_image('ngradr_a.shp', n))[:66] > 0)
        return float(xx.mean()), float(xx.max() - xx.min() + 1)
    first, width = extent(0)
    result = {}
    for item in sequence:
        n = item['sourceFrame']
        center, current = extent(n)
        scale = current / width
        matrix = np.array([[scale, 0, pivot * D * (1 - scale) + (center - first) * D], [0, 1, 0], [0, 0, 1]])
        inverse = np.linalg.inv(matrix)
        image = base.copy()
        image.alpha_composite(upper.transform(upper.size, Image.Transform.AFFINE, tuple(inverse[:2].ravel()), Image.Resampling.BICUBIC))
        result[n] = image
    return result


def authored_wall(f, n):
    sheet = f.load(ROOT / 'art-v1/NAWALL/connections-raw.png')
    control = Image.open(ROOT / 'references-v1/NAWALL' / f'connection-{n}.png').convert('RGBA')
    box = control.getchannel('A').point(lambda a: 255 if a > 32 else 0).getbbox()
    return fit_master(sheet_cell(sheet, 4, 4, n), box, f.size)
