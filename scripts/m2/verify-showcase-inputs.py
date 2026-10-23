"""Verify pinned native export inputs without treating them as HD acceptance."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
source = json.loads((root / 'source.json').read_text())
ledger = Path('docs/m2-2-map-coverage.json')
sha = lambda data: hashlib.sha256(data).hexdigest()
assert source['ledgerSha256'] == sha(ledger.read_bytes())
assert not source['failures']
assert not json.loads(ledger.read_text())['issues']
counts = dict(sources=0, images=0, empty=0, indexed=0, palettes=0, hva=0, vpl=0)
identities = set()
for entry in source['sources']:
    assert sha((root / 'native' / entry['member']).read_bytes()) == entry['sha256']
    key = (entry['sha256'], entry['palette']['sha256'])
    assert key not in identities
    identities.add(key)
    counts['sources'] += 1
    for dependency in ('palette', 'hva', 'vpl'):
        value = entry.get(dependency)
        if value:
            assert sha((root / 'native' / value['member']).read_bytes()) == value['sha256']
            counts['palettes' if dependency == 'palette' else dependency] += 1
    for frame in entry.get('images', entry.get('frames', [])):
        width, height = frame['size']
        rgba = (root / 'native' / frame['file']).read_bytes()
        assert len(rgba) == width * height * 4
        assert sha(rgba) == frame['rgbaSha256']
        counts['images'] += 1
        counts['empty'] += bool(frame.get('empty'))
        if 'indexSha256' in frame:
            indices = (root / 'native' / f"{entry['member']}-{frame['slot']}.index").read_bytes()
            assert len(indices) == width * height
            assert sha(indices) == frame['indexSha256']
            assert frame['empty'] == all(index == 0 for index in indices)
            assert all(rgba[pixel * 4 + 3] == (255 if index else 0)
                       for pixel, index in enumerate(indices))
            counts['indexed'] += 1
    assert all(binding['role'] and binding['id'] for binding in entry['bindings'])
result = dict(status='PASS_PINNED_NATIVE_INPUTS', counts=counts,
              sourceSha256=sha((root / 'source.json').read_bytes()),
              ledgerSha256=source['ledgerSha256'],
              boundary='No authored HD family, in-game state or whole-map acceptance is implied.')
(root / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
