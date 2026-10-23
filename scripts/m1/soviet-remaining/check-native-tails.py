"""Revalidate the explicit Original-only tails against decoded retail indices."""
import json
from pathlib import Path

root = Path('.artifacts/soviet-remaining')
inventory = json.loads((root / 'source-v1/inventory.json').read_text())
checklist = json.loads((root / 'production-checklist-v2.json').read_text())
retained_starts = {
    'NANRCT': {'ngnrct_a.shp': 22}, 'NACLON': {'ngclon_a.shp': 22},
    'NAIRON': {'ngiron_a.shp': 22, 'ngiron_f.shp': 42, 'ngiron_h.shp': 24},
    'NAYARD': {'ngyard_b.shp': 30, 'ngyard_c.shp': 30},
}
rows = []
authored = retained = 0
for family, data in inventory['families'].items():
    for member in data['members']:
        name = member['source']['member']
        count = member['aggregateVisibleFrames']
        start = retained_starts.get(family, {}).get(name, count)
        expected = next(m for m in checklist['families'][family]['members'] if m['member'] == name)
        assert expected['authorFrames'] == list(range(start))
        assert expected['retainedOriginalFrames'] == list(range(start, count))
        authored += start
        if start == count:
            continue
        raw = json.loads((root / 'source-v1' / family / (name + '.json')).read_text())
        values = set()
        for frame in raw['frames'][start:count]:
            values.update(frame['pixels'])
        assert values <= {0, 1}, (family, name, values)
        retained += count - start
        rows.append(dict(family=family, member=name, retainedFrames=list(range(start, count)),
                         retailPaletteIndices=sorted(values), sourceSha256=member['source']['sha256']))
assert authored == 1102 and retained == 192
report = dict(status='PASS_RETAIL_ORIGINAL_TAILS', authoredFrames=authored, retainedOriginalFrames=retained,
              note='No colored retail pixels are omitted. Aggregate offsets remain the full retail offsets.', rows=rows)
(root / 'native-tail-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['status'], authored, retained)
