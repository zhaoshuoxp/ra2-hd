"""Stage exact originals for the sixteen remaining independent buildings; claim no new coverage."""
import collections
import copy
import hashlib
import json
import os
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
ledger_file = base / 'urban-buildings-batch59-v1/coverage-delta.json'
audit_file = Path('docs/m2-4-urban-remaining-after-batch56-20261016.json')
guide_file = base / 'urban-civilians-native-batch49-v1/source.json'
ledger, audit, guide = read(ledger_file), read(audit_file), read(guide_file)
current = read(Path('desktop/environment-urban-hd-contract.json'))
assert len(current['families']) == 260 and current['selectedPack'] == ledger['selectedEnvironment']
remaining = {r['key'] for r in ledger['remainingGaps']}
chosen = [g for g in audit['groups'] if g['key'] in remaining and g['category'] == 'SINGLE_MEMBER_BUILDING'
    and g['member'] not in ['culit01e.shp', 'cupol01s.shp']]
assert len(chosen) == 16
root = base / 'urban-buildings-native-batch60-v1'
root.mkdir()
os.symlink((guide_file.parent / 'native').resolve(), root / 'native')
sources, rows = [], []
for group in chosen:
    source, = [copy.deepcopy(s) for s in guide['sources'] if s['member'] == group['member'] and s['sha256'] == group['sha256']]
    assert sha(root / 'native' / source['nativeFile']) == source['sha256']
    assert source['hasShadow'] and source['totalFrames'] == 8
    assert all(b['role'] == 'body' for b in source['bindings']) and not group['completeDependencies']
    duplicates = []
    for frame in source['frames']:
        for file_key, hash_key in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
            assert sha(root / 'native' / frame[file_key]) == frame[hash_key]
        if frame['slot'] >= 4:
            continue
        donor = next((f for f in source['frames'][:frame['slot']] if all(f[k] == frame[k] for k in
            ['origin', 'size', 'indexSha256', 'rgbaSha256', 'empty'])), None)
        if donor:
            duplicates.append(dict(slot=frame['slot'], canonical=donor['slot'], indexSha256=frame['indexSha256'],
                rgbaSha256=frame['rgbaSha256'], origin=frame['origin'], size=frame['size']))
    sources.append(source)
    rows.append(dict(identity=group['identities'][0], member=source['member'], sourceSha256=source['sha256'],
        originalCanvas=source['canvas'], bodyFrames=4, shadowFrames=4, exactWithinSourceDuplicates=duplicates,
        canOccupy=str(source['nativeRules'].get('CanBeOccupied', 'no')).lower() in ['yes', 'true', '1'],
        leaveRubble=str(source['nativeRules'].get('LeaveRubble', 'no')).lower() in ['yes', 'true', '1'],
        maps=group['maps'], nativeArtAndRulesUnchanged=True))
with (root / 'source.json').open('x') as f:
    f.write(json.dumps(dict(schema=guide['schema'], theater='URBAN', sources=sources,
        inventoryFile=str(audit_file), inventorySha256=sha(audit_file),
        scope='Sixteen remaining independent buildings, exact source-only preparation; no selection or coverage change.'), indent=2) + '\n')
output = dict(schema='m2-4-urban-buildings-batch60-preflight-v1', status='EXACT_ORIGINAL_SOURCES_PREPARED_ART_REUSE_AUDIT_PENDING',
    priorCoverage=pin(ledger_file), originalAudit=pin(audit_file), originalGuide=pin(guide_file), preparedSource=pin(root / 'source.json'),
    currentSelectedPack=current['selectedPack'], rows=rows, completeNewSourceGroups=16, nativeBodySlots=64, nativeShadows=64,
    expectedDensityFrames=128, exactWithinSourceDuplicates=sum(len(r['exactWithinSourceDuplicates']) for r in rows),
    technicalCoverageAdded=0, currentRemainingGroups=33,
    nextIndependentScope='Audit accepted body donors before drawing; retain all complete source slots and actual tall-building geometry.',
    deferredLinkedFamilies=[dict(member=g['member'], identities=g['identities'], dependencies=g['completeDependencies'])
        for g in audit['groups'] if g['key'] in remaining and g['category'] == 'LINKED_BUILDING_FAMILY'],
    deferredPlaceholders=['CALIT01E', 'CAPOL01S'], selectedResourcesChanged=False, originalMapsChanged=False,
    windows='NOT_RUN', m24Complete=False)
with (base / 'urban-buildings-batch60-preflight-v1.json').open('x') as f:
    f.write(json.dumps(output, indent=2) + '\n')
print(json.dumps(dict(families=16, originalBodySlots=64, originalShadows=64,
    duplicateSlots=output['exactWithinSourceDuplicates'], linkedFamiliesRetained=6, coverageAdded=0)))
