"""Pin all original members of the six remaining linked Urban building families."""
import copy
import hashlib
import json
import os
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
audit_file = Path('docs/m2-4-urban-remaining-after-batch56-20261016.json')
ledger_file = base / 'urban-placeholder-hd-repair-v1/coverage-delta.json'
guide_file = base / 'urban-native-v2/source.json'
audit, ledger, guide = read(audit_file), read(ledger_file), read(guide_file)
remaining = {row['key'] for row in ledger['remainingGaps']}
groups = [g for g in audit['groups'] if g['key'] in remaining and g['category'] == 'LINKED_BUILDING_FAMILY']
assert len(groups) == 6
root = base / 'urban-linked-native-batch61-v1'
root.mkdir()
os.symlink((guide_file.parent / 'native').resolve(), root / 'native')
sources, rows, members = [], [], set()
for group in groups:
    requirements = [dict(role='body', source=dict(member=group['member'], sha256=group['sha256']),
        palette=group['editionRows'][0]['palette'])] + group['completeDependencies']
    family_members = []
    for item in requirements:
        name, digest = item['source']['member'], item['source']['sha256']
        identity = (name, digest, item['palette']['sha256'])
        family_members.append(dict(member=name, sourceSha256=digest, role=item['role']))
        if identity in members:
            continue
        source, = [copy.deepcopy(s) for s in guide['sources'] if s['member'] == name
            and s['sha256'] == digest and s['palette']['sha256'] == item['palette']['sha256']]
        assert source['hasShadow'] and source['totalFrames'] % 2 == 0
        assert sha(root / 'native' / source['nativeFile']) == digest
        assert sha(root / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
        for frame in source['frames']:
            for file_key, hash_key in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
                assert sha(root / 'native' / frame[file_key]) == frame[hash_key]
        sources.append(source)
        members.add(identity)
    rows.append(dict(identity=group['identities'][0], bodyMember=group['member'],
        sourceSha256=group['sha256'], originalMapIds=group['maps'], completeMembers=family_members,
        originalRulesAndArt=group['editionRows'], dependencyDeclarations=group['completeDependencies']))
assert len(sources) == 13
visible = sum(s['totalFrames'] // 2 for s in sources)
assert visible == 223
prepared = dict(schema=guide['schema'], theater='URBAN', sources=sources,
    inventoryFile=str(audit_file), inventorySha256=sha(audit_file),
    scope='Six complete linked families, exact original sources only; no selection or coverage claim.')
(root / 'source.json').write_text(json.dumps(prepared, indent=2) + '\n')
report = dict(schema='m2-4-urban-linked-batch61-preflight-v1', status='EXACT_COMPLETE_SOURCE_CLOSURE_PREPARED_DONOR_AUDIT_PENDING',
    originalGuide=pin(guide_file), originalAudit=pin(audit_file), priorCoverage=pin(ledger_file),
    preparedSource=pin(root / 'source.json'), rows=rows, completeFamilies=6, sourceMembers=13,
    originalVisibleSlots=visible, untouchedNativeShadows=visible, expectedDensityFrames=visible * 2,
    sharedBuildUnbuildMember='nupsybmk.shp', technicalCoverageAdded=0, selectedResourcesChanged=False,
    nativeAcceptance=False, visual='NOT_AUTHORED', windows='NOT_RUN', m24Complete=False)
(base / 'urban-linked-batch61-preflight-v1.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['status', 'completeFamilies', 'sourceMembers', 'originalVisibleSlots', 'expectedDensityFrames']}))
