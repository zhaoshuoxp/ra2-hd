"""Compare original YR loading subjects with the accepted RA2 photo library."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source_root = args.source.parent
source = read(args.source)
old_root = Path('../project-history/ra2-campaign-completion-20261026/Art/OriginalLoading')
old = read(old_root / 'inventory.json')
art_root = old_root.parent
master_names = {}
for p in art_root.rglob('*.png'):
    master_names.setdefault(p.name, []).append(p)


def photo_rects(image):
    rgb = np.asarray(image.convert('RGB')).astype(int)
    border = (rgb.min(2) > 90) & (np.ptp(rgb, axis=2) < 30)
    candidates = []
    for y in range(345, 415):
        ends = np.flatnonzero(np.diff(np.r_[False, border[y, 230:530], False]))
        for left, right in zip(ends[::2] + 230, ends[1::2] + 230):
            if not 72 <= right-left <= 85:
                continue
            for height in range(57, 72):
                if border[y+height, left:right].mean() > .85 \
                        and border[y:y+height+1, left].mean() > .8 \
                        and border[y:y+height+1, right-1].mean() > .8:
                    candidates.append([int(left+1), y+1, int(right-left-2), height-1])
    selected = []
    for rect in sorted(candidates, key=lambda r: (-r[2]*r[3], r[1])):
        if not any(abs(rect[0]-other[0]) < 10 for other in selected):
            selected.append(rect)
    assert len(selected) in (2, 3), selected
    return sorted(selected)


def crop(image, rect):
    x, y, w, h = rect
    return image.crop((x, y, x+w, y+h))


def descriptor(image):
    # Normalization serves comparison only; it is never exported as HD artwork.
    rgb = np.asarray(image.convert('RGB').resize((60, 48), Image.Resampling.BICUBIC)).astype(float)
    gray = rgb @ [.299, .587, .114]
    values = gray[2:-2, 2:-2].ravel()
    return (values-values.mean()) / max(values.std(), 1)


library = []
for row in old['rows']:
    if row['faction'] not in ('allied', 'soviet'):
        continue
    original = old_root / row['full']
    image = Image.open(original).convert('RGB')
    spec = read(Path('.local/campaign/ra2') / row['mission'][:-4] / 'interface-hd.json')
    rects = spec['loading'].get('originalPhotoRects', [photo['rect'] for photo in row['photos']])[:-1]
    for index, rect in enumerate(rects):
        masters = []
        for entry in spec['loading'].get('masters', []):
            matches = [p for p in master_names.get(Path(entry['name']).name, []) if sha(p) == entry['sha256']]
            masters.append({**entry, 'resolvedFiles': [str(p) for p in matches]})
        library.append(dict(mission=row['mission'], index=index, rect=rect,
            original=str(original), descriptor=descriptor(crop(image, rect)), acceptedMasters=masters))

args.output.mkdir(parents=True, exist_ok=False)
rows = []
for row in source['rows']:
    file = source_root / row['original']
    assert sha(file) == row['originalPngSha256']
    image = Image.open(file).convert('RGB')
    for index, rect in enumerate(photo_rects(image)):
        values = descriptor(crop(image, rect))
        scores = sorted(((float(values @ item['descriptor'] / len(values)), item) for item in library),
                        key=lambda r: -r[0])
        score, parent = scores[0]
        name = row['mission'][:-4] + f'-photo-{index}.png'
        crop(image, rect).save(args.output / name)
        rows.append(dict(mission=row['mission'], index=index, rect=rect, originalCrop=name,
            bestSourceCorrelation=score, acceptedSource={k: v for k, v in parent.items() if k != 'descriptor'},
            reuseCandidate=score >= .88, visualQualification='PENDING_ORIGINAL_AND_ACCEPTED_MASTER_INSPECTION'))
report = dict(schema='yr-loading-accepted-photo-source-reuse-audit-v1', rows=rows,
    normalization='Analysis-only 60x48 luminance comparison; no normalized images are saved or selected.',
    originalPhotos=len(rows), reuseCandidates=sum(row['reuseCandidate'] for row in rows),
    artworkChanged=False, registered=False)
(args.output / 'audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['originalPhotos', 'reuseCandidates', 'artworkChanged']}))
