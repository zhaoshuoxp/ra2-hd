"""Isolate original warm reef bodies from source sea and reflected shadows."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


author = Path('.artifacts/m2-4/newurban-coast-authoring-batch74-v1')
root = Path('.artifacts/m2-4/newurban-reef-bodies-batch74-v2')
root.mkdir(exist_ok=False)
source = json.loads((author / 'source.json').read_text())
water = json.loads((author / 'water-material-profile-v3.json').read_text())
board_size, columns = [1254, 1254], 3
board = Image.new('RGBA', tuple(board_size))
layout, ownership = {}, []
names = ['water07.ubn', 'water08.ubn', 'water14.ubn']
for slot, name in enumerate(names):
    member = next(row for row in source['members'] if row['member'] == name)
    native_file = author / (name + '-native.png')
    image = Image.open(native_file).convert('RGBA')
    native = np.asarray(image)
    rgb = native[..., :3].astype(float)
    warm = (native[..., 3] > 0) & (rgb[..., 0] > rgb[..., 1] + 10) & (rgb[..., 0] > rgb[..., 2] + 12) & (rgb[..., 0] > 60)
    labels, count = ndimage.label(warm)
    sizes = np.bincount(labels.ravel())
    if name == 'water07.ubn':
        # Its disconnected warm dots below the rock are reflected source material.
        kept = [int(np.argmax(sizes[1:]) + 1)]
    else:
        # Water08 has one isolated upper rock; retain both source body components.
        kept = [index for index in range(1, count + 1) if sizes[index] >= 32]
    mask = ndimage.binary_fill_holes(np.isin(labels, kept))
    sea = water['mixedWaterMembers'][name]['mask']
    sea_file = author / sea['file']
    assert sha(sea_file) == sea['sha256']
    sea_mask = np.frombuffer(sea_file.read_bytes(), np.uint8).reshape(mask.shape) != 0
    assert mask.any()
    overlap = int((mask & sea_mask).sum())
    # A few dark rock colors also occur in the source sea palette. Explicit
    # connected body ownership takes precedence over that ambiguous palette.
    corrected_sea = (sea_mask & ~mask).astype(np.uint8)
    corrected_file = root / (name + '-water-body-excluded-mask-v4.bin')
    corrected_file.write_bytes(corrected_sea.tobytes())
    assert not (mask & (corrected_sea != 0)).any()
    water['mixedWaterMembers'][name]['mask'] = dict(sea, file=str(corrected_file.resolve()),
        sha256=sha(corrected_file), sourcePaletteMaskSha256=sea['sha256'], excludedNativeBodyPixels=overlap,
        policy='Exact native palette/layer sea with source-pinned connected warm reef body excluded; '
            'ambiguous dark body colors cannot inherit sea ownership.')
    y, x = np.where(mask)
    bounds = [int(x.min()), int(y.min()), int(x.max()) + 1, int(y.max()) + 1]
    x0, y0, x1, y1 = bounds
    body = native[y0:y1, x0:x1].copy()
    body[..., 3] = mask[y0:y1, x0:x1] * 255
    width, height = x1 - x0, y1 - y0
    guide = Image.fromarray(body).resize((width * 7, height * 7), Image.Resampling.NEAREST)
    cell_left = slot * 418
    board.alpha_composite(guide, (cell_left + (418 - guide.width) // 2, (1254 - guide.height) // 2))
    layout[name] = dict(board='reef-bodies-master.png', boardSize=board_size, occupied=3,
        slotRect=[cell_left, 0, 418, 1254], nativeAlphaBounds=[0, 0, width, height], bounds=[0, 0, width, height])
    mask_file = root / (name + '-native-body.bin')
    mask_file.write_bytes(mask.astype(np.uint8).tobytes())
    ownership.append(dict(member=name, sourceSha256=member['native']['sha256'], nativeBodyBounds=bounds,
        bodyPixels=int(mask.sum()), retainedComponents=kept, excludedPaletteSeaBodyOverlap=overlap,
        bodyMask=dict(file=str(mask_file.resolve()), sha256=sha(mask_file),
            nativeRgbaSha256=hashlib.sha256(native.tobytes()).hexdigest(), logical=list(image.size)),
        policy='Original warm source body components, disjoint from exact palette-owned sea; disconnected lower '
            'Water07 reflections excluded. Source map, logical alpha and native shadow remain unchanged.'))
reference = root / 'reef-bodies-reference.png'
board.save(reference)
prompt = ('Use case: precise-object-edit. Repaint these three exact NewUrban isometric reef rock bodies, '
    'left to right in the same three-column, one-row layout. Image 1 is the exact original body geometry '
    'and warm color guide, isolated from sea and shadows. Preserve each complete original rock cluster, '
    'its silhouette, crevices, gaps, upper-left light, warm orange/ochre highlights and muted brown faces. '
    'Add fine genuine sandstone and wet-rock material detail with smooth continuous edges, without '
    'changing the rock arrangements or enlarging their shapes. The middle cluster includes the isolated '
    'small upper rock. No water, waves, foam, reflected shapes, sea shadow, ground or new rocks. '
    'Keep generous transparent margins and gutters; each whole body stays in its original cell. '
    'Genuinely transparent background, no text, labels, grid, border or checkerboard. Target at least '
    '1536 by 1536 pixels with enough real detail for independent 2X and 4X exports; no pixel blocks, '
    'interpolation, blur or sharpening as a substitute for new detail.')
job = dict(id='newurban-reef-bodies-batch74-v1', reference=str(reference.resolve()), referenceSha256=sha(reference),
    destination=str((root / 'reef-bodies-master.png').resolve()), members=names, cellLayout=[3, 1],
    boardSize=board_size, prompt=prompt)
for filename, value in [('layout.json', layout), ('native-body-ownership-v1.json', dict(members=ownership)),
        ('water-material-profile-v4.json', water),
        ('imagegen-jobs.json', dict(jobs=[job], sourceSha256=sha(author / 'source.json')))]:
    with (root / filename).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(bodies=3, bodyPixels=[row['bodyPixels'] for row in ownership],
    resolvedSourcePaletteOverlap=[row['excludedPaletteSeaBodyOverlap'] for row in ownership], finalSeaOverlap=0)))
