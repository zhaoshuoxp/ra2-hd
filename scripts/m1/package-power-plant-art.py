"""Pack the explicitly accepted review without changing its frame pixels."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--review', type=Path, required=True)
parser.add_argument('--acceptance', type=Path, required=True)
parser.add_argument('--revision', required=True)
args = parser.parse_args()
assert args.revision.isdecimal()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
review_file = args.review / 'candidate-review.json'
review = json.loads(review_file.read_text())
approval = json.loads(args.acceptance.read_text())
assert approval['status'] == 'USER_ACCEPTED_COMPLETE_CANDIDATE' and approval['candidateSha256'] == sha(review_file)
assert review['validatedExports'] == 88 and review['requiredAuthoredFrames'] == 44
frames = {(f['member'], f['nativeFrame']): f for f in review['frames']}
assert len(frames) == 44
family_root = Path('.local/hd-packs/power-plant-authored', args.revision)
family_root.mkdir(parents=True, exist_ok=False)
family = {'schemaVersion': 1, 'family': 'GAPOWR', 'theater': 'TEMPERATE',
          'candidateSha256': sha(review_file), 'approvalSha256': sha(args.acceptance), 'members': []}
for role, member, count in [('body', 'ggpowr.shp', 3), ('active', 'ggpowr_a.shp', 16), ('buildup', 'gtpowrmk.shp', 25)]:
    manifest = json.loads(Path(f'.local/hd-packs/power-plant-calibration-{role}/1/manifest.json').read_text())
    assert manifest['source']['member'] == member and len(manifest['logical']['frames']) == count
    pack_id = f'power-plant-authored-{role}'
    root = Path('.local/hd-packs', pack_id, args.revision)
    root.mkdir(parents=True, exist_ok=False)
    manifest.update(packId=pack_id, packRevision=args.revision, purpose='User-accepted GAPOWR authored prototype',
                    candidateSha256=family['candidateSha256'])
    for variant in manifest['variants']:
        density = variant['density']
        for page in variant['pages']:
            for channel in ['base', 'data']:
                atlas = Image.new('RGBA', page['size'], (0, 0, 0, 255 if channel == 'data' else 0))
                for frame in variant['frames']:
                    if frame['page'] != page['id']:
                        continue
                    source = frames[(member, frame['nativeFrame'])]
                    export = next(e for e in source['exports'] if e['density'] == density)
                    entry = export['files'][channel]
                    file = args.review / entry['file']
                    assert sha(file) == entry['sha256']
                    image = Image.open(file).convert('RGBA')
                    x, y, width, height = frame['sampleRect']
                    assert image.size == (width, height)
                    atlas.paste(image, (x, y))
                file = root / page[channel]
                atlas.save(file)
                page[channel + 'Sha256'] = sha(file)
                page[channel + 'Bytes'] = file.stat().st_size
    file = root / 'manifest.json'
    file.write_text(json.dumps(manifest, indent=2) + '\n')
    family['members'].append({'member': member, 'packId': pack_id, 'revision': args.revision, 'sha256': sha(file)})
(family_root / 'family.json').write_text(json.dumps(family, indent=2) + '\n')
print(json.dumps({'family': str(family_root / 'family.json'), 'sha256': sha(family_root / 'family.json'), 'members': family['members']}))
