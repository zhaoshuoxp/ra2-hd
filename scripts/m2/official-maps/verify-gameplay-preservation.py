"""Independently verify R6 geometry, alpha, owner data and unaffected resources."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def read(p):
    return json.loads(p.read_text())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


contact_file, output = map(Path, sys.argv[1:3])
contact = read(contact_file)
assert not output.exists()
report = dict(status='PASS_SCOPED_GEOMETRY_ALPHA_OWNER_DATA_GUTTERS_AND_UNAFFECTED_BYTES',
    environment=contact['environment'], terrain=contact['terrain'], sourceReceiptSha256=sha(contact_file),
    filesChecked=0, unchangedEnvironmentFamilies=238-len(contact['changedEnvironmentFamilies']), unchangedTerrainGroups=23-len(contact['changedTerrainGroups']))
old = Path('.local/environment-packs/environment-m2-3-edge-feedback-complete-v6')
new = Path('.local/environment-packs')/contact['environment']['revision']
a, b = read(old/'manifest.json'), read(new/'manifest.json')
assert set(a['families']) == set(b['families'])
for family, record in a['families'].items():
    unchanged = family not in contact['changedEnvironmentFamilies']
    if unchanged:
        assert record == b['families'][family]
    for x, y in zip(record['members'], b['families'][family]['members']):
        assert x['member'] == y['member']
        m1, m2 = read(old/x['path']), read(new/y['path'])
        assert m1['logical'] == m2['logical'] and m1['source'] == m2['source']
        for file in (old/x['path']).parent.rglob('*'):
            if not file.is_file():
                continue
            current = new/file.relative_to(old)
            report['filesChecked'] += 1
            if unchanged or file.name == 'data.png':
                assert sha(file) == sha(current)
            elif file.name == 'base.png':
                before, after = np.asarray(Image.open(file)), np.asarray(Image.open(current))
                assert np.array_equal(before[..., 3], after[..., 3])
                assert not after[after[..., 3] == 0, :3].any()
old = Path('.local/terrain-packs/temperate-m2-3-material-feedback-v3')
new = Path('.local/terrain-packs')/contact['terrain']['revision']
a, b = read(old/'manifest.json'), read(new/'manifest.json')
assert len(a['groups']) == len(b['groups']) == 23
for ga, gb in zip(a['groups'], b['groups']):
    assert ga['members'] == gb['members'] and ga['id'] == gb['id']
    for va, vb in zip(ga['variants'], gb['variants']):
        assert va['rects'] == vb['rects'] and va['size'] == vb['size'] and va['density'] == vb['density']
        before = np.frombuffer((old/va['file']).read_bytes(), np.uint8).reshape(*va['size'][::-1], 4)
        after = np.frombuffer((new/vb['file']).read_bytes(), np.uint8).reshape(*vb['size'][::-1], 4)
        assert np.array_equal(before[..., 3], after[..., 3])
        assert sha(new/vb['file']) == vb['sha256']
        if ga['id'] not in contact['changedTerrainGroups']:
            assert np.array_equal(before, after)
        for x, y, w, h in vb['rects']:
            assert np.array_equal(after[y-2:y+h+2, x-2:x+w+2],
                np.pad(after[y:y+h, x:x+w], ((2, 2), (2, 2), (0, 0)), mode='edge'))
report['protectedPaths'] = read(Path('.artifacts/m2-3/feedback-r5-v1/preservation-final-v1.json'))['protectedPaths']
for row in report['protectedPaths']:
    file = Path(row['file'])
    assert sha(file) == row['sha256'] if 'sha256' in row else not file.exists()
output.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k != 'protectedPaths'}))
