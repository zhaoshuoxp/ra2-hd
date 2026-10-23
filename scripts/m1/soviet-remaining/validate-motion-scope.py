"""Verify the correction boundary against delivered files and accepted artwork."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path('.artifacts/soviet-remaining')
selection = json.loads((root / 'production-selection-r3.json').read_text())
old = json.loads((root / 'production-selection-v1.json').read_text())
report = {'status': 'RUNNING', 'families': {}}
for name in selection:
    if name == 'NAWALL':
        continue
    before, after = Path(old[name]['exports']), Path(selection[name]['exports'])
    candidate = json.loads((after / 'candidate-review.json').read_text())
    unchanged, changed, frames = 0, 0, 0
    for item in candidate['frames']:
        member = item['member']
        permitted = 'mk.shp' in member or name == 'NAPSIS' or (name == 'TESLA' and member in ['ngtsla_a.shp', 'ngtsla_b.shp'])
        source = json.loads((root / 'source-v1' / name / (member + '.json')).read_text())['frames'][item['nativeFrame']]
        for export in item['exports']:
            expected = tuple(max(1, (source[key] + source[key] % 2) * export['density']) for key in ['width', 'height'])
            for role in ['base', 'data']:
                assert Image.open(after / export[role]).size == expected
                same = (before / export[role]).read_bytes() == (after / export[role]).read_bytes()
                if not permitted:
                    assert same, (name, export[role], 'unrelated pixels changed')
                    unchanged += 1
                changed += int(not same)
            frames += 1
    for operation in candidate['composition']:
        if 'mk.shp' in operation['member']:
            assert operation['frameScale'] == [1, 1]
    report['families'][name] = {'unchangedFiles': unchanged, 'changedFiles': changed, 'framesChecked': frames, 'status': 'PASS'}
for name in ['NAHAND', 'NAREFN', 'NAWEAP', 'NACNST']:
    before = Path('.artifacts/m1-6b') / ('full-exports-r2' if name == 'NAREFN' else 'full-exports-v4') / name
    after = Path('.artifacts/m1-6b/full-exports-animation-r4') / name
    candidate = json.loads((after / 'candidate-review.json').read_text())
    checked = 0
    for row in candidate['frames']:
        if 'mk.shp' in row['member']:
            continue
        for export in row['exports']:
            for role in ['base', 'data']:
                assert (before / export[role]).read_bytes() == (after / export[role]).read_bytes()
                checked += 1
    report['families'][name] = {'unchangedFiles': checked, 'status': 'PASS_ALL_NON_BUILD_STATES_IDENTICAL'}
art = json.loads((root / 'feedback-r2/feedback.json').read_text())['preservedArt']
for row in art:
    assert hashlib.sha256(Path(row['path']).read_bytes()).hexdigest() == row['sha256']
report.update(status='PASS_ANIMATION_SCOPE_AND_ACCEPTED_ART_PRESERVATION', acceptedArtFiles=len(art),
              limits='NAPSIS fixed-base layer partition and active frames are intentionally revised; final visual acceptance remains pending')
(root / 'feedback-r2/export-scope-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['status'], len(report['families']), 'families;', len(art), 'accepted artwork files unchanged')
