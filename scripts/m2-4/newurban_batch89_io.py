"""Small immutable input and atlas helpers for the linked NewUrban batch."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-linked-buildings-batch89-20261020')
read = lambda p: json.loads(Path(p).read_text())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=Path(p).stat().st_size)


def write(file, value):
    with Path(file).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


def crop(file, slot, density, role='base'):
    file = Path(file)
    metadata = read(file)
    variant, = [v for v in metadata['variants'] if v['density'] == density]
    frame, = [f for f in variant['frames'] if f['nativeFrame'] == slot]
    page, = [p for p in variant['pages'] if p['id'] == frame['page']]
    png = file.parent / str(density) / page['id'] / (role + '.png')
    assert sha(png) == page[role + 'Sha256']
    x, y, w, h = frame['sampleRect']
    return np.array(Image.open(png).convert('RGBA'))[y:y + h, x:x + w].copy()


def logical(frame):
    return dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
        legacyRenderSize=[n + n % 2 for n in frame['size']], empty=frame['empty'])


def atlas(folder, frames, images, density):
    sizes = [[n * density for n in frame['legacyRenderSize']] for frame in frames]
    width = ((max(w for w, _ in sizes) + 4 + 63) // 64) * 64
    assert width <= 2048
    pages, declarations, placements = [], [], []
    y, page_index = 2, 0

    def flush():
        height = max(py + sizes[number][1] + 2 for number, py in placements)
        base = np.zeros((height, width, 4), np.uint8)
        data = np.zeros_like(base)
        data[..., 3] = 255
        for number, py in placements:
            b, d = images[number]
            h, w = b.shape[:2]
            padded = np.pad(b, ((2, 2), (2, 2), (0, 0)), mode='edge')
            padded[..., 3] = 0
            padded[2:h + 2, 2:w + 2] = b
            base[py - 2:py + h + 2, :w + 4] = padded
            data[py:py + h, 2:w + 2] = d
        target = folder / str(density) / f'p{page_index}'
        target.mkdir(parents=True)
        page = dict(id=f'p{page_index}', size=[width, height])
        for role, array in [('base', base), ('data', data)]:
            file = target / (role + '.png')
            Image.fromarray(array).save(file)
            page.update({role: f'{density}-p{page_index}-{role}.png',
                role + 'Sha256': sha(file), role + 'Bytes': file.stat().st_size})
        pages.append(page)

    for number, (w, h) in enumerate(sizes):
        assert h + 4 <= 2048
        if y + h + 2 > 2048:
            flush()
            placements, y, page_index = [], 2, page_index + 1
        declarations.append(dict(nativeFrame=number, page=f'p{page_index}', sampleRect=[2, y, w, h],
            contentRect=[2, y, *[n * density for n in frames[number]['trimSize']]]))
        placements.append((number, y))
        y += h + 4
    flush()
    return dict(density=density, pages=pages, frames=declarations)
