"""Retain full scenes and make exact unscaled detail crops of large state captures."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(exist_ok=False)
manifest = json.loads((args.source / 'review-manifest.json').read_text())
state_files = {file for row in manifest['states'] for file in row['images'].values()}
scene_files = {file for row in manifest['scenes'] for file in row['images'].values()}
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
crops = []
for row in manifest['files']:
    source, target = args.source / row['file'], args.output / row['file']
    assert sha(source) == row['sha256']
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        if row['file'] in state_files - scene_files and image.size == (1489, 1080):
            rectangle = (344, 190, 1144, 890)
            cropped = image.crop(rectangle)
            cropped.save(target, optimize=True)
            with Image.open(target) as check:
                assert check.mode == cropped.mode and check.tobytes() == cropped.tobytes()
            original_hash = row['sha256']
            row.update(size=list(cropped.size), sha256=sha(target), sourceCropRect=list(rectangle),
                       fullCaptureSha256=original_hash, decodedPixelChange=False, rescaled=False)
            crops.append(dict(file=row['file'], source=row['source'], fullCaptureSha256=original_hash,
                              cropSha256=row['sha256'], rectangle=list(rectangle)))
        else:
            shutil.copyfile(source, target)
            assert sha(target) == row['sha256']
manifest['disclosure'] += ' Large native state images use exact800x700 framebuffer detail crops at their original display scale; full source screenshots remain preserved and hash-pinned. Full matched scenes and source atlas comparisons are retained. No image pixels, assets, camera scale or game behavior are repainted or resized.'
manifest['detailCropReceipt'] = 'native-detail-crops.json'
for name, data in [('review-manifest.json', manifest), ('native-detail-crops.json',
                   dict(status='PASS_EXACT_UNSCALED_NATIVE_DETAIL_PIXELS', crops=crops))]:
    with (args.output / name).open('x') as stream:
        json.dump(data, stream, indent=2)
shutil.copyfile(args.source / 'index.html', args.output / 'index.html')
print(json.dumps(dict(images=len(manifest['files']), croppedStates=len(crops))))
