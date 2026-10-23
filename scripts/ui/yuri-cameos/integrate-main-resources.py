"""Validate accepted E resources, stage an additive UI catalog and publish its selection."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
SOURCE = Path(sys.argv[1]).resolve()
OUT = ROOT / '.artifacts/yuri-cameos-main-integration-v1'
REVISION = 'yuri-cameos-e-main-v1'


def read(root, name):
    return json.loads((root / name).read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_exact(source, destination, expected):
    assert source.is_file() and not source.is_symlink(), source
    assert digest(source) == expected, source
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        assert destination.is_file() and not destination.is_symlink(), destination
        assert digest(destination) == expected, destination
        return False
    with source.open('rb') as incoming, destination.open('xb') as outgoing:
        shutil.copyfileobj(incoming, outgoing)
    assert digest(destination) == expected, destination
    return True


completion = read(SOURCE, 'docs/yuri-cameos-final-completion.json')
assert completion['status'] == 'YURI_CAMEOS_E_ACCEPTED_AND_DELIVERED_NOT_MERGED'
assert not completion['visual']['pendingIdentities']
supplement = read(SOURCE, completion['integration']['resourceManifest'])
assert supplement['implementationHead'] == 'cd6944def05dc4444f0e904c8eea29f6c381cdbe'
for row in supplement['resources']:
    assert digest(SOURCE / row['file']) == row['sha256'], row['file']

pointer_file = ROOT / '.local/ui-selection.json'
pointer_bytes = pointer_file.read_bytes()
before = json.loads(pointer_bytes)
saved = read(ROOT, str(OUT.relative_to(ROOT) / 'pre-merge/snapshot.json'))
assert digest(pointer_file) == saved['uiSelectionBeforeSha256']
base_dir = ROOT / '.local/ui-packs' / before['revision']
assert digest(base_dir / 'manifest.json') == before['sha256']
manifest = read(base_dir, 'manifest.json')
original_assets = {entry['id']: entry for entry in manifest['assets']}
assets = dict(original_assets)
additions = []
for delta_pin in completion['integration']['deltaOrder']:
    assert digest(SOURCE / delta_pin['file']) == delta_pin['sha256']
    delta = read(SOURCE, delta_pin['file'])
    for row in delta['additions']:
        assert row['operation'] == 'ADD' and row['expectedPredecessor'] is None
        assert row['id'] not in assets, f"Catalog collision: {row['id']}"
        entry = {key: value for key, value in row.items()
                 if key not in ('operation', 'expectedPredecessor')}
        assets[row['id']] = entry
        additions.append(entry)
assert len(additions) == 44 and sum('overlay' in row for row in additions) == 12
assert len(assets) <= 512

stage = OUT / 'resource-staging' / REVISION
assert not stage.exists()
stage.mkdir(parents=True)
source_dir = SOURCE / Path(completion['selectedResources']['manifest']['file']).parent
copied = []
for entry in assets.values():
    source = base_dir / entry['file'] if entry['id'] in original_assets else source_dir / entry['file']
    copy_exact(source, stage / entry['file'], entry['sha256'])
for video in manifest.get('menuVideo', {}).values():
    copy_exact(base_dir / video['file'], stage / video['file'], video['sha256'])
manifest['revision'] = REVISION
manifest['assets'] = list(assets.values())
(stage / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
manifest_hash = digest(stage / 'manifest.json')
for identity, old in original_assets.items():
    assert assets[identity] == old
    assert digest(stage / old['file']) == old['sha256']

# Preserve selected masters, both export densities and acceptance/provenance locally.
batch = read(SOURCE, '.artifacts/yuri-cameos/batch-acceptance-v2.json')
accepted_files = {row['file']: row['sha256'] for row in supplement['resources']
                  if row['file'].startswith('.artifacts/')}
for item in batch['approved']:
    for row in [item['master'], *item['exports']]:
        accepted_files[row['file']] = row['sha256']
for name in ['.artifacts/yuri-cameos/batch-acceptance-v2.json',
             '.artifacts/yuri-cameos/production-v5/export-receipt.json',
             '.artifacts/yuri-cameos/production-v5/master-overrides.json',
             '.artifacts/yuri-cameos/production-v5/accepted-validation-receipt.json',
             '.artifacts/yuri-cameos/loading-followup-v1/prompt.txt',
             completion['integration']['resourceManifest']]:
    accepted_files[name] = digest(SOURCE / name)
for name, expected in accepted_files.items():
    added = copy_exact(SOURCE / name, ROOT / name, expected)
    copied.append({'file': name, 'sha256': expected, 'added': added})

published = ROOT / '.local/ui-packs' / REVISION
assert not published.exists()
shutil.copytree(stage, published)
assert digest(published / 'manifest.json') == manifest_hash
selection = {'schemaVersion': 1, 'revision': REVISION,
             'sha256': manifest_hash, 'reviewOnly': False}
assert pointer_file.read_bytes() == pointer_bytes
temporary = OUT / 'validated-ui-selection.json'
temporary.write_text(json.dumps(selection, indent=2) + '\n')
os.replace(temporary, pointer_file)
report = {'status': 'PASS_ACCEPTED_E_ADDITIVE_RESOURCE_TRANSFER',
          'beforeSelection': before, 'selection': selection,
          'manifest': str(published / 'manifest.json'),
          'stage': str(stage), 'source': str(SOURCE),
          'priorEntriesPreserved': len(original_assets), 'additions': additions,
          'combinedEntries': len(assets), 'newAliases': 12,
          'validatedSupplementFiles': len(supplement['resources']),
          'acceptedSourceAndExportCopies': copied,
          'worldResourceFilesWritten': 0,
          'historicalEvidence': 'Historical E apps/rejected variants remain preserved in the source worktree.'}
(OUT / 'resource-transfer.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'entries': len(assets),
                  'selection': selection, 'acceptedCopies': len(copied)}))
