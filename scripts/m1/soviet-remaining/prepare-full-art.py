"""Extract authored source cells without repainting or changing accepted masters."""
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image

ROOT = Path('.artifacts/soviet-remaining')
OUT = ROOT / 'full-art-crops-v4'
OUT.mkdir(exist_ok=False)
report = {}
names = {
    'NARADR': ['damaged', 'early', 'middle', 'late'],
    'NADEPT': ['damaged', 'early', 'middle', 'late'],
    'NAYARD': ['damaged', 'middle'],
    'NANRCT': ['damaged', 'early', 'middle', 'late'],
    'NACLON': ['damaged', 'early', 'middle', 'late'],
    'NAPSIS': ['damaged', 'early', 'middle', 'late'],
    'NALASR': ['normal-base', 'damaged', 'early', 'late'],
    'NAFLAK': ['normal-base', 'damaged', 'early', 'middle'],
    'TESLA': ['clean', 'damaged', 'early', 'middle'],
    'NAIRON': ['damaged', 'early', 'middle', 'late'],
    'NAMISL': ['damaged', 'damaged-open', 'early', 'middle'],
}


def source_cells(im, count):
    labels, _ = ndimage.label(np.array(im.getchannel('A')) > 32)
    areas = np.bincount(labels.ravel()); areas[0] = 0
    objects = ndimage.find_objects(labels)
    largest = np.argsort(areas)[-count:]
    boxes = [[objects[i - 1][1].start, objects[i - 1][0].start,
              objects[i - 1][1].stop, objects[i - 1][0].stop] for i in largest]
    anchors = [b.copy() for b in boxes]
    for i, obj in enumerate(objects, 1):
        if obj is None or i in largest:
            continue
        b = [obj[1].start, obj[0].start, obj[1].stop, obj[0].stop]
        def distance(a):
            return max(a[0] - b[2], b[0] - a[2], 0) ** 2 + max(a[1] - b[3], b[1] - a[3], 0) ** 2
        target = boxes[min(range(count), key=lambda j: distance(anchors[j]))]
        target[:] = [min(target[0], b[0]), min(target[1], b[1]), max(target[2], b[2]), max(target[3], b[3])]
    boxes.sort(key=lambda b: b[1] + b[3])
    if count == 4:
        boxes = sorted(boxes[:2], key=lambda b: b[0]) + sorted(boxes[2:], key=lambda b: b[0])
    return boxes


def save(family, name, image, source, box):
    directory = OUT / family
    directory.mkdir(exist_ok=True)
    crop = image.crop(box)
    bounds = crop.getchannel('A').point(lambda a: 255 if a > 32 else 0).getbbox()
    assert bounds, (family, name, 'empty authored cell')
    crop = crop.crop(bounds)
    target = directory / (name + '.png')
    crop.save(target)
    report.setdefault(family, {})[name] = dict(file=str(target), source=str(source),
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), cellBox=box, alphaCrop=bounds, size=crop.size)


for family, labels in names.items():
    source = ROOT / 'full-art-v1' / family / 'states-raw.png'
    image = Image.open(source).convert('RGBA')
    boxes = source_cells(image, len(labels))
    for label, box in zip(labels, boxes):
        save(family, label, image, source, box)

source = ROOT / 'full-art-v1/NATECH/damaged-raw.png'
image = Image.open(source).convert('RGBA')
save('NATECH', 'damaged', image, source, (0, 0, image.width, image.height))
source = ROOT / 'full-art-v1/NATECH/build-raw.png'
image = Image.open(source).convert('RGBA')
for label, box in zip(['build-4', 'build-8', 'build-13', 'build-18'], source_cells(image, 4)):
    save('NATECH', label, image, source, box)
source = ROOT / 'full-art-v1/NAIRON/ready-raw.png'
image = Image.open(source).convert('RGBA')
# Use these only as local sphere/emission donors; the original fixed structure
# remains authoritative. The sheet's base corners approach its outer edges.
for label, box in zip(['ready', 'damaged-ready'], sorted(source_cells(image, 2), key=lambda b: b[0])):
    save('NAIRON', label, image, source, box)
for label, filename in [('damaged', 'damaged-r2-raw.png'), ('ruins', 'ruins-raw.png')]:
    source = ROOT / 'full-art-v1/NAWALL' / filename
    image = Image.open(source).convert('RGBA')
    alpha = np.array(image.getchannel('A')) > 32
    rows, count = ndimage.label(alpha.any(axis=1))
    assert count == 4, (label, 'expected four separated sprite rows', count)
    for y, row in enumerate(ndimage.find_objects(rows)):
        y0, y1 = row[0].start, row[0].stop
        columns, count = ndimage.label(alpha[y0:y1].any(axis=0))
        assert count == 4, (label, y, 'expected four separated sprites', count)
        for x, column in enumerate(ndimage.find_objects(columns)):
            save('NAWALL', f'{label}-{y * 4 + x:02}', image, source,
                 (column[0].start, y0, column[0].stop, y1))
(OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print('Extracted', sum(len(v) for v in report.values()), 'authored source cells')
