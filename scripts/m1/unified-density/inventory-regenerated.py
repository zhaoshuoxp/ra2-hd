"""Pin selected true-4x resources, authored masters and exact generation prompts."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/4x-regeneration')
read = lambda p: json.loads(Path(p).read_text())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
allied = read('desktop/allied-building-coverage.json')
units = read('desktop/allied-unit-contracts.json')['shp']
snow = read('desktop/soviet-building-coverage.json')
soviet = read(root / 'candidate-soviet-bindings-v2.json')
families, files = [], {}


def pin(relative, expected=None):
    path = Path('.local') / relative
    digest = sha(path)
    assert not expected or expected == digest, path
    files[relative] = {'path': relative, 'sha256': digest, 'bytes': path.stat().st_size}
    return read(path) if path.suffix == '.json' else None


def family(identity, theater, relative, digest):
    data = pin(relative, digest)
    members = []
    for binding in data['members']:
        base = f'hd-packs/{binding["packId"]}/{binding["revision"]}/'
        manifest = pin(base + 'manifest.json', binding['sha256'])
        assert sorted(v['density'] for v in manifest['variants']) == [2, 4]
        for variant in manifest['variants']:
            for page in variant['pages']:
                for role in ['base', 'data']:
                    pin(base + page[role], page[role + 'Sha256'])
        members.append({'member': binding['member'], 'manifest': base + 'manifest.json', 'sha256': binding['sha256']})
    if data.get('turret'):
        base = data['turret']['path']
        turret = pin(base + 'manifest.json', data['turret']['sha256'])
        assert turret['density'] == 4 and len(turret['headings']) == 8
        for heading in turret['headings']:
            for role in ['base', 'mask']:
                pin(base + heading[role], heading[role + 'Sha256'])
    families.append({'identity': identity, 'theater': theater, 'family': relative, 'sha256': digest, 'members': members})


for identity, entry in units.items():
    if '/regen4x' in entry['familyPath']:
        family(identity, 'SOURCE_MATCHED', entry['familyPath'], entry['familyHash'])
for coverage in [allied, snow]:
    for key, entry in coverage.items():
        if '/regen4x' in entry['familyPath']:
            family(key.split('-')[0].upper(), key.split('-')[-1].upper(), entry['familyPath'], entry['familyHash'])
for key, revision in soviet['sovietBatchRevisions'].items():
    if revision.startswith('regen4x'):
        family(key.upper(), 'TEMPERATE', f'hd-packs/soviet-{key}-authored/{revision}/family.json', soviet['sovietBatchIdentities'][key])
jobs = read(root / 'unit-generation-jobs-v1.json')['jobs']
assert len(jobs) == 26 and sum(len(j['frames']) for j in jobs) == 143
for job in jobs:
    sampling = job.get('minAvailableDensity', min(job.get('availableDensities', [0])))
    assert sampling >= 4 and sha(job['output']) == job['outputSha256']
masters = read(root / 'building-master-map-v1.json')
for master in masters.values():
    assert sha(master['output']) == master['sha256']
prompts = {str(p): read(p) for p in sorted(root.glob('imagegen*prompts*.json'))}
ledger = {'baseline': 'f24c58cb55898bc046500306c1f43af8790d45c3',
          'status': 'TECHNICAL_CANDIDATE_HUMAN_VISUAL_ACCEPTANCE_PENDING',
          'scope': '24 previous complete-family 2x exceptions; existing 2x atlas bytes and native contracts preserved',
          'families': sorted(families, key=lambda r: (r['identity'], r['theater'])),
          'files': sorted(files.values(), key=lambda r: r['path']),
          'unitPoseJobs': jobs, 'buildingMasterReplacements': masters, 'generationPrompts': prompts}
assert len({f['identity'] for f in families}) == 24 and len(families) == 40
path = Path('docs/true-4x-regeneration-resources.json')
path.write_text(json.dumps(ledger, indent=2) + '\n')
print(len(families), 'family/theater selections;', len(files), 'pinned files;', path)
