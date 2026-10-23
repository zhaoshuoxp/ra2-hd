"""Inspect geometry, material, ownership and contacts in registered original trims."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
guide = read(GUIDE / 'source.json')
donors = read(ROOT / 'selected-donor-inputs-v1.json')
rows, pictures = [], []
for donor in donors['records']:
    source, = [s for s in guide['sources'] if s['member'] == donor['targetMember']]
    slots = []
    for frame in donor['frames']:
        slot = frame['slot']
        target = source['frames'][slot]
        a = np.fromfile(frame['index']['file'], np.uint8).reshape(frame['size'][::-1])
        b = np.fromfile(GUIDE / 'native' / target['indexFile'], np.uint8).reshape(target['size'][::-1])
        offset = [int(frame['origin'][axis] - donor['descriptor']['canvas'][axis] // 2
                      - target['origin'][axis] + source['canvas'][axis] // 2) for axis in [0, 1]]
        registered = np.zeros_like(b)
        x, y = offset
        sx, sy = max(0, -x), max(0, -y)
        dx, dy = max(0, x), max(0, y)
        w, h = min(a.shape[1] - sx, b.shape[1] - dx), min(a.shape[0] - sy, b.shape[0] - dy)
        if w > 0 and h > 0:
            registered[dy:dy + h, dx:dx + w] = a[sy:sy + h, sx:sx + w]
        iso = source['member'] != 'cnfncp.shp' and slot == 3
        palette = (GUIDE / 'native' / ('1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676.pal'
                   if iso else source['palette']['sha256'] + '.pal'))
        ap = np.fromfile(frame['palette']['file'], np.uint8).reshape(256, 3).astype(float) * 4
        bp = np.fromfile(palette, np.uint8).reshape(256, 3).astype(float) * 4
        ca, cb = ap[registered], bp[b]
        ao = (registered >= 16) & (registered <= 31) & source['remapable'] & (not iso)
        bo = (b >= 16) & (b <= 31) & source['remapable'] & (not iso)
        active = (registered != 0) & (b != 0) & ~ao & ~bo
        if not iso:
            active &= (registered != 12) & (b != 12)
        alpha = (registered != 0) != (b != 0)
        rgb = ((ca != cb).any(2) & active)
        labels, _ = ndimage.label(alpha)
        components = np.bincount(labels.ravel())[1:]
        gain = cb[active].mean(0) / np.maximum(1, ca[active].mean(0)) if active.any() else np.ones(3)
        correlation = float(np.corrcoef(ca[active].mean(1), cb[active].mean(1))[0, 1]) if active.any() else 1
        row = dict(slot=slot, offset=offset, nativeSize=target['size'], donorSize=frame['size'],
            alphaDifferences=int(alpha.sum()), alphaDifferenceLargestComponent=int(components.max(initial=0)),
            ownerCoverageDifferences=int((ao != bo).sum()), ownerShadeDifferences=int(((registered != b) & ao & bo).sum()),
            contactDifferences=int(((registered == 12) != (b == 12)).sum()) if not iso else 0,
            fixedRgbDifferences=int(rgb.sum()), fixedMaterialSamples=int(active.sum()),
            materialMeanRatio=gain.tolist(), materialLuminanceCorrelation=correlation,
            materialRmse=float(np.sqrt(np.mean((ca[active] * gain - cb[active]) ** 2))) if active.any() else 0,
            sourceIndex=pin(GUIDE / 'native' / target['indexFile']), donorIndex=frame['index'],
            targetPalette=pin(palette), donorPalette=frame['palette'])
        slots.append(row)
        if source['member'] != 'cnfncp.shp' or slot in [0, 5, 10, 16, 21, 26]:
            board = Image.new('RGB', (820, max(b.shape[0] * 2 + 42, 110)), '#101820')
            draw = ImageDraw.Draw(board)
            for i, (indices, colors, label) in enumerate([(registered, ca, 'Accepted donor original'), (b, cb, 'Target original')]):
                rgba = np.dstack((colors.astype(np.uint8), (indices != 0).astype(np.uint8) * 255))
                picture = Image.fromarray(rgba).resize((b.shape[1] * 2, b.shape[0] * 2), Image.Resampling.NEAREST)
                board.paste(picture, (i * 410 + 8, 34), picture)
                draw.text((i * 410 + 8, 8), f'{source["member"]} / {slot}: {label}', fill='white')
            file = ROOT / f'original-comparison-{source["member"]}-{slot}.png'
            board.save(file)
            pictures.append(pin(file))
    rows.append(dict(member=source['member'], donor=donor['member'], theater=donor['theater'], slots=slots))
write(ROOT / 'registered-native-analysis-v1.json', dict(status='READ_ONLY_REGISTERED_NATIVE_MATERIAL_AND_SEMANTIC_AUDIT',
    donorInputs=pin(ROOT / 'selected-donor-inputs-v1.json'), rows=rows, inspection=pictures,
    noHdArtChanged=True, windows='NOT_RUN', m24Complete=False))
for row in rows:
    print(row['member'], [(s['slot'], s['offset'], s['alphaDifferences'], s['ownerCoverageDifferences'],
        s['ownerShadeDifferences'], s['contactDifferences'], s['fixedRgbDifferences'],
        round(s['materialLuminanceCorrelation'], 4), round(s['materialRmse'], 2)) for s in row['slots']])
