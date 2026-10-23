"""Reduce review size with representative contexts and unscaled native state crops."""
import copy
import hashlib
import json
import os
import subprocess
from pathlib import Path

from PIL import Image

base = Path('.artifacts/m2-4')
source = base / 'urban-actors-review-batch62-v1'
root = base / 'urban-actors-review-batch62-v2'
root.mkdir()
(root / 'media').mkdir()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = copy.deepcopy(json.loads((source / 'review-manifest.json').read_text()))
manifest['scenes'] = [row for row in manifest['scenes'] if row['name'].endswith('/ SSRV')
    or '/ JEEP / heading 0' in row['name'] or '/ CIVP / heading 0' in row['name']]
assert len(manifest['scenes']) == 3
selected = {file for section in ['scenes', 'states'] for row in manifest[section] for file in row['images'].values()}
selected.update(row['image'] for row in manifest['comparisons'])
states = {file for row in manifest['states'] for file in row['images'].values()}
files, crop_receipts = [], []
for row in manifest['files']:
    if row['file'] not in selected:
        continue
    before, after = source / row['file'], root / row['file']
    assert sha(before) == row['sha256']
    if row['file'] in states:
        image = Image.open(before).convert('RGBA')
        assert image.size == (960, 720)
        rectangle = [320, 288, 640, 528]
        crop = image.crop(rectangle)
        crop.save(after)
        assert Image.open(after).convert('RGBA').tobytes() == crop.tobytes()
        row.update(uncroppedSourceSha256=row['sha256'], sourceRect=[320, 288, 320, 240],
            source=str(before.resolve()), sha256=sha(after), size=[320, 240], rescaled=False)
        crop_receipts.append(dict(file=row['file'], originalSha256=row['uncroppedSourceSha256'],
            cropSha256=row['sha256'], rectangle=row['sourceRect'], pixelEquality='EXACT_UNSCALED_SOURCE_REGION'))
    else:
        os.link(before, after)
    files.append(row)
for row in manifest['videoFiles']:
    before, after = source / row['file'], root / row['file']
    assert sha(before) == row['sha256']
    os.link(before, after)
manifest['files'] = files
manifest['summary'] += (' To keep this combined review compact, three representative full-frame contexts are shown. '
    'Every new infantry state uses an unscaled 320 by 240 pixel crop from its original native capture. '
    'All nine actor families retain their original live clips and complete source comparison boards. '
    'The uncropped native evidence remains preserved in the task workspace; no image, camera or gameplay scale changed.')
manifest['compactReview'] = dict(sourceManifestSha256=sha(source / 'review-manifest.json'),
    fullFrameContexts=3, croppedNativeStates=len(crop_receipts), cropReceipts=crop_receipts,
    nativeRecordingsChanged=False, authoredResourcesChanged=False)
(root / 'review-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>'
    + manifest['title'] + '</title><h1>' + manifest['title'] + '</h1><p>' + manifest['summary'] + '</p>\n')
subprocess.run(['python3', 'scripts/m2-4/embed-review.py', '--source', str(root), '--output',
    str(root / 'M2.4-Urban-Batch62-Embedded.html')], check=True)
print(json.dumps(dict(images=len(files), clips=len(manifest['videoFiles']), unscaledCrops=len(crop_receipts))))
