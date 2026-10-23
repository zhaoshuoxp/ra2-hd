"""Verify only changed contracts and preserve the previous selected families."""
import json
import subprocess
from pathlib import Path
from PIL import Image
from production_common import ROOT, sha

catalog = json.loads(Path('desktop/allied-building-coverage.json').read_text())
baseline = json.loads(subprocess.check_output(['git', 'show', 'f128c69:desktop/allied-building-coverage.json']))
changed = {'GTGCAN', 'GAAIRC', 'GACSPH', 'GAWEAT'}
results = []
for key, entry in catalog.items():
    old = baseline[key]
    if entry['family'] not in changed:
        assert entry == old, key
        continue
    assert entry['members'] == old['members'], key
    assert entry['familyPath'] != old['familyPath']
    family = json.loads((Path('.local') / entry['familyPath']).read_text())
    previous = json.loads((Path('.local') / old['familyPath']).read_text())
    assert sha(Path('.local') / old['familyPath']) == old['familyHash']
    assert sha(Path('.local') / entry['familyPath']) == entry['familyHash']
    for binding, prior in zip(family['members'], previous['members']):
        folder = Path('.local/hd-packs') / binding['packId'] / binding['revision']
        prior_folder = Path('.local/hd-packs') / prior['packId'] / prior['revision']
        assert sha(folder / 'manifest.json') == binding['sha256']
        manifest = json.loads((folder / 'manifest.json').read_text())
        old_manifest = json.loads((prior_folder / 'manifest.json').read_text())
        assert manifest['logical'] == old_manifest['logical']
        assert manifest['source'] == old_manifest['source']
        for variant in manifest['variants']:
            for page in variant['pages']:
                for role in ('base', 'data'):
                    assert sha(folder / page[role]) == page[role + 'Sha256']
                    assert list(Image.open(folder / page[role]).size) == page['size']
        results.append({'selection': key, 'member': binding['member'], 'geometry': 'UNCHANGED', 'hashes': 'PASS'})
    if entry['family'] == 'GTGCAN' and entry['theater'] == 'TEMPERATE':
        assert family['turret']['sha256'] == previous['turret']['sha256']
versions = {'GTGCAN': 'mask-exports-v2', 'GAAIRC': 'full-exports-v2',
            'GACSPH': 'full-exports-v4', 'GAWEAT': 'full-exports-v3'}
preserved = 0
for identity, version in versions.items():
    for suffix in ('', '-SNOW'):
        old = ROOT / version / (identity + suffix)
        new = ROOT / 'feedback-exports-v1' / (identity + suffix)
        records = json.loads((old / 'candidate-review.json').read_text())['frames']
        for record in records:
            name = record['member']
            affected = ('mk.' in name if identity in ('GTGCAN', 'GAAIRC')
                        else any(part in name for part in ('_f.', '_g.', '_h.'))
                        or (identity == 'GAWEAT' and 'mk.' in name))
            if affected:
                continue
            for role in ('base', 'data'):
                file = record['exports'][0][role]
                assert sha(old / file) == sha(new / file), (identity, file)
                preserved += 1
report = {'status': 'PASS_CHANGED_CONTRACTS', 'baseline': 'f128c69', 'members': results,
          'unchangedSelections': len(catalog) - 8, 'unchangedExportFiles': preserved,
          'turretBytes': 'UNCHANGED', 'GAPILL': 'UNCHANGED_2X_RESOURCES_REVIEW_ONLY',
          'reusedCoverage': 'selected-coverage-v2.json', 'visualAcceptance': 'PENDING'}
with (ROOT / 'feedback-v1/structural.json').open('x') as file:
    json.dump(report, file, indent=2)
print(json.dumps({k: v for k, v in report.items() if k != 'members'}))
