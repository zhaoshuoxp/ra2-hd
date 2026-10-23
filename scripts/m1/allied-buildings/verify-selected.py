"""Cheap final cell verification; reuse the accepted decoded-member ledger."""
import json
from pathlib import Path
from production_common import ROOT, INVENTORY, sha, row_for

catalog = json.loads(Path('desktop/allied-building-coverage.json').read_text())
old = json.loads((ROOT/'coverage-ledger-v1.json').read_text())
dependencies = json.loads((ROOT/'dependencies-v1.json').read_text())
deps = {(r['edition'],r['theater'],r['id']):r for r in dependencies['rows']}
accepted_path = Path('.local/hd-packs/power-plant-authored/1/family.json')
assert sha(accepted_path) == '31b76d8632f470e41886aaf2987c3df618370f1b25ea80725d044e450f94b2d2'
checked, cells, differences = {},[],[]
for key,entry in catalog.items():
    path = Path('.local')/entry['familyPath']
    assert sha(path) == entry['familyHash']
    family = json.loads(path.read_text())
    manifests = []
    for binding in family['members']:
        folder = Path('.local/hd-packs')/binding['packId']/binding['revision']
        assert sha(folder/'manifest.json') == binding['sha256']
        manifest = json.loads((folder/'manifest.json').read_text())
        definition = next(m for m in entry['members'] if m['member'] == binding['member'])
        assert manifest['source']['sha256'] == definition['sha256']
        assert manifest['logical']['canvas'] == definition['canvas']
        assert len(manifest['logical']['frames']) == definition['frames']
        variant = next(v for v in manifest['variants'] if v['density'] == 2)
        assert len(variant['frames']) == definition['frames']
        for page in variant['pages']:
            for role in ('base','data'):
                file = folder/page[role]
                assert file.stat().st_size == page[role+'Bytes'] and sha(file) == page[role+'Sha256']
        manifests.append({'member':binding['member'],'sha256':binding['sha256'],'frames':definition['frames']})
    checked[key] = {'familyHash':entry['familyHash'],'members':manifests,'status':'PASS_SELECTED_PINS_AND_MAPPINGS'}

def sequence(row):
    return [{k:a.get(k) for k in ('type','name','offset','depthOffset','flat','normal','damaged')}
            for a in row['animations']]

for row in INVENTORY['matrix']:
    theater = 'SNOW' if row['theater'] == 'SNOW' else 'TEMPERATE'
    name = 'GAAIRC' if row['id'] == 'AMRADR' else row['id']
    peer = row_for(name,theater)
    member_identity = lambda r:[(m['source']['sha256'],m['visibleFrames'],m['canvas'],m['roles']) for m in r['members']]
    assert member_identity(row) == member_identity(peer), (row['id'],row['edition'],row['theater'])
    if sequence(row) != sequence(peer): differences.append({'id':row['id'],'edition':row['edition'],'theater':row['theater']})
    assert row['palette']['remapIndices'] == peer['palette']['remapIndices']
    key = name.lower()+'-'+theater.lower()
    reused = name == 'GAPOWR' and theater == 'TEMPERATE'
    assert reused or key in checked
    missing = [m['name'] for m in INVENTORY['missingMembers'] if (m['edition'],m['theater'],m['id']) == (row['edition'],row['theater'],row['id'])]
    cells.append({'edition':row['edition'],'theater':row['theater'],'id':row['id'],
        'selection':'accepted-power-plant-authored/1' if reused else key,
        'sourceMemberIdentity':'PASS','sequenceEquivalent':sequence(row)==sequence(peer),
        'resolvedMemberNames':[m['source']['member'] for m in row['members']],
        'canonicalMemberNames':[m['source']['member'] for m in peer['members']],
        'paletteSha256':row['palette']['sha256'],'paletteSemantics':deps[row['edition'],row['theater'],row['id']]['paletteSemantics'],
        'nativeDeclarationExceptions':missing,'status':'REUSED_ACCEPTED_EVIDENCE' if reused else 'NEW_CONTENT_STRUCTURAL_PASS'})
assert len(cells) == 186 and len(checked) == 39
report = {'status':'PASS_WITH_NAMED_NATIVE_DECLARATION_EXCEPTIONS','selectedFamilies':checked,
    'cells':cells,'sequenceDifferences':differences,'uniqueSourceMemberChecksReused':old['checks'],
    'nativeEffects':'Original shared fire, destruction, particles and shadows retained; see dependencies-v1.json',
    'visualAcceptance':'PENDING_FINAL_REVIEW'}
with (ROOT/'selected-coverage-v2.json').open('x') as f: json.dump(report,f,indent=2);f.write('\n')
print(json.dumps({'cells':len(cells),'selectedFamilies':len(checked),'sequenceDifferences':differences}))
