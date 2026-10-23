"""Correct one approved bridge road using native main blocks and observed neighbors."""
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_bridge_contacts import register_bridge_contacts

root = Path('.artifacts/m2-4/bridge-road-contact-r3-20261019')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pointer_file = Path('.local/terrain-newurban-selection.json')
before = read(pointer_file)
assert before['revision'] == 'newurban-m2-4-structures-material-contacts-r2'
old_root = Path('.local/terrain-packs') / before['revision']
assert sha(old_root / 'manifest.json') == before['sha256']
manifest = read(old_root / 'manifest.json')
revision = 'newurban-m2-4-bridge-road-contact-r3-v2'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
guides = root / 'native-guides-v1'
source = read(guides / 'source.json')
sources = {row['member']: row for row in source['sources']}
member = 'ovrps05.ubn'
layout = read(Path('.artifacts/m2-4/newurban-structures-contact-r1-authoring-20261019/layout.json'))[member]
group = next(g for g in manifest['groups'] if any(m['member'] == member for m in g['members']))
native_member = next(m for m in group['members'] if m['member'] == member)
assert native_member['sourceHashes']['yr'] == sources[member]['sha256']
assert sha(guides / sources[member]['rawFile']) == sources[member]['sha256']
neighbors = read(root / 'native-road-neighbors.json')
joins = [row for row in neighbors if row['tile'][1] == 124 and row['tile'][0] in [114, 115, 116]]
assert len(joins) == 3 and all(row['files'] ==
    ['proad02.ubn', 'proad02a.ubn', 'proad02b.ubn', 'proad02c.ubn'] for row in joins)


def main_assembly(record, bridge=False):
    images = [image for image in record['images'] if image['nativeOffset'] > 0
        and (not bridge or image['terrainType'] == 11 and image['height'] == 4)]
    width, height = (240, 180) if bridge else (120, 60)
    canvas = Image.new('RGBA', (width, height))
    for image in images:
        main = image['main']
        file = guides / main['file']
        assert sha(file) == main['sha256']
        pixels = Image.frombytes('RGBA', tuple(main['size']), file.read_bytes())
        x, y = image['origin']
        if bridge:
            x -= layout['bounds'][0]
            y -= image['height']*15+layout['bounds'][1]
        canvas.alpha_composite(pixels, (x, y))
    return np.asarray(canvas)


native_main = main_assembly(sources[member], True)
donors = [main_assembly(row) for name, row in sources.items() if name != member]
records, changed_pairs, exact_pairs = [], 0, 0
variants = copy.deepcopy(group['variants'])
for variant in variants:
    file = old_root / variant['file']
    assert sha(file) == variant['sha256']
    width, height = variant['size']
    original = np.frombuffer(file.read_bytes(), np.uint8).reshape(height, width, 4)
    current = original.copy()
    density = variant['density']
    entries, offset = {}, 0
    for declared in group['members']:
        entries[declared['member']] = variant['rects'][offset:offset+len(declared['images'])]
        offset += len(declared['images'])
    parts = {part['subTile']: part['rect'] for part in layout['parts']}
    whole = Image.new('RGBA', tuple(n*density for n in layout['bounds'][2:]))
    ordered = sorted(sources[member]['images'], key=lambda image: parts[image['subTile']][1])
    for image in ordered:
        x, y, w, h = entries[member][image['subTile']]
        px, py = parts[image['subTile']][:2]
        whole.alpha_composite(Image.fromarray(original[y:y+h, x:x+w]), (px*density, py*density))
    approved = np.asarray(whole)
    corrected, registration = register_bridge_contacts(approved, native_main, donors, density)
    Image.fromarray(approved).save(root / f'approved-bridge-{density}x-v2.png')
    Image.fromarray(corrected).save(root / f'corrected-bridge-{density}x-v2.png')
    for declared in group['members']:
        for image, rect in zip(declared['images'], entries[declared['member']]):
            x, y, w, h = rect
            previous = original[y:y+h, x:x+w]
            result = current[y:y+h, x:x+w]
            if declared['member'] == member:
                px, py = parts[image['subTile']][:2]
                replacement = corrected[py*density:py*density+h, px*density:px*density+w]
                delta = np.any(approved[py*density:py*density+h, px*density:px*density+w] != replacement, axis=2)
                delta &= result[..., 3] > 0
                result[..., :3][delta] = replacement[..., :3][delta]
                current[y-2:y+h+2, x-2:x+w+2] = np.pad(result, ((2, 2), (2, 2), (0, 0)), mode='edge')
            np.testing.assert_array_equal(result[..., 3], previous[..., 3])
            if declared['member'] != member:
                np.testing.assert_array_equal(result, previous)
                exact_pairs += 1
            elif not np.array_equal(result, previous):
                changed_pairs += 1
    with (destination / variant['file']).open('xb') as stream:
        stream.write(current.tobytes())
    variant['sha256'] = sha(destination / variant['file'])
    records.append(registration)
for other in manifest['groups']:
    if other['id'] == group['id']:
        continue
    for variant in other['variants']:
        source_file = old_root / variant['file']
        assert sha(source_file) == variant['sha256']
        os.link(source_file, destination / variant['file'])
        assert sha(destination / variant['file']) == variant['sha256']
group['variants'] = variants
manifest.update(revision=revision, scope='APPROVED_BASE_WITH_SOURCE_PINNED_BRIDGE_ROAD_CONTACT_REGISTRATION')
with (destination / 'manifest.json').open('x') as stream:
    stream.write(json.dumps(manifest, indent=2)+'\n')
after = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
receipt = dict(status='PASS_BRIDGE_ROAD_REGISTRATION_ALPHA_AND_APPROVED_MEMBER_PRESERVATION',
    baseline=before, candidate=after, sourceGuidesSha256=sha(guides / 'source.json'),
    changedMember=member, changedDensityFramePairs=changed_pairs,
    exactOtherBridgeFramePairs=exact_pairs, unchangedOtherGroups=len(manifest['groups'])-1,
    records=records, windows='NOT_RUN', nativeValidation='PENDING', userSeamAcceptance='PENDING',
    artworkAcceptance='ACCEPTED_BY_USER_KEEPING_MOTHER_FILES', m24Complete=False)
with (root / 'export-and-preservation-v2.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({key: receipt[key] for key in ['status', 'candidate', 'changedDensityFramePairs',
    'exactOtherBridgeFramePairs', 'unchangedOtherGroups']}))
